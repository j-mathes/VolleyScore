// ============================================================
// VolleyScore — app.js
// All domain logic, persistence, and UI wiring in one file.
// Open index.html directly in a browser (or host on GitHub Pages).
// © 2025 Jared Mathes — CC BY-NC-SA 4.0
// ============================================================

"use strict";

// ---- Polyfills -------------------------------------------

// crypto.randomUUID — Safari 15.3 and earlier lack this
if (typeof crypto !== "undefined" && typeof crypto.randomUUID !== "function") {
  crypto.randomUUID = function () {
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.from(b).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
  };
}

// iOS/iPadOS detection (iPad Pro reports as MacIntel + touch)
var _isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// ---- Constants & Config ---------------------------------

// Triple ball phase definitions: who has the ball at each phase (0-5)
// Cycle: A Serves → Toss to B → Toss to A → B Serves → Toss to A → Toss to B
var TB_PHASE_TEAMS = ["A", "B", "A", "B", "A", "B"];
var TB_PHASE_LABELS = ["A Serves", "→ B (Toss)", "→ A (Toss)", "B Serves", "→ A (Toss)", "→ B (Toss)"];

// Storage keys
var LS_INDEX = "vs_index";        // game index (lightweight metadata)
var LS_PREFIX = "vs_g_";          // full game record prefix
var LS_CURRENT = "vs_current";    // ID of current/last active game
var LS_SETTINGS = "vs_settings";  // user settings

// Default settings
var DEFAULT_SETTINGS = {
  darkMode: false,
  fontSize: "medium",
  teamAColor: "#1d4ed8",
  teamBColor: "#b91c1c",
  defaultFormat: "best3",
  defaultTimeouts: 2,
  defaultSubs: 6,
};

// ---- Settings -------------------------------------------

var settings = Object.assign({}, DEFAULT_SETTINGS);

function loadSettings() {
  try {
    var raw = localStorage.getItem(LS_SETTINGS);
    if (raw) {
      settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
    }
  } catch (e) { /* ignore */ }
}

