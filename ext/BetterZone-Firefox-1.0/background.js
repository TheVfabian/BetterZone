"use strict";

const ext = typeof browser !== "undefined" ? browser : chrome;

const knockDefault = { on: false, seconds: 60 };
const musicDefault = { on: false };
let knock = { ...knockDefault };
let music = { ...musicDefault };
let lastKnockPoll = 0;

ext.storage.local.get(["bzKnock", "bzMusic"]).then((r) => {
  if (r && r.bzKnock) knock = { ...knockDefault, ...r.bzKnock };
  if (r && r.bzMusic) music = { ...musicDefault, ...r.bzMusic };
});

ext.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.bzKnock) knock = { ...knockDefault, ...(changes.bzKnock.newValue || {}) };
  if (changes.bzMusic) music = { ...musicDefault, ...(changes.bzMusic.newValue || {}) };
});

function pathOf(url) {
  try { return new URL(url).pathname; } catch { return ""; }
}

function onKnockPoll(details) {
  if (!knock.on || details.method !== "GET") return {};
  if (pathOf(details.url).replace(/\/+$/, "") !== "/api/dorms/knocks") return {};
  const now = Date.now();
  if (knock.seconds > 0 && now - lastKnockPoll >= knock.seconds * 1000) {
    lastKnockPoll = now;
    return {};
  }
  return { cancel: true };
}

function onMusicRequest(details) {
  if (!music.on || details.method !== "GET") return {};
  const path = pathOf(details.url);
  if (path.replace(/\/+$/, "") === "/api/music" || path.startsWith("/uploads/music/")) return { cancel: true };
  return {};
}

ext.webRequest.onBeforeRequest.addListener(
  onKnockPoll,
  { urls: ["*://rec.zone/api/dorms/knocks*", "*://www.rec.zone/api/dorms/knocks*"] },
  ["blocking"]
);

ext.webRequest.onBeforeRequest.addListener(
  onMusicRequest,
  {
    urls: [
      "*://rec.zone/api/music*",
      "*://www.rec.zone/api/music*",
      "*://rec.zone/uploads/music/*",
      "*://www.rec.zone/uploads/music/*",
    ],
  },
  ["blocking"]
);
