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
// (letters here assume Team A serves first — tbPhaseBoxHtml flips them when
// the actual first server for the set is Team B instead)
var TB_PHASE_TEAMS  = ["A", "B", "A", "B", "A", "B"];
var TB_PHASE_TYPES  = ["Serves", "Toss", "Toss", "Serves", "Toss", "Toss"];
var TB_PHASE_TOWARD = ["B", "B", "A", "A", "A", "B"]; // which team receives the ball
var TB_PHASE_LABELS = ["A Serves", "\u2192 B (Toss)", "\u2190 A (Toss)", "B Serves", "\u2190 A (Toss)", "\u2192 B (Toss)"];

// Storage keys
var LS_INDEX = "vs_index";        // game index (lightweight metadata)
var LS_PREFIX = "vs_g_";          // full game record prefix
var LS_CURRENT = "vs_current";    // ID of current/last active game
var LS_SETTINGS = "vs_settings";  // user settings

// App version — bump this (and CACHE_VERSION in sw.js) with every deployment
var APP_VERSION = "22";

var GITHUB_URL = "https://github.com/j-mathes/VolleyScore";

// Default settings
var DEFAULT_SETTINGS = {
  darkMode: false,
  fontSize: "medium",
  teamAColor: "#1d4ed8",
  teamBColor: "#b91c1c",
  // Remembers the last color used for each team name (keyed lowercased/trimmed)
  // so picking that team again on the New Game form auto-fills its color.
  teamColors: {},
  sidebarBtnBorder: "#000000",
  tbBoxSize: 84,
  tbHighlightColor: "#15803d",
  tbScrollSpeed: 280,
  startSetColor: "#15803d",
  startSetBgColor: "#15803d",
  startSetPulseColor: "#15803d",
  defaultFormat: "best3",
  defaultVariation: "standard",
  defaultFairPlay: "none",
  autoSwitchSidesBetweenSets: false,
  promptSwitchSidesMidDecider: true,
  defaultTimeouts: 2,
  defaultSubs: 6,
  notchEnabled: false,
  notchSide: "left",
  notchPad: 50,
  scoreBtnLayout: "mirrorPlus", // minusPlus | plusMinus | mirrorPlus | mirrorMinus
  keepScreenAwake: false,
  confirmUndo: false,
  refereeName: "",
  defaultTeamA: "",
  defaultTeamB: "",
  defaultLocation: "",
  defaultGender: "",
  defaultAgeCategory: "",
  defaultLeague: "",
  // When true, the New Game form pre-fills from the last game's actual entries
  // instead of the configured defaults above; when false (default), behaves as before.
  persistNewGameData: false,
  lastGameSetup: null,
  // Master lists — Team Names/Locations grow from usage; Age Categories/Leagues start pre-seeded
  masterTeamNames: [],
  masterLocations: [],
  masterAgeCategories: ["Senior", "Junior", "18U", "17U", "16U", "15U", "14U", "13U", "12U"],
  masterLeagues: ["CSHSAA", "ISAA", "Foothills", "Rockyview", "Volleyball Alberta"],
  showMasterListEditIcons: true,
  // Scoring defaults
  defaultSetWinScore: 25,
  defaultSetWinBy: 2,
  defaultSetWinCap: 0,
  defaultDeciderWinScore: 15,
  defaultDeciderWinBy: 2,
  defaultDeciderWinCap: 0,
  // Win alert
  winGlowColor: "#f59e0b",
  winGlowDuration: 3,
  winToastDuration: 3,
  // Action alert (timeouts, subs, sanctions)
  actionGlowColor: "#a855f7",
  actionGlowDuration: 2,
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

// ---- Master lists (Team Names, Locations, Age Categories, Leagues) -------

// Adds a trimmed value to the named master list (case-insensitive de-dupe); returns true if added.
// Always reassigns a new array rather than mutating in place, so DEFAULT_SETTINGS'
// shared array references are never modified (that literal is reused via Object.assign).
function addToMasterList(listName, rawValue) {
  var value = (rawValue || "").trim();
  if (!value) return false;
  var list = Array.isArray(settings[listName]) ? settings[listName] : [];
  var exists = list.some(function (v) { return v.toLowerCase() === value.toLowerCase(); });
  if (exists) return false;
  settings[listName] = list.concat([value]).sort(function (a, b) { return a.localeCompare(b); });
  saveSettings();
  return true;
}

function removeFromMasterList(listName, value) {
  if (!Array.isArray(settings[listName])) return;
  settings[listName] = settings[listName].filter(function (v) { return v !== value; });
  saveSettings();
}

// Renames an existing entry in place (case-insensitive de-dupe against other entries).
// Returns true if renamed; alerts and returns false on an empty/duplicate/unchanged name.
function renameInMasterList(listName, oldValue, rawNewValue) {
  var newValue = (rawNewValue || "").trim();
  if (!newValue || newValue === oldValue) return false;
  var list = Array.isArray(settings[listName]) ? settings[listName] : [];
  var duplicate = list.some(function (v) { return v !== oldValue && v.toLowerCase() === newValue.toLowerCase(); });
  if (duplicate) {
    alert('"' + newValue + '" already exists in this list.');
    return false;
  }
  settings[listName] = list.map(function (v) { return v === oldValue ? newValue : v; })
    .sort(function (a, b) { return a.localeCompare(b); });
  if (listName === "masterTeamNames") renameRememberedTeamColor(oldValue, newValue);
  saveSettings();
  return true;
}

// Tracks the single chip currently in inline-rename mode, e.g. { listName, value }.
// window.prompt() is unusable here since standalone iOS PWAs silently no-op it.
var _mlEditing = null;

// Per-list chip filter text, keyed by listName — lets a long list be searched
// instead of scrolling through every chip on a small screen.
var _mlFilter = {
  masterTeamNames: "",
  masterLocations: "",
  masterAgeCategories: "",
  masterLeagues: "",
};

var ML_COUNT_ELS = {
  masterTeamNames: "mlCountTeamNames",
  masterLocations: "mlCountLocations",
  masterAgeCategories: "mlCountAgeCategories",
  masterLeagues: "mlCountLeagues",
};

// Fill shown on a Team Names chip's color swatch when no color has been remembered yet
var ML_CHIP_NO_COLOR = "#9ca3af";

function renderMasterListChips(containerId, listName) {
  var container = $(containerId);
  if (!container) return;
  var values = settings[listName] || [];
  var filterText = (_mlFilter[listName] || "").trim().toLowerCase();
  var shown = filterText ? values.filter(function (v) { return v.toLowerCase().indexOf(filterText) !== -1; }) : values;

  var countEl = $(ML_COUNT_ELS[listName]);
  if (countEl) {
    countEl.textContent = filterText ? (shown.length + " of " + values.length) : (values.length ? String(values.length) : "");
  }

  if (!values.length) {
    container.innerHTML = '<span class="no-data-msg">None yet</span>';
    return;
  }
  if (!shown.length) {
    container.innerHTML = '<span class="no-data-msg">No matches</span>';
    return;
  }
  var isTeamNames = listName === "masterTeamNames";
  container.innerHTML = shown.map(function (v) {
    var isEditingThis = _mlEditing && _mlEditing.listName === listName && _mlEditing.value === v;
    var color = isTeamNames ? (getRememberedTeamColor(v) || ML_CHIP_NO_COLOR) : null;
    if (isEditingThis) {
      // Full edit mode (entered via the pencil): the color becomes editable here too.
      var colorBtn = isTeamNames ?
        '<button type="button" class="ml-chip-color" data-value="' + esc(v) + '" style="background:' + esc(color) + '" aria-label="Set color for ' + esc(v) + '" title="Set color for ' + esc(v) + '"></button>' : "";
      return '<span class="ml-chip ml-chip-editing">' + colorBtn +
        '<input type="text" class="ml-chip-input" data-list="' + listName + '" data-value="' + esc(v) + '" value="' + esc(v) + '"></span>';
    }
    // Outside edit mode, the color is just a static display dot — editing it
    // requires clicking the pencil first (same as renaming).
    var colorDot = isTeamNames ? '<span class="ml-chip-color-dot" style="background:' + esc(color) + '" aria-hidden="true"></span>' : "";
    return '<span class="ml-chip">' + colorDot + esc(v) +
      (settings.showMasterListEditIcons ? '<button type="button" class="ml-chip-edit" data-list="' + listName + '" data-value="' + esc(v) + '" aria-label="Rename ' + esc(v) + '">&#9998;</button>' : "") +
      '<button type="button" class="ml-chip-remove" data-list="' + listName + '" data-value="' + esc(v) + '" aria-label="Remove ' + esc(v) + '">&times;</button></span>';
  }).join("");
  if (_mlEditing && _mlEditing.listName === listName) {
    var input = container.querySelector(".ml-chip-input");
    if (input) { input.focus(); input.select(); }
  }
}

// Renders the Setup → Match Info Lists editors (add input + chip list) for all four master lists.
function renderMasterListEditors() {
  renderMasterListChips("mlListTeamNames", "masterTeamNames");
  renderMasterListChips("mlListLocations", "masterLocations");
  renderMasterListChips("mlListAgeCategories", "masterAgeCategories");
  renderMasterListChips("mlListLeagues", "masterLeagues");
}

// Scans every saved game's GAME_STARTED event and returns, per master list, the
// set of lower-cased values actually referenced by at least one saved game.
async function computeMasterListUsage() {
  var usage = {
    masterTeamNames: new Set(),
    masterLocations: new Set(),
    masterAgeCategories: new Set(),
    masterLeagues: new Set(),
  };
  var index = dbListGames();
  for (var i = 0; i < index.length; i++) {
    var record = await dbLoadGame(index[i].gameId);
    if (!record) continue;
    var startEv = (record.events || []).find(function (e) { return e.type === "GAME_STARTED"; });
    if (!startEv) continue;
    if (startEv.teamA) usage.masterTeamNames.add(startEv.teamA.toLowerCase());
    if (startEv.teamB) usage.masterTeamNames.add(startEv.teamB.toLowerCase());
    if (startEv.location) usage.masterLocations.add(startEv.location.toLowerCase());
    if (startEv.ageCategory) usage.masterAgeCategories.add(startEv.ageCategory.toLowerCase());
    if (startEv.league) usage.masterLeagues.add(startEv.league.toLowerCase());
  }
  return usage;
}

// Removes master-list entries not referenced by any saved game (case-insensitive).
// Safe to run any time — saved games store their own copy of these fields directly
// on the GAME_STARTED event, so pruning the master list never touches game data.
async function removeUnusedMasterListEntries(listName, label) {
  var usage = await computeMasterListUsage();
  var used = usage[listName] || new Set();
  var list = settings[listName] || [];
  var unused = list.filter(function (v) { return !used.has(v.toLowerCase()); });
  if (!unused.length) {
    alert("Every " + label + " entry is used by a saved game — nothing to remove.");
    return;
  }
  var plural = unused.length === 1 ? "y" : "ies";
  if (!confirm("Remove " + unused.length + " unused " + label + " entr" + plural + "?\n\n" +
    "These aren't referenced by any saved game. You can always re-add one by typing it again.")) return;
  unused.forEach(function (v) { removeFromMasterList(listName, v); });
  renderMasterListEditors();
  renderDefaultPickerOptions();
}

function fillSelectOptions(id, values, selected) {
  var el = $(id);
  if (!el) return;
  el.innerHTML = '<option value="">None</option>' + (values || []).map(function (v) {
    return '<option value="' + esc(v) + '"' + (v === selected ? " selected" : "") + '>' + esc(v) + '</option>';
  }).join("");
}

// Refreshes the Setup → Game Defaults "Default Age Category"/"Default League" pickers from the master lists.
function renderDefaultPickerOptions() {
  fillSelectOptions("cfgDefAgeCategory", settings.masterAgeCategories, settings.defaultAgeCategory);
  fillSelectOptions("cfgDefLeague", settings.masterLeagues, settings.defaultLeague);
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
// Sorted by when the game actually happened (createdAt), not when its record was
// last saved — otherwise editing a completed game's info would bump it to the top.
function dbListGames() {
  return loadIndex().sort(function (a, b) {
    var da = new Date(a.createdAt || a.scheduledAt || a.updatedAt).getTime();
    var db2 = new Date(b.createdAt || b.scheduledAt || b.updatedAt).getTime();
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
      case "FIRST_SERVER_CORRECTED": {
        var fsc2 = getOrCreateSet(ev.setNumber);
        fsc2.firstServer = ev.firstServer || fsc2.firstServer;
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

  // ---- Fair play enforcement -----------------------------------------------
  var fairPlay = startEv.fairPlay || "none";
  var effectiveTimeoutsPerSet = startEv.timeoutsPerSet || 2;
  var effectiveSubsPerSet = startEv.subsPerSet || 6;
  var subsAllowedInActiveSet = true;
  var subsGrantedForSet = true; // false only when the rule prohibits subs for the entire set
  var fairPlayNote = "";

  if (fairPlay !== "none" && activeSetNumber) {
    var isEarlySet = activeSetNumber <= 2;
    var activeSetFP = setsMap[activeSetNumber];
    var maxScore = activeSetFP ? Math.max(activeSetFP.scoreA, activeSetFP.scoreB) : 0;

    if (fairPlay === "triple-fp" || fairPlay === "standard-full") {
      effectiveTimeoutsPerSet = isEarlySet ? 3 : 2;
      if (isEarlySet) {
        subsAllowedInActiveSet = false;
        subsGrantedForSet = false;
      } else {
        effectiveSubsPerSet = 12; // deciding set: 12 subs allowed
        if (fairPlay === "triple-fp") {
          // Deciding set with Triple Ball FP: subs only after last toss (same phase as timeouts)
          subsAllowedInActiveSet = (tripleBallPhase === 0 || tripleBallPhase === 3);
          if (!subsAllowedInActiveSet) fairPlayNote = "Subs: after last toss only";
        } else {
          subsAllowedInActiveSet = true; // standard-full deciding set: any time
        }
      }
    } else if (fairPlay === "standard-partial") {
      effectiveTimeoutsPerSet = 2;
      if (isEarlySet) {
        subsAllowedInActiveSet = maxScore >= 15;
        fairPlayNote = subsAllowedInActiveSet
          ? "Fair play: subs now available"
          : "Fair play: subs unlock at 15 pts (max now " + maxScore + ")";
      }
    }
  }

  // Triple ball: timeouts only at end of a 3-ball sequence (before a serve)
  // Phase 0 = before A serves, Phase 3 = before B serves — those are the only valid moments
  var timeoutAllowedInTripleBall = true;
  if (startEv.variation === "triplebal" && activeSetNumber) {
    timeoutAllowedInTripleBall = (tripleBallPhase === 0 || tripleBallPhase === 3);
  }

  // ---- Scoring rules & win condition detection ----------------------------
  var rawSetWinScore     = startEv.setWinScore     !== undefined ? startEv.setWinScore     : 25;
  var rawSetWinBy        = startEv.setWinBy        !== undefined ? startEv.setWinBy        : 2;
  var rawSetWinCap       = startEv.setWinCap       !== undefined ? startEv.setWinCap       : 0;
  var rawDeciderWinScore = startEv.deciderWinScore !== undefined ? startEv.deciderWinScore : 15;
  var rawDeciderWinBy    = startEv.deciderWinBy    !== undefined ? startEv.deciderWinBy    : 2;
  var rawDeciderWinCap   = startEv.deciderWinCap   !== undefined ? startEv.deciderWinCap   : 0;

  // Deciding set = last possible set in a best-of format
  var isBestOf = (startEv.gameFormat === "best3" || startEv.gameFormat === "best5");
  var activeSetIsDecider = isBestOf && activeSetNumber === formatInfo.total;

  var setWinConditionMet = false;
  var setWinnerTeam = null;
  var pendingMatchWin = false; // true when current set win would also clinch the match

  if (activeSetNumber && !endedAt) {
    var activeSetData = setsMap[activeSetNumber];
    if (activeSetData) {
      var wScore = activeSetIsDecider ? rawDeciderWinScore : rawSetWinScore;
      var wBy    = activeSetIsDecider ? rawDeciderWinBy    : rawSetWinBy;
      var wCap   = activeSetIsDecider ? rawDeciderWinCap   : rawSetWinCap;
      var sA = activeSetData.scoreA;
      var sB = activeSetData.scoreB;

      var teamAWins = (wCap > 0 && sA >= wCap) || (sA >= wScore && (sA - sB) >= wBy);
      var teamBWins = (wCap > 0 && sB >= wCap) || (sB >= wScore && (sB - sA) >= wBy);

      if (teamAWins) {
        setWinConditionMet = true;
        setWinnerTeam = "A";
        if ((setsWonA + 1) >= formatInfo.toWin) pendingMatchWin = true;
      } else if (teamBWins) {
        setWinConditionMet = true;
        setWinnerTeam = "B";
        if ((setsWonB + 1) >= formatInfo.toWin) pendingMatchWin = true;
      }
    }
  }

  return {
    gameId: startEv.gameId,
    gameName: startEv.gameName || "Untitled Game",
    teamA: startEv.teamA || "Team A",
    teamB: startEv.teamB || "Team B",
    teamAColor: startEv.teamAColor || null,
    teamBColor: startEv.teamBColor || null,
    location: startEv.location || "",
    gender: startEv.gender || "",
    ageCategory: startEv.ageCategory || "",
    league: startEv.league || "",
    scheduledAt: startEv.scheduledAt || null,
    gameFormat: startEv.gameFormat || "best3",
    variation: startEv.variation || "standard",
    timeoutsPerSet: startEv.timeoutsPerSet || 2,
    subsPerSet: effectiveSubsPerSet,
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
    fairPlay: fairPlay,
    effectiveTimeoutsPerSet: effectiveTimeoutsPerSet,
    subsAllowedInActiveSet: subsAllowedInActiveSet,
    subsGrantedForSet: subsGrantedForSet,
    fairPlayNote: fairPlayNote,
    timeoutAllowedInTripleBall: timeoutAllowedInTripleBall,
    // Scoring rules
    setWinScore: rawSetWinScore,
    setWinBy: rawSetWinBy,
    setWinCap: rawSetWinCap,
    deciderWinScore: rawDeciderWinScore,
    deciderWinBy: rawDeciderWinBy,
    deciderWinCap: rawDeciderWinCap,
    activeSetIsDecider: activeSetIsDecider,
    // Win condition
    setWinConditionMet: setWinConditionMet,
    setWinnerTeam: setWinnerTeam,
    pendingMatchWin: pendingMatchWin,
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

// ---- Wake Lock ------------------------------------------

var _wakeLock = null;

function requestWakeLock() {
  if (!settings.keepScreenAwake || !("wakeLock" in navigator)) return;
  navigator.wakeLock.request("screen").then(function (lock) {
    _wakeLock = lock;
    lock.addEventListener("release", function () { _wakeLock = null; });
  }).catch(function () {});
}

function releaseWakeLock() {
  if (_wakeLock) { _wakeLock.release().catch(function () {}); _wakeLock = null; }
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

async function downloadFile(filename, content, mimeType) {
  // Prefer the native Share Sheet when the browser can share files — this is what
  // actually lets the user save/send the file on mobile. iOS Safari ignores
  // <a download> entirely, and opening the blob in a new tab (the old fallback)
  // just displays the raw JSON as text instead of offering any way to save it.
  try {
    var file = new File([content], filename, { type: mimeType });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return; // user cancelled the share sheet
    // otherwise fall through to the blob download/tab fallback below
  }

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

// Exports the given gameIds (2+ selected from the Games page) as a single multi-game file.
async function exportSelectedGames(gameIds) {
  var games = [];
  for (var i = 0; i < gameIds.length; i++) {
    var r = await dbLoadGame(gameIds[i]);
    if (r) games.push(r);
  }
  if (!games.length) { alert("No games selected."); return; }
  var payload = {
    version: 1,
    type: "volleyscore-export",
    exportedAt: new Date().toISOString(),
    games: games,
  };
  var suffix = games.length + (games.length === 1 ? "game" : "games");
  downloadFile("volleyscore_export_" + suffix + "_" + new Date().toISOString().slice(0, 10) + ".json",
    JSON.stringify(payload, null, 2), "application/json");
}

// Adds a game's teamA/teamB/location/ageCategory/league to the master lists if not already present.
// Returns the number of new entries added.
function populateMasterListsFromGame(record) {
  var startEv = (record.events || []).find(function (e) { return e.type === "GAME_STARTED"; });
  if (!startEv) return 0;
  var added = 0;
  if (addToMasterList("masterTeamNames", startEv.teamA)) added++;
  if (addToMasterList("masterTeamNames", startEv.teamB)) added++;
  if (addToMasterList("masterLocations", startEv.location)) added++;
  if (addToMasterList("masterAgeCategories", startEv.ageCategory)) added++;
  if (addToMasterList("masterLeagues", startEv.league)) added++;
  return added;
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
  var listEntriesAdded = 0;
  for (var i = 0; i < games.length; i++) {
    var g = games[i];
    if (!g.gameId || !Array.isArray(g.events)) continue;
    await dbSaveGame(g);
    listEntriesAdded += populateMasterListsFromGame(g);
    imported++;
  }
  if (listEntriesAdded) {
    renderMasterListEditors();
    renderDefaultPickerOptions();
  }
  var msg = "Imported " + imported + " game" + (imported === 1 ? "" : "s") + ".";
  if (listEntriesAdded) msg += " Added " + listEntriesAdded + " new match info entr" + (listEntriesAdded === 1 ? "y" : "ies") + ".";
  alert(msg);
  await renderGamesList();
}

// ---- Match Info Lists: export / import (JSON) ------------

function exportCategoriesJson() {
  var payload = {
    version: 1,
    type: "volleyscore-categories",
    exportedAt: new Date().toISOString(),
    teamNames: settings.masterTeamNames || [],
    locations: settings.masterLocations || [],
    ageCategories: settings.masterAgeCategories || [],
    leagues: settings.masterLeagues || [],
    teamColors: settings.teamColors || {},
  };
  downloadFile("volleyscore_categories_" + new Date().toISOString().slice(0, 10) + ".json",
    JSON.stringify(payload, null, 2), "application/json");
}

function importCategoriesFromJson(text) {
  var payload;
  try { payload = JSON.parse(text); } catch (e) { alert("Invalid JSON file."); return; }
  if (payload.type !== "volleyscore-categories") { alert("Unrecognized file format."); return; }

  var added = 0;
  (payload.teamNames || []).forEach(function (v) { if (addToMasterList("masterTeamNames", v)) added++; });
  (payload.locations || []).forEach(function (v) { if (addToMasterList("masterLocations", v)) added++; });
  (payload.ageCategories || []).forEach(function (v) { if (addToMasterList("masterAgeCategories", v)) added++; });
  (payload.leagues || []).forEach(function (v) { if (addToMasterList("masterLeagues", v)) added++; });

  var colorsImported = 0;
  if (payload.teamColors && typeof payload.teamColors === "object") {
    for (var key in payload.teamColors) {
      if (!payload.teamColors.hasOwnProperty(key)) continue;
      var hex = payload.teamColors[key];
      if (typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex)) { rememberTeamColor(key, hex); colorsImported++; }
    }
  }

  renderMasterListEditors();
  renderDefaultPickerOptions();
  var msg = "Imported " + added + " new entr" + (added === 1 ? "y" : "ies") + ".";
  if (colorsImported) msg += " Updated " + colorsImported + " team color" + (colorsImported === 1 ? "" : "s") + ".";
  alert(msg);
}

// ---- Match Info Lists: export as .xlsx (hand-rolled, stored/uncompressed ZIP) ----
// Each category gets its own sheet/tab. Import only supports JSON — .xlsx export
// is meant for viewing/sharing in Excel, not as a round-trip import format.

var CRC32_TABLE = (function () {
  var table = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  var crc = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function concatUint8(arrays) {
  var total = arrays.reduce(function (s, a) { return s + a.length; }, 0);
  var out = new Uint8Array(total);
  var offset = 0;
  arrays.forEach(function (a) { out.set(a, offset); offset += a.length; });
  return out;
}

// Builds a ZIP archive (stored/no-compression entries) from [{ name, data: Uint8Array }].
function buildZip(files) {
  var localChunks = [];
  var centralChunks = [];
  var offset = 0;

  files.forEach(function (f) {
    var nameBytes = new TextEncoder().encode(f.name);
    var crc = crc32(f.data);
    var size = f.data.length;

    var local = new Uint8Array(30 + nameBytes.length);
    var lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x21, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localChunks.push(local, f.data);

    var central = new Uint8Array(46 + nameBytes.length);
    var cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralChunks.push(central);

    offset += local.length + f.data.length;
  });

  var centralStart = offset;
  var centralBlock = concatUint8(centralChunks);

  var eocd = new Uint8Array(22);
  var ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralBlock.length, true);
  ev.setUint32(16, centralStart, true);

  return concatUint8(localChunks.concat([centralBlock, eocd]));
}

function xlsxColLetter(i) {
  var s = "";
  i++;
  while (i > 0) {
    var rem = (i - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

// footerText, if given, becomes the printed page footer (Excel's own page-footer
// feature — shows when the sheet itself is printed, independent of our HTML report footer).
// footerText, if given, becomes the printed page footer (Excel's own page-footer
// feature — shows when the sheet itself is printed, independent of our HTML report footer).
// merges is an optional array of "A1:B1"-style ranges to merge (e.g. a team name
// spanning that team's columns). boldCenterRows is an optional array of 0-based
// row indices whose cells should render bold + centered (style index 1).
function xlsxSheetXml(rows, footerText, merges, boldCenterRows) {
  var boldCenterSet = {};
  (boldCenterRows || []).forEach(function (ri) { boldCenterSet[ri] = true; });
  var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  rows.forEach(function (row, ri) {
    xml += '<row r="' + (ri + 1) + '">';
    var styleAttr = boldCenterSet[ri] ? ' s="1"' : '';
    row.forEach(function (val, ci) {
      var ref = xlsxColLetter(ci) + (ri + 1);
      xml += '<c r="' + ref + '"' + styleAttr + ' t="inlineStr"><is><t xml:space="preserve">' + esc(String(val)) + '</t></is></c>';
    });
    xml += '</row>';
  });
  xml += '</sheetData>';
  if (merges && merges.length) {
    xml += '<mergeCells count="' + merges.length + '">' +
      merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join("") +
      '</mergeCells>';
  }
  if (footerText) {
    xml += '<headerFooter><oddFooter>&amp;C&amp;"Calibri"' + esc(footerText) + '</oddFooter></headerFooter>';
  }
  xml += '</worksheet>';
  return xml;
}

function xlsxWorkbookXml(sheetNames) {
  var sheets = sheetNames.map(function (name, i) {
    return '<sheet name="' + esc(name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
  }).join("");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' + sheets + '</sheets></workbook>';
}

function xlsxWorkbookRelsXml(sheetCount) {
  var rels = "";
  for (var i = 0; i < sheetCount; i++) {
    rels += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
  }
  rels += '<Relationship Id="rId' + (sheetCount + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>';
}

function xlsxContentTypesXml(sheetCount) {
  var overrides = '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
  for (var i = 0; i < sheetCount; i++) {
    overrides += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' + overrides + '</Types>';
}

var XLSX_ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

var XLSX_STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
  '</cellXfs>' +
  '</styleSheet>';

function exportCategoriesXlsx() {
  var sheetsData = [
    { name: "Team Names", values: settings.masterTeamNames || [] },
    { name: "Locations", values: settings.masterLocations || [] },
    { name: "Age Categories", values: settings.masterAgeCategories || [] },
    { name: "Leagues", values: settings.masterLeagues || [] },
  ];

  var enc = new TextEncoder();
  var files = [
    { name: "[Content_Types].xml", data: enc.encode(xlsxContentTypesXml(sheetsData.length)) },
    { name: "_rels/.rels", data: enc.encode(XLSX_ROOT_RELS) },
    { name: "xl/workbook.xml", data: enc.encode(xlsxWorkbookXml(sheetsData.map(function (s) { return s.name; }))) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(xlsxWorkbookRelsXml(sheetsData.length)) },
    { name: "xl/styles.xml", data: enc.encode(XLSX_STYLES_XML) },
  ];
  sheetsData.forEach(function (sheet, i) {
    var rows = sheet.name === "Team Names" ?
      [[sheet.name, "Color"]].concat(sheet.values.map(function (v) { return [v, getRememberedTeamColor(v) || ""]; })) :
      [[sheet.name]].concat(sheet.values.map(function (v) { return [v]; }));
    files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: enc.encode(xlsxSheetXml(rows)) });
  });

  var zipBytes = buildZip(files);
  downloadFile("volleyscore_categories_" + new Date().toISOString().slice(0, 10) + ".xlsx",
    zipBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

// ---- Match Info Lists: import from .xlsx (hand-rolled ZIP reader + DOM XML parsing) ----
// Supports both "stored" (uncompressed) and "deflate" entries — the latter via the
// browser's native DecompressionStream, so no hand-written inflate is needed. Sheets are
// matched to a category by name; column A values become that category's list entries.

function findZipEocd(bytes) {
  var minPos = Math.max(0, bytes.length - 65557); // max comment length (65535) + EOCD record (22)
  for (var i = bytes.length - 22; i >= minPos; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return i;
  }
  return -1;
}

// Reads the central directory into a { name: {method, compSize, localOffset} } map.
function readZipEntries(bytes) {
  var eocdPos = findZipEocd(bytes);
  if (eocdPos === -1) throw new Error("Not a valid .xlsx (zip) file.");
  var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  var entryCount = dv.getUint16(eocdPos + 10, true);
  var pos = dv.getUint32(eocdPos + 16, true);

  var entries = {};
  for (var i = 0; i < entryCount; i++) {
    if (dv.getUint32(pos, true) !== 0x02014b50) break;
    var method = dv.getUint16(pos + 10, true);
    var compSize = dv.getUint32(pos + 20, true);
    var nameLen = dv.getUint16(pos + 28, true);
    var extraLen = dv.getUint16(pos + 30, true);
    var commentLen = dv.getUint16(pos + 32, true);
    var localOffset = dv.getUint32(pos + 42, true);
    var name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    entries[name] = { method: method, compSize: compSize, localOffset: localOffset };
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readZipEntryData(bytes, entry) {
  var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  var pos = entry.localOffset;
  if (dv.getUint32(pos, true) !== 0x04034b50) throw new Error("Corrupt .xlsx (zip) entry.");
  var nameLen = dv.getUint16(pos + 26, true);
  var extraLen = dv.getUint16(pos + 28, true);
  var dataStart = pos + 30 + nameLen + extraLen;
  var raw = bytes.subarray(dataStart, dataStart + entry.compSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("This browser can't open Excel files that use compression. Try a newer browser, or import the JSON export instead.");
    }
    var stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error("Unsupported compression in .xlsx file.");
}

function xlsxPartPath(target) {
  var t = target.replace(/^\.?\//, "");
  return /^xl\//.test(t) ? t : "xl/" + t;
}

function xmlText(el) {
  return el ? Array.prototype.map.call(el.getElementsByTagName("t"), function (t) { return t.textContent; }).join("") : "";
}

var CATEGORY_SHEET_NAMES = {
  "team names": "masterTeamNames",
  "locations": "masterLocations",
  "age categories": "masterAgeCategories",
  "leagues": "masterLeagues",
};

// Reads a single XLSX cell's text content, resolving shared-string references.
function xlsxCellText(cell, sharedStrings) {
  if (!cell) return "";
  var type = cell.getAttribute("t");
  var text;
  if (type === "inlineStr") {
    text = xmlText(cell.getElementsByTagName("is")[0]);
  } else if (type === "s") {
    var vEl = cell.getElementsByTagName("v")[0];
    text = sharedStrings[vEl ? parseInt(vEl.textContent, 10) : -1] || "";
  } else {
    var vEl2 = cell.getElementsByTagName("v")[0];
    text = vEl2 ? vEl2.textContent : (cell.textContent || "");
  }
  return (text || "").trim();
}

async function importCategoriesFromXlsx(arrayBuffer) {
  var bytes = new Uint8Array(arrayBuffer);
  var decoder = new TextDecoder();
  var parser = new DOMParser();
  var entries;

  try {
    entries = readZipEntries(bytes);
  } catch (e) {
    alert("Could not read that file as an Excel workbook.");
    return;
  }

  async function readPart(name) {
    var entry = entries[name];
    if (!entry) return null;
    var data = await readZipEntryData(bytes, entry);
    return parser.parseFromString(decoder.decode(data), "application/xml");
  }

  var added = 0;
  var colorsAdded = 0;
  try {
    var workbookXml = await readPart("xl/workbook.xml");
    if (!workbookXml) throw new Error("Missing workbook.xml.");

    var relsXml = await readPart("xl/_rels/workbook.xml.rels");
    var relMap = {};
    if (relsXml) {
      Array.prototype.forEach.call(relsXml.getElementsByTagName("Relationship"), function (rel) {
        relMap[rel.getAttribute("Id")] = rel.getAttribute("Target");
      });
    }

    var sharedStrings = [];
    var sstXml = await readPart("xl/sharedStrings.xml");
    if (sstXml) {
      Array.prototype.forEach.call(sstXml.getElementsByTagName("si"), function (si) {
        sharedStrings.push(xmlText(si));
      });
    }

    var sheetEls = workbookXml.getElementsByTagName("sheet");
    for (var i = 0; i < sheetEls.length; i++) {
      var sheetName = (sheetEls[i].getAttribute("name") || "").trim();
      var listKey = CATEGORY_SHEET_NAMES[sheetName.toLowerCase()];
      if (!listKey) continue;

      var rId = sheetEls[i].getAttribute("r:id") ||
        sheetEls[i].getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      var target = relMap[rId];
      if (!target) continue;

      var sheetXml = await readPart(xlsxPartPath(target));
      if (!sheetXml) continue;

      var isTeamNames = listKey === "masterTeamNames";
      var values = [];
      var colorsByName = {}; // Team Names sheet only — column B holds the hex color, if any
      var rows = sheetXml.getElementsByTagName("row");
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].getElementsByTagName("c");
        var text = xlsxCellText(cells[0], sharedStrings);
        if (!text) continue;
        values.push(text);
        if (isTeamNames) {
          var colorText = xlsxCellText(cells[1], sharedStrings);
          if (/^#[0-9a-f]{6}$/i.test(colorText)) colorsByName[text] = colorText;
        }
      }

      // Drop the header row (our own export repeats the category name there)
      if (values.length && values[0].toLowerCase() === sheetName.toLowerCase()) values.shift();
      values.forEach(function (v) { if (addToMasterList(listKey, v)) added++; });
      if (isTeamNames) {
        values.forEach(function (v) {
          if (colorsByName[v]) { rememberTeamColor(v, colorsByName[v]); colorsAdded++; }
        });
      }
    }
  } catch (e) {
    alert(e.message || "Could not import that Excel file.");
    return;
  }

  renderMasterListEditors();
  renderDefaultPickerOptions();
  var msg = "Imported " + added + " new entr" + (added === 1 ? "y" : "ies") + " from Excel.";
  if (colorsAdded) msg += " Updated " + colorsAdded + " team color" + (colorsAdded === 1 ? "" : "s") + ".";
  alert(msg);
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
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
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
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

// yyyy-mm-dd hh:mm (24-hour) — used in Recent Games list
function formatDateTimeShort(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  var pad = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
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
    case "expulsion":        return '<span class="card-icon card-y"></span><span class="card-icon card-r card-r-overlap" aria-label="Expulsion"></span>';
    case "disqualification": return '<span class="card-icon card-y"></span><span class="card-icon card-r card-r-offset" aria-label="Disqualification"></span>';
    default:                 return '<span class="card-icon card-y"></span>';
  }
}

function delaySanctionHtml(dtype) {
  var watch = '<span class="delay-icon" aria-hidden="true">\u231A</span>';
  switch (dtype) {
    case "warning": return '<span class="card-icon card-y card-small" title="Delay warning"></span>' + watch;
    case "penalty":  return '<span class="card-icon card-r card-small" title="Delay penalty"></span>' + watch;
    default:        return "";
  }
}

// ---- Page navigation ------------------------------------

var currentPage = "score";

function showPage(page) {
  currentPage = page;
  $("scorePage").hidden  = page !== "score";
  $("gamesPage").hidden  = page !== "games";
  $("reportsPage").hidden = page !== "reports";
  $("setupPage").hidden  = page !== "setup";
  $("logPage").hidden    = page !== "log";

  document.querySelectorAll(".nav-btn").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-page") === page);
  });

  if (page === "games") { void renderGamesList(); }
  if (page === "reports") { renderReportsPage(); }
  if (page === "setup") { renderSetupPage(); }
  if (page === "log")   { renderLogPage(); }
  // When returning to score page, reset to setup if no game is loaded
  if (page === "score") {
    if (!controller.getState()) {
      showSetupPanel();
    } else if (!$("scoreboard").hidden) {
      renderScoreboard(); // re-render to ensure controls reflect current state
    }
  }
}

// ---- Score Page — Game Setup Form ----------------------

var setupFirstServer = "A";
var setupTimeouts = 2;
var setupSubs = 6;

function initGameSetupForm() {
  // When persistence is on and a previous game exists, prefill from that game's
  // actual entries instead of the configured defaults; otherwise, unchanged behavior.
  var last = (settings.persistNewGameData && settings.lastGameSetup) ? settings.lastGameSetup : null;

  // Pre-fill team names and location from saved defaults
  $("cfgTeamA").value    = last ? last.teamA : (settings.defaultTeamA || "Team A");
  $("cfgTeamB").value    = last ? last.teamB : (settings.defaultTeamB || "Team B");
  $("cfgLocation").value = last ? last.location : (settings.defaultLocation || "");
  $("cfgGender").value = last ? last.gender : (settings.defaultGender || "");
  $("cfgAgeCategory").value = last ? last.ageCategory : (settings.defaultAgeCategory || "");
  $("cfgLeague").value = last ? last.league : (settings.defaultLeague || "");
  // Per-game color override — reset to the current global defaults each time,
  // unless persisting, in which case reuse the last game's override colors. A
  // remembered per-team-name color (if any) takes priority over both of those.
  $("cfgTeamAColorOverride").value = getRememberedTeamColor($("cfgTeamA").value) || (last ? last.teamAColor : settings.teamAColor);
  $("cfgTeamBColorOverride").value = getRememberedTeamColor($("cfgTeamB").value) || (last ? last.teamBColor : settings.teamBColor);
  syncColorSwatchButtons();
  // Apply those colors live (setting .value alone doesn't fire input/update the CSS vars)
  updateTeamColors($("cfgTeamAColorOverride").value, $("cfgTeamBColorOverride").value);
  // Prefill defaults from settings
  document.querySelector('input[name="gameFormat"][value="' + (last ? last.gameFormat : settings.defaultFormat) + '"]').checked = true;
  document.querySelector('input[name="variation"][value="' + (last ? last.variation : (settings.defaultVariation || "standard")) + '"]').checked = true;
  document.querySelector('input[name="fairPlay"][value="' + (last ? last.fairPlay : (settings.defaultFairPlay || "none")) + '"]').checked = true;
  setupTimeouts = last ? last.timeoutsPerSet : settings.defaultTimeouts;
  setupSubs = last ? last.subsPerSet : settings.defaultSubs;
  $("cfgTimeouts").textContent = setupTimeouts;
  $("cfgSubs").textContent = setupSubs;
  $("cfgScheduledAt").value = toLocalDatetimeValue(new Date());
  if (last) setupFirstServer = last.firstServer || "A";

  // Pre-fill scoring rules from settings defaults
  setupSetWinScore = last ? last.setWinScore : (settings.defaultSetWinScore !== undefined ? settings.defaultSetWinScore : 25);
  setupSetWinBy = last ? last.setWinBy : (settings.defaultSetWinBy !== undefined ? settings.defaultSetWinBy : 2);
  setupSetWinCap = last ? last.setWinCap : (settings.defaultSetWinCap !== undefined ? settings.defaultSetWinCap : 0);
  setupDeciderWinScore = last ? last.deciderWinScore : (settings.defaultDeciderWinScore !== undefined ? settings.defaultDeciderWinScore : 15);
  setupDeciderWinBy = last ? last.deciderWinBy : (settings.defaultDeciderWinBy !== undefined ? settings.defaultDeciderWinBy : 2);
  setupDeciderWinCap = last ? last.deciderWinCap : (settings.defaultDeciderWinCap !== undefined ? settings.defaultDeciderWinCap : 0);
  $("cfgSetWinScore").textContent = setupSetWinScore;
  $("cfgSetWinBy").textContent = setupSetWinBy;
  $("chkSetWinCap").checked = setupSetWinCap > 0;
  $("cfgSetWinCap").textContent = setupSetWinCap > 0 ? setupSetWinCap : setupSetWinScore;
  $("cfgDeciderWinScore").textContent = setupDeciderWinScore;
  $("cfgDeciderWinBy").textContent = setupDeciderWinBy;
  $("chkDeciderWinCap").checked = setupDeciderWinCap > 0;
  $("cfgDeciderWinCap").textContent = setupDeciderWinCap > 0 ? setupDeciderWinCap : setupDeciderWinScore;
  updateScoringRuleInteractivity();

  // Reset fair play tooltip
  $("fpTooltip").hidden = true;
  $("btnFpInfo").setAttribute("aria-expanded", "false");

  // Team name placeholders reflect first-serve selection
  updateFirstServeBtnLabels();
  // Show only fair play options relevant to the current variation
  updateFairPlayOptions();
  // Show/hide deciding set rules based on game format
  updateDeciderRulesVisibility();
}

// Show/hide fair play options and reset selection based on variation
// Also show/hide the timeout/sub steppers (hidden when a fair play rule is active)
function updateFairPlayOptions() {
  var variation = document.querySelector('input[name="variation"]:checked').value;
  document.querySelectorAll('[data-fp-variation]').forEach(function (label) {
    var visible = label.getAttribute('data-fp-variation') === variation;
    label.hidden = !visible;
    // If the hidden option was selected, reset to none
    if (!visible) {
      var radio = label.querySelector('input[name="fairPlay"]');
      if (radio && radio.checked) {
        document.querySelector('input[name="fairPlay"][value="none"]').checked = true;
      }
    }
  });
  // Hide timeout/sub steppers when any fair play rule is active
  var fpSelected = document.querySelector('input[name="fairPlay"]:checked').value;
  var stepperRow = $("setupStepperRow");
  if (stepperRow) stepperRow.hidden = fpSelected !== "none";
}

// Also wire fair play radio change to update stepper visibility
(function () {
  document.querySelectorAll('input[name="fairPlay"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      var stepperRow = $("setupStepperRow");
      if (stepperRow) stepperRow.hidden = radio.value !== "none";
    });
  });
})();

// Show/hide the deciding set rules fieldset based on game format
function updateDeciderRulesVisibility() {
  var format = document.querySelector('input[name="gameFormat"]:checked').value;
  var hasdecider = (format === "best3" || format === "best5");
  var deciderFieldset = $("deciderRulesFieldset");
  if (deciderFieldset) deciderFieldset.hidden = !hasdecider;
}

// Enforce cap/win-by interactivity rules for the per-game setup form.
function updateScoringRuleInteractivity() {
  // Regular sets
  var capEnabled = $("chkSetWinCap") && $("chkSetWinCap").checked;
  var rowCapVal = $("rowSetWinCapVal");
  var rowWinBy  = $("rowSetWinBy");
  if (rowCapVal) rowCapVal.hidden = !capEnabled;
  if (!capEnabled) {
    setupSetWinCap = 0;
    if (rowWinBy) rowWinBy.hidden = false;
  } else {
    if (setupSetWinCap < setupSetWinScore) {
      setupSetWinCap = setupSetWinScore;
      if ($("cfgSetWinCap")) $("cfgSetWinCap").textContent = setupSetWinCap;
    }
    if (rowWinBy) rowWinBy.hidden = (setupSetWinCap - setupSetWinScore <= setupSetWinBy);
  }
  // Deciding set
  var decCapEnabled = $("chkDeciderWinCap") && $("chkDeciderWinCap").checked;
  var rowDecCapVal = $("rowDeciderWinCapVal");
  var rowDecWinBy  = $("rowDeciderWinBy");
  if (rowDecCapVal) rowDecCapVal.hidden = !decCapEnabled;
  if (!decCapEnabled) {
    setupDeciderWinCap = 0;
    if (rowDecWinBy) rowDecWinBy.hidden = false;
  } else {
    if (setupDeciderWinCap < setupDeciderWinScore) {
      setupDeciderWinCap = setupDeciderWinScore;
      if ($("cfgDeciderWinCap")) $("cfgDeciderWinCap").textContent = setupDeciderWinCap;
    }
    if (rowDecWinBy) rowDecWinBy.hidden = (setupDeciderWinCap - setupDeciderWinScore <= setupDeciderWinBy);
  }
}

// Same enforcement for the Setup page Scoring Defaults section.
function updateDefScoringRuleInteractivity() {
  var winScore = settings.defaultSetWinScore !== undefined ? settings.defaultSetWinScore : 25;
  var capEnabled = $("chkDefSetWinCap") && $("chkDefSetWinCap").checked;
  var rowCapVal = $("rowDefSetWinCapVal");
  var rowWinBy  = $("rowDefSetWinBy");
  if (rowCapVal) rowCapVal.hidden = !capEnabled;
  if (!capEnabled) {
    settings.defaultSetWinCap = 0;
    if (rowWinBy) rowWinBy.hidden = false;
  } else {
    var cap = settings.defaultSetWinCap || 0;
    if (cap < winScore) {
      settings.defaultSetWinCap = winScore;
      if ($("cfgDefSetWinCap")) $("cfgDefSetWinCap").textContent = settings.defaultSetWinCap;
    }
    if (rowWinBy) rowWinBy.hidden = (settings.defaultSetWinCap - winScore <= (settings.defaultSetWinBy !== undefined ? settings.defaultSetWinBy : 2));
  }
  var deciderWinScore = settings.defaultDeciderWinScore !== undefined ? settings.defaultDeciderWinScore : 15;
  var decCapEnabled = $("chkDefDeciderWinCap") && $("chkDefDeciderWinCap").checked;
  var rowDecCapVal = $("rowDefDeciderWinCapVal");
  var rowDecWinBy  = $("rowDefDeciderWinBy");
  if (rowDecCapVal) rowDecCapVal.hidden = !decCapEnabled;
  if (!decCapEnabled) {
    settings.defaultDeciderWinCap = 0;
    if (rowDecWinBy) rowDecWinBy.hidden = false;
  } else {
    var decCap = settings.defaultDeciderWinCap || 0;
    if (decCap < deciderWinScore) {
      settings.defaultDeciderWinCap = deciderWinScore;
      if ($("cfgDefDeciderWinCap")) $("cfgDefDeciderWinCap").textContent = settings.defaultDeciderWinCap;
    }
    if (rowDecWinBy) rowDecWinBy.hidden = (settings.defaultDeciderWinCap - deciderWinScore <= (settings.defaultDeciderWinBy !== undefined ? settings.defaultDeciderWinBy : 2));
  }
  saveSettings();
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

function clearGenericTeamNameOnFocus(input, genericName) {
  input.addEventListener("focus", function () {
    if (input.value === genericName) input.value = "";
  });
}

function wireGameSetupForm() {
  clearGenericTeamNameOnFocus($("cfgTeamA"), "Team A");
  clearGenericTeamNameOnFocus($("cfgTeamB"), "Team B");
  // Also auto-fill that team's remembered color (if any) when its name changes,
  // whether typed to an exact match or picked from the dropdown.
  $("cfgTeamA").addEventListener("input", function () {
    updateFirstServeBtnLabels();
    applyRememberedTeamColor("A");
  });
  $("cfgTeamB").addEventListener("input", function () {
    updateFirstServeBtnLabels();
    applyRememberedTeamColor("B");
  });

  // Live-preview the per-game color override on the First Serve buttons (and
  // anything else on this screen driven by --team-a/--team-b) as it's picked —
  // and remember it against the current team name for next time.
  $("cfgTeamAColorOverride").addEventListener("input", function () {
    updateTeamColors(this.value, $("cfgTeamBColorOverride").value);
    rememberTeamColor($("cfgTeamA").value, this.value);
  });
  $("cfgTeamBColorOverride").addEventListener("input", function () {
    updateTeamColors($("cfgTeamAColorOverride").value, this.value);
    rememberTeamColor($("cfgTeamB").value, this.value);
  });

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

  // Variation change → update fair play options
  document.querySelectorAll('input[name="variation"]').forEach(function (radio) {
    radio.addEventListener("change", updateFairPlayOptions);
  });

  // Format change → update deciding set rules visibility
  document.querySelectorAll('input[name="gameFormat"]').forEach(function (radio) {
    radio.addEventListener("change", updateDeciderRulesVisibility);
  });

  // Scoring rule steppers — regular sets
  $("btnSetWinScoreDown").addEventListener("click", function () {
    if (setupSetWinScore > 1) { setupSetWinScore--; $("cfgSetWinScore").textContent = setupSetWinScore; updateScoringRuleInteractivity(); }
  });
  $("btnSetWinScoreUp").addEventListener("click", function () {
    if (setupSetWinScore < 50) { setupSetWinScore++; $("cfgSetWinScore").textContent = setupSetWinScore; updateScoringRuleInteractivity(); }
  });
  $("btnSetWinByDown").addEventListener("click", function () {
    if (setupSetWinBy > 1) { setupSetWinBy--; $("cfgSetWinBy").textContent = setupSetWinBy; }
  });
  $("btnSetWinByUp").addEventListener("click", function () {
    if (setupSetWinBy < 10) { setupSetWinBy++; $("cfgSetWinBy").textContent = setupSetWinBy; }
  });
  $("chkSetWinCap").addEventListener("change", function () {
    if (this.checked && setupSetWinCap === 0) {
      setupSetWinCap = setupSetWinScore;
      $("cfgSetWinCap").textContent = setupSetWinCap;
    }
    updateScoringRuleInteractivity();
  });
  $("btnSetWinCapDown").addEventListener("click", function () {
    if (setupSetWinCap > setupSetWinScore) { setupSetWinCap--; $("cfgSetWinCap").textContent = setupSetWinCap; updateScoringRuleInteractivity(); }
  });
  $("btnSetWinCapUp").addEventListener("click", function () {
    if (setupSetWinCap < 60) { setupSetWinCap++; $("cfgSetWinCap").textContent = setupSetWinCap; updateScoringRuleInteractivity(); }
  });

  // Scoring rule steppers — deciding set
  $("btnDeciderWinScoreDown").addEventListener("click", function () {
    if (setupDeciderWinScore > 1) { setupDeciderWinScore--; $("cfgDeciderWinScore").textContent = setupDeciderWinScore; updateScoringRuleInteractivity(); }
  });
  $("btnDeciderWinScoreUp").addEventListener("click", function () {
    if (setupDeciderWinScore < 50) { setupDeciderWinScore++; $("cfgDeciderWinScore").textContent = setupDeciderWinScore; updateScoringRuleInteractivity(); }
  });
  $("btnDeciderWinByDown").addEventListener("click", function () {
    if (setupDeciderWinBy > 1) { setupDeciderWinBy--; $("cfgDeciderWinBy").textContent = setupDeciderWinBy; }
  });
  $("btnDeciderWinByUp").addEventListener("click", function () {
    if (setupDeciderWinBy < 10) { setupDeciderWinBy++; $("cfgDeciderWinBy").textContent = setupDeciderWinBy; }
  });
  $("chkDeciderWinCap").addEventListener("change", function () {
    if (this.checked && setupDeciderWinCap === 0) {
      setupDeciderWinCap = setupDeciderWinScore;
      $("cfgDeciderWinCap").textContent = setupDeciderWinCap;
    }
    updateScoringRuleInteractivity();
  });
  $("btnDeciderWinCapDown").addEventListener("click", function () {
    if (setupDeciderWinCap > setupDeciderWinScore) { setupDeciderWinCap--; $("cfgDeciderWinCap").textContent = setupDeciderWinCap; updateScoringRuleInteractivity(); }
  });
  $("btnDeciderWinCapUp").addEventListener("click", function () {
    if (setupDeciderWinCap < 60) { setupDeciderWinCap++; $("cfgDeciderWinCap").textContent = setupDeciderWinCap; updateScoringRuleInteractivity(); }
  });

  // Info icon → toggle fair play tooltip
  $("btnFpInfo").addEventListener("click", function (e) {
    e.stopPropagation();
    var tooltip = $("fpTooltip");
    var open = tooltip.hidden;
    tooltip.hidden = !open;
    $("btnFpInfo").setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", function (e) {
    if (!$("fpTooltip").hidden && !e.target.closest("#btnFpInfo")) {
      $("fpTooltip").hidden = true;
      $("btnFpInfo").setAttribute("aria-expanded", "false");
    }
  });

  // Start game
  $("btnStartGame").addEventListener("click", function () {
    void startNewGame();
  });
}

async function startNewGame() {
  var teamA = $("cfgTeamA").value.trim() || "Team A";
  var teamB = $("cfgTeamB").value.trim() || "Team B";
  var teamAColor = $("cfgTeamAColorOverride").value || settings.teamAColor;
  var teamBColor = $("cfgTeamBColorOverride").value || settings.teamBColor;
  var location = $("cfgLocation").value.trim();
  var gender = $("cfgGender").value;
  var ageCategory = $("cfgAgeCategory").value.trim();
  var league = $("cfgLeague").value.trim();
  var scheduledAt = $("cfgScheduledAt").value || toLocalDatetimeValue(new Date());
  var gameFormat = document.querySelector('input[name="gameFormat"]:checked').value;
  var variation  = document.querySelector('input[name="variation"]:checked').value;
  var fairPlay   = document.querySelector('input[name="fairPlay"]:checked').value;
  var gameId = crypto.randomUUID();
  var now = new Date().toISOString();

  // Remember any newly typed values for next time
  addToMasterList("masterTeamNames", teamA);
  addToMasterList("masterTeamNames", teamB);
  addToMasterList("masterLocations", location);
  addToMasterList("masterAgeCategories", ageCategory);
  addToMasterList("masterLeagues", league);
  rememberTeamColor(teamA, teamAColor);
  rememberTeamColor(teamB, teamBColor);

  // Snapshot this game's New Game form entries, used next time if "persist New
  // Game data" is on. Captured unconditionally so turning the setting on later
  // immediately has this game's data available rather than nothing at all.
  settings.lastGameSetup = {
    teamA: teamA, teamB: teamB, teamAColor: teamAColor, teamBColor: teamBColor,
    location: location, gender: gender, ageCategory: ageCategory, league: league,
    gameFormat: gameFormat, variation: variation, fairPlay: fairPlay,
    timeoutsPerSet: setupTimeouts, subsPerSet: setupSubs, firstServer: setupFirstServer,
    setWinScore: setupSetWinScore, setWinBy: setupSetWinBy, setWinCap: setupSetWinCap,
    deciderWinScore: setupDeciderWinScore, deciderWinBy: setupDeciderWinBy, deciderWinCap: setupDeciderWinCap,
  };
  saveSettings();

  controller.clear();
  controller.currentGameId = gameId;
  selectedLogSetFilter = null; // reset filter for new game
  sidesSwapped = false;        // reset side layout for new game
  _tbPrevPhase = -1;           // reset triple ball animation state
  _setWinKey = null;           // reset win condition alert state
  _matchWinKey = null;
  _midDeciderSwitchPromptedSet = null;

  var startEvent = {
    type: "GAME_STARTED",
    gameId: gameId,
    gameName: teamA + " vs " + teamB,
    teamA: teamA,
    teamB: teamB,
    teamAColor: teamAColor,
    teamBColor: teamBColor,
    location: location,
    gender: gender,
    ageCategory: ageCategory,
    league: league,
    scheduledAt: scheduledAt,
    gameFormat: gameFormat,
    variation: variation,
    fairPlay: fairPlay,
    timeoutsPerSet: setupTimeouts,
    subsPerSet: setupSubs,
    firstServer: setupFirstServer,
    setWinScore: setupSetWinScore,
    setWinBy: setupSetWinBy,
    setWinCap: setupSetWinCap,
    deciderWinScore: setupDeciderWinScore,
    deciderWinBy: setupDeciderWinBy,
    deciderWinCap: setupDeciderWinCap,
    timestamp: now,
  };
  controller.dispatch(startEvent);

  // Don't auto-start Set 1 — prompt for it via the between-sets serve picker,
  // same as Set 2 onward. Pre-suggest whatever was chosen on the New Game screen.
  pendingServePickTeam = setupFirstServer;

  await persistGame();
  showScoreboard();
  renderScoreboard();
}

// ---- Score Page — Scoreboard ----------------------------

var sanctionTargetTeam = null;     // "A" or "B"
var sanctionSelectedRole = "player"; // current role in misconduct sanction
var _sanctionPlayerNum = "";       // player number from the numeric pad
var pendingServePickTeam = null;   // for between-sets serve selection
var selectedLogSetFilter = null;   // null = all sets; number = filter log to that set
var sidesSwapped = false;          // true when Team B panel is visually on the left
var _justEndedGame = false;        // true only until user navigates away after End Game
var _tbPrevPhase = -1;             // previous TB phase, used to choose animation direction
var _tbAnimating = false;          // prevents overlapping TB phase animations
var _prevPortrait = window.innerHeight > window.innerWidth; // orientation tracking for TB re-render

// Per-game scoring rules (pre-filled from settings, can be changed per game)
var setupSetWinScore = 25;
var setupSetWinBy = 2;
var setupSetWinCap = 0;
var setupDeciderWinScore = 15;
var setupDeciderWinBy = 2;
var setupDeciderWinCap = 0;

// Win condition alert state — track last triggered key to avoid duplicate toasts
var _setWinKey = null;   // e.g. "A-2" = Team A at win condition in set 2, or null
var _matchWinKey = null; // "A" or "B" or null
var _midDeciderSwitchPromptedSet = null; // set number already prompted for the mid-decider side switch, or null

function showScoreboard() {
  $("gameSetupPanel").hidden = true;
  $("scoreboard").hidden = false;
  var state = controller.getState();
  updateTeamColors(state && state.teamAColor, state && state.teamBColor);
  requestWakeLock();
}

function showSetupPanel() {
  $("scoreboard").hidden = true;
  $("gameSetupPanel").hidden = false;
  $("navLogBtn").hidden = true;
  _justEndedGame = false; // navigating away clears the undo window
  _tbPrevPhase = -1;
  _setWinKey = null;
  _matchWinKey = null;
  _midDeciderSwitchPromptedSet = null;
  updateTeamColors(); // restore global default colors
  initGameSetupForm();
}

// Apply team colors from state (or CSS vars). aOverride/bOverride let an
// active game's per-game team colors take precedence over the global defaults.
function updateTeamColors(aOverride, bOverride) {
  var root = document.documentElement;
  var aColor = aOverride || settings.teamAColor;
  var bColor = bOverride || settings.teamBColor;
  root.style.setProperty("--team-a", aColor);
  var aRgb = hexToRgb(aColor);
  var bRgb = hexToRgb(bColor);
  if (aRgb) root.style.setProperty("--team-a-light", "rgba(" + aRgb + ",0.12)");
  root.style.setProperty("--team-b", bColor);
  if (bRgb) root.style.setProperty("--team-b-light", "rgba(" + bRgb + ",0.12)");
  // Start Set button: separate fill and pulse/outline colors
  // Fall back to legacy startSetColor if the newer keys aren't saved yet
  var ssBg    = settings.startSetBgColor    || settings.startSetColor || "#15803d";
  var ssPulse = settings.startSetPulseColor || settings.startSetColor || "#15803d";
  root.style.setProperty("--start-set-color", ssBg);
  root.style.setProperty("--start-set-pulse-color", ssPulse);
  var ssRgb = hexToRgb(ssPulse);
  if (ssRgb) root.style.setProperty("--start-set-rgb", ssRgb);
  root.style.setProperty("--sidebar-btn-border", settings.sidebarBtnBorder || "#000000");
  root.style.setProperty("--tb-box-sz", (settings.tbBoxSize || 84) + "px");
  root.style.setProperty("--tb-unit", ((settings.tbBoxSize || 84) + 16) + "px");
  root.style.setProperty("--tb-highlight", settings.tbHighlightColor || "#15803d");
  root.style.setProperty("--win-glow-color", settings.winGlowColor || "#f59e0b");
  root.style.setProperty("--win-glow-duration", (settings.winGlowDuration || 3) + "s");
  root.style.setProperty("--action-glow-color", settings.actionGlowColor || "#a855f7");
  root.style.setProperty("--action-glow-duration", (settings.actionGlowDuration || 2) + "s");
}

function hexToRgb(hex) {
  var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  return parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16);
}

// ---- Per-team-name remembered colors ---------------------------------

// Looks up the color last used for this team name, or null if none saved yet.
function getRememberedTeamColor(name) {
  var key = (name || "").trim().toLowerCase();
  if (!key) return null;
  return (settings.teamColors && settings.teamColors[key]) || null;
}

// Saves/updates the color remembered for this team name. Always builds a new
// object (never mutates settings.teamColors in place) so DEFAULT_SETTINGS'
// shared {} literal is never touched, same precaution as addToMasterList.
function rememberTeamColor(name, hex) {
  var key = (name || "").trim().toLowerCase();
  if (!key || !hex) return;
  var map = settings.teamColors || {};
  if (map[key] === hex) return;
  var next = {};
  for (var k in map) { if (map.hasOwnProperty(k)) next[k] = map[k]; }
  next[key] = hex;
  settings.teamColors = next;
  saveSettings();
}

// Carries a remembered color over to a team's new name after a master-list rename
// (otherwise it would be silently orphaned under the old, now-unused key).
function renameRememberedTeamColor(oldName, newName) {
  var oldKey = (oldName || "").trim().toLowerCase();
  var newKey = (newName || "").trim().toLowerCase();
  if (!oldKey || !newKey || oldKey === newKey) return;
  var map = settings.teamColors || {};
  if (!Object.prototype.hasOwnProperty.call(map, oldKey)) return;
  var next = {};
  for (var k in map) { if (map.hasOwnProperty(k) && k !== oldKey) next[k] = map[k]; }
  next[newKey] = map[oldKey];
  settings.teamColors = next;
}

// If the named team (A or B) has a remembered color, applies it to that team's
// color override field (and live CSS vars) — called whenever the team name
// field changes, whether typed or picked from the dropdown.
function applyRememberedTeamColor(letter) {
  var nameInput = $(letter === "A" ? "cfgTeamA" : "cfgTeamB");
  var colorInput = $(letter === "A" ? "cfgTeamAColorOverride" : "cfgTeamBColorOverride");
  var remembered = getRememberedTeamColor(nameInput.value);
  if (remembered && remembered.toLowerCase() !== colorInput.value.toLowerCase()) {
    setColorInputValue(colorInput, remembered);
  }
}

// A single reusable (never removed) hidden <input type=color> that stands in for
// whichever Team Names chip's swatch was last clicked, so the shared color preset
// popover (built around a real color input) can also drive per-team-name colors.
function getMlTeamColorProxyInput() {
  var input = $("mlTeamColorProxy");
  if (input) return input;
  input = document.createElement("input");
  input.type = "color";
  input.id = "mlTeamColorProxy";
  input.className = "color-input-visually-hidden";
  input.tabIndex = -1;
  document.body.appendChild(input);
  input.addEventListener("input", function () {
    if (!input.dataset.teamName) return;
    rememberTeamColor(input.dataset.teamName, input.value);
    renderMasterListEditors();
  });
  return input;
}

// Opens the shared color preset popover anchored to a Team Names chip's swatch button.
function openTeamColorPickerForChip(teamName, anchorBtn) {
  var proxy = getMlTeamColorProxyInput();
  proxy.dataset.teamName = teamName;
  proxy.value = getRememberedTeamColor(teamName) || ML_CHIP_NO_COLOR;
  openColorPresetPopover(proxy, anchorBtn);
}

// ---- Color preset popover (shared by all color pickers) -------------

var COLOR_PRESET_SWATCHES = [
  "#dc2626", "#ea580c", "#f59e0b", "#eab308", "#65a30d", "#16a34a",
  "#059669", "#0d9488", "#0891b2", "#0284c7", "#2563eb", "#4f46e5",
  "#7c3aed", "#9333ea", "#c026d3", "#db2777", "#e11d48", "#78350f",
  "#1e3a8a", "#4b5563", "#000000", "#ffffff",
];

var _colorPopoverInput = null; // the hidden <input type=color> currently being edited

// Replaces a native color input's visible control with a swatch button that
// opens a shared preset-grid popover; the original input stays for "Custom…".
function enhanceColorInput(inputId) {
  var input = $(inputId);
  if (!input || input.dataset.enhanced) return;
  input.dataset.enhanced = "1";

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "color-swatch-btn" + (input.classList.contains("color-picker-sm") ? " color-swatch-btn-sm" : "");
  btn.style.background = input.value;
  var label = input.getAttribute("title") || input.getAttribute("aria-label") || "Choose color";
  btn.title = label;
  btn.setAttribute("aria-label", label);

  input.insertAdjacentElement("beforebegin", btn);
  // Visually hidden (not display:none) so .click() can still open the native picker
  input.classList.add("color-input-visually-hidden");
  input.tabIndex = -1;

  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    openColorPresetPopover(input, btn);
  });
  // Keep the swatch in sync when the native picker ("Custom…") changes the value
  input.addEventListener("input", function () { btn.style.background = input.value; });
}

// Re-applies each swatch button's background from its paired input's current
// value — needed because setting `.value` in JS doesn't fire input/change events.
function syncColorSwatchButtons() {
  document.querySelectorAll(".color-swatch-btn").forEach(function (btn) {
    var input = btn.nextElementSibling;
    if (input && input.type === "color") btn.style.background = input.value;
  });
}

function openColorPresetPopover(input, anchorBtn) {
  _colorPopoverInput = input;
  var grid = $("colorPresetGrid");
  grid.innerHTML = "";
  COLOR_PRESET_SWATCHES.forEach(function (hex) {
    var sw = document.createElement("button");
    sw.type = "button";
    sw.className = "color-preset-swatch" + (hex.toLowerCase() === (input.value || "").toLowerCase() ? " active" : "");
    sw.style.background = hex;
    sw.title = hex;
    sw.setAttribute("aria-label", hex);
    sw.addEventListener("click", function () {
      setColorInputValue(input, hex);
      closeColorPresetPopover();
    });
    grid.appendChild(sw);
  });

  var pop = $("colorPresetPopover");
  pop.hidden = false;
  positionColorPopover(pop, anchorBtn);
}

function closeColorPresetPopover() {
  $("colorPresetPopover").hidden = true;
  _colorPopoverInput = null;
}

function positionColorPopover(pop, anchor) {
  var r = anchor.getBoundingClientRect();
  var pw = pop.offsetWidth, ph = pop.offsetHeight;
  // Right-align to the button (swatch buttons are usually the last thing in
  // their row), so the popover tends to stay within the card instead of
  // spilling into the page background when the button sits near the right edge.
  var left = Math.max(8, Math.min(r.right - pw, window.innerWidth - pw - 8));
  var top = r.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  pop.style.left = left + "px";
  pop.style.top = top + "px";
}

function setColorInputValue(input, hex) {
  input.value = hex;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  syncColorSwatchButtons();
}

function wireColorPresetPopover() {
  [
    "cfgTeamAColor", "cfgTeamBColor", "cfgSidebarBtnBorder",
    "cfgStartSetColor", "cfgStartSetPulseColor", "cfgTbHighlight",
    "cfgWinGlowColor", "cfgActionGlowColor",
    "cfgTeamAColorOverride", "cfgTeamBColorOverride", "cfgAddTeamNameColor",
  ].forEach(enhanceColorInput);

  $("btnColorPresetCustom").addEventListener("click", function () {
    var input = _colorPopoverInput;
    closeColorPresetPopover();
    if (input) input.click(); // opens the native OS color picker
  });

  document.addEventListener("click", function (e) {
    var pop = $("colorPresetPopover");
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest(".color-swatch-btn, .ml-chip-color")) {
      closeColorPresetPopover();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("colorPresetPopover").hidden) closeColorPresetPopover();
  });
  // Reposition (don't close) on scroll — avoids the popover vanishing if the page
  // scrolls for any reason (e.g. a nearby field's keyboard-driven scroll-into-view).
  window.addEventListener("scroll", function () {
    var pop = $("colorPresetPopover");
    if (!pop.hidden && _colorPopoverInput) {
      var btn = _colorPopoverInput.previousElementSibling;
      if (btn) positionColorPopover(pop, btn);
    }
  }, true);
}

// ---- Combo dropdown (Team A/B, Location, Age Category, League) -------
// Custom pick-or-type list that always opens below the field, unlike native
// <datalist> which some browsers position inconsistently (e.g. flipped left).

var COMBO_FIELDS = [
  { inputId: "cfgTeamA", listKey: "masterTeamNames" },
  { inputId: "cfgTeamB", listKey: "masterTeamNames" },
  { inputId: "cfgLocation", listKey: "masterLocations" },
  { inputId: "cfgAgeCategory", listKey: "masterAgeCategories" },
  { inputId: "cfgLeague", listKey: "masterLeagues" },
  { inputId: "emiTeamA", listKey: "masterTeamNames" },
  { inputId: "emiTeamB", listKey: "masterTeamNames" },
  { inputId: "emiLocation", listKey: "masterLocations" },
  { inputId: "emiAgeCategory", listKey: "masterAgeCategories" },
  { inputId: "emiLeague", listKey: "masterLeagues" },
];

var _comboInput = null;   // input currently showing the dropdown
var _comboOptions = [];   // current filtered option strings
var _comboActiveIndex = -1;

function enhanceComboInput(inputId, listKey) {
  var input = $(inputId);
  if (!input || input.dataset.comboEnhanced) return;
  input.dataset.comboEnhanced = "1";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-autocomplete", "list");

  input.addEventListener("focus", function () { openComboDropdown(input, listKey); });
  // Dismissing the dropdown (e.g. tapping a non-focusable area) doesn't always blur
  // the input, so a second tap on an already-focused field wouldn't refire "focus" —
  // "click" fires every tap regardless, so it reliably reopens the dropdown.
  input.addEventListener("click", function () { openComboDropdown(input, listKey); });
  input.addEventListener("input", function () { openComboDropdown(input, listKey); });
  input.addEventListener("keydown", function (e) { handleComboKeydown(e, input); });
  // mousedown on an option calls preventDefault (see below), so blur only fires
  // for genuine focus-away actions (Tab, clicking elsewhere) — safe to close here.
  input.addEventListener("blur", function () { closeComboDropdown(); });
}

function openComboDropdown(input, listKey) {
  var values = settings[listKey] || [];
  var q = input.value.trim().toLowerCase();
  var filtered = q ? values.filter(function (v) { return v.toLowerCase().indexOf(q) !== -1; }) : values.slice();

  _comboInput = input;
  _comboOptions = filtered;
  _comboActiveIndex = -1;

  var panel = $("comboDropdown");
  if (filtered.length) {
    panel.innerHTML = filtered.map(function (v, i) {
      return '<div class="combo-option" data-index="' + i + '" role="option">' + esc(v) + '</div>';
    }).join("");
    panel.querySelectorAll(".combo-option").forEach(function (opt, i) {
      // mousedown (not click) fires before the input's blur, so the selection registers reliably
      opt.addEventListener("mousedown", function (e) {
        e.preventDefault();
        selectComboOption(i);
      });
    });
  } else {
    // Still show the panel with a hint — otherwise an empty/no-match list looks
    // identical to the dropdown being broken rather than "nothing saved yet".
    panel.innerHTML = '<div class="combo-empty-hint">' +
      esc(values.length ? "No matches \u2014 keep typing to add a new one" : "No saved values yet \u2014 type to add one") +
      '</div>';
  }

  panel.hidden = false;
  input.setAttribute("aria-expanded", "true");
  positionComboDropdown(panel, input);
  // Mobile browsers often auto-scroll a lower field above the on-screen keyboard
  // shortly *after* focus fires — re-check position once that settles.
  requestAnimationFrame(function () { if (_comboInput === input) positionComboDropdown(panel, input); });
  setTimeout(function () { if (_comboInput === input) positionComboDropdown(panel, input); }, 350);
}

function selectComboOption(index) {
  if (!_comboInput || index < 0 || index >= _comboOptions.length) return;
  _comboInput.value = _comboOptions[index];
  _comboInput.dispatchEvent(new Event("input", { bubbles: true }));
  closeComboDropdown();
}

function closeComboDropdown() {
  var panel = $("comboDropdown");
  panel.hidden = true;
  if (_comboInput) _comboInput.setAttribute("aria-expanded", "false");
  _comboInput = null;
  _comboOptions = [];
  _comboActiveIndex = -1;
}

// Opens below the field by default; flips above when that side has more room
// (e.g. a lower field like League sitting near the bottom of the visible area,
// covered by the on-screen keyboard). Always finishes with a hard clamp so the
// panel can never end up rendered partly or fully off-screen either way.
function positionComboDropdown(panel, input) {
  var margin = 8;
  var r = input.getBoundingClientRect();
  // visualViewport reflects the space actually visible above an on-screen keyboard;
  // window.innerHeight doesn't shrink for the keyboard on iOS Safari.
  var visibleBottom = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  var spaceBelow = visibleBottom - r.bottom - margin;
  var spaceAbove = r.top - margin;

  panel.style.left = r.left + "px";
  panel.style.width = r.width + "px";

  var openBelow = spaceBelow >= 80 || spaceBelow >= spaceAbove;
  var available = Math.max(40, openBelow ? spaceBelow : spaceAbove);
  var height = Math.min(panel.scrollHeight, available);
  var top = openBelow ? (r.bottom + 4) : (r.top - height - 4);

  // Hard clamp: never let the panel extend above or below the visible area,
  // regardless of how the field itself is currently positioned/scrolled.
  top = Math.max(margin, Math.min(top, visibleBottom - height - margin));

  panel.style.top = top + "px";
  panel.style.maxHeight = height + "px";
}

function handleComboKeydown(e, input) {
  var panel = $("comboDropdown");
  if (panel.hidden || _comboInput !== input) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    _comboActiveIndex = Math.min(_comboActiveIndex + 1, _comboOptions.length - 1);
    updateComboActiveOption();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    _comboActiveIndex = Math.max(_comboActiveIndex - 1, 0);
    updateComboActiveOption();
  } else if (e.key === "Enter") {
    if (_comboActiveIndex >= 0) { e.preventDefault(); selectComboOption(_comboActiveIndex); }
  } else if (e.key === "Escape") {
    closeComboDropdown();
  }
}

function updateComboActiveOption() {
  var panel = $("comboDropdown");
  panel.querySelectorAll(".combo-option").forEach(function (opt, i) {
    opt.classList.toggle("active", i === _comboActiveIndex);
  });
  var activeEl = panel.querySelector(".combo-option.active");
  if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
}

function wireComboInputs() {
  COMBO_FIELDS.forEach(function (f) { enhanceComboInput(f.inputId, f.listKey); });

  document.addEventListener("click", function (e) {
    var panel = $("comboDropdown");
    if (!panel.hidden && !panel.contains(e.target) && e.target !== _comboInput) {
      closeComboDropdown();
    }
  });
  // Reposition (don't close) on scroll/resize — mobile browsers scroll the
  // focused field into view above the keyboard, which shouldn't dismiss it.
  window.addEventListener("scroll", function () {
    if (_comboInput) positionComboDropdown($("comboDropdown"), _comboInput);
  }, true);
  window.addEventListener("resize", function () {
    if (_comboInput) positionComboDropdown($("comboDropdown"), _comboInput);
  });
  // visualViewport catches on-screen keyboard show/hide more reliably than window resize
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function () {
      if (_comboInput) positionComboDropdown($("comboDropdown"), _comboInput);
    });
  }
}

// Update the team-panels flex order and side indicator to reflect sidesSwapped
function updateSidesDisplay(state) {
  var panels = $("teamPanels");
  if (panels) panels.classList.toggle("sides-swapped", sidesSwapped);

  var gameInfo = $("gameInfo");
  if (gameInfo) gameInfo.classList.toggle("sides-swapped", sidesSwapped);

  var btn = $("btnSwitchSides");
  if (btn) btn.title = sidesSwapped ? "Restore original sides" : "Swap which side each team appears on";
}

// Apply or remove the win-glow class without restarting the animation when already active
function applyWinGlow(elementId, apply) {
  var el = $(elementId);
  if (!el) return;
  var has = el.classList.contains("win-glow");
  if (apply && !has) {
    el.classList.add("win-glow");
  } else if (!apply && has) {
    el.classList.remove("win-glow");
  }
}

// Flash a one-shot action glow on an element (timeout, sub, sanction).
// Restarts the animation if called again while already glowing.
function applyActionGlow(el) {
  if (!el) return;
  el.classList.remove("action-glow");
  void el.offsetWidth; // force reflow to restart animation
  el.classList.add("action-glow");
  var duration = (settings.actionGlowDuration || 2) * 1000;
  setTimeout(function () {
    el.classList.remove("action-glow");
  }, duration + 100);
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
  if ($("sbGameName")) $("sbGameName").textContent = state.gameName;
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

  // Sub indicator — show count normally, or "No Subs" when fair play prohibits all subs this set
  var subNoGrant = !!(activeSet && !state.subsGrantedForSet);
  var subIndA = $("subIndicatorA");
  var subIndB = $("subIndicatorB");
  if (subIndA) {
    subIndA.innerHTML = subNoGrant
      ? "No Subs"
      : 'Sub <span id="subValA">' + (activeSet ? activeSet.subsA : 0) + '</span>/<span id="subMaxA">' + state.subsPerSet + '</span>';
  }
  if (subIndB) {
    subIndB.innerHTML = subNoGrant
      ? "No Subs"
      : 'Sub <span id="subValB">' + (activeSet ? activeSet.subsB : 0) + '</span>/<span id="subMaxB">' + state.subsPerSet + '</span>';
  }

  // Timeout dots — use effective timeout count (fair play may override)
  renderTimeoutDots("toDotsA", "toCountA", activeSet ? activeSet.timeoutsA : 0, state.effectiveTimeoutsPerSet);
  renderTimeoutDots("toDotsB", "toCountB", activeSet ? activeSet.timeoutsB : 0, state.effectiveTimeoutsPerSet);
  $("btnToA").classList.toggle("to-exhausted", activeSet && (activeSet.timeoutsA >= state.effectiveTimeoutsPerSet || !state.timeoutAllowedInTripleBall));
  $("btnToB").classList.toggle("to-exhausted", activeSet && (activeSet.timeoutsB >= state.effectiveTimeoutsPerSet || !state.timeoutAllowedInTripleBall));

  // Sub exhausted / fair-play-blocked highlight
  $("btnSubA").classList.toggle("sub-exhausted", activeSet && (activeSet.subsA >= state.subsPerSet || !state.subsAllowedInActiveSet));
  $("btnSubB").classList.toggle("sub-exhausted", activeSet && (activeSet.subsB >= state.subsPerSet || !state.subsAllowedInActiveSet));

  // Serve dot — in triple ball shows which team owns the current 3-ball half (phases 0-2 or 3-5);
  // in standard play shows last scorer
  var dotTeam;
  if (state.variation === "triplebal" && state.activeSetNumber && activeSet) {
    dotTeam = state.tripleBallPhase < 3
      ? activeSet.firstServer
      : (activeSet.firstServer === "A" ? "B" : "A");
  } else {
    dotTeam = state.servingTeam;
  }
  $("serveDotA").classList.toggle("active", !!state.activeSetNumber && dotTeam === "A");
  $("serveDotB").classList.toggle("active", !!state.activeSetNumber && dotTeam === "B");

  // Sanctions display — aggregate across all sets (sanctions are match-wide)
  var allSanctionsA = state.sets.reduce(function (acc, s) { return acc.concat(s.sanctionsA); }, []);
  var allSanctionsB = state.sets.reduce(function (acc, s) { return acc.concat(s.sanctionsB); }, []);
  var allDelayA = state.sets.reduce(function (acc, s) { return acc.concat(s.delaySanctionsA); }, []);
  var allDelayB = state.sets.reduce(function (acc, s) { return acc.concat(s.delaySanctionsB); }, []);
  renderSanctionsBar("sanctionsBarA", allSanctionsA, allDelayA, state.improperRequestA);
  renderSanctionsBar("sanctionsBarB", allSanctionsB, allDelayB, state.improperRequestB);

  // Triple ball
  var isTriple = state.variation === "triplebal";
  var courtCenter = $("courtCenter");
  if (courtCenter) courtCenter.classList.toggle("tb-mode", isTriple);
  $("tripleBallBar").hidden = !isTriple;
  // The actual renderTripleBall() call happens further below, after the serve
  // picker resolves pendingServePickTeam — otherwise the between-sets preview
  // (including before Set 1) would read a stale/unset value.

  // Control buttons
  var hasActiveSet = !!state.activeSetNumber;
  var isGameOver = !!state.endedAt;
  var isBetweenSets = !isGameOver && !hasActiveSet;

  $("btnEndSet").hidden = !hasActiveSet;
  $("btnEndSet").disabled = !hasActiveSet;
  // Hide "Start Next Set" when the game is already decided or all sets are done
  $("btnStartNextSet").hidden = !isBetweenSets || state.gameCanEnd;
  $("btnStartNextSet").disabled = isGameOver;
  $("nextSetNum").textContent = state.nextSetNum;
  $("btnEndGame").hidden = isGameOver;
  $("btnEndGame").disabled = !state.gameCanEnd && !hasActiveSet && !isBetweenSets;
  $("btnNewGame").hidden = !isGameOver;
  $("btnSwitchSides").hidden = isGameOver;

  // Serve picker: shown between sets (pick the next set's server) OR during
  // the current set before any point is scored (fix a wrong initial pick).
  var canCorrectActiveServe = hasActiveSet && !!activeSet && (activeSet.scoreA + activeSet.scoreB === 0);
  $("servePicker").hidden = !((isBetweenSets && !state.gameCanEnd) || canCorrectActiveServe);
  if (isBetweenSets && !state.gameCanEnd) {
    $("servePickerSetNum").textContent = state.nextSetNum;
    // Pre-suggest server (alternates from last set's first server)
    if (pendingServePickTeam === null) {
      var prevEndedSets = state.sets.filter(function (s) { return !!s.endedAt; });
      var lastEndedSet = prevEndedSets.length ? prevEndedSets[prevEndedSets.length - 1] : null;
      pendingServePickTeam = lastEndedSet ? (lastEndedSet.firstServer === "A" ? "B" : "A") : "A";
    }
    $("servePickerChipTeam").textContent = pendingServePickTeam === "A" ? state.teamA : state.teamB;
  } else if (canCorrectActiveServe) {
    $("servePickerSetNum").textContent = state.activeSetNumber;
    $("servePickerChipTeam").textContent = activeSet.firstServer === "A" ? state.teamA : state.teamB;
  }

  // Now that pendingServePickTeam is resolved above, render (or preview) the
  // Triple Ball track. Without the between-sets branch, the indicator would
  // keep showing whatever was last rendered (e.g. the previous game's last
  // set) until Start Set is tapped, which looks like a stale/wrong server.
  if (isTriple) {
    if (hasActiveSet) {
      var tbHidePrev = !!(activeSet && (activeSet.scoreA + activeSet.scoreB === 0));
      renderTripleBall(state.tripleBallPhase, tbHidePrev, activeSet && activeSet.firstServer);
    } else if (isBetweenSets && !state.gameCanEnd) {
      renderTripleBall(0, true, pendingServePickTeam || "A");
    }
  }

  // Undo / Redo — Undo is disabled for completed games unless they were just ended
  $("btnUndo").disabled = !state.canUndo || (!!state.endedAt && !_justEndedGame);
  $("btnRedo").disabled = !state.canRedo;

  // Score buttons disabled when no active set or game over
  var scoringActive = hasActiveSet && !isGameOver;
  ["btnScoreAPlus", "btnScoreAMinus", "btnScoreBPlus", "btnScoreBMinus",
   "btnToA", "btnToB", "btnSubA", "btnSubB", "btnCardA", "btnCardB"].forEach(function (id) {
    var el = $(id);
    if (el) el.disabled = !scoringActive;
  });
  // Apply additional restrictions on top of the base disabled state
  if (scoringActive) {
    $("btnSubA").disabled = !state.subsAllowedInActiveSet;
    $("btnSubB").disabled = !state.subsAllowedInActiveSet;
    $("btnToA").disabled = !state.timeoutAllowedInTripleBall;
    $("btnToB").disabled = !state.timeoutAllowedInTripleBall;
  }

  // Show/hide the Match Log nav button
  $("navLogBtn").hidden = false;

  // ---- Win condition glow -----------------------------------------------
  var winA = !isGameOver && state.setWinConditionMet && state.setWinnerTeam === "A";
  var winB = !isGameOver && state.setWinConditionMet && state.setWinnerTeam === "B";
  // End Set button glows persistently while win condition is met
  applyWinGlow("btnEndSet", (winA || winB) && hasActiveSet);
  // End Game button glows between sets when match winner is determined
  applyWinGlow("btnEndGame", state.gameCanEnd && isBetweenSets && !isGameOver);

  // Win condition reminder in game bar
  var wcEl = $("sbWinCondition");
  if (wcEl) {
    if (hasActiveSet && !isGameOver) {
      var wscore = state.activeSetIsDecider ? state.deciderWinScore : state.setWinScore;
      var wby    = state.activeSetIsDecider ? state.deciderWinBy    : state.setWinBy;
      var wcap   = state.activeSetIsDecider ? state.deciderWinCap   : state.setWinCap;
      var condText;
      if (wcap > 0 && wcap === wscore) {
        condText = "First to " + wscore;
      } else if (wcap > 0) {
        condText = "First to " + wscore + ", win by " + wby + " \u00B7 cap " + wcap;
      } else if (wby > 1) {
        condText = "First to " + wscore + ", win by " + wby;
      } else {
        condText = "First to " + wscore;
      }
      wcEl.textContent = condText;
      wcEl.hidden = false;
    } else {
      wcEl.hidden = true;
    }
  }

  // Clear the toast-key trackers when win condition is no longer present,
  // so the toast will fire again if the user re-scores the winning point (e.g. after undo).
  if (!state.setWinConditionMet) _setWinKey = null;
  if (!state.gameCanEnd && !state.pendingMatchWin) _matchWinKey = null;

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

// Build the HTML for a single phase box, including directional ball-flow arrow.
// TB_PHASE_TEAMS/TOWARD assume Team A serves first; flip A/B when the set's
// actual first server is Team B instead.
function tbPhaseBoxHtml(idx, cls, firstServer) {
  function flip(letter) {
    return firstServer === "B" ? (letter === "A" ? "B" : "A") : letter;
  }
  var team   = flip(TB_PHASE_TEAMS[idx]);
  var type   = TB_PHASE_TYPES[idx];
  var toward = flip(TB_PHASE_TOWARD[idx]);
  var teamCls   = team   === "A" ? "tb-a" : "tb-b";
  // Arrow points toward the receiving team (direction), but is colored for
  // the team performing the action (server/tosser), same as the letter.
  var isRight = sidesSwapped ? (toward === "A") : (toward === "B");
  var dirArrow = isRight ? "\u27A1" : "\u2B05"; // ➡ or ⬅  (solid filled arrows)
  return '<div class="tb-phase-box ' + cls + '">' +
    '<span class="tb-team-letter ' + teamCls + '">' + team + '</span>' +
    '<span class="tb-type">' + type + '</span>' +
    '<span class="tb-dir-arrow ' + teamCls + '">' + dirArrow + '</span>' +
    '</div>';
}

// Rebuild the track as a static 3-box snapshot (prev · current · next).
// hidePrev: make the prev slot invisible (set start — no ball has been in play yet).
function tbBuildStatic(track, phase, hidePrev, firstServer) {
  var prevPhase = ((phase - 1) + 6) % 6;
  var nextPhase = (phase + 1) % 6;
  var arrow = '<span class="tb-col-arrow">\u25BC</span>';
  var prevCls = "tb-box-prev" + (hidePrev ? " tb-box-hidden" : "");
  track.innerHTML =
    tbPhaseBoxHtml(prevPhase, prevCls, firstServer) + arrow +
    tbPhaseBoxHtml(phase,     "tb-box-current", firstServer) + arrow +
    tbPhaseBoxHtml(nextPhase, "tb-box-next", firstServer);
}

function renderTripleBall(phase, hidePrev, firstServer) {
  var track = $("tbColTrack");
  if (!track) return;

  var portrait = window.innerHeight > window.innerWidth;
  var boxSz = settings.tbBoxSize || 84;
  // Slot size: landscape includes arrow+gaps (~16 px); portrait hides arrows (gap only ~3 px)
  var unit = portrait ? (boxSz + 3) : (boxSz + 16);
  // Base transform: centers box-1 (current) over the stationary window
  // Landscape: track top=0, left=50%, shift left by half track width = translateX(-50%)
  // Portrait:  track top=50%, left=50%, shift left so box-1 center lands at strip center
  //            box-1 center offset from track origin = 1.5*boxSz + 3 (box + gap)
  var baseTransform = portrait
    ? "translate(" + (-(1.5 * boxSz + 3)) + "px, -50%)"
    : "translateX(-50%)";
  // Animation target: same formula shifted by -unit (forward) / pre-offset for backward
  var animTarget = portrait
    ? "translate(" + (-(1.5 * boxSz + 3) - unit) + "px, -50%)"
    : "translateX(-50%) translateY(" + (-unit) + "px)";

  var phaseChanged = _tbPrevPhase >= 0 && _tbPrevPhase !== phase;
  var dist     = phaseChanged ? (phase - _tbPrevPhase + 6) % 6 : 0;
  var forward  = dist === 1;
  var backward = dist === 5;

  // Non-animated cases: initial render, multi-step jump, or mid-animation
  if (!phaseChanged || (!forward && !backward) || _tbAnimating) {
    track.style.transition = "none";
    track.style.transform  = baseTransform;
    tbBuildStatic(track, phase, !!hidePrev, firstServer);
    _tbPrevPhase = phase;
    return;
  }

  _tbAnimating = true;
  var speed = settings.tbScrollSpeed !== undefined ? settings.tbScrollSpeed : 280;
  var arrowHtml = '<span class="tb-col-arrow">\u25BC</span>';
  var addPhase;

  if (forward) {
    // Append new-next box; animate from base to animTarget
    addPhase = (phase + 1) % 6;
    track.insertAdjacentHTML("beforeend", arrowHtml + tbPhaseBoxHtml(addPhase, "tb-box-next", firstServer));
    void track.offsetWidth;
    track.style.transition = "transform " + speed + "ms cubic-bezier(0.25,0.46,0.45,0.94)";
    track.style.transform  = animTarget;
  } else {
    // Prepend new-prev box; pre-offset to animTarget (looks like base), then animate to base
    addPhase = ((phase - 1) + 6) % 6;
    track.insertAdjacentHTML("afterbegin", tbPhaseBoxHtml(addPhase, "tb-box-prev", firstServer) + arrowHtml);
    track.style.transition = "none";
    track.style.transform  = animTarget;
    void track.offsetWidth;
    track.style.transition = "transform " + speed + "ms cubic-bezier(0.25,0.46,0.45,0.94)";
    track.style.transform  = baseTransform;
  }

  var fallback;
  function onEnd() {
    track.removeEventListener("transitionend", onEnd);
    clearTimeout(fallback);
    track.style.transition = "none";
    track.style.transform  = baseTransform;
    _tbPrevPhase = phase;
    tbBuildStatic(track, phase, false, firstServer);
    _tbAnimating = false;
  }
  fallback = setTimeout(onEnd, speed + 150);
  track.addEventListener("transitionend", onEnd, { once: true });
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

// Render the detail-page set summary table with filterable pills.
function renderDetailSetTable(state) {
  var tbody = $("detailSetBody");
  var tfoot = $("detailSetFoot");
  if (!tbody || !tfoot) return;
  tbody.innerHTML = "";
  tfoot.innerHTML = "";
  state.sets.forEach(function (s) {
    var tr = document.createElement("tr");
    var winA = s.endedAt && s.scoreA > s.scoreB;
    var winB = s.endedAt && s.scoreB > s.scoreA;
    var isFiltered = selectedDetailSetFilter === s.setNumber;
    tr.innerHTML =
      "<td><span class='set-filter-pill" + (isFiltered ? " active" : "") + "' data-setnum='" + s.setNumber + "' title='" + (isFiltered ? "Clear filter" : "Filter log to Set " + s.setNumber) + "'>" + s.setNumber + "</span></td>" +
      "<td class='" + (winA ? "set-win-a" : "") + "'>" + s.scoreA + "</td>" +
      "<td class='" + (winB ? "set-win-b" : "") + "'>" + s.scoreB + "</td>";
    tbody.appendChild(tr);
  });
  var footTr = document.createElement("tr");
  footTr.innerHTML =
    "<td>Sets Won</td><td class='set-win-a'>" + state.setsWonA + "</td><td class='set-win-b'>" + state.setsWonB + "</td>";
  tfoot.appendChild(footTr);
  var hint = $("detailFilterHint");
  if (hint) hint.hidden = !selectedDetailSetFilter;
}

function formatLabel(fmt) {
  return { "single": "Single Set", "straight2": "2 Sets", "best3": "Best of 3", "best5": "Best of 5" }[fmt] || fmt;
}

// Compact win-condition string for display in game details / meta lines.
// e.g. "to 25, by 2" or "to 25, by 2, cap 28" or "to 15, cap 17"
function winCondLabel(winScore, winBy, winCap) {
  var capHidesWinBy = winCap > 0 && (winCap - winScore) <= winBy;
  if (winCap > 0 && capHidesWinBy) {
    return "to " + winScore + (winCap > winScore ? ", cap " + winCap : "");
  } else if (winCap > 0) {
    return "to " + winScore + ", by " + winBy + ", cap " + winCap;
  } else if (winBy > 1) {
    return "to " + winScore + ", by " + winBy;
  }
  return "to " + winScore;
}

// Show a temporary toast message at the bottom of the screen.
var _toastTimer = null;
function showToast(message, duration, extraClass) {
  duration = duration || 4000;
  // Remove any existing toast immediately
  var existing = document.querySelector(".toast");
  if (existing) existing.parentNode.removeChild(existing);
  if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }

  var toast = document.createElement("div");
  toast.className = "toast" + (extraClass ? " " + extraClass : "");
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
    if (settings.confirmUndo && !confirm("Undo last action?")) return;
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
    // Check if ending this set results in a match win
    var stateAfterEnd = controller.getState();
    if (stateAfterEnd && stateAfterEnd.gameCanEnd) {
      var matchWinner = stateAfterEnd.setsWonA >= stateAfterEnd.setsToWin ? "A" :
                        stateAfterEnd.setsWonB >= stateAfterEnd.setsToWin ? "B" : null;
      if (matchWinner && matchWinner !== _matchWinKey) {
        _matchWinKey = matchWinner;
        var mTeamName = matchWinner === "A" ? stateAfterEnd.teamA : stateAfterEnd.teamB;
        var toastMs = (settings.winToastDuration || 3) * 1000;
        showToast("\uD83C\uDFC6 " + mTeamName + " wins the match! (" +
          stateAfterEnd.setsWonA + "\u2013" + stateAfterEnd.setsWonB + " sets)", toastMs, "toast-win");
      }
    }
    // Sides for the upcoming set — applied now (while "Start Set N" is up)
    // rather than only after it's tapped, so the swap is visible ahead of
    // starting play. A deciding set gets its own real coin-toss prompt
    // instead of the regular auto-switch setting.
    if (stateAfterEnd && !stateAfterEnd.gameCanEnd) {
      var isBestOfFmt = stateAfterEnd.gameFormat === "best3" || stateAfterEnd.gameFormat === "best5";
      var nextIsDecider = isBestOfFmt && stateAfterEnd.nextSetNum === stateAfterEnd.totalSets;
      if (nextIsDecider) {
        pendingServePickTeam = null; // force an explicit pick, no pre-suggested alternation
        // Teams stay exactly where they finished the last set by default —
        // only swap if the referee says that's NOT correct after the toss.
        var sideMsg = "Deciding Set " + stateAfterEnd.nextSetNum + " \u2014 new coin toss. Are teams on the correct side?";
        if (!confirm(sideMsg)) {
          sidesSwapped = !sidesSwapped;
          updateSidesDisplay(stateAfterEnd);
        }
        renderScoreboard();
        // Brief pause so the (possibly just-swapped) team panels are visible
        // before the next prompt covers the screen.
        setTimeout(openServePickerModal, 600);
        return;
      }
      if (settings.autoSwitchSidesBetweenSets) {
        sidesSwapped = !sidesSwapped;
        updateSidesDisplay(stateAfterEnd);
      }
    }
    renderScoreboard();
  });

  // Serve picker chip opens a modal; between sets it stages a pick for
  // "Start Next Set", during an unscored active set it corrects immediately.
  $("btnOpenServePicker").addEventListener("click", openServePickerModal);
  $("btnCloseServePickerModal").addEventListener("click", closeServePickerModal);
  $("servePickerModal").addEventListener("click", function (e) {
    if (e.target === $("servePickerModal")) closeServePickerModal();
  });
  $("btnPickServeA").addEventListener("click", function () { handleServePick("A"); });
  $("btnPickServeB").addEventListener("click", function () { handleServePick("B"); });

  function handleServePick(team) {
    var state = controller.getState();
    if (!state) return;
    var activeSet = state.activeSetNumber
      ? state.sets.find(function (s) { return s.setNumber === state.activeSetNumber; })
      : null;
    var canCorrect = activeSet && (activeSet.scoreA + activeSet.scoreB === 0);
    if (canCorrect) {
      if (activeSet.firstServer !== team) {
        controller.dispatch({
          type: "FIRST_SERVER_CORRECTED",
          setNumber: state.activeSetNumber,
          firstServer: team,
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      pendingServePickTeam = team;
    }
    closeServePickerModal();
    renderScoreboard();
  }

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
  $("btnEndGame").addEventListener("click", async function () {
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
    releaseWakeLock();
    // Force-save immediately so Games page shows the correct status
    _justEndedGame = true;
    await persistGame();
    // Stay on scoreboard — Undo is available here; New Game navigates away
    renderScoreboard();
  });

  // New Game (shown after game ends) — clear the just-ended flag and go to setup
  $("btnNewGame").addEventListener("click", function () {
    _justEndedGame = false;
    showSetupPanel();
  });

  // Switch sides display
  $("btnSwitchSides").addEventListener("click", function () {
    sidesSwapped = !sidesSwapped;
    updateSidesDisplay(controller.getState());
    // Re-render TB phases so directional arrows reflect the new sides —
    // covers both an active set and the between-sets preview (including
    // before Set 1 starts, which otherwise wouldn't reflect the swap until
    // Start Set was tapped).
    var sw = controller.getState();
    if (sw && sw.variation === "triplebal") {
      _tbPrevPhase = -1; // suppress animation on side-swap
      if (sw.activeSetNumber) {
        var swSet = sw.sets.find(function(s) { return s.setNumber === sw.activeSetNumber; });
        renderTripleBall(sw.tripleBallPhase, !!(swSet && swSet.scoreA + swSet.scoreB === 0), swSet && swSet.firstServer);
      } else if (!sw.endedAt && !sw.gameCanEnd) {
        renderTripleBall(0, true, pendingServePickTeam || "A");
      }
    }
  });
}

function dispatchPoint(team, delta) {
  var state = controller.getState();
  if (!state || !state.activeSetNumber) return;
  // In triple ball, − reverses the sequence via undo rather than directly subtracting a point
  if (delta < 0 && state.variation === "triplebal") {
    if (state.canUndo) { controller.undo(); renderScoreboard(); }
    return;
  }
  // Don't allow score below 0
  var activeSet = state.sets.find(function (s) { return s.setNumber === state.activeSetNumber; });
  if (delta < 0 && activeSet) {
    if (team === "A" && activeSet.scoreA <= 0) return;
    if (team === "B" && activeSet.scoreB <= 0) return;
  }
  // Capture partial fair play sub status before scoring
  var subsBefore = state.subsAllowedInActiveSet;
  controller.dispatch({
    type: "POINT_SCORED",
    team: team,
    setNumber: state.activeSetNumber,
    delta: delta,
    timestamp: new Date().toISOString(),
  });
  // Notify referee when partial fair play unlocks substitutions
  var stateAfter = controller.getState();
  if (!subsBefore && stateAfter && stateAfter.subsAllowedInActiveSet && stateAfter.fairPlay === "standard-partial") {
    showToast("\u26A1 15 points reached \u2014 substitutions are now available for both teams");
  }
  // Notify referee when win condition is newly met (or changes to a different team)
  if (stateAfter && stateAfter.setWinConditionMet) {
    var newWinKey = stateAfter.setWinnerTeam + "-" + stateAfter.activeSetNumber;
    if (newWinKey !== _setWinKey) {
      _setWinKey = newWinKey;
      // One-shot glow on winning team name and score (fades out, not persistent)
      applyActionGlow(stateAfter.setWinnerTeam === "A" ? $("sbTeamAName") : $("sbTeamBName"));
      applyActionGlow(stateAfter.setWinnerTeam === "A" ? $("scoreValA") : $("scoreValB"));
      var winTeamName = stateAfter.setWinnerTeam === "A" ? stateAfter.teamA : stateAfter.teamB;
      var winningSet = stateAfter.sets.find(function (s) { return s.setNumber === stateAfter.activeSetNumber; });
      var wScoreA = winningSet ? winningSet.scoreA : 0;
      var wScoreB = winningSet ? winningSet.scoreB : 0;
      var toastMsg;
      if (stateAfter.pendingMatchWin) {
        var matchKey = stateAfter.setWinnerTeam;
        if (matchKey !== _matchWinKey) {
          _matchWinKey = matchKey;
          var projA = stateAfter.setsWonA + (stateAfter.setWinnerTeam === "A" ? 1 : 0);
          var projB = stateAfter.setsWonB + (stateAfter.setWinnerTeam === "B" ? 1 : 0);
          toastMsg = "\uD83C\uDFC6 " + winTeamName + " wins the MATCH! (" +
            wScoreA + "\u2013" + wScoreB + " in Set " + stateAfter.activeSetNumber +
            " \u00B7 Sets " + projA + "\u2013" + projB + ")";
        }
      }
      if (!toastMsg) {
        toastMsg = "\uD83C\uDFC5 " + winTeamName + " at set win! (" +
          wScoreA + "\u2013" + wScoreB + " in Set " + stateAfter.activeSetNumber + ")";
      }
      var toastMs = (settings.winToastDuration || 3) * 1000;
      showToast(toastMsg, toastMs, "toast-win");
    }
  }
  // Deciding-set mid-set side switch (FIVB rule: switch once the first team
  // reaches 8 points in a 15-point decider). Resets below 8 so it can
  // honestly re-trigger if the point is undone back under the threshold.
  if (stateAfter && stateAfter.activeSetIsDecider && !stateAfter.endedAt) {
    var decSet = stateAfter.sets.find(function (s) { return s.setNumber === stateAfter.activeSetNumber; });
    var decMax = decSet ? Math.max(decSet.scoreA, decSet.scoreB) : 0;
    if (decMax < 8) {
      _midDeciderSwitchPromptedSet = null;
    } else if (settings.promptSwitchSidesMidDecider && _midDeciderSwitchPromptedSet !== stateAfter.activeSetNumber) {
      // Triple ball: wait for the current 3-ball sequence to finish (phase 0
      // or 3) rather than interrupting mid-sequence — so this can end up
      // firing at 8, 9, or 10 points depending on where in the sequence.
      var tbReady = stateAfter.variation !== "triplebal" ||
        stateAfter.tripleBallPhase === 0 || stateAfter.tripleBallPhase === 3;
      if (tbReady) {
        _midDeciderSwitchPromptedSet = stateAfter.activeSetNumber;
        var leaderTeam = decSet.scoreA > decSet.scoreB ? "A" : "B";
        var leaderName = leaderTeam === "A" ? stateAfter.teamA : stateAfter.teamB;
        renderScoreboard(); // flush the current score/phase before the prompt covers it
        if (confirm("Deciding set: " + leaderName + " has reached " + decMax + " points. Switch sides now?")) {
          sidesSwapped = !sidesSwapped;
          updateSidesDisplay(stateAfter);
          if (stateAfter.variation === "triplebal") {
            _tbPrevPhase = -1; // suppress animation on side-swap
            renderTripleBall(stateAfter.tripleBallPhase, decSet.scoreA + decSet.scoreB === 0, decSet.firstServer);
          }
        }
      }
    }
  }
  renderScoreboard();
}

function dispatchTimeout(team) {
  var state = controller.getState();
  if (!state || !state.activeSetNumber) return;
  // Triple ball timing check — only allowed before a serve (phase 0 or 3)
  if (!state.timeoutAllowedInTripleBall) {
    alert("In triple ball, timeouts can only be called at the end of a 3-ball sequence \u2014 after the last toss, before the next serve.");
    return;
  }
  var activeSet = state.sets.find(function (s) { return s.setNumber === state.activeSetNumber; });
  if (!activeSet) return;
  var used = team === "A" ? activeSet.timeoutsA : activeSet.timeoutsB;
  if (used >= state.effectiveTimeoutsPerSet) {
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
  applyActionGlow($("toIndicator" + team));
}

function dispatchSub(team) {
  var state = controller.getState();
  if (!state || !state.activeSetNumber) return;
  // Fair play check first
  if (!state.subsAllowedInActiveSet) {
    // Triple ball deciding set: timing restriction
    var isTbTiming = state.fairPlay === "triple-fp" && state.activeSetNumber > 2 && state.variation === "triplebal";
    if (isTbTiming) {
      alert("In triple ball, substitutions can only be made at the end of a 3-ball sequence \u2014 after the last toss, before the next serve.");
    } else if (state.fairPlay === "standard-partial") {
      var curMax = (function () {
        var s = state.sets.find(function (x) { return x.setNumber === state.activeSetNumber; });
        return s ? Math.max(s.scoreA, s.scoreB) : 0;
      })();
      alert("Substitutions are not permitted until a team reaches 15 points.\n\nCurrent max: " + curMax + ".");
    } else {
      alert("Substitutions are not permitted in this set under the current fair play rule.");
    }
    return;
  }
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
  applyActionGlow($("subIndicator" + team));
}

// ---- Sanction escalation helpers -------------------------

var SANCTION_LEVELS = { yellow: 1, red: 2, expulsion: 3, disqualification: 4 };

// Returns which misconduct sanction types are currently available for a recipient.
// asst_coach is exempt from individual-level escalation tracking because the UI
// cannot distinguish between different assistant coaches on the same bench.
function getMisconductAvailability(team, role, playerNum, state) {
  var allSanctions = state.sets.reduce(function (acc, s) {
    return acc.concat(team === "A" ? s.sanctionsA : s.sanctionsB);
  }, []);

  // Only one warning (yellow) may be issued per team per match.
  var teamHasWarning = allSanctions.some(function (s) { return s.type === "yellow"; });

  // Track individual escalation — skip for asst_coach and un-numbered players.
  var maxLevel = 0;
  var trackIndividual = role !== "asst_coach" && !(role === "player" && !playerNum);
  if (trackIndividual) {
    allSanctions.filter(function (s) {
      return role === "player"
        ? (s.role === "player" && s.player === playerNum)
        : (s.role === role);
    }).forEach(function (s) {
      var lvl = SANCTION_LEVELS[s.type] || 0;
      if (lvl > maxLevel) maxLevel = lvl;
    });
  }

  // minLevel: must be strictly above current max (or 1 if no prior sanctions).
  var minLevel = maxLevel === 0 ? 1 : maxLevel + 1;
  // Team-level warning constraint overrides individual if needed.
  if (teamHasWarning && minLevel < 2) minLevel = 2;

  return {
    yellow:           minLevel <= 1,
    red:              minLevel <= 2,
    expulsion:        minLevel <= 3,
    disqualification: minLevel <= 4,
  };
}

// Returns true if a delay warning can still be issued to this team (only one per match).
function canIssueDelayWarning(team, state) {
  return !state.sets.some(function (s) {
    var ds = team === "A" ? s.delaySanctionsA : s.delaySanctionsB;
    return ds.some(function (d) { return d.type === "warning"; });
  });
}

// Re-evaluate and update which sanction buttons are enabled in the modal.
function updateSanctionButtons() {
  var state = controller.getState();
  if (!state || !sanctionTargetTeam) return;

  var avail = getMisconductAvailability(sanctionTargetTeam, sanctionSelectedRole, _sanctionPlayerNum, state);

  document.querySelectorAll(".sanction-type-btn[data-stype]").forEach(function (btn) {
    var stype = btn.getAttribute("data-stype");
    var ok = !!avail[stype];
    btn.disabled = !ok;
    if (!ok) {
      var hint = "";
      if (stype === "yellow")
        hint = "Warning already issued for this team \u2014 next sanction must be Penalty or higher";
      else if (stype === "red")
        hint = "Penalty already given \u2014 next must be Expulsion or higher";
      else if (stype === "expulsion")
        hint = "Expulsion already given \u2014 next must be Disqualification";
      else if (stype === "disqualification")
        hint = "Disqualification already applied \u2014 no further sanctions available";
      btn.title = hint;
    } else {
      btn.title = "";
    }
  });

  var delayWarnOk = canIssueDelayWarning(sanctionTargetTeam, state);
  var delayWarnBtn = document.querySelector(".sanction-type-btn[data-dtype='warning']");
  if (delayWarnBtn) {
    delayWarnBtn.disabled = !delayWarnOk;
    delayWarnBtn.title = delayWarnOk ? "" : "Delay warning already issued \u2014 use Delay Penalty";
  }
}

// ---- Score Page — Sanction Modal ------------------------

function openSanctionModal(team) {
  sanctionTargetTeam = team;
  sanctionSelectedRole = "player";
  _sanctionPlayerNum = "";
  var state = controller.getState();
  var teamName = state ? (team === "A" ? state.teamA : state.teamB) : ("Team " + team);
  $("sanctionTeamName").textContent = teamName;
  updatePlayerNumDisplay();

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
  updateSanctionButtons();
}

function updatePlayerNumDisplay() {
  var el = $("playerNumDisplay");
  if (el) el.textContent = _sanctionPlayerNum || "\u2014";
}

function closeSanctionModal() {
  sanctionTargetTeam = null;
  $("sanctionModal").hidden = true;
}

function dispatchImproperRequest() {
  var state = controller.getState();
  if (!state || !state.activeSetNumber || !sanctionTargetTeam) return;
  var glowTeam = sanctionTargetTeam;
  controller.dispatch({
    type: "IMPROPER_REQUEST",
    team: sanctionTargetTeam,
    setNumber: state.activeSetNumber,
    timestamp: new Date().toISOString(),
  });
  closeSanctionModal();
  renderScoreboard();
  var irBar = $("sanctionsBar" + glowTeam);
  if (irBar) applyActionGlow(irBar.querySelector(".sanction-chip-ir"));
}

function dispatchSanction(stype) {
  var state = controller.getState();
  if (!state || !state.activeSetNumber || !sanctionTargetTeam) return;
  var glowTeam = sanctionTargetTeam;
  var player = sanctionSelectedRole === "player" ? (_sanctionPlayerNum || null) : null;
  // Enforce escalation rules — belt-and-suspenders guard if UI state is stale
  var avail = getMisconductAvailability(sanctionTargetTeam, sanctionSelectedRole, _sanctionPlayerNum, state);
  if (!avail[stype]) return;
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
  // Glow the newest chip (last in the bar) for the sanctioned team
  var sanBar = $("sanctionsBar" + glowTeam);
  if (sanBar) {
    var chips = sanBar.querySelectorAll(".sanction-chip");
    if (chips.length) applyActionGlow(chips[chips.length - 1]);
  }
}

function dispatchDelaySanction(dtype) {
  var state = controller.getState();
  if (!state || !state.activeSetNumber || !sanctionTargetTeam) return;
  var glowTeam = sanctionTargetTeam;
  if (dtype === "warning" && !canIssueDelayWarning(sanctionTargetTeam, state)) return;
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
  // Glow the newest chip (last in the bar) for the sanctioned team
  var delBar = $("sanctionsBar" + glowTeam);
  if (delBar) {
    var delChips = delBar.querySelectorAll(".sanction-chip");
    if (delChips.length) applyActionGlow(delChips[delChips.length - 1]);
  }
}

function wireSanctionModal() {
  $("btnCloseSanctionModal").addEventListener("click", closeSanctionModal);

  // Close on overlay click
  $("sanctionModal").addEventListener("click", function (e) {
    if (e.target === $("sanctionModal")) closeSanctionModal();
  });

  // Numeric pad — digit buttons (max 2 digits for jersey number)
  document.querySelectorAll(".npb[data-digit]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (_sanctionPlayerNum.length < 2) {
        _sanctionPlayerNum += btn.getAttribute("data-digit");
        updatePlayerNumDisplay();
        updateSanctionButtons();
      }
    });
  });
  $("btnNumDel").addEventListener("click", function () {
    _sanctionPlayerNum = _sanctionPlayerNum.slice(0, -1);
    updatePlayerNumDisplay();
    updateSanctionButtons();
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
      updateSanctionButtons();
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
    if (e.key === "Escape" && !$("servePickerModal").hidden) closeServePickerModal();
  });
}

function openServePickerModal() {
  var state = controller.getState();
  if (!state) return;
  var activeSet = state.activeSetNumber
    ? state.sets.find(function (s) { return s.setNumber === state.activeSetNumber; })
    : null;
  var canCorrect = activeSet && (activeSet.scoreA + activeSet.scoreB === 0);
  var setNum = canCorrect ? state.activeSetNumber : state.nextSetNum;
  var currentTeam = canCorrect ? activeSet.firstServer : pendingServePickTeam;
  $("servePickerModalSetNum").textContent = setNum;
  $("btnPickServeA").classList.toggle("active", currentTeam === "A");
  $("btnPickServeB").classList.toggle("active", currentTeam === "B");
  $("servePickerModal").removeAttribute("hidden");
}

function closeServePickerModal() {
  $("servePickerModal").hidden = true;
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
    } else if (ev.type === "FIRST_SERVER_CORRECTED") {
      rows.push('<div class="event-log-row event-log-system">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score">0 – 0</span>' +
        '<span class="elr-desc">Set ' + ev.setNumber + ' first serve corrected</span>' +
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
    if (state.league) parts.push(state.league);
    if (state.ageCategory) parts.push(state.ageCategory);
    if (state.gender) parts.push(state.gender);
    // Only call out the scheduled time separately when it differs from the actual start
    if (state.scheduledAt && formatDate(state.scheduledAt) !== formatDate(state.startedAt)) {
      parts.push("Scheduled " + formatDate(state.scheduledAt));
    }
    if (state.startedAt) parts.push(formatDate(state.startedAt));
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
    // Actual start (createdAt) takes priority over the pre-configured scheduled time
    var dateStr = formatDateTimeShort(g.createdAt || g.scheduledAt || g.updatedAt);
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
  _justEndedGame = false; // loading from history — undo not available for completed games
  showPage("score");
  showScoreboard();
  renderScoreboard();
}

// ---- Games Page -----------------------------------------

var selectedDetailGameId = null;
var selectedDetailSetFilter = null; // null = all sets; number = filter to that set
var _detailState = null;            // cached for filter re-renders
var _detailTimeline = null;

var gamesSelectMode = false;
var selectedGameIds = new Set(); // gameIds checked for bulk export, only used while gamesSelectMode is true

async function renderGamesList() {
  var container = $("gamesList");
  if (!container) return;
  var games = dbListGames();
  if (!games.length) {
    container.innerHTML = '<p class="no-data-msg">No saved games yet.</p>';
    clearGameDetail();
    selectedGameIds.clear();
    if (gamesSelectMode) updateGamesSelectBar();
    return;
  }

  container.innerHTML = "";
  games.forEach(function (g) {
    var wrapper = document.createElement("div");
    wrapper.className = "game-list-item-wrapper";

    if (gamesSelectMode) {
      var chk = document.createElement("input");
      chk.type = "checkbox";
      chk.className = "game-list-checkbox";
      chk.checked = selectedGameIds.has(g.gameId);
      chk.addEventListener("change", function () {
        if (chk.checked) selectedGameIds.add(g.gameId); else selectedGameIds.delete(g.gameId);
        updateGamesSelectBar();
      });
      wrapper.appendChild(chk);
    }

    var btn = document.createElement("button");
    btn.className = "game-list-item" + (g.gameId === selectedDetailGameId ? " selected" : "");

    var isActive = !g.endedAt;
    var meta = (g.teamA || "?") + " vs " + (g.teamB || "?") + " · " + formatLabel(g.gameFormat || "best3");
    // Actual start (createdAt) takes priority over the pre-configured scheduled time
    var dateStr = formatDateTimeShort(g.createdAt || g.scheduledAt || g.updatedAt);

    btn.innerHTML =
      '<span class="gli-name">' + esc(g.gameName || meta) + '</span>' +
      '<span class="gli-meta">' + esc(meta) + '</span>' +
      '<span class="gli-meta">' + esc(dateStr) + '</span>' +
      '<span class="gli-status ' + (isActive ? "status-active" : "status-done") + '">' +
        (isActive ? "In Progress" : "Complete") +
      '</span>';

    btn.addEventListener("click", function () {
      if (gamesSelectMode) {
        if (selectedGameIds.has(g.gameId)) selectedGameIds.delete(g.gameId);
        else selectedGameIds.add(g.gameId);
        void renderGamesList();
        return;
      }
      void selectDetailGame(g.gameId);
    });

    wrapper.appendChild(btn);

    if (!gamesSelectMode) {
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
          if (controller.currentGameId === g.gameId) {
            controller.clear();
            // If the score page is showing the now-deleted game's scoreboard, reset it
            if (currentPage === "score" && !$("scoreboard").hidden) showSetupPanel();
          }
          await renderGamesList();
        })();
      });
      wrapper.appendChild(delBtn);
    }

    container.appendChild(wrapper);
  });

  if (gamesSelectMode) updateGamesSelectBar();
}

function setGamesSelectMode(on) {
  gamesSelectMode = on;
  if (!on) selectedGameIds.clear();
  var bar = $("gamesSelectBar");
  if (bar) bar.hidden = !on;
  var btn = $("btnSelectGames");
  if (btn) btn.textContent = on ? "Done" : "Select";
  void renderGamesList();
}

function updateGamesSelectBar() {
  var countEl = $("gamesSelectedCount");
  var exportBtn = $("btnExportSelectedGames");
  var deleteBtn = $("btnDeleteSelectedGames");
  var allChk = $("chkSelectAllGames");
  var games = dbListGames();
  if (countEl) countEl.textContent = selectedGameIds.size + " selected";
  if (exportBtn) exportBtn.disabled = selectedGameIds.size === 0;
  if (deleteBtn) deleteBtn.disabled = selectedGameIds.size === 0;
  if (allChk) allChk.checked = games.length > 0 && selectedGameIds.size === games.length;
}

async function selectDetailGame(gameId) {
  selectedDetailGameId = gameId;
  selectedDetailSetFilter = null; // reset filter for new selection
  await renderGamesList(); // refresh selection highlight
  var record = await dbLoadGame(gameId);
  if (!record) { clearGameDetail(); return; }

  var tl = { events: record.events, cursor: record.cursor };
  var state = deriveGameState(tl);
  if (!state) { clearGameDetail(); return; }

  _detailState = state;
  _detailTimeline = tl;

  var isActive = !state.endedAt;

  $("gameDetailPlaceholder").hidden = true;
  $("gameDetailContent").hidden = false;

  $("detailGameName").textContent = state.gameName;
  $("detailHdrA").textContent = state.teamA;
  $("detailHdrB").textContent = state.teamB;

  var metaParts = [];
  if (state.teamA && state.teamB) metaParts.push(state.teamA + " vs " + state.teamB);
  metaParts.push(formatLabel(state.gameFormat));
  // Win condition summary
  var bestOfFmt = (state.gameFormat === "best3" || state.gameFormat === "best5");
  var condStr = winCondLabel(state.setWinScore, state.setWinBy, state.setWinCap);
  if (bestOfFmt) {
    condStr += " \u00B7 dec. " + winCondLabel(state.deciderWinScore, state.deciderWinBy, state.deciderWinCap);
  }
  metaParts.push(condStr);
  if (state.location) metaParts.push(state.location);
  if (state.league) metaParts.push(state.league);
  if (state.ageCategory) metaParts.push(state.ageCategory);
  if (state.gender) metaParts.push(state.gender);
  // Only call out the scheduled time separately when it differs from the actual start
  var schedStr = state.scheduledAt ? formatDateTime(state.scheduledAt) : "";
  var startStr = state.startedAt ? formatDateTime(state.startedAt) : "";
  if (schedStr && schedStr !== startStr) metaParts.push("Scheduled " + schedStr);
  if (startStr) metaParts.push("Started " + startStr);
  metaParts.push(isActive ? "In Progress" : "Complete");
  $("detailGameMeta").textContent = metaParts.join(" · ");

  // Set summary with filterable pills
  renderDetailSetTable(state);

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
      var wasActive = controller.currentGameId === gameId;
      await dbDeleteGame(gameId);
      clearGameDetail();
      if (wasActive) {
        controller.clear();
        showPage("games"); // stay on Games page; Score page will show setup next time
      }
      await renderGamesList();
    })();
  };

  // Event log
  var logBody = $("detailEventLogBody");
  if (logBody) logBody.innerHTML = buildEventLogHtml(state, tl, selectedDetailSetFilter);
}