function saveSettings() {
  try {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  } catch (e) { /* ignore */ }
}

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
  return {
    gameId: record.gameId,
    gameName: record.gameName,
    teamA: record.teamA,
    teamB: record.teamB,
    gameFormat: record.gameFormat,
    variation: record.variation,
    scheduledAt: record.scheduledAt,
    createdAt: record.createdAt,
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
function dbListGames() {
  return loadIndex().sort(function (a, b) {
    var da = new Date(a.updatedAt || a.createdAt).getTime();
    var db2 = new Date(b.updatedAt || b.createdAt).getTime();
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

// ---- Timeline Engine ------------------------------------

function applyEvent(timeline, event) {
  var kept = timeline.events.slice(0, timeline.cursor);
  kept.push(event);
  return { events: kept, cursor: kept.length };
}

function undoTimeline(timeline) {
  if (timeline.cursor === 0) return timeline;
  return { events: timeline.events, cursor: timeline.cursor - 1 };
}

function redoTimeline(timeline) {
  if (timeline.cursor >= timeline.events.length) return timeline;
  return { events: timeline.events, cursor: timeline.cursor + 1 };
}

// ---- Derived State (replay timeline → game state) -------

function deriveGameState(timeline) {
  if (!timeline || !timeline.events || timeline.events.length === 0) return null;

  var events = timeline.events.slice(0, timeline.cursor);
  var startEv = events.find(function (e) { return e.type === "GAME_STARTED"; });
  if (!startEv) return null;

  // Sets map: setNumber → set data
  var setsMap = {};
  var activeSetNumber = null;
  var endedAt = null;
  var improperRequestA = false; // match-wide: one free per team
  var improperRequestB = false;

  function getOrCreateSet(n) {
    if (!setsMap[n]) {
      setsMap[n] = {
        setNumber: n,
        scoreA: 0, scoreB: 0,
        timeoutsA: 0, timeoutsB: 0,
        subsA: 0, subsB: 0,
        sanctionsA: [], sanctionsB: [],
        delaySanctionsA: [], delaySanctionsB: [],
        firstServer: "A",
        startedAt: null,
        endedAt: null,
      };
    }
    return setsMap[n];
  }

  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    switch (ev.type) {
      case "SET_STARTED": {
        activeSetNumber = ev.setNumber;
        var s = getOrCreateSet(ev.setNumber);
        s.firstServer = ev.firstServer || "A";
        s.startedAt = ev.timestamp;
        break;
      }
      case "SET_ENDED": {
        var se = setsMap[ev.setNumber];
        if (se) se.endedAt = ev.timestamp;
        if (activeSetNumber === ev.setNumber) activeSetNumber = null;
        break;
      }
      case "GAME_ENDED": {
        endedAt = ev.timestamp;
        activeSetNumber = null;
        break;
      }
      case "POINT_SCORED": {
        var ps = getOrCreateSet(ev.setNumber);
        if (ev.team === "A") ps.scoreA = Math.max(0, ps.scoreA + ev.delta);
        else ps.scoreB = Math.max(0, ps.scoreB + ev.delta);
        break;
      }
      case "TIMEOUT_TAKEN": {
        var to = getOrCreateSet(ev.setNumber);
        if (ev.team === "A") to.timeoutsA++;
        else to.timeoutsB++;
        break;
      }
      case "SUBSTITUTION": {
        var sub = getOrCreateSet(ev.setNumber);
        if (ev.team === "A") sub.subsA++;
        else sub.subsB++;
        break;
      }
      case "SANCTION": {
        var san = getOrCreateSet(ev.setNumber);
        var sanList = ev.team === "A" ? san.sanctionsA : san.sanctionsB;
        sanList.push({ type: ev.sanctionType, player: ev.playerNumber || null, role: ev.role || "player", timestamp: ev.timestamp });
        break;
      }
      case "DELAY_SANCTION": {
        var ds = getOrCreateSet(ev.setNumber);
        var dsList = ev.team === "A" ? ds.delaySanctionsA : ds.delaySanctionsB;
        dsList.push({ type: ev.sanctionType, timestamp: ev.timestamp });
        break;
      }
      case "IMPROPER_REQUEST": {
        if (ev.team === "A") improperRequestA = true;
        else improperRequestB = true;
        break;
      }
      /* SERVE_CHANGED is handled by serving team derivation below */
    }
  }

  // Build ordered sets array
  var setsArray = Object.keys(setsMap)
    .map(function (k) { return setsMap[k]; })
    .sort(function (a, b) { return a.setNumber - b.setNumber; });

  // Sets won
  var setsWonA = 0, setsWonB = 0;
  setsArray.forEach(function (s) {
    if (s.endedAt) {
      if (s.scoreA > s.scoreB) setsWonA++;
      else if (s.scoreB > s.scoreA) setsWonB++;
    }
  });

  // Total sets & win threshold by format
  var formatInfo = {
    "single":   { total: 1, toWin: 1 },
    "straight2":{ total: 2, toWin: 2 },
    "best3":    { total: 3, toWin: 2 },
    "best5":    { total: 5, toWin: 3 },
  }[startEv.gameFormat] || { total: 3, toWin: 2 };

  // Serving team in active set
  var servingTeam = startEv.firstServer || "A";
  if (activeSetNumber) {
    var activeSet = setsMap[activeSetNumber];
    if (activeSet) servingTeam = activeSet.firstServer;
    // Find last POINT_SCORED or SERVE_CHANGED in active set
    for (var j = events.length - 1; j >= 0; j--) {
      var je = events[j];
      if (je.setNumber !== activeSetNumber) continue;
      if (je.type === "POINT_SCORED" && je.delta > 0) { servingTeam = je.team; break; }
      if (je.type === "SERVE_CHANGED") { servingTeam = je.team; break; }
    }
  }

  // Triple ball phase (derived from total points in active set)
  var tripleBallPhase = 0;
  if (startEv.variation === "triplebal" && activeSetNumber) {
    var tbSet = setsMap[activeSetNumber];
    if (tbSet) tripleBallPhase = (tbSet.scoreA + tbSet.scoreB) % 6;
  }

  // Next set number
  var nextSetNum = setsArray.length + 1;

  // Can end game?
  var completedSets = setsArray.filter(function (s) { return !!s.endedAt; }).length;
  var gameCanEnd = !endedAt && (
    setsWonA >= formatInfo.toWin ||
    setsWonB >= formatInfo.toWin ||
    completedSets >= formatInfo.total
  );

  return {
    gameId: startEv.gameId,
    gameName: startEv.gameName || "Untitled Game",
    teamA: startEv.teamA || "Team A",
    teamB: startEv.teamB || "Team B",
    location: startEv.location || "",
    scheduledAt: startEv.scheduledAt || null,
    gameFormat: startEv.gameFormat || "best3",
    variation: startEv.variation || "standard",
    timeoutsPerSet: startEv.timeoutsPerSet || 2,
    subsPerSet: startEv.subsPerSet || 6,
    firstServer: startEv.firstServer || "A",
    startedAt: startEv.timestamp,
    endedAt: endedAt,
    activeSetNumber: activeSetNumber,
    sets: setsArray,
    setsWonA: setsWonA,
    setsWonB: setsWonB,
    totalSets: formatInfo.total,
    setsToWin: formatInfo.toWin,
    servingTeam: servingTeam,
    tripleBallPhase: tripleBallPhase,
    nextSetNum: nextSetNum,
    gameCanEnd: gameCanEnd,
    improperRequestA: improperRequestA,
    improperRequestB: improperRequestB,
    cursor: timeline.cursor,
    canUndo: timeline.cursor > 0,
    canRedo: timeline.cursor < timeline.events.length,
  };
}

// ---- Controller -----------------------------------------

var controller = {
  timeline: { events: [], cursor: 0 },
  currentGameId: null,
  _state: null, // cached derived state

  dispatch: function (event) {
    this.timeline = applyEvent(this.timeline, event);
    this._state = deriveGameState(this.timeline);
    scheduleAutoSave();
  },

  undo: function () {
    this.timeline = undoTimeline(this.timeline);
    this._state = deriveGameState(this.timeline);
    scheduleAutoSave();
  },

  redo: function () {
    this.timeline = redoTimeline(this.timeline);
    this._state = deriveGameState(this.timeline);
    scheduleAutoSave();
  },

  getState: function () {
    return this._state;
  },

  hydrate: function (record) {
    this.timeline = { events: record.events || [], cursor: record.cursor || 0 };
    this.currentGameId = record.gameId;
    this._state = deriveGameState(this.timeline);
    localStorage.setItem(LS_CURRENT, record.gameId);
  },

  clear: function () {
    this.timeline = { events: [], cursor: 0 };
    this.currentGameId = null;
    this._state = null;
  },

  toRecord: function () {
    if (!this.currentGameId) return null;
    var state = this._state;
    if (!state) return null;
    var start = this.timeline.events.find(function (e) { return e.type === "GAME_STARTED"; });
    return {
      gameId: this.currentGameId,
      gameName: state.gameName,
      teamA: state.teamA,
      teamB: state.teamB,
      location: state.location,
      scheduledAt: state.scheduledAt,
      gameFormat: state.gameFormat,
      variation: state.variation,
      timeoutsPerSet: state.timeoutsPerSet,
      subsPerSet: state.subsPerSet,
      createdAt: start ? start.timestamp : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      endedAt: state.endedAt || null,
      cursor: this.timeline.cursor,
      events: this.timeline.events,
    };
  },
};

// ---- Auto-save ------------------------------------------

var _autoSaveTimer = null;

function scheduleAutoSave() {
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(function () {
    _autoSaveTimer = null;
    void persistGame();
  }, 400);
}

async function persistGame() {
  var record = controller.toRecord();
  if (!record) return;
  await dbSaveGame(record);
}

window.addEventListener("beforeunload", function () {
  // Flush pending auto-save synchronously where possible
  if (_autoSaveTimer) {
    clearTimeout(_autoSaveTimer);
    _autoSaveTimer = null;
    var record = controller.toRecord();
    if (record) {
      try { localStorage.setItem(LS_PREFIX + record.gameId, JSON.stringify(record)); } catch (e) { /* ignore */ }
      updateIndexEntry(indexEntryFromRecord(record));
    }
  }
});

// ---- Export / Import ------------------------------------

function downloadFile(filename, content, mimeType) {
  var blob = new Blob([content], { type: mimeType });
  var url = URL.createObjectURL(blob);
  if (_isIOS) {
    // iOS Safari ignores <a download>; open in new tab so user can save
    window.open(url, "_blank");
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  } else {
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

function gameFilename(record) {
  var slug = (record.gameName || "game").replace(/[^a-zA-Z0-9_-]/g, "_");
  var date = (record.scheduledAt || record.createdAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  return "volleyscore_" + slug + "_" + date + ".json";
}

function exportRecord(record) {
  var payload = {
    version: 1,
    type: "volleyscore-game",
    exportedAt: new Date().toISOString(),
    game: record,
  };
  downloadFile(gameFilename(record), JSON.stringify(payload, null, 2), "application/json");
}

async function exportAllGames() {
  var index = dbListGames();
  var games = [];
  for (var i = 0; i < index.length; i++) {
    var r = await dbLoadGame(index[i].gameId);
    if (r) games.push(r);
  }
  var payload = {
    version: 1,
    type: "volleyscore-export",
    exportedAt: new Date().toISOString(),
    games: games,
  };
  downloadFile("volleyscore_export_" + new Date().toISOString().slice(0, 10) + ".json",
    JSON.stringify(payload, null, 2), "application/json");
}

async function importGamesFromJson(text) {
  var payload;
  try { payload = JSON.parse(text); } catch (e) { alert("Invalid JSON file."); return; }

  var games = [];
  if (payload.type === "volleyscore-game" && payload.game) {
    games = [payload.game];
  } else if (payload.type === "volleyscore-export" && Array.isArray(payload.games)) {
    games = payload.games;
  } else if (payload.gameId) {
    // Raw game record
    games = [payload];
  } else {
    alert("Unrecognized file format.");
    return;
  }

  var imported = 0;
  for (var i = 0; i < games.length; i++) {
    var g = games[i];
    if (!g.gameId || !Array.isArray(g.events)) continue;
    await dbSaveGame(g);
    imported++;
  }
  alert("Imported " + imported + " game" + (imported === 1 ? "" : "s") + ".");
  await renderGamesList();
  renderRecentGames();
}

// ---- UI Utilities ---------------------------------------

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function $(id) { return document.getElementById(id); }

function formatTime(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toLocalDatetimeValue(d) {
  var pad = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function cardHtml(stype) {
  switch (stype) {
    case "yellow":           return '<span class="card-icon card-y" aria-label="Yellow card"></span>';
    case "red":              return '<span class="card-icon card-r" aria-label="Red card"></span>';
    case "expulsion":        return '<span class="card-icon card-y"></span><span class="card-icon card-r" aria-label="Expulsion"></span>';
    case "disqualification": return '<span class="card-icon card-y"></span><span class="card-icon card-r card-r-offset" aria-label="Disqualification"></span>';
    default:                 return '<span class="card-icon card-y"></span>';
  }
}

function delaySanctionHtml(dtype) {
  switch (dtype) {
    case "warning": return '<span class="card-icon card-y card-small" title="Delay warning"></span>';
    case "penalty":  return '<span class="card-icon card-r card-small" title="Delay penalty"></span>';
    default:        return "";
  }
}

// ---- Page navigation ------------------------------------

var currentPage = "score";

function showPage(page) {
  currentPage = page;
  $("scorePage").hidden  = page !== "score";
  $("gamesPage").hidden  = page !== "games";
  $("setupPage").hidden  = page !== "setup";
  $("logPage").hidden    = page !== "log";

  document.querySelectorAll(".nav-btn").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-page") === page);
  });

  if (page === "games") { void renderGamesList(); }
  if (page === "setup") { renderSetupPage(); }
  if (page === "log")   { renderLogPage(); }
}

// ---- Score Page — Game Setup Form ----------------------

var setupFirstServer = "A";
var setupTimeouts = 2;
var setupSubs = 6;

function initGameSetupForm() {
  // Prefill defaults from settings
  document.querySelector('input[name="gameFormat"][value="' + settings.defaultFormat + '"]').checked = true;
  setupTimeouts = settings.defaultTimeouts;
  setupSubs = settings.defaultSubs;
  $("cfgTimeouts").textContent = setupTimeouts;
  $("cfgSubs").textContent = setupSubs;
  $("cfgScheduledAt").value = toLocalDatetimeValue(new Date());

  // Team name placeholders reflect first-serve selection
  updateFirstServeBtnLabels();
}

function updateFirstServeBtnLabels() {
  var btnA = $("btnFirstServeA");
  var btnB = $("btnFirstServeB");
  var nameA = $("cfgTeamA").value.trim() || "Team A";
  var nameB = $("cfgTeamB").value.trim() || "Team B";
  btnA.textContent = nameA;
  btnB.textContent = nameB;
  btnA.classList.toggle("active", setupFirstServer === "A");
  btnB.classList.toggle("active", setupFirstServer === "B");
}

function wireGameSetupForm() {
  $("cfgTeamA").addEventListener("input", updateFirstServeBtnLabels);
  $("cfgTeamB").addEventListener("input", updateFirstServeBtnLabels);

  $("btnFirstServeA").addEventListener("click", function () {
    setupFirstServer = "A";
    updateFirstServeBtnLabels();
  });
  $("btnFirstServeB").addEventListener("click", function () {
    setupFirstServer = "B";
    updateFirstServeBtnLabels();
  });

  // Timeout stepper
  $("btnToDown").addEventListener("click", function () {
    if (setupTimeouts > 0) { setupTimeouts--; $("cfgTimeouts").textContent = setupTimeouts; }
  });
  $("btnToUp").addEventListener("click", function () {
    if (setupTimeouts < 5) { setupTimeouts++; $("cfgTimeouts").textContent = setupTimeouts; }
  });

  // Sub stepper
  $("btnSubsDown").addEventListener("click", function () {
    if (setupSubs > 0) { setupSubs--; $("cfgSubs").textContent = setupSubs; }
  });
  $("btnSubsUp").addEventListener("click", function () {
    if (setupSubs < 18) { setupSubs++; $("cfgSubs").textContent = setupSubs; }
  });

  // Start game
  $("btnStartGame").addEventListener("click", function () {
    void startNewGame();
  });
}

async function startNewGame() {
  var teamA = $("cfgTeamA").value.trim() || "Team A";
  var teamB = $("cfgTeamB").value.trim() || "Team B";
  var location = $("cfgLocation").value.trim();
  var scheduledAt = $("cfgScheduledAt").value || toLocalDatetimeValue(new Date());
  var gameFormat = document.querySelector('input[name="gameFormat"]:checked').value;
  var variation  = document.querySelector('input[name="variation"]:checked').value;
  var gameId = crypto.randomUUID();
  var now = new Date().toISOString();

  controller.clear();
  controller.currentGameId = gameId;
  selectedLogSetFilter = null; // reset filter for new game
  sidesSwapped = false;        // reset side layout for new game

  var startEvent = {
    type: "GAME_STARTED",
    gameId: gameId,
    gameName: teamA + " vs " + teamB,
    teamA: teamA,
    teamB: teamB,
    location: location,
    scheduledAt: scheduledAt,
    gameFormat: gameFormat,
    variation: variation,
    timeoutsPerSet: setupTimeouts,
    subsPerSet: setupSubs,
    firstServer: setupFirstServer,
    timestamp: now,
  };
  controller.dispatch(startEvent);

  // Auto-start set 1
  controller.dispatch({
    type: "SET_STARTED",
    setNumber: 1,
    firstServer: setupFirstServer,
    timestamp: now,
  });

  await persistGame();
  showScoreboard();
  renderScoreboard();
}

// ---- Score Page — Scoreboard ----------------------------

var sanctionTargetTeam = null;     // "A" or "B"
var sanctionSelectedRole = "player"; // current role in misconduct sanction
var pendingServePickTeam = null;   // for between-sets serve selection
var selectedLogSetFilter = null;   // null = all sets; number = filter log to that set
var sidesSwapped = false;          // true when Team B panel is visually on the left

function showScoreboard() {
  $("gameSetupPanel").hidden = true;
  $("scoreboard").hidden = false;
  updateTeamColors();
}

function showSetupPanel() {
  $("scoreboard").hidden = true;
  $("gameSetupPanel").hidden = false;
  $("navLogBtn").hidden = true; // no active game on setup panel
  initGameSetupForm();
  renderRecentGames();
}

// Apply team colors from state (or CSS vars)
function updateTeamColors() {
  var root = document.documentElement;
  root.style.setProperty("--team-a", settings.teamAColor);
  // Generate light variant (15% opacity approximation via rgba)
  var aRgb = hexToRgb(settings.teamAColor);
  var bRgb = hexToRgb(settings.teamBColor);
  if (aRgb) root.style.setProperty("--team-a-light", "rgba(" + aRgb + ",0.12)");
  root.style.setProperty("--team-b", settings.teamBColor);
  if (bRgb) root.style.setProperty("--team-b-light", "rgba(" + bRgb + ",0.12)");
}

function hexToRgb(hex) {
  var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  return parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16);
}

// Update the team-panels flex order and side indicator to reflect sidesSwapped
function updateSidesDisplay(state) {
  var panels = $("teamPanels");
  if (panels) panels.classList.toggle("sides-swapped", sidesSwapped);

  var btn = $("btnSwitchSides");
  if (btn) btn.title = sidesSwapped ? "Restore original sides" : "Swap which side each team appears on";

  var indicator = $("sideIndicator");
  if (indicator && state) {
    indicator.textContent = sidesSwapped
      ? "\u21C4 " + state.teamB + " left \u00B7 " + state.teamA + " right"
      : "";
  }
}

// ---- Main scoreboard render ----

function renderScoreboard() {
  var state = controller.getState();

  if (!state) {
    showSetupPanel();
    return;
  }

  // Sync team names
  $("sbTeamAName").textContent = state.teamA;
  $("sbTeamBName").textContent = state.teamB;
  $("btnFirstServeA").textContent = state.teamA;
  $("btnFirstServeB").textContent = state.teamB;
  $("btnPickServeA").textContent = state.teamA;
  $("btnPickServeB").textContent = state.teamB;

  // Game bar
  $("sbGameName").textContent = state.gameName;
  $("sbFormat").textContent = formatLabel(state.gameFormat);

  var setLabelText;
  if (state.endedAt) {
    setLabelText = "Final";
  } else if (state.activeSetNumber) {
    setLabelText = "Set " + state.activeSetNumber;
  } else {
    setLabelText = "Between Sets";
  }
  $("sbSetLabel").textContent = setLabelText;
  $("sbSetsA").textContent = state.setsWonA;
  $("sbSetsB").textContent = state.setsWonB;

  // Active set data
  var activeSet = state.activeSetNumber
    ? state.sets.find(function (s) { return s.setNumber === state.activeSetNumber; })
    : null;

  var scoreA = activeSet ? activeSet.scoreA : 0;
  var scoreB = activeSet ? activeSet.scoreB : 0;

  setScoreDisplay("scoreValA", scoreA);
  setScoreDisplay("scoreValB", scoreB);

  // Sub max display
  $("subMaxA").textContent = state.subsPerSet;
  $("subMaxB").textContent = state.subsPerSet;
  $("subValA").textContent = activeSet ? activeSet.subsA : 0;
  $("subValB").textContent = activeSet ? activeSet.subsB : 0;

  // Timeout dots
  renderTimeoutDots("toDotsA", "toCountA", activeSet ? activeSet.timeoutsA : 0, state.timeoutsPerSet);
  renderTimeoutDots("toDotsB", "toCountB", activeSet ? activeSet.timeoutsB : 0, state.timeoutsPerSet);
  $("btnToA").classList.toggle("to-exhausted", activeSet && activeSet.timeoutsA >= state.timeoutsPerSet);
  $("btnToB").classList.toggle("to-exhausted", activeSet && activeSet.timeoutsB >= state.timeoutsPerSet);

  // Sub exhausted highlight
  $("btnSubA").classList.toggle("sub-exhausted", activeSet && activeSet.subsA >= state.subsPerSet);
  $("btnSubB").classList.toggle("sub-exhausted", activeSet && activeSet.subsB >= state.subsPerSet);

  // Serve dot
  var servingA = !!state.activeSetNumber && state.servingTeam === "A";
  var servingB = !!state.activeSetNumber && state.servingTeam === "B";
  $("serveDotA").classList.toggle("active", servingA);
  $("serveDotB").classList.toggle("active", servingB);

  // Sanctions display — aggregate across all sets (sanctions are match-wide)
  var allSanctionsA = state.sets.reduce(function (acc, s) { return acc.concat(s.sanctionsA); }, []);
  var allSanctionsB = state.sets.reduce(function (acc, s) { return acc.concat(s.sanctionsB); }, []);
  var allDelayA = state.sets.reduce(function (acc, s) { return acc.concat(s.delaySanctionsA); }, []);
  var allDelayB = state.sets.reduce(function (acc, s) { return acc.concat(s.delaySanctionsB); }, []);
  renderSanctionsBar("sanctionsBarA", allSanctionsA, allDelayA, state.improperRequestA);
  renderSanctionsBar("sanctionsBarB", allSanctionsB, allDelayB, state.improperRequestB);

  // Triple ball
  var isTriple = state.variation === "triplebal";
  $("tripleBallBar").hidden = !isTriple;
  if (isTriple && state.activeSetNumber) {
    renderTripleBall(state.tripleBallPhase);
  }

  // Control buttons
  var hasActiveSet = !!state.activeSetNumber;
  var isGameOver = !!state.endedAt;
  var isBetweenSets = !isGameOver && !hasActiveSet;

  $("btnEndSet").hidden = !hasActiveSet;
  $("btnEndSet").disabled = !hasActiveSet;
  $("btnStartNextSet").hidden = !isBetweenSets;
  $("btnStartNextSet").disabled = isGameOver;
  $("nextSetNum").textContent = state.nextSetNum;
  $("btnEndGame").hidden = isGameOver;
  $("btnEndGame").disabled = !state.gameCanEnd && !hasActiveSet && !isBetweenSets;
  $("btnNewGame").hidden = !isGameOver;

  // Between-sets serve picker
  $("servePicker").hidden = !isBetweenSets;
  if (isBetweenSets) {
    $("servePickerSetNum").textContent = state.nextSetNum;
    // Pre-suggest server (alternates from last set's first server)
    if (pendingServePickTeam === null) {
      var prevEndedSets = state.sets.filter(function (s) { return !!s.endedAt; });
      var lastEndedSet = prevEndedSets.length ? prevEndedSets[prevEndedSets.length - 1] : null;
      pendingServePickTeam = lastEndedSet ? (lastEndedSet.firstServer === "A" ? "B" : "A") : "A";
    }
    $("btnPickServeA").classList.toggle("active", pendingServePickTeam === "A");
    $("btnPickServeB").classList.toggle("active", pendingServePickTeam === "B");
  }

  // Undo / Redo
  $("btnUndo").disabled = !state.canUndo;
  $("btnRedo").disabled = !state.canRedo;

  // Score buttons disabled when no active set or game over
  var scoringActive = hasActiveSet && !isGameOver;
  ["btnScoreAPlus", "btnScoreAMinus", "btnScoreBPlus", "btnScoreBMinus",
   "btnToA", "btnToB", "btnSubA", "btnSubB", "btnCardA", "btnCardB"].forEach(function (id) {
    var el = $(id);
    if (el) el.disabled = !scoringActive;
  });

  // Show/hide the Match Log nav button
  $("navLogBtn").hidden = false;

  // Apply side swap display
  updateSidesDisplay(state);
}

function setScoreDisplay(id, value) {
  var el = $(id);
  if (!el) return;
  var prev = parseInt(el.textContent, 10) || 0;
  el.textContent = value;
  if (value !== prev) {
    el.classList.remove("score-high");
    void el.offsetWidth; // reflow
    el.classList.add("score-high");
  }
}

function renderTimeoutDots(dotsId, countId, used, total) {
  var el = $(dotsId);
  if (!el) return;
  var html = "";
  for (var i = 0; i < total; i++) {
    html += '<span class="to-dot' + (i < used ? " used" : "") + '"></span>';
  }
  el.innerHTML = html;
  var countEl = $(countId);
  if (countEl) countEl.textContent = used + "/" + total;
}

var ROLE_ABBR = { head_coach: "HC", asst_coach: "AC", trainer: "Tr", medical: "Md" };
var ROLE_LABEL = { player: "Player", head_coach: "Head Coach", asst_coach: "Asst. Coach", trainer: "Trainer", medical: "Medical" };

function renderSanctionsBar(barId, sanctions, delaySanctions, irUsed) {
  var bar = $(barId);
  if (!bar) return;
  if (!sanctions.length && !delaySanctions.length && !irUsed) { bar.innerHTML = ""; return; }
  var html = "";
  sanctions.forEach(function (s) {
    var abbr = ROLE_ABBR[s.role] || null;
    html += '<span class="sanction-chip">' + cardHtml(s.type);
    if (abbr) {
      html += '<span class="sanction-chip-player">' + abbr + '</span>';
    } else if (s.player) {
      html += '<span class="sanction-chip-player">#' + esc(s.player) + '</span>';
    }
    html += '</span>';
  });
  delaySanctions.forEach(function (d) {
    html += '<span class="sanction-chip"><span style="font-size:0.7rem;color:var(--ink-muted)">D</span>' + delaySanctionHtml(d.type) + '</span>';
  });
  if (irUsed) {
    html += '<span class="sanction-chip sanction-chip-ir" title="Improper Request used">IR</span>';
  }
  bar.innerHTML = html;
}

function renderTripleBall(phase) {
  var phases = document.querySelectorAll("#tbSeq .tb-phase");
  phases.forEach(function (el) {
    var p = parseInt(el.getAttribute("data-phase"), 10);
    el.classList.toggle("tb-active", p === phase);
  });
  $("tbPhaseLabel").textContent = TB_PHASE_LABELS[phase] || "";
}

function renderSetSummaryTable(state) {
  var tbody = $("logSetTableBody");
  var tfoot = $("logSetTableFoot");
  if (!tbody || !tfoot) return;
  tbody.innerHTML = "";
  tfoot.innerHTML = "";
  if (!state || !state.sets.length) return;

  state.sets.forEach(function (s) {
    var tr = document.createElement("tr");
    var winA = s.endedAt && s.scoreA > s.scoreB;
    var winB = s.endedAt && s.scoreB > s.scoreA;
    var isFiltered = selectedLogSetFilter === s.setNumber;
    // Set number cell: pill toggle button — click to filter log to this set
    tr.innerHTML =
      "<td><span class='set-filter-pill" + (isFiltered ? " active" : "") + "' data-setnum='" + s.setNumber + "' title='" + (isFiltered ? "Clear filter" : "Filter log to Set " + s.setNumber) + "'>" + s.setNumber + "</span></td>" +
      "<td class='" + (winA ? "set-win-a" : "") + "'>" + s.scoreA + "</td>" +
      "<td class='" + (winB ? "set-win-b" : "") + "'>" + s.scoreB + "</td>";
    tbody.appendChild(tr);
  });

  var footTr = document.createElement("tr");
  footTr.innerHTML =
    "<td>Sets Won</td>" +
    "<td class='set-win-a'>" + state.setsWonA + "</td>" +
    "<td class='set-win-b'>" + state.setsWonB + "</td>";
  tfoot.appendChild(footTr);
}

function formatLabel(fmt) {
  return { "single": "Single Set", "straight2": "2 Sets", "best3": "Best of 3", "best5": "Best of 5" }[fmt] || fmt;
}

// Show a temporary toast message at the bottom of the screen.
var _toastTimer = null;
function showToast(message, duration) {
  duration = duration || 4000;
  // Remove any existing toast immediately
  var existing = document.querySelector(".toast");
  if (existing) existing.parentNode.removeChild(existing);
  if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }

  var toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  _toastTimer = setTimeout(function () {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
    _toastTimer = null;
  }, duration + 400); // extra time covers the fade-out animation
}

// ---- Score Page — Game Controls -------------------------

function wireScoreboardControls() {
  // Score buttons — Team A
  $("btnScoreAPlus").addEventListener("click", function () { dispatchPoint("A", 1); });
  $("btnScoreAMinus").addEventListener("click", function () { dispatchPoint("A", -1); });
  // Score buttons — Team B
  $("btnScoreBPlus").addEventListener("click", function () { dispatchPoint("B", 1); });
  $("btnScoreBMinus").addEventListener("click", function () { dispatchPoint("B", -1); });

  // Timeouts
  $("btnToA").addEventListener("click", function () { dispatchTimeout("A"); });
  $("btnToB").addEventListener("click", function () { dispatchTimeout("B"); });

  // Substitutions
  $("btnSubA").addEventListener("click", function () { dispatchSub("A"); });
  $("btnSubB").addEventListener("click", function () { dispatchSub("B"); });

  // Sanction modal
  $("btnCardA").addEventListener("click", function () { openSanctionModal("A"); });
  $("btnCardB").addEventListener("click", function () { openSanctionModal("B"); });

  // Undo / Redo
  $("btnUndo").addEventListener("click", function () {
    controller.undo();
    renderScoreboard();
  });
  $("btnRedo").addEventListener("click", function () {
    controller.redo();
    renderScoreboard();
  });

  // End Set
  $("btnEndSet").addEventListener("click", function () {
    var state = controller.getState();
    if (!state || !state.activeSetNumber) return;
    var activeSet = state.sets.find(function (s) { return s.setNumber === state.activeSetNumber; });
    var sA = activeSet ? activeSet.scoreA : 0;
    var sB = activeSet ? activeSet.scoreB : 0;
    if (!confirm("End Set " + state.activeSetNumber + "? Final score: " + state.teamA + " " + sA + " – " + sB + " " + state.teamB)) return;
    controller.dispatch({
      type: "SET_ENDED",
      setNumber: state.activeSetNumber,
      timestamp: new Date().toISOString(),
    });
    renderScoreboard();
  });

  // Between-sets: serve picker
  $("btnPickServeA").addEventListener("click", function () {
    pendingServePickTeam = "A";
    $("btnPickServeA").classList.add("active");
    $("btnPickServeB").classList.remove("active");
  });
  $("btnPickServeB").addEventListener("click", function () {
    pendingServePickTeam = "B";
    $("btnPickServeB").classList.add("active");
    $("btnPickServeA").classList.remove("active");
  });

  // Start Next Set
  $("btnStartNextSet").addEventListener("click", function () {
    var state = controller.getState();
    if (!state) return;
    var server = pendingServePickTeam;
    if (!server) {
      // Default: suggest opposite of last set's first server
      var prevSets = state.sets.filter(function (s) { return !!s.endedAt; });
      var lastSet = prevSets.length ? prevSets[prevSets.length - 1] : null;
      server = lastSet ? (lastSet.firstServer === "A" ? "B" : "A") : "A";
    }
    controller.dispatch({
      type: "SET_STARTED",
      setNumber: state.nextSetNum,
      firstServer: server,
      timestamp: new Date().toISOString(),
    });
    pendingServePickTeam = null;
    renderScoreboard();
  });

  // End Game
  $("btnEndGame").addEventListener("click", function () {
    var state = controller.getState();
    if (!state) return;
    if (!confirm("End the game?")) return;
    // If a set is still active, end it first
    if (state.activeSetNumber) {
      controller.dispatch({
        type: "SET_ENDED",
        setNumber: state.activeSetNumber,
        timestamp: new Date().toISOString(),
      });
    }
    controller.dispatch({
      type: "GAME_ENDED",
      timestamp: new Date().toISOString(),
    });
    renderScoreboard();
  });

  // New Game (shown after game ends)
  $("btnNewGame").addEventListener("click", function () {
    showSetupPanel();
  });

  // Switch sides display
  $("btnSwitchSides").addEventListener("click", function () {
    sidesSwapped = !sidesSwapped;
    updateSidesDisplay(controller.getState());
  });
}

function dispatchPoint(team, delta) {
  var state = controller.getState();
  if (!state || !state.activeSetNumber) return;
  // Don't allow score below 0
  var activeSet = state.sets.find(function (s) { return s.setNumber === state.activeSetNumber; });
  if (delta < 0 && activeSet) {
    if (team === "A" && activeSet.scoreA <= 0) return;
    if (team === "B" && activeSet.scoreB <= 0) return;
  }
  controller.dispatch({
    type: "POINT_SCORED",
    team: team,
    setNumber: state.activeSetNumber,
    delta: delta,
    timestamp: new Date().toISOString(),
  });
  renderScoreboard();
}

function dispatchTimeout(team) {
  var state = controller.getState();
  if (!state || !state.activeSetNumber) return;
  var activeSet = state.sets.find(function (s) { return s.setNumber === state.activeSetNumber; });
  if (!activeSet) return;
  var used = team === "A" ? activeSet.timeoutsA : activeSet.timeoutsB;
  if (used >= state.timeoutsPerSet) {
    alert((team === "A" ? state.teamA : state.teamB) + " has no timeouts remaining.");
    return;
  }
  controller.dispatch({
    type: "TIMEOUT_TAKEN",
    team: team,
    setNumber: state.activeSetNumber,
    timestamp: new Date().toISOString(),
  });
  renderScoreboard();
}

function dispatchSub(team) {
  var state = controller.getState();
  if (!state || !state.activeSetNumber) return;
  var activeSet = state.sets.find(function (s) { return s.setNumber === state.activeSetNumber; });
  if (!activeSet) return;
  var used = team === "A" ? activeSet.subsA : activeSet.subsB;
  if (used >= state.subsPerSet) {
    alert((team === "A" ? state.teamA : state.teamB) + " has no substitutions remaining.");
    return;
  }
  controller.dispatch({
    type: "SUBSTITUTION",
    team: team,
    setNumber: state.activeSetNumber,
    timestamp: new Date().toISOString(),
  });
  renderScoreboard();
}

// ---- Score Page — Sanction Modal ------------------------

function openSanctionModal(team) {
  sanctionTargetTeam = team;
  sanctionSelectedRole = "player";
  var state = controller.getState();
  var teamName = state ? (team === "A" ? state.teamA : state.teamB) : ("Team " + team);
  $("sanctionTeamName").textContent = teamName;
  $("sanctionPlayerNum").value = "";

  // Reset role selector to Player
  document.querySelectorAll(".role-btn").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-role") === "player");
  });
  $("playerNumLabel").hidden = false;

  // Improper request — disable if already used
  var irUsed = !!(state && (team === "A" ? state.improperRequestA : state.improperRequestB));
  $("btnImproperRequest").disabled = irUsed;
  $("irAlreadyUsed").hidden = !irUsed;

  // Show Triple Ball section only when a Triple Ball game is active
  var isTb = !!(state && state.variation === "triplebal" && state.activeSetNumber);
  $("tbPenaltySection").hidden = !isTb;
  $("cbTbMidRally").checked = false;

  $("sanctionModal").removeAttribute("hidden");
  $("sanctionPlayerNum").focus();
}

function closeSanctionModal() {
  sanctionTargetTeam = null;
  $("sanctionModal").hidden = true;
}

function dispatchImproperRequest() {
  var state = controller.getState();
  if (!state || !state.activeSetNumber || !sanctionTargetTeam) return;
  controller.dispatch({
    type: "IMPROPER_REQUEST",
    team: sanctionTargetTeam,
    setNumber: state.activeSetNumber,
    timestamp: new Date().toISOString(),
  });
  closeSanctionModal();
  renderScoreboard();
}

function dispatchSanction(stype) {
  var state = controller.getState();
  if (!state || !state.activeSetNumber || !sanctionTargetTeam) return;
  var player = sanctionSelectedRole === "player" ? ($("sanctionPlayerNum").value.trim() || null) : null;
  controller.dispatch({
    type: "SANCTION",
    team: sanctionTargetTeam,
    sanctionType: stype,
    role: sanctionSelectedRole,
    playerNumber: player,
    setNumber: state.activeSetNumber,
    timestamp: new Date().toISOString(),
  });
  // Only Red card (Penalty) awards a point + serve to the opponent.
  // Expulsion and Disqualification remove the player but do not directly award a point.
  if (stype === "red") {
    // Capture triple ball phase BEFORE the point advances the sequence
    var tbPhase = (state.variation === "triplebal" && state.activeSetNumber) ? state.tripleBallPhase : -1;
    var isMidRally = tbPhase >= 0 && $("cbTbMidRally").checked;
    var opponent = sanctionTargetTeam === "A" ? "B" : "A";
    controller.dispatch({
      type: "POINT_SCORED",
      team: opponent,
      setNumber: state.activeSetNumber,
      delta: 1,
      timestamp: new Date().toISOString(),
    });
    if (tbPhase >= 0) {
      if (isMidRally) {
        showToast("\uD83D\uDFE5 Mid-rally penalty \u2014 replaces \u201c" + TB_PHASE_LABELS[tbPhase] + "\u201d (current ball cancelled)");
      } else {
        showToast("\uD83D\uDFE5 Red card penalty \u2014 replaces \u201c" + TB_PHASE_LABELS[tbPhase] + "\u201d (next ball in sequence)");
      }
    }
  }
  closeSanctionModal();
  renderScoreboard();
}

function dispatchDelaySanction(dtype) {
  var state = controller.getState();
  if (!state || !state.activeSetNumber || !sanctionTargetTeam) return;
  controller.dispatch({
    type: "DELAY_SANCTION",
    team: sanctionTargetTeam,
    sanctionType: dtype,
    setNumber: state.activeSetNumber,
    timestamp: new Date().toISOString(),
  });
  // Delay penalty awards a point + serve to the opponent
  if (dtype === "penalty") {
    // Capture triple ball phase BEFORE the point advances the sequence
    var tbPhase = (state.variation === "triplebal" && state.activeSetNumber) ? state.tripleBallPhase : -1;
    var isMidRally = tbPhase >= 0 && $("cbTbMidRally").checked;
    var opp = sanctionTargetTeam === "A" ? "B" : "A";
    controller.dispatch({
      type: "POINT_SCORED",
      team: opp,
      setNumber: state.activeSetNumber,
      delta: 1,
      timestamp: new Date().toISOString(),
    });
    if (tbPhase >= 0) {
      if (isMidRally) {
        showToast("\uD83D\uDFE5 Mid-rally delay penalty \u2014 replaces \u201c" + TB_PHASE_LABELS[tbPhase] + "\u201d (current ball cancelled)");
      } else {
        showToast("\uD83D\uDFE5 Delay penalty \u2014 replaces \u201c" + TB_PHASE_LABELS[tbPhase] + "\u201d (next ball in sequence)");
      }
    }
  }
  closeSanctionModal();
  renderScoreboard();
}

function wireSanctionModal() {
  $("btnCloseSanctionModal").addEventListener("click", closeSanctionModal);

  // Close on overlay click
  $("sanctionModal").addEventListener("click", function (e) {
    if (e.target === $("sanctionModal")) closeSanctionModal();
  });

  // Role selector buttons
  document.querySelectorAll(".role-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      sanctionSelectedRole = btn.getAttribute("data-role");
      document.querySelectorAll(".role-btn").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      // Show player number input only for player role
      $("playerNumLabel").hidden = sanctionSelectedRole !== "player";
    });
  });

  // Improper request button
  $("btnImproperRequest").addEventListener("click", function () {
    dispatchImproperRequest();
  });

  // Player sanction buttons
  document.querySelectorAll(".sanction-type-btn[data-stype]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      dispatchSanction(btn.getAttribute("data-stype"));
    });
  });

  // Delay sanction buttons
  document.querySelectorAll(".sanction-type-btn[data-dtype]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      dispatchDelaySanction(btn.getAttribute("data-dtype"));
    });
  });

  // Close on Escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("sanctionModal").hidden) closeSanctionModal();
  });
}

