// ============================================================
// VolleyScore — js/core.js  (Polyfills, constants, default settings)
// Classic script: shares one global scope with the other js/*.js files.
// Load order is set by the <script> tags in index.html and listed in sw.js.
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
var APP_VERSION = "42";

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
  // League associations — keyed lowercased/trimmed team name / age category /
  // location, each value an array of league name strings (many-to-many; any of
  // these can belong to multiple leagues). Drives the New Game form's hard
  // filter (pick a League, then Team A/B + Age Category + Location only
  // suggest entries associated with it), and vice versa.
  teamLeagues: {},
  ageCategoryLeagues: {},
  locationLeagues: {},
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
  startMatchSidesSwapped: false,
  promptSwitchSidesMidDecider: true,
  defaultTimeouts: 2,
  defaultSubs: 6,
  notchEnabled: false,
  notchSide: "left",
  notchPad: 50,
  scoreBtnLayout: "mirrorPlus", // minusPlus | plusMinus | mirrorPlus | mirrorMinus
  scoreBtnSize: 100, // percent — 100 is the original/smallest size
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
  // Pre-defined remark text a referee can pick from when adding a remark during a
  // live game — order here IS the order shown in the live picker (user-controlled,
  // never auto-sorted, unlike the master lists above).
  remarkPresets: ["Game delayed due to previous match."],
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
  // Timeout countdown popup
  timeoutTimerEnabled: true,
  timeoutTimerCountUp: false,
  timeoutTimerDuration: 60,
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