function clearGameDetail() {
  selectedDetailGameId = null;
  selectedDetailSetFilter = null;
  _detailState = null;
  _detailTimeline = null;
  $("gameDetailPlaceholder").hidden = false;
  $("gameDetailContent").hidden = true;
}

// ---- Edit Match Info (post-hoc correction for finished/in-progress games) --

var _emiGameId = null; // gameId currently open in the Edit Match Info modal

function openEditMatchInfoModal(gameId) {
  var state = (gameId === controller.currentGameId) ? controller.getState() : _detailState;
  if (!state) return;
  _emiGameId = gameId;
  $("emiTeamA").value = state.teamA || "";
  $("emiTeamB").value = state.teamB || "";
  $("emiLocation").value = state.location || "";
  $("emiGender").value = state.gender || "";
  $("emiAgeCategory").value = state.ageCategory || "";
  $("emiLeague").value = state.league || "";
  $("editMatchInfoModal").removeAttribute("hidden");
}

function closeEditMatchInfoModal() {
  _emiGameId = null;
  $("editMatchInfoModal").hidden = true;
}

async function saveMatchInfoEdits() {
  var gameId = _emiGameId;
  if (!gameId) return;

  var teamA = $("emiTeamA").value.trim() || "Team A";
  var teamB = $("emiTeamB").value.trim() || "Team B";
  var location = $("emiLocation").value.trim();
  var gender = $("emiGender").value;
  var ageCategory = $("emiAgeCategory").value.trim();
  var league = $("emiLeague").value.trim();
  var gameName = teamA + " vs " + teamB;

  addToMasterList("masterTeamNames", teamA);
  addToMasterList("masterTeamNames", teamB);
  addToMasterList("masterLocations", location);
  addToMasterList("masterAgeCategories", ageCategory);
  addToMasterList("masterLeagues", league);
  renderMasterListEditors();
  renderDefaultPickerOptions();

  function applyToStartEvent(events) {
    var startEv = events.find(function (e) { return e.type === "GAME_STARTED"; });
    if (!startEv) return;
    startEv.gameName = gameName;
    startEv.teamA = teamA;
    startEv.teamB = teamB;
    startEv.location = location;
    startEv.gender = gender;
    startEv.ageCategory = ageCategory;
    startEv.league = league;
  }

  if (gameId === controller.currentGameId) {
    applyToStartEvent(controller.timeline.events);
    controller._state = deriveGameState(controller.timeline);
    await persistGame();
    renderScoreboard();
  } else {
    var record = await dbLoadGame(gameId);
    if (record) {
      applyToStartEvent(record.events || []);
      record.gameName = gameName;
      record.teamA = teamA;
      record.teamB = teamB;
      record.location = location;
      await dbSaveGame(record);
    }
  }

  closeEditMatchInfoModal();
  if (selectedDetailGameId === gameId) await selectDetailGame(gameId);
  await renderGamesList();
}