// ---- Score Page — Event Log -----------------------------

function renderEventLog() {
  var body = $("logEventLogBody");
  if (!body) return;
  var state = controller.getState();
  body.innerHTML = buildEventLogHtml(state, controller.timeline, selectedLogSetFilter);
}

function buildEventLogHtml(state, timeline, filterSetNumber) {
  if (!state) return '<div class="event-log-empty">No game in progress.</div>';

  var events = timeline ? timeline.events.slice(0, timeline.cursor) : [];
  if (!events.length) return '<div class="event-log-empty">No events recorded yet.</div>';

  // When filtering, only include events for the selected set plus global bookends
  if (filterSetNumber) {
    events = events.filter(function (e) {
      return e.type === "GAME_STARTED" ||
             e.type === "GAME_ENDED"   ||
             e.setNumber === filterSetNumber;
    });
    if (events.length <= 1) {
      return '<div class="event-log-empty">No events recorded for Set ' + filterSetNumber + '.</div>';
    }
  }

  // Track running scores for display
  var setScores = {}; // setNumber → { A: n, B: n }
  function getScore(setNum) {
    if (!setScores[setNum]) setScores[setNum] = { A: 0, B: 0 };
    return setScores[setNum];
  }
  var lastLeader = {}; // setNumber → "A" | "B" | "tied"

  var rows = [];
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    var time = formatTime(ev.timestamp);
    var sc = ev.setNumber ? getScore(ev.setNumber) : null;

    if (ev.type === "GAME_STARTED") {
      rows.push('<div class="event-log-row event-log-system">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score"></span>' +
        '<span class="elr-desc">Game started</span>' +
        '<span class="elr-detail">' + esc(ev.teamA) + ' vs ' + esc(ev.teamB) + '</span>' +
        '</div>');
    } else if (ev.type === "SET_STARTED") {
      rows.push('<div class="event-log-row event-log-system">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score">0 – 0</span>' +
        '<span class="elr-desc">Set ' + ev.setNumber + ' started</span>' +
        '<span class="elr-detail">First serve: ' + esc(ev.firstServer === "A" ? (state.teamA || "Team A") : (state.teamB || "Team B")) + '</span>' +
        '</div>');
    } else if (ev.type === "SET_ENDED") {
      var fsc = getScore(ev.setNumber);
      rows.push('<div class="event-log-row event-log-system">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score">' + fsc.A + ' – ' + fsc.B + '</span>' +
        '<span class="elr-desc">Set ' + ev.setNumber + ' ended</span>' +
        '<span class="elr-detail">' + (fsc.A > fsc.B ? esc(state.teamA) : (fsc.B > fsc.A ? esc(state.teamB) : "Tie")) + ' wins set</span>' +
        '</div>');
    } else if (ev.type === "GAME_ENDED") {
      rows.push('<div class="event-log-row event-log-system">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score"></span>' +
        '<span class="elr-desc">Game ended</span>' +
        '<span class="elr-detail"></span>' +
        '</div>');
    } else if (ev.type === "POINT_SCORED") {
      var psc = getScore(ev.setNumber);
      psc[ev.team] = Math.max(0, psc[ev.team] + ev.delta);
      var prev = lastLeader[ev.setNumber] || "tied";
      var newLeader = psc.A > psc.B ? "A" : psc.B > psc.A ? "B" : "tied";
      var leadChange = newLeader !== "tied" && newLeader !== prev;
      if (newLeader !== "tied") lastLeader[ev.setNumber] = newLeader;
      var scoreClass = leadChange ? " lead-" + newLeader.toLowerCase() : "";
      var rowClass = "event-log-team-" + ev.team.toLowerCase();
      var action = ev.delta > 0 ? "Point" : "Point removed";
      var teamName = ev.team === "A" ? (state.teamA || "Team A") : (state.teamB || "Team B");
      rows.push('<div class="event-log-row ' + rowClass + '">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score' + scoreClass + '">' + psc.A + ' – ' + psc.B + '</span>' +
        '<span class="elr-desc">' + esc(action) + '</span>' +
        '<span class="elr-detail">' + esc(teamName) + (leadChange ? ' — Lead' : '') + '</span>' +
        '</div>');
    } else if (ev.type === "TIMEOUT_TAKEN") {
      var tosc = getScore(ev.setNumber);
      var toTeam = ev.team === "A" ? (state.teamA || "Team A") : (state.teamB || "Team B");
      var rowClassTo = "event-log-team-" + ev.team.toLowerCase();
      rows.push('<div class="event-log-row ' + rowClassTo + '">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score">' + tosc.A + ' – ' + tosc.B + '</span>' +
        '<span class="elr-desc">Timeout</span>' +
        '<span class="elr-detail">' + esc(toTeam) + '</span>' +
        '</div>');
    } else if (ev.type === "SUBSTITUTION") {
      var subsc = getScore(ev.setNumber);
      var subTeam = ev.team === "A" ? (state.teamA || "Team A") : (state.teamB || "Team B");
      var rowClassSub = "event-log-team-" + ev.team.toLowerCase();
      rows.push('<div class="event-log-row ' + rowClassSub + '">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score">' + subsc.A + ' – ' + subsc.B + '</span>' +
        '<span class="elr-desc">Substitution</span>' +
        '<span class="elr-detail">' + esc(subTeam) + '</span>' +
        '</div>');
    } else if (ev.type === "SANCTION") {
      var sansc = getScore(ev.setNumber);
      var sanTeam = ev.team === "A" ? (state.teamA || "Team A") : (state.teamB || "Team B");
      var sanLabel = {
        yellow: "Warning", red: "Penalty",
        expulsion: "Expulsion", disqualification: "Disqualification"
      }[ev.sanctionType] || ev.sanctionType;
      var sanRoleLabel = ROLE_LABEL[ev.role] || "Player";
      var sanRecipient = sanRoleLabel !== "Player" ? sanRoleLabel : (ev.playerNumber ? "#" + ev.playerNumber : "Player");
      var sanRowClass = "event-log-team-" + ev.team.toLowerCase();
      rows.push('<div class="event-log-row ' + sanRowClass + '">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score">' + sansc.A + ' \u2013 ' + sansc.B + '</span>' +
        '<span class="elr-desc">' + esc(sanLabel) + '</span>' +
        '<span class="elr-detail">' + esc(sanTeam) + ' \u2014 ' + esc(sanRecipient) + '</span>' +
        '</div>');
    } else if (ev.type === "DELAY_SANCTION") {
      var dssc = getScore(ev.setNumber);
      var dsTeam = ev.team === "A" ? (state.teamA || "Team A") : (state.teamB || "Team B");
      var dsLabel = ev.sanctionType === "warning" ? "Delay Warning" : "Delay Penalty";
      var dsRowClass = "event-log-team-" + ev.team.toLowerCase();
      rows.push('<div class="event-log-row ' + dsRowClass + '">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score">' + dssc.A + ' \u2013 ' + dssc.B + '</span>' +
        '<span class="elr-desc">' + esc(dsLabel) + '</span>' +
        '<span class="elr-detail">' + esc(dsTeam) + ' (team)</span>' +
        '</div>');
    } else if (ev.type === "IMPROPER_REQUEST") {
      var irsc = getScore(ev.setNumber);
      var irTeam = ev.team === "A" ? (state.teamA || "Team A") : (state.teamB || "Team B");
      var irRowClass = "event-log-team-" + ev.team.toLowerCase();
      rows.push('<div class="event-log-row ' + irRowClass + '">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score">' + irsc.A + ' \u2013 ' + irsc.B + '</span>' +
        '<span class="elr-desc">Improper Request</span>' +
        '<span class="elr-detail">' + esc(irTeam) + '</span>' +
        '</div>');
    } else if (ev.type === "SERVE_CHANGED") {
      var seTeam = ev.team === "A" ? (state.teamA || "Team A") : (state.teamB || "Team B");
      var seRowClass = "event-log-team-" + ev.team.toLowerCase();
      rows.push('<div class="event-log-row ' + seRowClass + '">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score"></span>' +
        '<span class="elr-desc">Serve changed</span>' +
        '<span class="elr-detail">' + esc(seTeam) + ' serves</span>' +
        '</div>');
    }
  }

  return rows.join("") || '<div class="event-log-empty">No events recorded yet.</div>';
}

