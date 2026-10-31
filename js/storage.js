// ============================================================
// VolleyScore — js/storage.js  (IndexedDB fallback and the localStorage storage layer)
// Classic script: shares one global scope with the other js/*.js files.
// Load order is set by the <script> tags in index.html and listed in sw.js.
// © 2025 Jared Mathes — CC BY-NC-SA 4.0
// ============================================================

"use strict";

// ---- IndexedDB fallback ---------------------------------

var _idb = null;

function openIdb() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise(function (resolve, reject) {
    if (typeof indexedDB === "undefined" || !indexedDB) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    var req;
    try {
      req = indexedDB.open("volleyscore", 1);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = function () {
      var db = req.result;
      if (!db.objectStoreNames.contains("games")) {
        db.createObjectStore("games", { keyPath: "gameId" });
      }
    };
    req.onsuccess = function () { _idb = req.result; resolve(_idb); };
    req.onerror = function () { reject(req.error || new Error("IDB open failed")); };
  });
}

function idbPut(record) {
  return openIdb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction("games", "readwrite");
      var req = tx.objectStore("games").put(record);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

function idbGet(gameId) {
  return openIdb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction("games", "readonly");
      var req = tx.objectStore("games").get(gameId);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  });
}

function idbDelete(gameId) {
  return openIdb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction("games", "readwrite");
      tx.objectStore("games").delete(gameId);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

function idbGetAll() {
  return openIdb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction("games", "readonly");
      var req = tx.objectStore("games").getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
  });
}

// ---- Storage Layer (localStorage + IDB fallback) --------

// Game index: lightweight metadata for all games
function loadIndex() {
  try {
    var raw = localStorage.getItem(LS_INDEX);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveIndex(index) {
  try {
    localStorage.setItem(LS_INDEX, JSON.stringify(index));
  } catch (e) { /* ignore quota on index — unlikely */ }
}

function updateIndexEntry(entry) {
  var index = loadIndex();
  var i = index.findIndex(function (x) { return x.gameId === entry.gameId; });
  if (i >= 0) index[i] = entry;
  else index.push(entry);
  saveIndex(index);
}

function removeIndexEntry(gameId) {
  var index = loadIndex().filter(function (x) { return x.gameId !== gameId; });
  saveIndex(index);
}

function indexEntryFromRecord(record) {
  var derived = null;
  try {
    derived = deriveGameState({ events: record.events || [], cursor: record.cursor != null ? record.cursor : (record.events || []).length });
  } catch (e) { /* fall back to createdAt */ }
  return {
    gameId: record.gameId,
    gameName: record.gameName,
    teamA: record.teamA,
    teamB: record.teamB,
    gameFormat: record.gameFormat,
    variation: record.variation,
    scheduledAt: record.scheduledAt,
    createdAt: record.createdAt,
    startedAt: derived ? derived.startedAt : record.createdAt,
    updatedAt: record.updatedAt,
    endedAt: record.endedAt,
    storage: record._storage || "ls",
  };
}

// Save full game record (try localStorage, fall back to IDB)
async function dbSaveGame(record) {
  record.updatedAt = new Date().toISOString();
  var key = LS_PREFIX + record.gameId;
  var saved = false;
  try {
    localStorage.setItem(key, JSON.stringify(record));
    record._storage = "ls";
    saved = true;
  } catch (e) {
    if (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED") {
      // localStorage full – remove old key if it was there, use IDB
      try { localStorage.removeItem(key); } catch (_) { /* ignore */ }
    } else {
      // Other error: still try IDB
    }
  }
  if (!saved) {
    record._storage = "idb";
    try {
      await idbPut(record);
    } catch (idbErr) {
      showStorageError("⚠️ Could not save game data. Storage may be full.");
    }
  }
  updateIndexEntry(indexEntryFromRecord(record));
  localStorage.setItem(LS_CURRENT, record.gameId);
}

// Load a single game record
async function dbLoadGame(gameId) {
  // Try localStorage first
  try {
    var raw = localStorage.getItem(LS_PREFIX + gameId);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through */ }
  // Try IndexedDB
  try {
    return await idbGet(gameId);
  } catch (e) { return null; }
}

// List all games (uses index)
// Sorted by when the game actually happened (first set start, else createdAt), not when its
// record was last saved — otherwise editing a completed game's info would bump it to the top.
function dbListGames() {
  return loadIndex().sort(function (a, b) {
    var da = new Date(a.startedAt || a.createdAt || a.scheduledAt || a.updatedAt).getTime();
    var db2 = new Date(b.startedAt || b.createdAt || b.scheduledAt || b.updatedAt).getTime();
    return db2 - da; // newest first
  });
}

// Delete a game
async function dbDeleteGame(gameId) {
  var index = loadIndex();
  var entry = index.find(function (x) { return x.gameId === gameId; });
  if (entry && entry.storage === "idb") {
    try { await idbDelete(gameId); } catch (e) { /* ignore */ }
  }
  try { localStorage.removeItem(LS_PREFIX + gameId); } catch (e) { /* ignore */ }
  removeIndexEntry(gameId);
  var current = localStorage.getItem(LS_CURRENT);
  if (current === gameId) localStorage.removeItem(LS_CURRENT);
}

// Clear all games
async function dbClearAll() {
  var index = loadIndex();
  for (var i = 0; i < index.length; i++) {
    try { localStorage.removeItem(LS_PREFIX + index[i].gameId); } catch (e) { /* ignore */ }
    if (index[i].storage === "idb") {
      try { await idbDelete(index[i].gameId); } catch (e) { /* ignore */ }
    }
  }
  localStorage.removeItem(LS_INDEX);
  localStorage.removeItem(LS_CURRENT);
}

var _storageErrorShown = false;
function showStorageError(msg) {
  if (_storageErrorShown) return;
  _storageErrorShown = true;
  var banner = document.getElementById("storageBanner");
  if (banner) { banner.textContent = msg; banner.removeAttribute("hidden"); }
}