// ---- Reports Page ----------------------------------------

var selectedReportTab = "matchLog";

function renderReportsPage() {
  renderMatchLogGamePicker();
  void renderMatchLogOutput();
  renderGameReportGamePicker();
  void renderGameReportOutput();
}

function wireReportsPage() {
  document.querySelectorAll(".reports-tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectedReportTab = btn.getAttribute("data-report");
      document.querySelectorAll(".reports-tab-btn").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      $("reportMatchLog").hidden = selectedReportTab !== "matchLog";
      $("reportGameReport").hidden = selectedReportTab !== "gameReport";
    });
  });

  $("btnMatchLogSelectAll").addEventListener("click", function () {
    _matchLogSelectedIds = new Set(dbListGames().map(function (g) { return g.gameId; }));
    renderMatchLogGamePicker();
    void renderMatchLogOutput();
  });
  $("btnMatchLogSelectNone").addEventListener("click", function () {
    _matchLogSelectedIds.clear();
    renderMatchLogGamePicker();
    void renderMatchLogOutput();
  });
  $("btnMatchLogSortToggle").addEventListener("click", function () {
    _matchLogSortAsc = !_matchLogSortAsc;
    $("btnMatchLogSortToggle").textContent = "Date: " + (_matchLogSortAsc ? "Oldest first" : "Newest first");
    renderMatchLogGamePicker();
    void renderMatchLogOutput();
  });
  $("btnMatchLogPreview").addEventListener("click", function () {
    openReportPreviewModal(buildMatchLogReportContentHtml(_matchLogRows), "Match Log");
  });
  $("btnMatchLogExportXlsx").addEventListener("click", exportMatchLogXlsx);
  $("btnMatchLogPrint").addEventListener("click", printMatchLog);

  $("btnGameReportSelectAll").addEventListener("click", function () {
    _gameReportSelectedIds = new Set(dbListGames().map(function (g) { return g.gameId; }));
    renderGameReportGamePicker();
    void renderGameReportOutput();
  });
  $("btnGameReportSelectNone").addEventListener("click", function () {
    _gameReportSelectedIds.clear();
    renderGameReportGamePicker();
    void renderGameReportOutput();
  });
  $("btnGameReportSortToggle").addEventListener("click", function () {
    _gameReportSortAsc = !_gameReportSortAsc;
    $("btnGameReportSortToggle").textContent = "Date: " + (_gameReportSortAsc ? "Oldest first" : "Newest first");
    renderGameReportGamePicker();
    void renderGameReportOutput();
  });
  $("btnGameReportPreview").addEventListener("click", function () {
    if (!_gameReportEntries.length) return;
    var html = _gameReportEntries.map(function (e) { return buildGameReportPageHtml(e.record, e.state); }).join("");
    openReportPreviewModal(html, "Game Report");
  });
  $("btnGameReportExportXlsx").addEventListener("click", exportGameReportXlsx);
  $("btnGameReportPrint").addEventListener("click", printGameReport);

  $("btnReportPreviewPrint").addEventListener("click", function () {
    // Close first so the modal overlay itself doesn't end up in the printout —
    // the underlying live report (already in the DOM) is what actually prints.
    closeReportPreviewModal();
    window.print();
  });
  $("btnCloseReportPreviewModal").addEventListener("click", closeReportPreviewModal);
  $("reportPreviewModal").addEventListener("click", function (e) {
    if (e.target === $("reportPreviewModal")) closeReportPreviewModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("reportPreviewModal").hidden) closeReportPreviewModal();
  });
}