// ---- Match Log Page -------------------------------------

function renderLogPage() {
  var state = controller.getState();

  // Title and metadata
  var title = $("logPageTitle");
  var meta  = $("logPageMeta");
  if (title) title.textContent = state ? state.gameName : "Match Log";
  if (meta && state) {
    var parts = [state.teamA + " vs " + state.teamB, formatLabel(state.gameFormat)];
    if (state.location) parts.push(state.location);
    if (state.scheduledAt) parts.push(formatDate(state.scheduledAt));
    parts.push(state.endedAt ? "Final" : (state.activeSetNumber ? "Set " + state.activeSetNumber + " in progress" : "Between sets"));
    meta.textContent = parts.join(" \u00B7 ");
  }

  // Team name headers in the set table
  var hdrA = $("logSetTblHdrA"), hdrB = $("logSetTblHdrB");
  if (hdrA && state) hdrA.textContent = state.teamA;
  if (hdrB && state) hdrB.textContent = state.teamB;

  renderSetSummaryTable(state);
  renderEventLog();

  // Show/hide the filter-active hint
  var hint = $("logFilterHint");
  if (hint) hint.hidden = !selectedLogSetFilter;
}

// ---- Recent Games (on setup panel) ----------------------

function renderRecentGames() {
  var container = $("recentGamesList");
  if (!container) return;
  var games = dbListGames().slice(0, 5);
  if (!games.length) {
    container.innerHTML = '<p class="no-data-msg">No saved games yet.</p>';
    return;
  }
  var html = "";
  games.forEach(function (g) {
    var isActive = !g.endedAt;
    var meta = [g.teamA, "vs", g.teamB, "·", formatLabel(g.gameFormat)].join(" ");
    var dateStr = g.scheduledAt ? formatDate(g.scheduledAt) : formatDate(g.updatedAt);
    html += '<div class="recent-game-item" data-id="' + esc(g.gameId) + '">' +
      '<span class="recent-game-name">' + esc(g.gameName || meta) + '</span>' +
      '<span class="recent-game-meta">' + esc(dateStr) + '</span>' +
      '<span class="recent-game-badge ' + (isActive ? "badge-active" : "badge-done") + '">' +
        (isActive ? "Active" : "Done") +
      '</span>' +
      '</div>';
  });
  container.innerHTML = html;
  container.querySelectorAll(".recent-game-item").forEach(function (item) {
    item.addEventListener("click", function () {
      var id = item.getAttribute("data-id");
      if (id) void loadAndShowGame(id);
    });
  });
}

