// ============================================================
// VolleyScore — sw.js  (Service Worker)
// Cache-first strategy with background refresh for fast, offline-capable loading.
// IMPORTANT: bump CACHE_VERSION when deploying updates to invalidate old caches.
// ============================================================

"use strict";

var CACHE_VERSION = "v10";
var CACHE_NAME    = "volleyscore-" + CACHE_VERSION;

var CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon.svg",
];

// ---- Install: pre-cache all core assets ----
self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(CORE_ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

// ---- Activate: delete caches from previous versions ----
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) { return k !== CACHE_NAME; })
          .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

// ---- Fetch: cache-first with background network refresh ----
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    caches.match(e.request).then(function (cached) {
      // Serve cached version immediately; silently refresh it in the background
      if (cached) {
        fetch(e.request).then(function (res) {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then(function (c) { c.put(e.request, res); });
          }
        }).catch(function () {});
        return cached;
      }
      // Not yet cached — fetch from network and store for next time
      return fetch(e.request).then(function (res) {
        if (res && res.status === 200) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(e.request, clone); });
        }
        return res;
      });
    })
  );
});