// Shows an on-screen approximation of the printed report — same header/table/footer
// markup rendered on a simulated letter-size page, since real pagination can only
// be seen once the browser actually lays out the print job.
var _reportPreviewHtml = "";
var _reportPreviewTitle = "";

function openReportPreviewModal(contentHtml, title) {
  _reportPreviewHtml = contentHtml;
  _reportPreviewTitle = title || "Report";
  $("reportPreviewPaper").innerHTML = contentHtml;
  $("reportPreviewModal").hidden = false;
}

function closeReportPreviewModal() {
  $("reportPreviewModal").hidden = true;
}

// Printing/PDF relies on the @media print rules in styles.css, which hide the
// nav/toolbar/game-picker/preview-modal chrome and show only .print-area. A
// dedicated iframe/window was tried here previously (to sidestep hiding the
// live app chrome) but proved less reliable for real print pagination —
// break-after page breaks and the repeating position:fixed footer didn't
// reliably carry over into an iframe's own print job. Printing the main
// document directly is the best-supported browser scenario for both.

// ---- Match Log Report -------------------------------------

var _matchLogSelectedIds = new Set(); // gameIds checked in the Match Log game picker
var _matchLogRows = [];               // last-built report rows, cached for export/print
var _matchLogSortAsc = false;          // false = newest first (default), true = oldest first
var MATCH_LOG_COLUMNS = ["Date", "Time", "Location", "Teams", "League", "Age", "Gender", "Set Score", "Set Points"];