async function loadAndShowGame(gameId) {
  var record = await dbLoadGame(gameId);
  if (!record) { alert("Could not load game."); return; }
  controller.hydrate(record);
  showPage("score");
  showScoreboard();
  renderScoreboard();
}

// ---- Games Page -----------------------------------------

var selectedDetailGameId = null;

async function renderGamesList() {
  var container = $("gamesList");
  if (!container) return;
  var games = dbListGames();
  if (!games.length) {
    container.innerHTML = '<p class="no-data-msg">No saved games yet.</p>';
    clearGameDetail();
    return;
  }

  container.innerHTML = "";
  games.forEach(function (g) {
    var wrapper = document.createElement("div");
    wrapper.className = "game-list-item-wrapper";

    var btn = document.createElement("button");
    btn.className = "game-list-item" + (g.gameId === selectedDetailGameId ? " selected" : "");

    var isActive = !g.endedAt;
    var meta = (g.teamA || "?") + " vs " + (g.teamB || "?") + " · " + formatLabel(g.gameFormat || "best3");
    var dateStr = g.scheduledAt ? formatDate(g.scheduledAt) : formatDate(g.updatedAt);

    btn.innerHTML =
      '<span class="gli-name">' + esc(g.gameName || meta) + '</span>' +
      '<span class="gli-meta">' + esc(meta) + '</span>' +
      '<span class="gli-meta">' + esc(dateStr) + '</span>' +
      '<span class="gli-status ' + (isActive ? "status-active" : "status-done") + '">' +
        (isActive ? "In Progress" : "Complete") +
      '</span>';

    btn.addEventListener("click", function () {
      void selectDetailGame(g.gameId);
    });

    var delBtn = document.createElement("button");
    delBtn.className = "game-list-del-btn";
    delBtn.title = "Delete game";
    delBtn.textContent = "×";
    delBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!confirm('Delete "' + (g.gameName || meta) + '"? This cannot be undone.')) return;
      void (async function () {
        await dbDeleteGame(g.gameId);
        if (selectedDetailGameId === g.gameId) clearGameDetail();
        if (controller.currentGameId === g.gameId) controller.clear();
        await renderGamesList();
        renderRecentGames();
      })();
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(delBtn);
    container.appendChild(wrapper);
  });
}

