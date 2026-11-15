(() => {
  "use strict";

  const ext = typeof browser !== "undefined" ? browser : typeof chrome !== "undefined" ? chrome : null;

  const NAME = "BetterZone Stable Version 1.0";
  const WORD_RE = /\bRECZONE\b/g;
  const TITLE_RE = /rec\s?zone/gi;
  const SKIP = ".wt-chatlog, .rza-banner, script, style, textarea, input, [contenteditable]";

  const KEY = {
    boot: "bz.bootanim",
    theme: "bz.theme",
    custom: "bz.custom",
    knock: "bz.knock",
    music: "bz.music",
    origName: "bz.origname",
    fps: "bz.fps",
    volume: "bz.music.vol",
    shuffle: "bz.music.shuffle",
  };

  function read(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  }
  function readJson(key, defaults) {
    try { return { ...defaults, ...JSON.parse(read(key) || "{}") }; } catch { return { ...defaults }; }
  }

  function syncedSetting(storeKey, mirrorKey, defaults) {
    let value = readJson(mirrorKey, defaults);
    const views = new Set();
    const adopt = (next) => {
      value = { ...defaults, ...next };
      write(mirrorKey, JSON.stringify(value));
      views.forEach((fn) => fn());
    };
    try {
      ext.storage.local.get(storeKey).then((r) => {
        if (r && r[storeKey]) adopt(r[storeKey]);
        else if (JSON.stringify(value) !== JSON.stringify(defaults)) ext.storage.local.set({ [storeKey]: value });
      });
      ext.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[storeKey] && changes[storeKey].newValue) adopt(changes[storeKey].newValue);
      });
    } catch {}
    return {
      get: () => value,
      save(next) {
        adopt(next);
        try { ext.storage.local.set({ [storeKey]: value }); } catch {}
      },
      watch(anchor, fn) {
        const run = () => {
          if (!anchor.isConnected) { views.delete(run); return; }
          fn();
        };
        views.add(run);
      },
    };
  }

  const knockSetting = syncedSetting("bzKnock", KEY.knock, { on: false, seconds: 60 });
  const musicSetting = syncedSetting("bzMusic", KEY.music, { on: false });

  const getBoot = () => read(KEY.boot) === "1";
  const setBoot = (on) => write(KEY.boot, on ? "1" : "0");
  const showsOriginalName = () => read(KEY.origName) === "1";

  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, s, l];
  }

  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let rgb;
    if (h < 60) rgb = [c, x, 0];
    else if (h < 120) rgb = [x, c, 0];
    else if (h < 180) rgb = [0, c, x];
    else if (h < 240) rgb = [0, x, c];
    else if (h < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    return rgb.map((v) => Math.round((v + m) * 255));
  }

  const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (c) => "#" + [c.r, c.g, c.b].map((v) => clamp255(v).toString(16).padStart(2, "0")).join("");

  const TOKEN_RE = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;

  function parseToken(tok) {
    if (tok[0] === "#") {
      let h = tok.slice(1);
      if (h.length <= 4) h = h.split("").map((c) => c + c).join("");
      const n = (i) => parseInt(h.slice(i, i + 2), 16);
      return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
    }
    const fn = tok.slice(0, tok.indexOf("(")).toLowerCase();
    const parts = tok.slice(tok.indexOf("(") + 1, -1).split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const pct = (p, scale) => (p.endsWith("%") ? (parseFloat(p) / 100) * scale : parseFloat(p));
    const a = parts[3] === undefined ? 1 : pct(parts[3], 1);
    let r, g, b;
    if (fn.startsWith("rgb")) {
      r = pct(parts[0], 255); g = pct(parts[1], 255); b = pct(parts[2], 255);
    } else {
      [r, g, b] = hsl2rgb(parseFloat(parts[0]), parseFloat(parts[1]) / 100, parseFloat(parts[2]) / 100);
    }
    if ([r, g, b, a].some((v) => Number.isNaN(v))) return null;
    return { r, g, b, a };
  }

  function parseColor(str) {
    if (typeof str !== "string") return null;
    const t = str.trim().toLowerCase();
    if (/^#?([0-9a-f]{3}|[0-9a-f]{6})$/.test(t)) return parseToken(t[0] === "#" ? t : "#" + t);
    if (/^(rgb|hsl)a?\(.*\)$/.test(t)) return parseToken(t);
    const m = t.match(/^(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})$/);
    if (m) {
      const [r, g, b] = [m[1], m[2], m[3]].map(Number);
      if (r <= 255 && g <= 255 && b <= 255) return { r, g, b, a: 1 };
    }
    return null;
  }

  const THEMES = {
    navy: { name: "Navy", hue: 224, s: 0.85, l: 0.62 },
    original: { name: "Original", hue: null },
    forest: { name: "Forest", hue: 145, s: 0.8, l: 0.8 },
    crimson: { name: "Crimson", hue: 352, s: 0.9, l: 0.85 },
    violet: { name: "Violet", hue: 268, s: 1, l: 0.9 },
    custom: { name: "Custom", hue: null },
  };
  const DEFAULT_THEME = "navy";
  const STOCK_ACCENT = "#2d6cff";

  const DEFAULT_CUSTOM = { mode: "solid", c1: "#2d6cff", c2: "#7a2cff", angle: 135 };
  const PRESETS = [
    ["Ocean", "#1b4fa8", "#2bb5c9", 135],
    ["Sunset", "#e0506a", "#f2994a", 135],
    ["Aurora", "#1fa97a", "#5b3bd1", 135],
    ["Ember", "#c0392b", "#f39c12", 135],
    ["Midnight", "#14213d", "#3a506b", 135],
    ["Candy", "#d6409f", "#7b5cff", 135],
  ];

  const getThemeId = () => (THEMES[read(KEY.theme)] ? read(KEY.theme) : DEFAULT_THEME);
  const getCustom = () => readJson(KEY.custom, DEFAULT_CUSTOM);
  const setCustom = (c) => write(KEY.custom, JSON.stringify(c));

  function readable(c) {
    const [h, s, l] = rgb2hsl(c.r, c.g, c.b);
    const [r, g, b] = hsl2rgb(h, s, Math.max(0.12, Math.min(0.65, l)));
    return { r, g, b };
  }

  function themeFromColor(c) {
    const [h, s, l] = rgb2hsl(c.r, c.g, c.b);
    return { hue: h, s: Math.max(0.02, s / 0.643), l: l / 0.494 };
  }

  function buildCustomTheme(custom) {
    const a = readable(parseColor(custom.c1) || parseColor(DEFAULT_CUSTOM.c1));
    const theme = { name: "Custom", ...themeFromColor(a), accent: toHex(a), extra: "" };
    if (custom.mode !== "gradient") return theme;
    const b = readable(parseColor(custom.c2) || parseColor(DEFAULT_CUSTOM.c2));
    const themeB = themeFromColor(b);
    const mid = { r: (a.r + b.r) / 2, g: (a.g + b.g) / 2, b: (a.b + b.b) / 2 };
    const A = toHex(a), B = toHex(b), M = toHex(mid);
    const angle = Math.max(0, Math.min(360, Number(custom.angle) || 0));
    const face1 = transformToken("#1d46ab", theme);
    const face2 = transformToken("#173a92", themeB);
    theme.extra =
      `.wt-menu,.rz-hud{--plate-hi:${A} !important;--plate:${M} !important;--plate-lo:${B} !important;` +
      `--face1:${face1} !important;--face2:${face2} !important}` +
      `.wt-bar,.wt-wing,.wt-screen,.wt-dock,.hud-startcard{background-image:linear-gradient(${angle}deg,${A},${B}) !important}`;
    return theme;
  }

  const resolveTheme = (id) => (id === "custom" ? buildCustomTheme(getCustom()) : THEMES[id]);

  function transformToken(tok, theme) {
    if (!theme || theme.hue == null) return tok;
    const c = parseToken(tok);
    if (!c) return tok;
    let [h, s, l] = rgb2hsl(c.r, c.g, c.b);
    if (!(h >= 205 && h <= 248 && s >= 0.25 && l > 0.06 && l < 0.92)) return tok;
    h = theme.hue;
    s = Math.min(1, s * theme.s);
    if (l > 0.15 && l < 0.7) l = Math.min(0.95, l * theme.l);
    const [r, g, b] = hsl2rgb(h, s, l);
    const a = Math.round(c.a * 1000) / 1000;
    return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
  }

  function transformValue(value, theme) {
    if (!theme || theme.hue == null || !value || value.includes("url(")) return value;
    return value.replace(TOKEN_RE, (t) => transformToken(t, theme));
  }

  const KEEP_SELECTORS = /team|\.lt-|\.cp-|\.rza-/i;

  function declsFor(style, theme, isFrame) {
    let text = "", changed = false;
    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      const value = style.getPropertyValue(prop);
      const next = transformValue(value, theme);
      if (next !== value) changed = true;
      if (isFrame) text += `${prop}:${next};`;
      else if (next !== value) text += `${prop}:${next} !important;`;
    }
    return { text, changed };
  }

  function rulesToCss(rules, theme) {
    let out = "";
    for (const rule of rules) {
      try {
        if (rule.type === 1) {
          if (KEEP_SELECTORS.test(rule.selectorText)) continue;
          const d = declsFor(rule.style, theme, false);
          if (d.changed) out += `${rule.selectorText}{${d.text}}`;
        } else if (rule.type === 3) {
          let inner = null;
          try { inner = rule.styleSheet && rule.styleSheet.cssRules; } catch {}
          if (inner) out += rulesToCss(inner, theme);
        } else if (rule.type === 7) {
          let frames = "", changed = false;
          for (const f of rule.cssRules) {
            const d = declsFor(f.style, theme, true);
            changed = changed || d.changed;
            frames += `${f.keyText}{${d.text}}`;
          }
          if (changed) out += `@keyframes ${rule.name}{${frames}}`;
        } else if (rule.cssRules && rule.cssRules.length) {
          const inner = rulesToCss(rule.cssRules, theme);
          if (inner) {
            const text = rule.cssText;
            out += text.slice(0, text.indexOf("{")) + "{" + inner + "}";
          }
        }
      } catch {}
    }
    return out;
  }

  function buildThemeCss(theme) {
    if (!theme || theme.hue == null) return "";
    let css = "";
    for (const sheet of document.styleSheets) {
      if (sheet.ownerNode && sheet.ownerNode.id === "bz-theme") continue;
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      css += rulesToCss(rules, theme);
    }
    return css + (theme.extra || "");
  }

  let themeEl = null;
  let themeTimer = 0;

  function applyTheme() {
    themeTimer = 0;
    const theme = resolveTheme(getThemeId());
    const root = document.documentElement;
    root.style.setProperty("--bz-accent", theme.accent || transformToken(STOCK_ACCENT, theme));
    const css = buildThemeCss(theme);
    if (!themeEl) {
      themeEl = document.createElement("style");
      themeEl.id = "bz-theme";
    }
    if (themeEl.textContent !== css) themeEl.textContent = css;
    const host = document.head || root;
    if (themeEl.parentNode !== host || themeEl.nextElementSibling) host.appendChild(themeEl);
    themeCards(root);
  }

  function scheduleTheme(delay) {
    if (themeTimer) {
      if (!delay) return;
      clearTimeout(themeTimer);
    }
    themeTimer = setTimeout(applyTheme, delay || 60);
  }

  function setTheme(id) {
    if (!THEMES[id]) return;
    write(KEY.theme, id);
    clearTimeout(themeTimer);
    applyTheme();
  }

  const CARD_PROPS = [["--card-a", "bzCardA"], ["--card-b", "bzCardB"]];

  function themeCards(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
    const theme = resolveTheme(getThemeId());
    const els = [...root.querySelectorAll('[style*="--card-"]')];
    if (root.matches && root.matches('[style*="--card-"]')) els.push(root);
    for (const el of els) {
      for (const [prop, key] of CARD_PROPS) {
        const cur = el.style.getPropertyValue(prop);
        if (!cur) continue;
        const orig = el.dataset[key + "Set"] === cur ? el.dataset[key] : cur;
        el.dataset[key] = orig;
        const next = transformValue(orig, theme);
        el.dataset[key + "Set"] = next;
        if (next !== cur) el.style.setProperty(prop, next);
      }
    }
  }

  const renamed = new Map();

  function fixText(node) {
    if (showsOriginalName()) return;
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP)) return;
    const re = parent.tagName === "TITLE" ? TITLE_RE : WORD_RE;
    const old = node.nodeValue;
    if (!old) return;
    re.lastIndex = 0;
    if (!re.test(old)) return;
    re.lastIndex = 0;
    node.nodeValue = old.replace(re, NAME);
    renamed.set(node, old);
    if (renamed.size > 500) {
      for (const n of renamed.keys()) if (!n.isConnected) renamed.delete(n);
    }
  }

  function restoreNames() {
    for (const [node, text] of renamed) {
      if (node.isConnected) node.nodeValue = text;
    }
    renamed.clear();
  }

  function scan(root) {
    if (root.nodeType === Node.TEXT_NODE) return fixText(root);
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) fixText(n);
    themeCards(root);
  }

  const fpsDefaults = { on: false, corner: "br" };
  const getFps = () => readJson(KEY.fps, fpsDefaults);
  let fpsEl = null;
  let fpsFrame = 0;

  function applyFps() {
    const cfg = getFps();
    if (!cfg.on) {
      if (fpsFrame) cancelAnimationFrame(fpsFrame);
      fpsFrame = 0;
      if (fpsEl) fpsEl.remove();
      fpsEl = null;
      return;
    }
    if (!fpsEl) {
      fpsEl = document.createElement("div");
      document.documentElement.appendChild(fpsEl);
    }
    fpsEl.className = "bz-fps bz-fps-" + cfg.corner;
    if (fpsFrame) return;
    let frames = 0;
    let since = performance.now();
    const tick = (now) => {
      frames++;
      const span = now - since;
      if (span >= 500) {
        const fps = Math.round((frames * 1000) / span);
        const ms = (span / frames).toFixed(1);
        if (fpsEl) {
          const level = fps >= 55 ? "" : fps >= 30 ? " is-mid" : " is-low";
          fpsEl.className = "bz-fps bz-fps-" + getFps().corner + level;
          fpsEl.innerHTML = "<b></b> FPS  <span></span>";
          fpsEl.querySelector("b").textContent = String(fps);
          fpsEl.querySelector("span").textContent = ms + " ms";
        }
        frames = 0;
        since = now;
      }
      fpsFrame = requestAnimationFrame(tick);
    };
    fpsFrame = requestAnimationFrame(tick);
  }

  function openMusicDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("bz-music", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("songs", { keyPath: "id", autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function withSongs(mode, fn) {
    const db = await openMusicDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("songs", mode);
      const req = fn(tx.objectStore("songs"));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  }

  const AUDIO_FILE = /\.(mp3|ogg|oga|wav|flac|m4a|aac|opus)$/i;

  const player = {
    songs: [],
    context: null,
    gain: null,
    source: null,
    index: -1,
    token: 0,
    playing: false,
    paused: false,
    loading: false,
    shuffle: read(KEY.shuffle) === "1",
    volume: Number(read(KEY.volume)) || 60,
    error: "",
    views: new Set(),

    notify() {
      this.views.forEach((fn) => fn());
    },

    async load() {
      try {
        const list = await withSongs("readonly", (s) => s.getAll());
        this.songs = (list || []).sort((a, b) => a.id - b.id);
        this.error = "";
      } catch {
        this.songs = [];
        this.error = "Could not open the song storage in this browser.";
      }
      this.notify();
    },

    async add(files) {
      const picked = [...files].filter((f) => f.type.startsWith("audio/") || AUDIO_FILE.test(f.name));
      if (!picked.length) return;
      try {
        await withSongs("readwrite", (s) => {
          for (const f of picked) s.add({ name: f.name.replace(/\.[^.]+$/, ""), blob: f });
        });
      } catch {
        this.error = "Could not save those songs.";
      }
      await this.load();
    },

    async remove(id) {
      const current = this.songs[this.index];
      if (current && current.id === id) this.stop();
      try { await withSongs("readwrite", (s) => s.delete(id)); } catch {}
      await this.load();
      if (this.playing) this.index = this.songs.findIndex((s) => this.current && s.id === this.current.id);
    },

    async clear() {
      this.stop();
      try { await withSongs("readwrite", (s) => s.clear()); } catch {}
      await this.load();
    },

    ensureContext() {
      if (!this.context) {
        this.context = new AudioContext();
        this.gain = this.context.createGain();
        this.gain.gain.value = this.volume / 100;
        this.gain.connect(this.context.destination);
      }
      return this.context;
    },

    dropSource() {
      if (!this.source) return;
      this.source.onended = null;
      try { this.source.stop(); } catch {}
      try { this.source.disconnect(); } catch {}
      this.source = null;
    },

    async play(i, tries = 0) {
      const song = this.songs[i];
      if (!song) return;
      const token = ++this.token;
      const ctx = this.ensureContext();
      ctx.resume();
      this.dropSource();
      this.index = i;
      this.current = song;
      this.loading = true;
      this.paused = false;
      this.playing = true;
      this.notify();
      let buffer;
      try {
        buffer = await ctx.decodeAudioData(await song.blob.arrayBuffer());
      } catch {
        if (token !== this.token) return;
        if (tries + 1 >= this.songs.length) { this.stop(); return; }
        this.play((i + 1) % this.songs.length, tries + 1);
        return;
      }
      if (token !== this.token) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gain);
      source.onended = () => {
        if (token === this.token) this.next();
      };
      this.source = source;
      source.start();
      this.loading = false;
      this.notify();
    },

    start() {
      if (!this.songs.length) return;
      this.play(this.shuffle ? Math.floor(Math.random() * this.songs.length) : 0);
    },

    next() {
      const n = this.songs.length;
      if (!n) return;
      let i;
      if (this.shuffle && n > 1) {
        do { i = Math.floor(Math.random() * n); } while (i === this.index);
      } else {
        i = (this.index + 1) % n;
      }
      this.play(i);
    },

    prev() {
      const n = this.songs.length;
      if (!n) return;
      this.play((this.index - 1 + n) % n);
    },

    toggle() {
      if (!this.playing) { this.start(); return; }
      if (this.paused) {
        this.paused = false;
        if (this.context) this.context.resume();
      } else {
        this.paused = true;
        if (this.context) this.context.suspend();
      }
      this.notify();
    },

    stop() {
      this.token++;
      this.dropSource();
      this.playing = false;
      this.paused = false;
      this.loading = false;
      this.index = -1;
      this.current = null;
      if (this.context && this.context.state === "suspended") this.context.resume();
      this.notify();
    },

    setVolume(v) {
      this.volume = Math.max(0, Math.min(100, v));
      write(KEY.volume, String(this.volume));
      if (this.gain) this.gain.gain.value = this.volume / 100;
    },

    setShuffle(on) {
      this.shuffle = on;
      write(KEY.shuffle, on ? "1" : "0");
      this.notify();
    },
  };

  let autoplayArmed = false;

  function armAutoplay() {
    if (autoplayArmed || !musicSetting.get().on || !player.songs.length || player.playing) return;
    autoplayArmed = true;
    const go = () => {
      document.removeEventListener("pointerdown", go, true);
      document.removeEventListener("keydown", go, true);
      autoplayArmed = false;
      if (musicSetting.get().on && !player.playing) player.start();
    };
    document.addEventListener("pointerdown", go, true);
    document.addEventListener("keydown", go, true);
  }

  function mk(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function chip(label, on, onClick) {
    const b = mk("button", "wt-chip" + (on ? " is-on" : ""), label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  function toggleBtn(label, on, onClick) {
    const b = mk("button", "wt-toggle" + (on ? " is-on" : ""));
    b.type = "button";
    b.setAttribute("role", "switch");
    b.setAttribute("aria-checked", String(on));
    b.innerHTML = "<i></i><span></span>";
    b.querySelector("span").textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function setToggle(b, on) {
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-checked", String(on));
  }

  function fieldWithTop(label) {
    const field = mk("div", "wt-field wt-field-wide");
    const top = mk("div", "wt-fieldtop");
    const val = mk("b", "wt-val", "");
    top.append(mk("span", "", label), val);
    field.appendChild(top);
    return { field, top, val };
  }

  function toggleField(label, on, onClick) {
    const field = mk("div", "wt-field wt-field-wide wt-toggles");
    const btn = toggleBtn(label, on, onClick);
    field.appendChild(btn);
    return { field, btn };
  }

  const stopKeys = (el) => ["keydown", "keyup", "keypress"].forEach((t) => el.addEventListener(t, (e) => e.stopPropagation()));

  function themeBlocks() {
    const bootToggle = toggleField("Custom boot animation", getBoot(), () => {
      const next = !bootToggle.btn.classList.contains("is-on");
      setToggle(bootToggle.btn, next);
      write(KEY.boot, next ? "1" : "0");
    });
    const bootNote = mk("div", "wt-note", "Shows a spinning donut on the loading screen. Applies the next time you load a room.");

    const themeF = fieldWithTop("Theme");
    const chips = mk("div", "wt-chips");
    const sync = () => {
      const cur = getThemeId();
      for (const c of chips.children) c.classList.toggle("is-on", c.dataset.theme === cur);
      themeF.val.textContent = THEMES[cur].name;
    };
    for (const [id, t] of Object.entries(THEMES)) {
      const c = chip(t.name, false, () => { setTheme(id); sync(); });
      c.dataset.theme = id;
      chips.appendChild(c);
    }
    themeF.field.appendChild(chips);
    sync();
    return { nodes: [bootToggle.field, bootNote, themeF.field], sync };
  }

  function customBlocks(syncTheme) {
    const st = getCustom();

    const modeF = fieldWithTop("Style");
    const modeChips = mk("div", "wt-chips");
    const solidChip = chip("Solid color", false, () => { st.mode = "solid"; render(); commit(); });
    const gradChip = chip("Gradient", false, () => { st.mode = "gradient"; render(); commit(); });
    const resetChip = chip("Reset", false, () => { Object.assign(st, DEFAULT_CUSTOM); render(); commit(); });
    modeChips.append(solidChip, gradChip, resetChip);
    modeF.field.appendChild(modeChips);

    const presetF = fieldWithTop("Gradients");
    const presetChips = mk("div", "wt-chips");
    for (const [name, a, b, angle] of PRESETS) {
      const c = mk("button", "wt-chip");
      c.type = "button";
      const dot = mk("i", "bz-dot");
      dot.style.background = `linear-gradient(135deg,${a},${b})`;
      c.append(dot, document.createTextNode(name));
      c.addEventListener("click", () => {
        st.mode = "gradient"; st.c1 = a; st.c2 = b; st.angle = angle;
        render();
        commit();
      });
      presetChips.appendChild(c);
    }
    presetF.field.appendChild(presetChips);

    function colorRow(key) {
      const row = mk("div", "bz-row");
      const pick = mk("input", "bz-color");
      pick.type = "color";
      const txt = mk("input", "bz-text");
      txt.type = "text";
      txt.spellcheck = false;
      txt.placeholder = "#2d6cff  or  rgb(45, 108, 255)";
      stopKeys(txt);
      pick.addEventListener("input", () => {
        st[key] = pick.value;
        txt.value = pick.value;
        txt.classList.remove("is-bad");
        commit();
      });
      txt.addEventListener("input", () => {
        const c = parseColor(txt.value);
        if (!c) { txt.classList.toggle("is-bad", txt.value.trim() !== ""); return; }
        txt.classList.remove("is-bad");
        st[key] = toHex(c);
        pick.value = st[key];
        commit();
      });
      txt.addEventListener("change", () => {
        if (!txt.classList.contains("is-bad")) txt.value = st[key];
      });
      row.append(pick, txt);
      return { row, pick, txt };
    }

    const c1F = fieldWithTop("Color");
    const c1 = colorRow("c1");
    c1F.field.appendChild(c1.row);
    const c2F = fieldWithTop("Color 2");
    const c2 = colorRow("c2");
    c2F.field.appendChild(c2.row);

    const angF = fieldWithTop("Angle");
    const ang = mk("input");
    ang.type = "range"; ang.min = "0"; ang.max = "360"; ang.step = "5";
    ang.addEventListener("input", () => { st.angle = Number(ang.value); render(); commit(); });
    angF.field.appendChild(ang);

    const prevF = fieldWithTop("Preview");
    const preview = mk("div", "bz-preview");
    prevF.field.appendChild(preview);
    const note = mk("div", "wt-note", "Editing here switches the theme to Custom. Very dark or very light colors are adjusted a little so the text stays readable.");

    function render() {
      const grad = st.mode === "gradient";
      solidChip.classList.toggle("is-on", !grad);
      gradChip.classList.toggle("is-on", grad);
      modeF.val.textContent = grad ? "Gradient" : "Solid";
      presetF.field.style.display = grad ? "" : "none";
      c2F.field.style.display = grad ? "" : "none";
      angF.field.style.display = grad ? "" : "none";
      c1F.top.firstChild.textContent = grad ? "Color 1" : "Color";
      c1F.val.textContent = st.c1;
      c2F.val.textContent = st.c2;
      c1.pick.value = st.c1; c1.txt.value = st.c1;
      c2.pick.value = st.c2; c2.txt.value = st.c2;
      c1.txt.classList.remove("is-bad");
      c2.txt.classList.remove("is-bad");
      ang.value = String(st.angle);
      angF.val.textContent = st.angle + "\u00b0";
      preview.style.background = grad ? `linear-gradient(${st.angle}deg,${st.c1},${st.c2})` : st.c1;
    }

    function commit() {
      setCustom(st);
      write(KEY.theme, "custom");
      syncTheme();
      scheduleTheme(90);
    }

    render();
    return [modeF.field, presetF.field, c1F.field, c2F.field, angF.field, prevF.field, note];
  }

  function nameBlocks() {
    const t = toggleField("Show the RECZONE name", showsOriginalName(), () => {
      const next = !t.btn.classList.contains("is-on");
      setToggle(t.btn, next);
      write(KEY.origName, next ? "1" : "0");
      if (next) restoreNames();
      else scan(document.documentElement);
    });
    const note = mk("div", "wt-note", "Puts the original RECZONE name back everywhere instead of the BetterZone name.");
    return [t.field, note];
  }

  function knockBlocks() {
    const t = toggleField("Fewer knock checks", knockSetting.get().on, () => {
      knockSetting.save({ ...knockSetting.get(), on: !knockSetting.get().on });
    });
    const note = mk("div", "wt-note", "The game checks for dorm knocks every 5 seconds. With this on it checks less often. Knocks still show up when you open Dorms.");
    const f = fieldWithTop("Check for knocks");
    const chips = mk("div", "wt-chips");
    const choices = [[30, "30 s"], [60, "1 min"], [120, "2 min"], [300, "5 min"], [0, "Only when I open Dorms"]];
    for (const [secs, label] of choices) {
      const c = chip(label, false, () => knockSetting.save({ ...knockSetting.get(), seconds: secs }));
      c.dataset.secs = String(secs);
      chips.appendChild(c);
    }
    f.field.appendChild(chips);
    const sync = () => {
      const cfg = knockSetting.get();
      setToggle(t.btn, cfg.on);
      f.field.style.display = cfg.on ? "" : "none";
      for (const c of chips.children) c.classList.toggle("is-on", c.dataset.secs === String(cfg.seconds));
      const hit = choices.find(([s]) => s === cfg.seconds);
      f.val.textContent = !hit ? "" : cfg.seconds === 0 ? "only when Dorms opens" : "every " + hit[1];
    };
    sync();
    knockSetting.watch(t.btn, sync);
    return [t.field, note, f.field];
  }

  function fpsBlocks() {
    const t = toggleField("FPS counter", getFps().on, () => {
      const cfg = getFps();
      write(KEY.fps, JSON.stringify({ ...cfg, on: !cfg.on }));
      sync();
      applyFps();
    });
    const f = fieldWithTop("Corner");
    const chips = mk("div", "wt-chips");
    const corners = [["tl", "Top left"], ["tr", "Top right"], ["bl", "Bottom left"], ["br", "Bottom right"]];
    for (const [id, label] of corners) {
      const c = chip(label, false, () => {
        write(KEY.fps, JSON.stringify({ ...getFps(), corner: id }));
        sync();
        applyFps();
      });
      c.dataset.corner = id;
      chips.appendChild(c);
    }
    f.field.appendChild(chips);
    function sync() {
      const cfg = getFps();
      setToggle(t.btn, cfg.on);
      f.field.style.display = cfg.on ? "" : "none";
      for (const c of chips.children) c.classList.toggle("is-on", c.dataset.corner === cfg.corner);
      f.val.textContent = (corners.find(([id]) => id === cfg.corner) || [])[1] || "";
    }
    sync();
    return [t.field, f.field];
  }

  function musicBlocks() {
    const t = toggleField("Play my own music instead of the radio", musicSetting.get().on, () => {
      const on = !musicSetting.get().on;
      musicSetting.save({ on });
      if (on) player.start();
      else player.stop();
    });
    const note = mk("div", "wt-note", "Replaces the game's radio and menu music with songs from your computer. Reload the page after turning this on or off.");

    const songsF = fieldWithTop("Your songs");
    const picker = mk("input", "bz-file");
    picker.type = "file";
    picker.accept = "audio/*,.mp3";
    picker.multiple = true;
    picker.addEventListener("change", () => {
      player.add(picker.files);
      picker.value = "";
    });
    const songBar = mk("div", "wt-chips");
    songBar.append(
      chip("Add songs", false, () => picker.click()),
      chip("Remove all", false, () => player.clear())
    );
    const list = mk("div", "bz-songs");
    songsF.field.append(picker, songBar, list);

    const playF = fieldWithTop("Player");
    const controls = mk("div", "wt-chips");
    const playChip = chip("Play", false, () => player.toggle());
    const shuffleChip = chip("Shuffle", false, () => player.setShuffle(!player.shuffle));
    controls.append(chip("Previous", false, () => player.prev()), playChip, chip("Next", false, () => player.next()), shuffleChip);
    const vol = mk("input");
    vol.type = "range"; vol.min = "0"; vol.max = "100"; vol.step = "1";
    vol.addEventListener("input", () => { player.setVolume(Number(vol.value)); volLabel.textContent = "Volume " + player.volume; });
    const volLabel = mk("div", "wt-note");
    playF.field.append(controls, volLabel, vol);

    function sync() {
      const on = musicSetting.get().on;
      setToggle(t.btn, on);
      songsF.field.style.display = on ? "" : "none";
      playF.field.style.display = on ? "" : "none";
      const count = player.songs.length;
      songsF.val.textContent = count === 1 ? "1 song" : count + " songs";
      list.textContent = "";
      if (player.error) list.appendChild(mk("div", "bz-empty", player.error));
      else if (!count) list.appendChild(mk("div", "bz-empty", "Nothing here yet. Add some songs, or the radio will be silent."));
      player.songs.forEach((song, i) => {
        const row = mk("div", "bz-song" + (player.playing && i === player.index ? " is-on" : ""));
        const name = mk("span", "bz-songname", song.name);
        name.addEventListener("click", () => player.play(i));
        const x = mk("button", "bz-songx", "\u00d7");
        x.type = "button";
        x.title = "Remove";
        x.addEventListener("click", () => player.remove(song.id));
        row.append(name, x);
        list.appendChild(row);
      });
      playChip.textContent = player.playing && !player.paused ? "Pause" : "Play";
      shuffleChip.classList.toggle("is-on", player.shuffle);
      const now = player.playing && player.songs[player.index];
      playF.val.textContent = now ? (player.loading ? "loading " : "") + now.name : "stopped";
      vol.value = String(player.volume);
      volLabel.textContent = "Volume " + player.volume;
    }
    sync();
    musicSetting.watch(t.btn, sync);
    const view = () => {
      if (!t.btn.isConnected) { player.views.delete(view); return; }
      sync();
    };
    player.views.add(view);
    return [t.field, note, songsF.field, playF.field];
  }

  function buildSettingsSection(page) {
    const head = mk("div", "wt-group", "BetterZone Firefox Stable Version 1.0");
    const themeBlock = themeBlocks();
    const customHead = mk("div", "wt-group", "Custom theme");
    const pluginHead = mk("div", "wt-group", "Plugins");
    page.append(
      head, ...themeBlock.nodes,
      customHead, ...customBlocks(themeBlock.sync),
      pluginHead, ...nameBlocks(), ...knockBlocks(), ...fpsBlocks(), ...musicBlocks()
    );
  }

  function ensureSettings() {
    for (const page of document.querySelectorAll(".wt-settings:not([data-bz])")) {
      page.dataset.bz = "1";
      buildSettingsSection(page);
    }
  }

  function ensureBoot() {
    const boot = document.getElementById("boot");
    if (!boot || !getBoot()) return;
    let donut = boot.querySelector(".bz-donut");
    if (!donut) {
      donut = document.createElement("div");
      donut.className = "bz-donut";
      boot.appendChild(donut);
      boot.classList.add("bz-boot-on");
    }
    const mark = boot.querySelector(".mark");
    if (mark && mark.nextElementSibling !== donut) mark.after(donut);
  }

  const isOurs = (n) => {
    const el = n.nodeType === Node.ELEMENT_NODE ? n : n.parentElement;
    return !!el && el.id === "bz-theme";
  };

  function watchSheets(node) {
    if (node.nodeType !== Node.ELEMENT_NODE || isOurs(node)) return;
    const found = [];
    if (node.tagName === "STYLE" || (node.tagName === "LINK" && /stylesheet/i.test(node.rel))) found.push(node);
    if (node.querySelectorAll) found.push(...node.querySelectorAll('style, link[rel~="stylesheet"]'));
    for (const el of found) {
      if (el.id === "bz-theme") continue;
      if (el.tagName === "LINK") el.addEventListener("load", () => scheduleTheme(), { once: true });
      scheduleTheme();
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (isOurs(m.target)) continue;
      if (m.type === "characterData") {
        if (m.target.parentElement && m.target.parentElement.tagName === "STYLE") scheduleTheme();
        fixText(m.target);
      } else {
        for (const added of m.addedNodes) {
          scan(added);
          watchSheets(added);
        }
        if (m.target.tagName === "STYLE") scheduleTheme();
      }
    }
    ensureSettings();
    ensureBoot();
  });

  function start() {
    scan(document.documentElement);
    watchSheets(document.documentElement);
    applyTheme();
    ensureSettings();
    ensureBoot();
    applyFps();
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    document.addEventListener("DOMContentLoaded", () => scheduleTheme());
    window.addEventListener("load", () => scheduleTheme());
    player.load().then(armAutoplay);
  }

  start();
})();