// Same date priority the report rows use (scheduledAt, else the game's actual
// start/creation time) so the picker list order always matches the report order.
function gameIndexSortKey(g) {
  var dt = g.scheduledAt || g.createdAt || g.updatedAt;
  return dt ? new Date(dt).getTime() : Number.MAX_SAFE_INTEGER;
}

function renderMatchLogGamePicker() {
  var container = $("matchLogGamePicker");
  if (!container) return;
  var games = dbListGames().sort(function (a, b) {
    var d = gameIndexSortKey(a) - gameIndexSortKey(b);
    return _matchLogSortAsc ? d : -d;
  });
  if (!games.length) {
    container.innerHTML = '<p class="no-data-msg">No saved games yet.</p>';
    updateMatchLogToolbar();
    return;
  }

  container.innerHTML = "";
  games.forEach(function (g) {
    var meta = (g.teamA || "?") + " vs " + (g.teamB || "?");
    var dtIso = g.scheduledAt || g.createdAt || g.updatedAt;

    var row = document.createElement("label");
    row.className = "report-game-row";

    var chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = _matchLogSelectedIds.has(g.gameId);
    chk.addEventListener("change", function () {
      if (chk.checked) _matchLogSelectedIds.add(g.gameId);
      else _matchLogSelectedIds.delete(g.gameId);
      updateMatchLogToolbar();
      void renderMatchLogOutput();
    });

    var span = document.createElement("span");
    span.className = "report-game-row-label";
    var dotHtml = '<span class="report-dot">\u00B7</span>';
    span.innerHTML = (dtIso ? esc(formatDateYMD(dtIso)) + dotHtml + esc(formatTime24(dtIso)) + dotHtml : "") + esc(g.gameName || meta);

    row.appendChild(chk);
    row.appendChild(span);
    container.appendChild(row);
  });

  updateMatchLogToolbar();
}