async function selectDetailGame(gameId) {
  selectedDetailGameId = gameId;
  await renderGamesList(); // refresh selection highlight
  var record = await dbLoadGame(gameId);
  if (!record) { clearGameDetail(); return; }

  var tl = { events: record.events, cursor: record.cursor };
  var state = deriveGameState(tl);
  if (!state) { clearGameDetail(); return; }

  var isActive = !state.endedAt;

  $("gameDetailPlaceholder").hidden = true;
  $("gameDetailContent").hidden = false;

  $("detailGameName").textContent = state.gameName;
  $("detailHdrA").textContent = state.teamA;
  $("detailHdrB").textContent = state.teamB;

  var metaParts = [];
  if (state.teamA && state.teamB) metaParts.push(state.teamA + " vs " + state.teamB);
  metaParts.push(formatLabel(state.gameFormat));
  if (state.location) metaParts.push(state.location);
  if (state.scheduledAt) metaParts.push(formatDateTime(state.scheduledAt));
  metaParts.push(isActive ? "In Progress" : "Complete");
  $("detailGameMeta").textContent = metaParts.join(" · ");

  // Set summary
  var detailTbody = $("detailSetBody");
  var detailTfoot = $("detailSetFoot");
  detailTbody.innerHTML = "";
  detailTfoot.innerHTML = "";
  state.sets.forEach(function (s) {
    var tr = document.createElement("tr");
    var winA = s.endedAt && s.scoreA > s.scoreB;
    var winB = s.endedAt && s.scoreB > s.scoreA;
    tr.innerHTML =
      "<td>" + s.setNumber + "</td>" +
      "<td class='" + (winA ? "set-win-a" : "") + "'>" + s.scoreA + "</td>" +
      "<td class='" + (winB ? "set-win-b" : "") + "'>" + s.scoreB + "</td>";
    detailTbody.appendChild(tr);
  });
  var footTr = document.createElement("tr");
  footTr.innerHTML =
    "<td>Sets Won</td><td class='set-win-a'>" + state.setsWonA + "</td><td class='set-win-b'>" + state.setsWonB + "</td>";
  detailTfoot.appendChild(footTr);

  // Actions
  $("btnResumeGame").disabled = !isActive;
  $("btnResumeGame").textContent = isActive ? "Resume Game" : "Game Complete";
  $("btnResumeGame").onclick = async function () {
    await loadAndShowGame(gameId);
  };
  $("btnExportGame").onclick = function () {
    exportRecord(record);
  };
  $("btnDeleteGame").onclick = function () {
    if (!confirm('Delete "' + state.gameName + '"? This cannot be undone.')) return;
    void (async function () {
      await dbDeleteGame(gameId);
      clearGameDetail();
      await renderGamesList();
      renderRecentGames();
    })();
  };

  // Event log
  var logBody = $("detailEventLogBody");
  if (logBody) logBody.innerHTML = buildEventLogHtml(state, tl);
}