function updateMatchLogToolbar() {
  var countEl = $("matchLogSelectedCount");
  if (countEl) countEl.textContent = _matchLogSelectedIds.size + " selected";
  var has = _matchLogSelectedIds.size > 0;
  $("btnMatchLogPreview").disabled = !has;
  $("btnMatchLogExportXlsx").disabled = !has;
  $("btnMatchLogPrint").disabled = !has;
}

// yyyy-mm-dd (local time, 24-hour clock elsewhere) — used by the Match Log report
function formatDateYMD(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  var pad = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function formatTime24(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  var pad = function (n) { return String(n).padStart(2, "0"); };
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}

// Builds one Match Log row from a saved game record. Prefers the pre-configured
// scheduled start for Date/Time, falling back to the actual start if none was set.
function buildMatchLogRow(record) {
  var tl = { events: record.events, cursor: record.cursor };
  var state = deriveGameState(tl);
  if (!state) return null;

  var dtSource = state.scheduledAt || state.startedAt || null;
  var completedSets = state.sets.filter(function (s) { return !!s.endedAt; });

  return {
    sortKey: dtSource ? new Date(dtSource).getTime() : Number.MAX_SAFE_INTEGER,
    date: dtSource ? formatDateYMD(dtSource) : "N/A",
    time: dtSource ? formatTime24(dtSource) : "N/A",
    location: state.location || "N/A",
    teams: state.teamA + " vs " + state.teamB,
    league: state.league || "N/A",
    age: state.ageCategory || "N/A",
    gender: state.gender || "N/A",
    setScore: state.setsWonA + "-" + state.setsWonB,
    // Non-breaking hyphen (\u2011) keeps each "25-18" pair from splitting across
    // two lines when this column wraps — only the comma+space between entries
    // (a normal breakable space) should ever become a line break.
    setScores: completedSets.length
      ? completedSets.map(function (s) { return s.scoreA + "\u2011" + s.scoreB; }).join(", ")
      : "N/A",
  };
}

// Shared header/footer for printed & exported reports — reusable by any report,
// not just Match Log. Referee line only appears when a name is configured
// (Setup → Game Defaults → Referee Name), since not every user is a referee.
function buildReportPrintHeaderHtml(reportTitle) {
  var html = '<div class="report-print-header">' +
    '<div class="report-print-brand">VolleyScore</div>' +
    '<h2 class="report-print-title">' + esc(reportTitle) + '</h2>' +
    '<div class="report-print-meta">Generated ' + esc(formatDateTimeShort(new Date().toISOString())) + '</div>';
  var referee = (settings.refereeName || "").trim();
  if (referee) html += '<div class="report-print-meta">Referee: ' + esc(referee) + '</div>';
  html += '</div>';
  return html;
}

function buildReportPrintFooterHtml() {
  return '<div class="report-print-footer">' + esc(GITHUB_URL) + '</div>';
}

// Same header/footer info as plain rows, for the Excel export (which has no
// concept of a fixed on-screen header/footer). Referee row omitted when unset.
function buildReportXlsxHeaderRows(reportTitle) {
  var rows = [
    ["VolleyScore \u2014 " + reportTitle],
    ["Generated " + formatDateTimeShort(new Date().toISOString())],
  ];
  var referee = (settings.refereeName || "").trim();
  if (referee) rows.push(["Referee: " + referee]);
  rows.push([]); // blank spacer row before the column headers
  return rows;
}

// Builds the header + table + footer markup shared by the live report output,
// the in-app preview modal, and printing (all three render identical content).
function buildMatchLogReportContentHtml(rows) {
  var html = buildReportPrintHeaderHtml("Match Log") +
    '<table class="report-table" id="matchLogTable"><thead><tr>' +
    MATCH_LOG_COLUMNS.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") +
    "</tr></thead><tbody>";
  rows.forEach(function (r) {
    html += "<tr>" +
      "<td>" + esc(r.date) + "</td>" +
      "<td>" + esc(r.time) + "</td>" +
      "<td>" + esc(r.location) + "</td>" +
      "<td>" + esc(r.teams) + "</td>" +
      "<td>" + esc(r.league) + "</td>" +
      "<td>" + esc(r.age) + "</td>" +
      "<td>" + esc(r.gender) + "</td>" +
      "<td>" + esc(r.setScore) + "</td>" +
      "<td>" + esc(r.setScores) + "</td>" +
      "</tr>";
  });
  html += "</tbody></table>" + buildReportPrintFooterHtml();
  return html;
}

async function renderMatchLogOutput() {
  var container = $("matchLogOutput");
  if (!container) return;

  if (!_matchLogSelectedIds.size) {
    container.innerHTML = '<p class="no-data-msg">Select one or more games above to build the Match Log.</p>';
    _matchLogRows = [];
    return;
  }

  var rows = [];
  var ids = Array.from(_matchLogSelectedIds);
  for (var i = 0; i < ids.length; i++) {
    var record = await dbLoadGame(ids[i]);
    if (!record) continue;
    var row = buildMatchLogRow(record);
    if (row) rows.push(row);
  }
  rows.sort(function (a, b) { return _matchLogSortAsc ? a.sortKey - b.sortKey : b.sortKey - a.sortKey; });
  _matchLogRows = rows;

  if (!rows.length) {
    container.innerHTML = '<p class="no-data-msg">No data available for the selected games.</p>';
    return;
  }

  container.innerHTML = '<div id="matchLogPrintArea" class="print-area">' +
    buildMatchLogReportContentHtml(rows) + "</div>";
}

// yyyy-mm-dd_HH-MM-SS (24-hour, filesystem-safe) — used to timestamp exported report files.
function reportFilenameTimestamp() {
  var d = new Date();
  var pad = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "_" + pad(d.getHours()) + "-" + pad(d.getMinutes()) + "-" + pad(d.getSeconds());
}

// Reuses the hand-rolled XLSX writer built for Match Info Lists export (see below).
function exportMatchLogXlsx() {
  if (!_matchLogRows.length) return;
  var rows = buildReportXlsxHeaderRows("Match Log")
    .concat([MATCH_LOG_COLUMNS])
    .concat(_matchLogRows.map(function (r) {
      return [r.date, r.time, r.location, r.teams, r.league, r.age, r.gender, r.setScore, r.setScores];
    }));

  var enc = new TextEncoder();
  var files = [
    { name: "[Content_Types].xml", data: enc.encode(xlsxContentTypesXml(1)) },
    { name: "_rels/.rels", data: enc.encode(XLSX_ROOT_RELS) },
    { name: "xl/workbook.xml", data: enc.encode(xlsxWorkbookXml(["Match Log"])) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(xlsxWorkbookRelsXml(1)) },
    { name: "xl/styles.xml", data: enc.encode(XLSX_STYLES_XML) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(xlsxSheetXml(rows, GITHUB_URL)) },
  ];
  var zipBytes = buildZip(files);
  downloadFile("volleyscore_match_log_" + reportFilenameTimestamp() + ".xlsx",
    zipBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

// Printing/PDF relies on the @media print rules in styles.css, which hide all
// app chrome and show only .print-area (already rendered live in the DOM).
function printMatchLog() {
  if (!_matchLogRows.length) return;
  window.print();
}

// ---- Game Report (FIVB score-sheet style) -----------------

var _gameReportSelectedIds = new Set(); // gameIds checked in the Game Report game picker
var _gameReportEntries = [];            // [{ record, state }] for the last-built report, cached for export/print
var _gameReportSortAsc = false;         // false = newest first (default), true = oldest first

// Sanction "recipient" abbreviations for non-player roles (Setup → sanction modal role picker).
var GR_ROLE_ABBR = { head_coach: "C", asst_coach: "AC", trainer: "T", medical: "M" };

function renderGameReportGamePicker() {
  var container = $("gameReportGamePicker");
  if (!container) return;
  var games = dbListGames().sort(function (a, b) {
    var d = gameIndexSortKey(a) - gameIndexSortKey(b);
    return _gameReportSortAsc ? d : -d;
  });
  if (!games.length) {
    container.innerHTML = '<p class="no-data-msg">No saved games yet.</p>';
    updateGameReportToolbar();
    return;
  }

  container.innerHTML = "";
  games.forEach(function (g) {
    var meta = (g.teamA || "?") + " vs " + (g.teamB || "?");
    var dtIso = g.scheduledAt || g.createdAt || g.updatedAt;

    var row = document.createElement("label");
    row.className = "report-game-row";

    var chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = _gameReportSelectedIds.has(g.gameId);
    chk.addEventListener("change", function () {
      if (chk.checked) _gameReportSelectedIds.add(g.gameId);
      else _gameReportSelectedIds.delete(g.gameId);
      updateGameReportToolbar();
      void renderGameReportOutput();
    });

    var span = document.createElement("span");
    span.className = "report-game-row-label";
    var dotHtml = '<span class="report-dot">\u00B7</span>';
    span.innerHTML = (dtIso ? esc(formatDateYMD(dtIso)) + dotHtml + esc(formatTime24(dtIso)) + dotHtml : "") + esc(g.gameName || meta);

    row.appendChild(chk);
    row.appendChild(span);
    container.appendChild(row);
  });

  updateGameReportToolbar();
}

function updateGameReportToolbar() {
  var countEl = $("gameReportSelectedCount");
  if (countEl) countEl.textContent = _gameReportSelectedIds.size + " selected";
  var has = _gameReportSelectedIds.size > 0;
  $("btnGameReportPreview").disabled = !has;
  $("btnGameReportExportXlsx").disabled = !has;
  $("btnGameReportPrint").disabled = !has;
}

// Drops seconds/ms — the report shows whole minutes only (floor, never rounded up).
function floorToMinute(iso) {
  var d = new Date(iso);
  d.setSeconds(0, 0);
  return d;
}

function diffMinutes(laterDate, earlierDate) {
  return Math.round((laterDate.getTime() - earlierDate.getTime()) / 60000);
}

function formatTime24FromDate(d) {
  var pad = function (n) { return String(n).padStart(2, "0"); };
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function formatDurationMin(mins) {
  if (mins == null || isNaN(mins)) return "N/A";
  var h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? (h + "h " + m + "mn") : (m + "mn");
}

// Replays a game's raw event log to capture the score at the moment of each
// sanction — deriveGameState only keeps each set's final score, not a running one.
function buildGameReportSanctionRows(record) {
  var events = (record.events || []).slice(0, record.cursor);
  var setScore = {};
  function score(n) {
    if (!setScore[n]) setScore[n] = { A: 0, B: 0 };
    return setScore[n];
  }

  var rows = [];
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (ev.type === "POINT_SCORED") {
      var sc = score(ev.setNumber);
      if (ev.team === "A") sc.A = Math.max(0, sc.A + ev.delta);
      else sc.B = Math.max(0, sc.B + ev.delta);
    } else if (ev.type === "SANCTION") {
      var sc2 = score(ev.setNumber);
      var col = { yellow: "W", red: "P", expulsion: "E", disqualification: "D" }[ev.sanctionType] || "W";
      var recipient = (ev.role && ev.role !== "player") ? (GR_ROLE_ABBR[ev.role] || "?") : ("#" + (ev.playerNumber || "?"));
      rows.push({
        col: col, value: recipient, team: ev.team, setNumber: ev.setNumber,
        scoreStr: ev.team === "A" ? (sc2.A + ":" + sc2.B) : (sc2.B + ":" + sc2.A),
      });
    } else if (ev.type === "DELAY_SANCTION") {
      var sc3 = score(ev.setNumber);
      rows.push({
        col: ev.sanctionType === "penalty" ? "P" : "W", value: "D", team: ev.team, setNumber: ev.setNumber,
        scoreStr: ev.team === "A" ? (sc3.A + ":" + sc3.B) : (sc3.B + ":" + sc3.A),
      });
    }
  }
  return rows;
}

// Builds the Results box's per-set rows plus match timing, per the report's fixed
// 3-minute-between-sets rule (see repo notes for the full algorithm/rationale):
// - Set 1's reported start = the match's actual (floored) start time.
// - Each other set's real play duration is kept as-is; gaps between sets are
//   always reported as exactly 3 minutes, regardless of the real gap.
// - The final played set's duration is back-solved from the actual (floored)
//   match end time, so the reported timeline always reconciles exactly with it.
function buildGameReportResults(state) {
  var totalSets = state.totalSets;
  var completed = state.sets.filter(function (s) { return !!s.endedAt; });
  var matchStart = state.startedAt ? floorToMinute(state.startedAt) : null;
  var matchEnd = state.endedAt ? floorToMinute(state.endedAt) : null;

  var rawDur = completed.map(function (s) {
    return diffMinutes(floorToMinute(s.endedAt), floorToMinute(s.startedAt));
  });

  var reportedStart = [];
  var reportedDur = [];
  if (completed.length && matchStart) {
    reportedStart[0] = matchStart;
    for (var i = 0; i < completed.length; i++) {
      var isLast = (i === completed.length - 1);
      reportedDur[i] = (isLast && matchEnd) ? diffMinutes(matchEnd, reportedStart[i]) : rawDur[i];
      if (i + 1 < completed.length) {
        reportedStart[i + 1] = new Date(reportedStart[i].getTime() + (reportedDur[i] + 3) * 60000);
      }
    }
  }

  var rows = [];
  for (var n = 1; n <= totalSets; n++) {
    var idx = completed.findIndex(function (s) { return s.setNumber === n; });
    if (idx === -1) {
      rows.push({ setNumber: n, tA: "", sA: "", wA: "", pA: "", tB: "", sB: "", wB: "", pB: "", duration: "", startTime: "" });
      continue;
    }
    var s = completed[idx];
    rows.push({
      setNumber: n,
      tA: s.timeoutsA, sA: s.subsA, wA: s.scoreA > s.scoreB ? 1 : 0, pA: s.scoreA,
      tB: s.timeoutsB, sB: s.subsB, wB: s.scoreB > s.scoreA ? 1 : 0, pB: s.scoreB,
      duration: reportedDur[idx], startTime: formatTime24FromDate(reportedStart[idx]),
    });
  }

  function sumField(key) { return rows.reduce(function (a, r) { return a + (typeof r[key] === "number" ? r[key] : 0); }, 0); }
  var totals = {
    tA: sumField("tA"), sA: sumField("sA"), wA: state.setsWonA, pA: sumField("pA"),
    tB: sumField("tB"), sB: sumField("sB"), wB: state.setsWonB, pB: sumField("pB"),
    setDuration: reportedDur.reduce(function (a, b) { return a + b; }, 0),
  };

  var winnerName = null, winnerScore = null;
  if (state.endedAt) {
    winnerName = state.setsWonA > state.setsWonB ? state.teamA : state.teamB;
    winnerScore = Math.max(state.setsWonA, state.setsWonB) + ":" + Math.min(state.setsWonA, state.setsWonB);
  }

  return {
    rows: rows, totals: totals, matchStart: matchStart, matchEnd: matchEnd,
    totalMatchDuration: (matchStart && matchEnd) ? diffMinutes(matchEnd, matchStart) : null,
    winnerName: winnerName, winnerScore: winnerScore,
  };
}

function buildGrInfoBoxHtml(state) {
  var dtSource = state.scheduledAt || state.startedAt || null;
  function cell(label, value) {
    return '<div class="gr-info-cell"><span class="gr-label">' + esc(label) + '</span><span class="gr-value">' + esc(value || "N/A") + '</span></div>';
  }
  return '<div class="gr-info-box">' +
    '<div class="gr-info-grid">' +
    cell("Date", dtSource ? formatDateYMD(dtSource) : null) +
    cell("Time", dtSource ? formatTime24(dtSource) : null) +
    cell("Location", state.location) + cell("League", state.league) +
    cell("Gender", state.gender) + cell("Age", state.ageCategory) +
    '</div>' +
    '<div class="gr-teams-row">' +
    '<span class="gr-team-badge">A</span><span class="gr-team-name">' + esc(state.teamA) + '</span>' +
    '<span class="gr-vs">vs</span>' +
    '<span class="gr-team-name">' + esc(state.teamB) + '</span><span class="gr-team-badge">B</span>' +
    '</div></div>';
}

function buildGrSanctionsBoxHtml(rows, state) {
  var bodyHtml;
  if (!rows.length) {
    bodyHtml = '<tr class="gr-empty-row"><td colspan="7">None</td></tr>';
  } else {
    bodyHtml = rows.map(function (r) {
      return "<tr>" +
        "<td>" + (r.col === "W" ? esc(r.value) : "") + "</td>" +
        "<td>" + (r.col === "P" ? esc(r.value) : "") + "</td>" +
        "<td>" + (r.col === "E" ? esc(r.value) : "") + "</td>" +
        "<td>" + (r.col === "D" ? esc(r.value) : "") + "</td>" +
        "<td>" + esc(r.team) + "</td>" +
        "<td>" + esc(r.setNumber) + "</td>" +
        "<td>" + esc(r.scoreStr) + "</td>" +
        "</tr>";
    }).join("");
  }
  // Each team's badge gets a bold X overlaid once their one free improper request is used.
  function irBadge(letter, used) {
    return '<span class="gr-ir-badge-wrap"><span class="gr-ir-badge">' + letter + '</span>' +
      (used ? '<span class="gr-ir-x">X</span>' : '') + '</span>';
  }
  return '<div class="gr-sanctions-box">' +
    '<div class="gr-box-header"><span class="gr-box-title">Sanctions</span>' +
    '<span class="gr-ir-box">Improper Request ' + irBadge("A", state.improperRequestA) + irBadge("B", state.improperRequestB) + '</span></div>' +
    '<table class="gr-sanctions-table"><thead><tr><th>W</th><th>P</th><th>E</th><th>D</th><th>A/B</th><th>Set</th><th>Score</th></tr></thead>' +
    "<tbody>" + bodyHtml + "</tbody></table>" +
    '<div class="gr-legend"># = player number &nbsp;&nbsp; C = Head Coach &nbsp;&nbsp; AC = Assistant Coach &nbsp;&nbsp; T = Trainer &nbsp;&nbsp; M = Medical &nbsp;&nbsp; D = Delay</div>' +
    "</div>";
}

function buildGrResultsBoxHtml(results, state) {
  var rowsHtml = results.rows.map(function (r) {
    var durCell = (r.duration !== "" && r.duration != null)
      ? ('<div class="gr-set-dur">' + esc(r.duration) + " mn</div><div class=\"gr-set-start\">" + esc(r.startTime) + "</div>")
      : "";
    return "<tr>" +
      "<td>" + esc(r.tA) + "</td><td>" + esc(r.sA) + "</td><td>" + esc(r.wA) + "</td><td>" + esc(r.pA) + "</td>" +
      '<td class="gr-set-cell"><div class="gr-set-num">' + r.setNumber + "</div>" + durCell + "</td>" +
      "<td>" + esc(r.pB) + "</td><td>" + esc(r.wB) + "</td><td>" + esc(r.sB) + "</td><td>" + esc(r.tB) + "</td>" +
      "</tr>";
  }).join("");

  var t = results.totals;
  var totalsRow = '<tr class="gr-totals-row">' +
    "<td>" + t.tA + "</td><td>" + t.sA + "</td><td>" + t.wA + "</td><td>" + t.pA + "</td>" +
    '<td class="gr-set-cell"><div class="gr-set-num">Total</div><div class="gr-set-dur">' + t.setDuration + " mn</div></td>" +
    "<td>" + t.pB + "</td><td>" + t.wB + "</td><td>" + t.sB + "</td><td>" + t.tB + "</td></tr>";

  return '<div class="gr-results-box">' +
    '<div class="gr-box-header"><span class="gr-box-title">Results</span></div>' +
    '<div class="gr-teams-row">' +
    '<span class="gr-team-badge">A</span><span class="gr-team-name">' + esc(state.teamA) + '</span>' +
    '<span class="gr-vs">vs</span>' +
    '<span class="gr-team-name">' + esc(state.teamB) + '</span><span class="gr-team-badge">B</span></div>' +
    '<table class="gr-results-table"><thead><tr><th>T</th><th>S</th><th>W</th><th>P</th><th>Set</th><th>P</th><th>W</th><th>S</th><th>T</th></tr></thead>' +
    "<tbody>" + rowsHtml + totalsRow + "</tbody></table>" +
    '<div class="gr-results-summary">' +
    '<div><span class="gr-label">Match Starting Time</span><span class="gr-value">' + esc(results.matchStart ? formatTime24FromDate(results.matchStart) : "N/A") + "</span></div>" +
    '<div><span class="gr-label">Match Ending Time</span><span class="gr-value">' + esc(results.matchEnd ? formatTime24FromDate(results.matchEnd) : "N/A") + "</span></div>" +
    '<div><span class="gr-label">Total Match Duration</span><span class="gr-value">' + esc(results.totalMatchDuration != null ? formatDurationMin(results.totalMatchDuration) : "N/A") + "</span></div>" +
    "</div>" +
    '<div class="gr-winner-row"><span class="gr-box-title">Winner</span>' +
    '<span class="gr-winner-name">' + esc(results.winnerName || "N/A") + "</span>" +
    '<span class="gr-winner-score">' + esc(results.winnerScore || "") + "</span></div>" +
    "</div>";
}

function buildGameReportPageHtml(record, state) {
  return '<div class="gr-page">' +
    buildReportPrintHeaderHtml("Game Report") +
    buildGrInfoBoxHtml(state) +
    buildGrSanctionsBoxHtml(buildGameReportSanctionRows(record), state) +
    buildGrResultsBoxHtml(buildGameReportResults(state), state) +
    buildReportPrintFooterHtml() +
    "</div>";
}

async function renderGameReportOutput() {
  var container = $("gameReportOutput");
  if (!container) return;

  if (!_gameReportSelectedIds.size) {
    container.innerHTML = '<p class="no-data-msg">Select one or more games above to build the Game Report.</p>';
    _gameReportEntries = [];
    return;
  }

  var ids = Array.from(_gameReportSelectedIds);
  var entries = [];
  for (var i = 0; i < ids.length; i++) {
    var record = await dbLoadGame(ids[i]);
    if (!record) continue;
    var state = deriveGameState({ events: record.events, cursor: record.cursor });
    if (!state) continue;
    var dtSource = state.scheduledAt || state.startedAt;
    entries.push({ record: record, state: state, sortKey: dtSource ? new Date(dtSource).getTime() : Number.MAX_SAFE_INTEGER });
  }
  entries.sort(function (a, b) { return _gameReportSortAsc ? a.sortKey - b.sortKey : b.sortKey - a.sortKey; });
  _gameReportEntries = entries;

  if (!entries.length) {
    container.innerHTML = '<p class="no-data-msg">No data available for the selected games.</p>';
    return;
  }

  var pagesHtml = entries.map(function (e) { return buildGameReportPageHtml(e.record, e.state); }).join("");
  container.innerHTML = '<div id="gameReportPrintArea" class="print-area">' + pagesHtml + "</div>";
}

// One sheet per selected game (same multi-sheet workbook technique as the Match
// Info Lists Excel export), since each game gets its own full score-sheet page.
function exportGameReportXlsx() {
  if (!_gameReportEntries.length) return;
  var enc = new TextEncoder();
  var sheetNames = [];
  var sheetXmls = [];

  _gameReportEntries.forEach(function (entry) {
    var state = entry.state;
    var sanctionRows = buildGameReportSanctionRows(entry.record);
    var results = buildGameReportResults(state);
    var dtSource = state.scheduledAt || state.startedAt;

    var base = ((state.teamA || "A") + " vs " + (state.teamB || "B")).replace(/[\\/?*[\]:]/g, "_").slice(0, 31);
    var name = base, n = 2;
    while (sheetNames.indexOf(name) !== -1) { name = base.slice(0, 28) + "-" + n; n++; }
    sheetNames.push(name);

    var rows = buildReportXlsxHeaderRows("Game Report");
    rows.push(["Match Info"]);
    rows.push(["Date", dtSource ? formatDateYMD(dtSource) : "N/A"]);
    rows.push(["Time", dtSource ? formatTime24(dtSource) : "N/A"]);
    rows.push(["Location", state.location || "N/A"]);
    rows.push(["League", state.league || "N/A"]);
    rows.push(["Gender", state.gender || "N/A"]);
    rows.push(["Age", state.ageCategory || "N/A"]);
    rows.push(["Team A", state.teamA]);
    rows.push(["Team B", state.teamB]);
    rows.push([]);
    rows.push(["Sanctions"]);
    rows.push(["W", "P", "E", "D", "A/B", "Set", "Score"]);
    if (!sanctionRows.length) {
      rows.push(["None"]);
    } else {
      sanctionRows.forEach(function (r) {
        rows.push([
          r.col === "W" ? r.value : "", r.col === "P" ? r.value : "",
          r.col === "E" ? r.value : "", r.col === "D" ? r.value : "",
          r.team, r.setNumber, r.scoreStr,
        ]);
      });
    }
    rows.push([]);
    rows.push(["Results"]);

    // Team names centered above their column group (bold + merged); "Set",
    // "Duration", and "Start Time" columns are shared, not team-specific, so blank here.
    var merges = [];
    var teamHeaderRow = ["", state.teamA + " (A)", "", "", "", "", state.teamB + " (B)", "", "", "", "", ""];
    rows.push(teamHeaderRow);
    var teamHeaderRowIdx = rows.length - 1; // 0-based, for boldCenterRows
    var teamHeaderRowNum = rows.length;     // 1-based, for the merge range
    merges.push(xlsxColLetter(1) + teamHeaderRowNum + ":" + xlsxColLetter(4) + teamHeaderRowNum);
    merges.push(xlsxColLetter(6) + teamHeaderRowNum + ":" + xlsxColLetter(9) + teamHeaderRowNum);

    rows.push(["Set", "T", "S", "W", "P", "Duration (mn)", "P", "W", "S", "T", "", "Start Time"]);
    results.rows.forEach(function (r) {
      rows.push([r.setNumber, r.tA, r.sA, r.wA, r.pA, r.duration, r.pB, r.wB, r.sB, r.tB, "", r.startTime]);
    });
    var t = results.totals;
    rows.push(["Total", t.tA, t.sA, t.wA, t.pA, t.setDuration, t.pB, t.wB, t.sB, t.tB, "", ""]);
    rows.push([]);
    rows.push(["Match Starting Time", results.matchStart ? formatTime24FromDate(results.matchStart) : "N/A"]);
    rows.push(["Match Ending Time", results.matchEnd ? formatTime24FromDate(results.matchEnd) : "N/A"]);
    rows.push(["Total Match Duration", results.totalMatchDuration != null ? formatDurationMin(results.totalMatchDuration) : "N/A"]);
    rows.push(["Winner", results.winnerName || "N/A", results.winnerScore || ""]);

    sheetXmls.push(xlsxSheetXml(rows, GITHUB_URL, merges, [teamHeaderRowIdx]));
  });

  var files = [
    { name: "[Content_Types].xml", data: enc.encode(xlsxContentTypesXml(sheetNames.length)) },
    { name: "_rels/.rels", data: enc.encode(XLSX_ROOT_RELS) },
    { name: "xl/workbook.xml", data: enc.encode(xlsxWorkbookXml(sheetNames)) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(xlsxWorkbookRelsXml(sheetNames.length)) },
    { name: "xl/styles.xml", data: enc.encode(XLSX_STYLES_XML) },
  ];
  sheetXmls.forEach(function (xml, i) {
    files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: enc.encode(xml) });
  });

  var zipBytes = buildZip(files);
  downloadFile("volleyscore_game_report_" + reportFilenameTimestamp() + ".xlsx",
    zipBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function printGameReport() {
  if (!_gameReportEntries.length) return;
  window.print();
}

function wireGamesPage() {
  // Set filter pills — delegated click on the detail set table
  $("detailSetTable").addEventListener("click", function (e) {
    var pill = e.target.closest(".set-filter-pill");
    if (!pill || !_detailState) return;
    var setNum = parseInt(pill.getAttribute("data-setnum"), 10);
    selectedDetailSetFilter = (selectedDetailSetFilter === setNum) ? null : setNum;
    renderDetailSetTable(_detailState);
    var logBody = $("detailEventLogBody");
    if (logBody) logBody.innerHTML = buildEventLogHtml(_detailState, _detailTimeline, selectedDetailSetFilter);
  });

  // Edit Match Info modal
  $("btnEditMatchInfo").addEventListener("click", function () {
    if (selectedDetailGameId) openEditMatchInfoModal(selectedDetailGameId);
  });
  $("btnSaveMatchInfo").addEventListener("click", function () {
    void saveMatchInfoEdits();
  });
  $("btnCloseEditMatchInfoModal").addEventListener("click", closeEditMatchInfoModal);
  $("editMatchInfoModal").addEventListener("click", function (e) {
    if (e.target === $("editMatchInfoModal")) closeEditMatchInfoModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("editMatchInfoModal").hidden) closeEditMatchInfoModal();
  });

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

  // Select mode — choose multiple (or all) games to export as one file
  $("btnSelectGames").addEventListener("click", function () {
    setGamesSelectMode(!gamesSelectMode);
  });
  $("chkSelectAllGames").addEventListener("change", function (e) {
    var games = dbListGames();
    if (e.target.checked) {
      selectedGameIds = new Set(games.map(function (g) { return g.gameId; }));
    } else {
      selectedGameIds.clear();
    }
    void renderGamesList();
  });
  $("btnExportSelectedGames").addEventListener("click", function () {
    if (!selectedGameIds.size) return;
    void exportSelectedGames(Array.from(selectedGameIds));
  });
  $("btnDeleteSelectedGames").addEventListener("click", function () {
    if (!selectedGameIds.size) return;
    var n = selectedGameIds.size;
    if (!confirm("Delete " + n + " selected game" + (n === 1 ? "" : "s") + "? This cannot be undone.\n\nTip: Export first to keep a backup.")) return;
    void (async function () {
      var ids = Array.from(selectedGameIds);
      for (var i = 0; i < ids.length; i++) {
        if (controller.currentGameId === ids[i]) controller.clear();
        await dbDeleteGame(ids[i]);
      }
      selectedGameIds.clear();
      clearGameDetail();
      await renderGamesList();
    })();
  });

  // Clear all
  $("btnClearAllGames").addEventListener("click", function () {
    if (!confirm("Delete ALL saved games? This cannot be undone.\n\nTip: Export first to keep a backup.")) return;
    void (async function () {
      await dbClearAll();
      controller.clear();
      clearGameDetail();
      await renderGamesList();
    })();
  });
}

// ---- Setup Page -----------------------------------------

function renderSetupPage() {
  $("cfgDarkMode").checked = settings.darkMode;
  $("cfgFontSize").value = settings.fontSize;
  $("cfgTeamAColor").value = settings.teamAColor;
  $("cfgTeamBColor").value = settings.teamBColor;
  $("cfgSidebarBtnBorder").value = settings.sidebarBtnBorder || "#000000";
  $("cfgTbBoxSize").textContent = settings.tbBoxSize || 84;
  $("cfgTbHighlight").value = settings.tbHighlightColor || "#15803d";
  $("cfgTbSpeed").value = String(settings.tbScrollSpeed !== undefined ? settings.tbScrollSpeed : 280);
  $("cfgStartSetColor").value = settings.startSetBgColor || settings.startSetColor || "#15803d";
  $("cfgStartSetPulseColor").value = settings.startSetPulseColor || settings.startSetColor || "#15803d";
  $("cfgDefaultFormat").value = settings.defaultFormat;
  var defVarRadio = document.querySelector('input[name="cfgDefVariation"][value="' + (settings.defaultVariation || "standard") + '"]');
  if (defVarRadio) defVarRadio.checked = true;
  $("cfgDefFairPlay").value = settings.defaultFairPlay || "none";
  $("cfgAutoSwitchSidesBetweenSets").checked = !!settings.autoSwitchSidesBetweenSets;
  $("cfgPromptSwitchSidesMidDecider").checked = !!settings.promptSwitchSidesMidDecider;
  $("cfgDefTimeouts").textContent = settings.defaultTimeouts;
  $("cfgDefSubs").textContent = settings.defaultSubs;
  $("cfgNotchEnabled").checked = !!settings.notchEnabled;
  $("notchOptions").hidden = !settings.notchEnabled;
  var notchSideRadio = document.querySelector('input[name="cfgNotchSide"][value="' + (settings.notchSide || "left") + '"]');
  if (notchSideRadio) notchSideRadio.checked = true;
  $("cfgNotchPad").textContent = settings.notchPad !== undefined ? settings.notchPad : 50;
  $("cfgScoreBtnLayout").value = settings.scoreBtnLayout || "mirrorPlus";
  $("cfgKeepAwake").checked   = !!settings.keepScreenAwake;
  $("cfgConfirmUndo").checked = !!settings.confirmUndo;
  $("cfgShowMlEditIcons").checked = !!settings.showMasterListEditIcons;
  $("cfgPersistNewGameData").checked = !!settings.persistNewGameData;
  $("cfgRefereeName").value = settings.refereeName || "";
  $("cfgDefTeamA").value    = settings.defaultTeamA    || "";
  $("cfgDefTeamB").value    = settings.defaultTeamB    || "";
  $("cfgDefLocation").value = settings.defaultLocation || "";
  $("cfgDefGender").value = settings.defaultGender || "";
  renderMasterListEditors();
  renderDefaultPickerOptions();
  // Scoring defaults
  $("cfgDefSetWinScore").textContent    = settings.defaultSetWinScore    !== undefined ? settings.defaultSetWinScore    : 25;
  $("cfgDefSetWinBy").textContent       = settings.defaultSetWinBy       !== undefined ? settings.defaultSetWinBy       : 2;
  var defSetWinCap = settings.defaultSetWinCap !== undefined ? settings.defaultSetWinCap : 0;
  $("chkDefSetWinCap").checked = defSetWinCap > 0;
  $("cfgDefSetWinCap").textContent = defSetWinCap > 0 ? defSetWinCap : (settings.defaultSetWinScore || 25);
  $("cfgDefDeciderWinScore").textContent = settings.defaultDeciderWinScore !== undefined ? settings.defaultDeciderWinScore : 15;
  $("cfgDefDeciderWinBy").textContent   = settings.defaultDeciderWinBy   !== undefined ? settings.defaultDeciderWinBy   : 2;
  var defDeciderWinCap = settings.defaultDeciderWinCap !== undefined ? settings.defaultDeciderWinCap : 0;
  $("chkDefDeciderWinCap").checked = defDeciderWinCap > 0;
  $("cfgDefDeciderWinCap").textContent = defDeciderWinCap > 0 ? defDeciderWinCap : (settings.defaultDeciderWinScore || 15);
  $("cfgWinGlowColor").value    = settings.winGlowColor    || "#f59e0b";
  $("cfgWinGlowDuration").textContent = settings.winGlowDuration !== undefined ? settings.winGlowDuration : 3;
  $("cfgWinToastDuration").textContent = settings.winToastDuration !== undefined ? settings.winToastDuration : 3;
  $("cfgActionGlowColor").value = settings.actionGlowColor || "#a855f7";
  $("cfgActionGlowDuration").textContent = settings.actionGlowDuration !== undefined ? settings.actionGlowDuration : 2;

  // About: show app version and active SW cache name
  var verLine = $("appVersionLine");
  if (verLine) {
    var cacheLabel = "no cache";
    if ("caches" in window) {
      caches.keys().then(function (keys) {
        verLine.textContent = "Version " + APP_VERSION + "  \u00B7  cache: " + (keys.length ? keys.join(", ") : "none");
      });
    } else {
      verLine.textContent = "Version " + APP_VERSION;
    }
  }
  // Apply cap toggle visibility after all values are set
  updateDefScoringRuleInteractivity();
  syncColorSwatchButtons();
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

  $("cfgScoreBtnLayout").addEventListener("change", function () {
    settings.scoreBtnLayout = this.value;
    applyScoreBtnLayout();
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

  $("cfgSidebarBtnBorder").addEventListener("input", function () {
    settings.sidebarBtnBorder = this.value;
    updateTeamColors();
    saveSettings();
  });

  $("btnTbSzDown").addEventListener("click", function () {
    var sz = settings.tbBoxSize || 84;
    if (sz > 36) { settings.tbBoxSize = sz - 4; $("cfgTbBoxSize").textContent = settings.tbBoxSize; updateTeamColors(); saveSettings(); }
  });
  $("btnTbSzUp").addEventListener("click", function () {
    var sz = settings.tbBoxSize || 84;
    if (sz < 112) { settings.tbBoxSize = sz + 4; $("cfgTbBoxSize").textContent = settings.tbBoxSize; updateTeamColors(); saveSettings(); }
  });

  $("cfgTbHighlight").addEventListener("input", function () {
    settings.tbHighlightColor = this.value;
    updateTeamColors();
    saveSettings();
  });

  $("cfgTbSpeed").addEventListener("change", function () {
    settings.tbScrollSpeed = parseInt(this.value, 10);
    saveSettings();
  });

  $("cfgStartSetColor").addEventListener("input", function () {
    settings.startSetBgColor = this.value;
    updateTeamColors();
    saveSettings();
  });

  $("cfgStartSetPulseColor").addEventListener("input", function () {
    settings.startSetPulseColor = this.value;
    updateTeamColors();
    saveSettings();
  });

  $("cfgDefaultFormat").addEventListener("change", function () {
    settings.defaultFormat = this.value;
    saveSettings();
  });

  document.querySelectorAll('input[name="cfgDefVariation"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      settings.defaultVariation = this.value;
      saveSettings();
    });
  });

  $("cfgDefFairPlay").addEventListener("change", function () {
    settings.defaultFairPlay = this.value;
    saveSettings();
  });

  $("cfgAutoSwitchSidesBetweenSets").addEventListener("change", function () {
    settings.autoSwitchSidesBetweenSets = this.checked;
    saveSettings();
  });

  $("cfgPromptSwitchSidesMidDecider").addEventListener("change", function () {
    settings.promptSwitchSidesMidDecider = this.checked;
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

  // Scoring defaults — regular sets
  $("btnDefSetWinScoreDown").addEventListener("click", function () {
    var v = settings.defaultSetWinScore !== undefined ? settings.defaultSetWinScore : 25;
    if (v > 1) { settings.defaultSetWinScore = v - 1; $("cfgDefSetWinScore").textContent = settings.defaultSetWinScore; updateDefScoringRuleInteractivity(); }
  });
  $("btnDefSetWinScoreUp").addEventListener("click", function () {
    var v = settings.defaultSetWinScore !== undefined ? settings.defaultSetWinScore : 25;
    if (v < 50) { settings.defaultSetWinScore = v + 1; $("cfgDefSetWinScore").textContent = settings.defaultSetWinScore; updateDefScoringRuleInteractivity(); }
  });
  $("btnDefSetWinByDown").addEventListener("click", function () {
    var v = settings.defaultSetWinBy !== undefined ? settings.defaultSetWinBy : 2;
    if (v > 1) { settings.defaultSetWinBy = v - 1; $("cfgDefSetWinBy").textContent = settings.defaultSetWinBy; saveSettings(); }
  });
  $("btnDefSetWinByUp").addEventListener("click", function () {
    var v = settings.defaultSetWinBy !== undefined ? settings.defaultSetWinBy : 2;
    if (v < 10) { settings.defaultSetWinBy = v + 1; $("cfgDefSetWinBy").textContent = settings.defaultSetWinBy; saveSettings(); }
  });
  $("chkDefSetWinCap").addEventListener("change", function () {
    if (this.checked && (settings.defaultSetWinCap || 0) === 0) {
      settings.defaultSetWinCap = settings.defaultSetWinScore || 25;
      $("cfgDefSetWinCap").textContent = settings.defaultSetWinCap;
    }
    updateDefScoringRuleInteractivity();
  });
  $("btnDefSetWinCapDown").addEventListener("click", function () {
    var min = settings.defaultSetWinScore || 25;
    var v = settings.defaultSetWinCap !== undefined ? settings.defaultSetWinCap : 0;
    if (v > min) { settings.defaultSetWinCap = v - 1; $("cfgDefSetWinCap").textContent = settings.defaultSetWinCap; updateDefScoringRuleInteractivity(); }
  });
  $("btnDefSetWinCapUp").addEventListener("click", function () {
    var v = settings.defaultSetWinCap !== undefined ? settings.defaultSetWinCap : 0;
    if (v < 60) { settings.defaultSetWinCap = v + 1; $("cfgDefSetWinCap").textContent = settings.defaultSetWinCap; updateDefScoringRuleInteractivity(); }
  });

  // Scoring defaults — deciding set
  $("btnDefDeciderWinScoreDown").addEventListener("click", function () {
    var v = settings.defaultDeciderWinScore !== undefined ? settings.defaultDeciderWinScore : 15;
    if (v > 1) { settings.defaultDeciderWinScore = v - 1; $("cfgDefDeciderWinScore").textContent = settings.defaultDeciderWinScore; updateDefScoringRuleInteractivity(); }
  });
  $("btnDefDeciderWinScoreUp").addEventListener("click", function () {
    var v = settings.defaultDeciderWinScore !== undefined ? settings.defaultDeciderWinScore : 15;
    if (v < 50) { settings.defaultDeciderWinScore = v + 1; $("cfgDefDeciderWinScore").textContent = settings.defaultDeciderWinScore; updateDefScoringRuleInteractivity(); }
  });
  $("btnDefDeciderWinByDown").addEventListener("click", function () {
    var v = settings.defaultDeciderWinBy !== undefined ? settings.defaultDeciderWinBy : 2;
    if (v > 1) { settings.defaultDeciderWinBy = v - 1; $("cfgDefDeciderWinBy").textContent = settings.defaultDeciderWinBy; saveSettings(); }
  });
  $("btnDefDeciderWinByUp").addEventListener("click", function () {
    var v = settings.defaultDeciderWinBy !== undefined ? settings.defaultDeciderWinBy : 2;
    if (v < 10) { settings.defaultDeciderWinBy = v + 1; $("cfgDefDeciderWinBy").textContent = settings.defaultDeciderWinBy; saveSettings(); }
  });
  $("chkDefDeciderWinCap").addEventListener("change", function () {
    if (this.checked && (settings.defaultDeciderWinCap || 0) === 0) {
      settings.defaultDeciderWinCap = settings.defaultDeciderWinScore || 15;
      $("cfgDefDeciderWinCap").textContent = settings.defaultDeciderWinCap;
    }
    updateDefScoringRuleInteractivity();
  });
  $("btnDefDeciderWinCapDown").addEventListener("click", function () {
    var min = settings.defaultDeciderWinScore || 15;
    var v = settings.defaultDeciderWinCap !== undefined ? settings.defaultDeciderWinCap : 0;
    if (v > min) { settings.defaultDeciderWinCap = v - 1; $("cfgDefDeciderWinCap").textContent = settings.defaultDeciderWinCap; updateDefScoringRuleInteractivity(); }
  });
  $("btnDefDeciderWinCapUp").addEventListener("click", function () {
    var v = settings.defaultDeciderWinCap !== undefined ? settings.defaultDeciderWinCap : 0;
    if (v < 60) { settings.defaultDeciderWinCap = v + 1; $("cfgDefDeciderWinCap").textContent = settings.defaultDeciderWinCap; updateDefScoringRuleInteractivity(); }
  });

  // Win alert — glow color
  $("cfgWinGlowColor").addEventListener("input", function () {
    settings.winGlowColor = this.value;
    updateTeamColors();
    saveSettings();
  });

  // Win alert — glow duration
  $("btnWinGlowDurDown").addEventListener("click", function () {
    var v = settings.winGlowDuration !== undefined ? settings.winGlowDuration : 3;
    if (v > 1) { settings.winGlowDuration = v - 1; $("cfgWinGlowDuration").textContent = settings.winGlowDuration; updateTeamColors(); saveSettings(); }
  });
  $("btnWinGlowDurUp").addEventListener("click", function () {
    var v = settings.winGlowDuration !== undefined ? settings.winGlowDuration : 3;
    if (v < 30) { settings.winGlowDuration = v + 1; $("cfgWinGlowDuration").textContent = settings.winGlowDuration; updateTeamColors(); saveSettings(); }
  });

  // Win alert — toast duration
  $("btnWinToastDurDown").addEventListener("click", function () {
    var v = settings.winToastDuration !== undefined ? settings.winToastDuration : 3;
    if (v > 1) { settings.winToastDuration = v - 1; $("cfgWinToastDuration").textContent = settings.winToastDuration; saveSettings(); }
  });
  $("btnWinToastDurUp").addEventListener("click", function () {
    var v = settings.winToastDuration !== undefined ? settings.winToastDuration : 3;
    if (v < 30) { settings.winToastDuration = v + 1; $("cfgWinToastDuration").textContent = settings.winToastDuration; saveSettings(); }
  });

  // Action alert — glow color
  $("cfgActionGlowColor").addEventListener("input", function () {
    settings.actionGlowColor = this.value;
    updateTeamColors();
    saveSettings();
  });

  // Action alert — glow duration
  $("btnActionGlowDurDown").addEventListener("click", function () {
    var v = settings.actionGlowDuration !== undefined ? settings.actionGlowDuration : 2;
    if (v > 1) { settings.actionGlowDuration = v - 1; $("cfgActionGlowDuration").textContent = settings.actionGlowDuration; saveSettings(); }
  });
  $("btnActionGlowDurUp").addEventListener("click", function () {
    var v = settings.actionGlowDuration !== undefined ? settings.actionGlowDuration : 2;
    if (v < 30) { settings.actionGlowDuration = v + 1; $("cfgActionGlowDuration").textContent = settings.actionGlowDuration; saveSettings(); }
  });

  // Keep screen awake
  $("cfgKeepAwake").addEventListener("change", function () {
    settings.keepScreenAwake = this.checked;
    if (this.checked) { var st = controller.getState(); if (st && !st.endedAt) requestWakeLock(); }
    else releaseWakeLock();
    saveSettings();
  });

  // Confirm before Undo
  $("cfgConfirmUndo").addEventListener("change", function () {
    settings.confirmUndo = this.checked;
    saveSettings();
  });
  $("cfgShowMlEditIcons").addEventListener("change", function () {
    settings.showMasterListEditIcons = this.checked;
    saveSettings();
    renderMasterListEditors();
  });
  $("cfgPersistNewGameData").addEventListener("change", function () {
    settings.persistNewGameData = this.checked;
    saveSettings();
  });

  $("cfgRefereeName").addEventListener("input", function () {
    settings.refereeName = this.value; saveSettings();
  });

  // Default team names and location
  $("cfgDefTeamA").addEventListener("input", function () {
    settings.defaultTeamA = this.value; saveSettings();
  });
  $("cfgDefTeamB").addEventListener("input", function () {
    settings.defaultTeamB = this.value; saveSettings();
  });
  $("cfgDefLocation").addEventListener("input", function () {
    settings.defaultLocation = this.value; saveSettings();
  });
  $("cfgDefGender").addEventListener("change", function () {
    settings.defaultGender = this.value; saveSettings();
  });
  $("cfgDefAgeCategory").addEventListener("change", function () {
    settings.defaultAgeCategory = this.value; saveSettings();
  });
  $("cfgDefLeague").addEventListener("change", function () {
    settings.defaultLeague = this.value; saveSettings();
  });

  // Match Info Lists — add new entries
  function wireMasterListAdd(inputId, listName, colorInputId) {
    var input = $(inputId);
    var colorInput = colorInputId ? $(colorInputId) : null;
    function add() {
      var value = input.value;
      if (addToMasterList(listName, value)) {
        if (colorInput && colorInput.value.toLowerCase() !== ML_CHIP_NO_COLOR) {
          rememberTeamColor(value, colorInput.value);
        }
        input.value = "";
        if (colorInput) setColorInputValue(colorInput, ML_CHIP_NO_COLOR);
        renderMasterListEditors();
        renderDefaultPickerOptions();
      }
    }
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); add(); } });
    return add;
  }
  $("btnAddTeamName").addEventListener("click", wireMasterListAdd("cfgAddTeamName", "masterTeamNames", "cfgAddTeamNameColor"));
  $("btnAddLocation").addEventListener("click", wireMasterListAdd("cfgAddLocation", "masterLocations"));
  $("btnAddAgeCategory").addEventListener("click", wireMasterListAdd("cfgAddAgeCategory", "masterAgeCategories"));
  $("btnAddLeague").addEventListener("click", wireMasterListAdd("cfgAddLeague", "masterLeagues"));

  // Match Info Lists — filter chips shown per list (delegated; inputs render statically in HTML)
  document.addEventListener("input", function (e) {
    var input = e.target.closest(".ml-filter-input");
    if (!input) return;
    var listName = input.getAttribute("data-list");
    _mlFilter[listName] = input.value;
    renderMasterListChips("mlList" + listName.replace("master", ""), listName);
  });

  // Match Info Lists — remove entries unused by any saved game
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".ml-prune-btn");
    if (!btn) return;
    void removeUnusedMasterListEntries(btn.getAttribute("data-list"), btn.getAttribute("data-label"));
  });

  // Match Info Lists — remove an entry (delegated for the dynamically rendered chips)
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".ml-chip-remove");
    if (!btn) return;
    removeFromMasterList(btn.getAttribute("data-list"), btn.getAttribute("data-value"));
    renderMasterListEditors();
    renderDefaultPickerOptions();
  });

  // Match Info Lists — rename an entry inline (delegated for the dynamically rendered chips)
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".ml-chip-edit");
    if (!btn) return;
    _mlEditing = { listName: btn.getAttribute("data-list"), value: btn.getAttribute("data-value") };
    renderMasterListEditors();
  });

  // Match Info Lists — open the color picker for a Team Names chip's swatch.
  // mousedown must preventDefault so clicking it (while the sibling rename
  // input is focused) doesn't blur that input first — a blur commits/exits
  // the rename and re-renders the chip list, which would detach this very
  // button before its own "click" handler runs (the popover would then open
  // anchored to a removed, zero-sized element).
  document.addEventListener("mousedown", function (e) {
    if (e.target.closest(".ml-chip-color")) e.preventDefault();
  });
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".ml-chip-color");
    if (!btn) return;
    e.stopPropagation();
    openTeamColorPickerForChip(btn.getAttribute("data-value"), btn);
  });

  document.addEventListener("keydown", function (e) {
    var input = e.target.closest(".ml-chip-input");
    if (!input) return;
    if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    else if (e.key === "Escape") { e.preventDefault(); _mlEditing = null; renderMasterListEditors(); }
  });

  document.addEventListener("focusout", function (e) {
    var input = e.target.closest(".ml-chip-input");
    if (!input || !_mlEditing) return;
    var listName = input.getAttribute("data-list");
    var oldValue = input.getAttribute("data-value");
    _mlEditing = null;
    renameInMasterList(listName, oldValue, input.value);
    renderMasterListEditors();
    renderDefaultPickerOptions();
  });

  // Match Info Lists — export / import
  $("btnExportCategoriesJson").addEventListener("click", function () {
    exportCategoriesJson();
  });
  $("btnExportCategoriesXlsx").addEventListener("click", function () {
    exportCategoriesXlsx();
  });
  $("btnImportCategories").addEventListener("click", function () {
    $("importCategoriesFileInput").click();
  });
  $("importCategoriesFileInput").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var isXlsx = /\.xlsx$/i.test(file.name);
    var reader = new FileReader();
    reader.onload = function (ev) {
      if (isXlsx) void importCategoriesFromXlsx(ev.target.result);
      else importCategoriesFromJson(ev.target.result);
    };
    if (isXlsx) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
    e.target.value = "";
  });

  // Notch padding
  $("cfgNotchEnabled").addEventListener("change", function () {
    settings.notchEnabled = this.checked;
    $("notchOptions").hidden = !this.checked;
    applyNotchPadding();
    saveSettings();
  });

  document.querySelectorAll('input[name="cfgNotchSide"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      settings.notchSide = this.value;
      applyNotchPadding();
      saveSettings();
    });
  });

  $("btnNotchPadDown").addEventListener("click", function () {
    var v = settings.notchPad !== undefined ? settings.notchPad : 50;
    if (v > 8) { settings.notchPad = v - 4; $("cfgNotchPad").textContent = settings.notchPad; applyNotchPadding(); saveSettings(); }
  });
  $("btnNotchPadUp").addEventListener("click", function () {
    var v = settings.notchPad !== undefined ? settings.notchPad : 50;
    if (v < 128) { settings.notchPad = v + 4; $("cfgNotchPad").textContent = settings.notchPad; applyNotchPadding(); saveSettings(); }
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
      applyScoreBtnLayout();
      renderSetupPage();
    })();
  });
}