function clearGameDetail() {
  selectedDetailGameId = null;
  $("gameDetailPlaceholder").hidden = false;
  $("gameDetailContent").hidden = true;
}

function wireGamesPage() {
  // Import button
  $("btnImportGame").addEventListener("click", function () {
    $("importFileInput").click();
  });
  $("importFileInput").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      void importGamesFromJson(ev.target.result);
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  // Clear all
  $("btnClearAllGames").addEventListener("click", function () {
    if (!confirm("Delete ALL saved games? This cannot be undone.\n\nTip: Export first to keep a backup.")) return;
    void (async function () {
      await dbClearAll();
      controller.clear();
      clearGameDetail();
      await renderGamesList();
      renderRecentGames();
    })();
  });
}

// ---- Setup Page -----------------------------------------

function renderSetupPage() {
  $("cfgDarkMode").checked = settings.darkMode;
  $("cfgFontSize").value = settings.fontSize;
  $("cfgTeamAColor").value = settings.teamAColor;
  $("cfgTeamBColor").value = settings.teamBColor;
  $("cfgDefaultFormat").value = settings.defaultFormat;
  $("cfgDefTimeouts").textContent = settings.defaultTimeouts;
  $("cfgDefSubs").textContent = settings.defaultSubs;
}

function wireSetupPage() {
  $("cfgDarkMode").addEventListener("change", function () {
    settings.darkMode = this.checked;
    applyTheme();
    saveSettings();
  });

  $("cfgFontSize").addEventListener("change", function () {
    settings.fontSize = this.value;
    applyFontSize();
    saveSettings();
  });

  $("cfgTeamAColor").addEventListener("input", function () {
    settings.teamAColor = this.value;
    updateTeamColors();
    saveSettings();
  });

  $("cfgTeamBColor").addEventListener("input", function () {
    settings.teamBColor = this.value;
    updateTeamColors();
    saveSettings();
  });

  $("cfgDefaultFormat").addEventListener("change", function () {
    settings.defaultFormat = this.value;
    saveSettings();
  });

  // Default timeouts stepper
  $("btnDefToDown").addEventListener("click", function () {
    if (settings.defaultTimeouts > 0) { settings.defaultTimeouts--; $("cfgDefTimeouts").textContent = settings.defaultTimeouts; saveSettings(); }
  });
  $("btnDefToUp").addEventListener("click", function () {
    if (settings.defaultTimeouts < 5) { settings.defaultTimeouts++; $("cfgDefTimeouts").textContent = settings.defaultTimeouts; saveSettings(); }
  });

  // Default subs stepper
  $("btnDefSubsDown").addEventListener("click", function () {
    if (settings.defaultSubs > 0) { settings.defaultSubs--; $("cfgDefSubs").textContent = settings.defaultSubs; saveSettings(); }
  });
  $("btnDefSubsUp").addEventListener("click", function () {
    if (settings.defaultSubs < 18) { settings.defaultSubs++; $("cfgDefSubs").textContent = settings.defaultSubs; saveSettings(); }
  });

  // Export all
  $("btnExportAll").addEventListener("click", function () {
    void exportAllGames();
  });

  // Import (setup page)
  $("btnImportSetup").addEventListener("click", function () {
    $("importSetupFileInput").click();
  });
  $("importSetupFileInput").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) { void importGamesFromJson(ev.target.result); };
    reader.readAsText(file);
    e.target.value = "";
  });

  // Clear all (setup page)
  $("btnClearAllSetup").addEventListener("click", function () {
    if (!confirm("Delete ALL saved games and settings? This cannot be undone.\n\nTip: Export first to keep a backup.")) return;
    void (async function () {
      await dbClearAll();
      controller.clear();
      clearGameDetail();
      // Reset settings
      settings = Object.assign({}, DEFAULT_SETTINGS);
      saveSettings();
      applyTheme();
      applyFontSize();
      updateTeamColors();
      renderSetupPage();
      renderRecentGames();
    })();
  });
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", settings.darkMode ? "dark" : "light");
}