function applyNotchPadding() {
  var pad = settings.notchEnabled ? (settings.notchPad !== undefined ? settings.notchPad : 50) : 0;
  document.documentElement.style.setProperty("--notch-pad", pad + "px");
  document.body.classList.toggle("notch-left",  settings.notchEnabled && settings.notchSide !== "right");
  document.body.classList.toggle("notch-right", settings.notchEnabled && settings.notchSide === "right");
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", settings.darkMode ? "dark" : "light");
}

function applyFontSize() {
  document.documentElement.classList.remove("fs-small", "fs-medium", "fs-large");
  document.documentElement.classList.add("fs-" + (settings.fontSize || "medium"));
}

function applyScoreBtnLayout() {
  document.documentElement.classList.remove("score-layout-plusMinus", "score-layout-mirrorPlus", "score-layout-mirrorMinus");
  var layout = settings.scoreBtnLayout || "mirrorPlus";
  if (layout !== "minusPlus") document.documentElement.classList.add("score-layout-" + layout);
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
  applyNotchPadding();
  applyScoreBtnLayout();

  // Wire up all UI
  wireNavigation();
  wireGameSetupForm();
  wireScoreboardControls();
  wireSanctionModal();
  wireGamesPage();
  wireSetupPage();
  wireReportsPage();
  wireColorPresetPopover();
  wireComboInputs();

  // Re-request wake lock when page becomes visible again (browser releases it on hide)
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && settings.keepScreenAwake && !_wakeLock) {
      var st = controller.getState();
      if (st && !st.endedAt) requestWakeLock();
    }
  });

  // Re-render triple ball track when orientation flips (portrait ↔ landscape).
  // renderTripleBall() bakes the orientation into CSS transforms, so a static
  // re-render is needed whenever the aspect ratio changes.
  window.addEventListener("resize", function () {
    var nowPortrait = window.innerHeight > window.innerWidth;
    if (nowPortrait !== _prevPortrait) {
      _prevPortrait = nowPortrait;
      _tbPrevPhase = -1; // suppress animation, force full static re-render
      if ($('scoreboard') && !$('scoreboard').hidden) renderScoreboard();
    }
  });

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
  // Register service worker for PWA offline support
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js")
      .then(function (reg) {
        reg.addEventListener("updatefound", function () {
          var newWorker = reg.installing;
          newWorker.addEventListener("statechange", function () {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // A new version is ready — show a tappable toast
              var existing = document.querySelector(".toast");
              if (existing) existing.parentNode.removeChild(existing);
              if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }

              var toast = document.createElement("div");
              toast.className = "toast toast-update";
              toast.textContent = "Update available \u2014 tap to refresh";
              toast.setAttribute("role", "button");
              toast.setAttribute("tabindex", "0");
              toast.style.cursor = "pointer";
              toast.addEventListener("click", function () { window.location.reload(); });
              toast.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") { window.location.reload(); }
              });
              document.body.appendChild(toast);
            }
          });
        });
      })
      .catch(function () { /* SW unavailable — app still works fine */ });
  }
});