function applyFontSize() {
  document.documentElement.classList.remove("fs-small", "fs-medium", "fs-large");
  document.documentElement.classList.add("fs-" + (settings.fontSize || "medium"));
}

// ---- Navigation wiring ----------------------------------

function wireNavigation() {
  document.querySelectorAll(".nav-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var page = btn.getAttribute("data-page");
      if (page) showPage(page);
    });
  });

  // "← Score" button on the log page returns to the scoreboard
  $("btnLogToScore").addEventListener("click", function () {
    showPage("score");
  });

  // Set filter pills — delegated click on the log set table
  $("logSetTable").addEventListener("click", function (e) {
    var pill = e.target.closest(".set-filter-pill");
    if (!pill) return;
    var setNum = parseInt(pill.getAttribute("data-setnum"), 10);
    // Toggle: clicking the active set clears the filter
    selectedLogSetFilter = (selectedLogSetFilter === setNum) ? null : setNum;
    renderSetSummaryTable(controller.getState());
    renderEventLog();
  });
}

// ---- Boot / Init ----------------------------------------

async function init() {
  loadSettings();
  applyTheme();
  applyFontSize();
  updateTeamColors();

  // Wire up all UI
  wireNavigation();
  wireGameSetupForm();
  wireScoreboardControls();
  wireSanctionModal();
  wireGamesPage();
  wireSetupPage();

  // Try to restore previous game session
  var currentId = localStorage.getItem(LS_CURRENT);
  if (currentId) {
    var record = await dbLoadGame(currentId);
    if (record) {
      controller.hydrate(record);
      var state = controller.getState();
      if (state && !state.endedAt) {
        // In-progress game — go straight to scoreboard
        showPage("score");
        showScoreboard();
        renderScoreboard();
        return;
      }
    }
  }

  // No active game — show setup panel
  showPage("score");
  showSetupPanel();
}

// Start the app when the DOM is ready
document.addEventListener("DOMContentLoaded", function () {
  void init();
});
