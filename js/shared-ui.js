// ============================================================
// VolleyScore — js/shared-ui.js  (Scoreboard state, team colors, color popover, combo dropdown)
// Classic script: shares one global scope with the other js/*.js files.
// Load order is set by the <script> tags in index.html and listed in sw.js.
// © 2025 Jared Mathes — CC BY-NC-SA 4.0
// ============================================================

"use strict";

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
  $("navRemarksBtn").hidden = true;
  $("navServeTimerBtn").hidden = true;
  closeServeTimer();
  closeTimeoutCountdown(); // don't leave a stale countdown showing after leaving the game
  _justEndedGame = false; // navigating away clears the undo window
  _tbPrevPhase = -1;
  _setWinKey = null;
  _matchWinKey = null;
  _midDeciderSwitchPromptedSet = null;
  updateTeamColors(); // restore global default colors
  initGameSetupForm();
}

// Fully abandons a game that was started by accident (cursor === 1, i.e. only
// GAME_STARTED so far, no set ever started) — deletes it outright rather than
// leaving a "cancelled" record behind, since a plain timeline undo back past
// GAME_STARTED can't be persisted (deriveGameState has nothing left to derive
// a state from) and would otherwise resurface as a live game on next launch.
async function cancelJustStartedGame() {
  var gameId = controller.currentGameId;
  controller.clear();
  localStorage.removeItem(LS_CURRENT);
  if (gameId) await dbDeleteGame(gameId);
  showSetupPanel();
  await renderGamesList();
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
  // Width/font stop growing at 200% so the +/- buttons never get too wide for
  // the row; height keeps scaling past that so larger sizes make them taller
  // (bigger tap target) instead of wider.
  var scoreBtnPct = settings.scoreBtnSize || 100;
  root.style.setProperty("--score-btn-scale-w", Math.min(scoreBtnPct, 200) / 100);
  root.style.setProperty("--score-btn-scale-h", scoreBtnPct / 100);
  root.style.setProperty("--win-glow-color", settings.winGlowColor || "#f59e0b");
  root.style.setProperty("--win-glow-duration", (settings.winGlowDuration || 3) + "s");
  root.style.setProperty("--action-glow-color", settings.actionGlowColor || "#a855f7");
  root.style.setProperty("--action-glow-duration", (settings.actionGlowDuration || 2) + "s");
  updateTeamColorContrastOutlines();
}

function hexToRgb(hex) {
  var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  return parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16);
}

// ---- Low-contrast team-color outline -----------------------------------
// WCAG relative luminance / contrast ratio, used to detect a chosen team
// color that's too close to the current background to read comfortably.
function relativeLuminanceHex(hex) {
  var rgb = hexToRgb(hex);
  if (!rgb) return null;
  var channels = rgb.split(",").map(function (n) {
    var c = parseInt(n, 10) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatioHex(hexA, hexB) {
  var lA = relativeLuminanceHex(hexA);
  var lB = relativeLuminanceHex(hexB);
  if (lA == null || lB == null) return 21; // can't parse — assume fine, don't outline
  var lighter = Math.max(lA, lB), darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

var TEAM_COLOR_CONTRAST_THRESHOLD = 2.2;

function hexToHsl(hex) {
  var rgb = hexToRgb(hex);
  if (!rgb) return null;
  var c = rgb.split(",").map(function (n) { return parseInt(n, 10) / 255; });
  var max = Math.max(c[0], c[1], c[2]), min = Math.min(c[0], c[1], c[2]);
  var l = (max + min) / 2, d = max - min, h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === c[0]) h = ((c[1] - c[2]) / d) % 6;
    else if (max === c[1]) h = (c[2] - c[0]) / d + 2;
    else h = (c[0] - c[1]) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: h, s: s, l: l };
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  var a = s * Math.min(l, 1 - l);
  function f(n) {
    var k = (n + h / 30) % 12;
    var v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, "0");
  }
  return "#" + f(0) + f(8) + f(4);
}

// Picks white or near-black text for a button filled with the given color, so the
// "+" glyph stays readable on any team color (e.g. a white team in dark mode).
function pickTextOnColor(fillHex) {
  var white = contrastRatioHex("#ffffff", fillHex);
  var dark = contrastRatioHex("#111111", fillHex);
  return white >= 3 || white >= dark ? "#ffffff" : "#111111";
}

// Picks a vivid glow color that contrasts with the team color AND the current
// theme's backgrounds: tries the complement (and split complements) of the team
// hue at several lightness levels and keeps the one with the best worst-case
// contrast, so it holds up in both light and dark mode.
function pickPointGlowColor(teamHex, backgrounds) {
  var hsl = hexToHsl(teamHex);
  var baseHue = hsl && hsl.s > 0.15 ? hsl.h : 200; // near-gray team color: no hue to oppose
  var against = [teamHex].concat(backgrounds).filter(Boolean);
  var best = null, bestScore = -1;
  [180, 150, 210].forEach(function (offset, oi) {
    [0.35, 0.5, 0.65, 0.8].forEach(function (light) {
      var cand = hslToHex(baseHue + offset, 0.95, light);
      var score = Math.min.apply(null, against.map(function (o) { return contrastRatioHex(cand, o); })) - oi * 0.05;
      if (score > bestScore) { bestScore = score; best = cand; }
    });
  });
  return best;
}

// Re-evaluates --team-a/--team-b against the app's actual background colors and
// toggles thin CSS-var-driven outlines (see the "Low-contrast team-color
// outline" rules in styles.css) when a color is hard to tell apart from the
// current theme's background — e.g. a near-white pick in light mode, or a
// near-black pick in dark mode. Checks both --bg and --bg-card and outlines if
// either is a poor match, since team colors show up against both surfaces.
function updateTeamColorContrastOutlines() {
  var root = document.documentElement;
  var cs = getComputedStyle(root);
  var bg = (cs.getPropertyValue("--bg") || "").trim();
  var bgCard = (cs.getPropertyValue("--bg-card") || "").trim();
  var teamAHex = (cs.getPropertyValue("--team-a") || "").trim();
  var teamBHex = (cs.getPropertyValue("--team-b") || "").trim();

  function isLowContrast(teamHex) {
    if (!teamHex) return false;
    var ratios = [bg, bgCard].filter(Boolean).map(function (b) { return contrastRatioHex(teamHex, b); });
    if (!ratios.length) return false;
    return Math.min.apply(null, ratios) < TEAM_COLOR_CONTRAST_THRESHOLD;
  }

  var lowA = isLowContrast(teamAHex);
  var lowB = isLowContrast(teamBHex);
  root.style.setProperty("--team-a-text-stroke-w", lowA ? "0.6px" : "0px");
  root.style.setProperty("--team-a-outline-w", lowA ? "2px" : "0px");
  root.style.setProperty("--team-b-text-stroke-w", lowB ? "0.6px" : "0px");
  root.style.setProperty("--team-b-outline-w", lowB ? "2px" : "0px");

  var backgrounds = [bg, bgCard].filter(Boolean);
  if (teamAHex) {
    root.style.setProperty("--team-a-point-glow", pickPointGlowColor(teamAHex, backgrounds));
    root.style.setProperty("--team-a-on-color", pickTextOnColor(teamAHex));
  }
  if (teamBHex) {
    root.style.setProperty("--team-b-point-glow", pickPointGlowColor(teamBHex, backgrounds));
    root.style.setProperty("--team-b-on-color", pickTextOnColor(teamBHex));
  }
}

// ---- Per-team-name remembered colors ---------------------------------

// Looks up the color last used for this team name, or null if none saved yet.
function getRememberedTeamColor(name) {
  var key = safeStr(name).trim().toLowerCase();
  if (!key) return null;
  return (settings.teamColors && settings.teamColors[key]) || null;
}

// Saves/updates the color remembered for this team name. Always builds a new
// object (never mutates settings.teamColors in place) so DEFAULT_SETTINGS'
// shared {} literal is never touched, same precaution as addToMasterList.
function rememberTeamColor(name, hex) {
  var key = safeStr(name).trim().toLowerCase();
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
  var oldKey = safeStr(oldName).trim().toLowerCase();
  var newKey = safeStr(newName).trim().toLowerCase();
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
  var nameInput = $(pickTeam(letter, "cfgTeamA", "cfgTeamB"));
  var colorInput = $(pickTeam(letter, "cfgTeamAColorOverride", "cfgTeamBColorOverride"));
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
var _customColorInputHome = null; // {parent, next} — where to restore the input after borrowing it for "Custom…"

// Temporarily reparents `input` onto the "Custom…" label so a real tap lands on
// it directly (required for mobile browsers to open the native color picker —
// see the comment on .color-input-custom-label-target in styles.css).
function moveInputIntoCustomLabel(input) {
  var label = $("btnColorPresetCustom");
  _customColorInputHome = { parent: input.parentNode, next: input.nextSibling };
  input.classList.remove("color-input-visually-hidden");
  input.classList.add("color-input-custom-label-target");
  label.appendChild(input);
  input.addEventListener("change", onCustomColorPicked);
}

function onCustomColorPicked() {
  restoreInputFromCustomLabel(); // put the input back next to its swatch button first
  syncColorSwatchButtons(); // ...so this can find it via btn.nextElementSibling
  closeColorPresetPopover();
}

function restoreInputFromCustomLabel() {
  if (!_customColorInputHome) return;
  var label = $("btnColorPresetCustom");
  var input = label.firstElementChild;
  if (input) {
    input.removeEventListener("change", onCustomColorPicked);
    input.classList.remove("color-input-custom-label-target");
    input.classList.add("color-input-visually-hidden");
    if (_customColorInputHome.next) _customColorInputHome.parent.insertBefore(input, _customColorInputHome.next);
    else _customColorInputHome.parent.appendChild(input);
  }
  _customColorInputHome = null;
}

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
  // Visually hidden; shown again (via .color-input-custom-label-target) only
  // while borrowed by the "Custom…" label in the popover, see moveInputIntoCustomLabel.
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
  moveInputIntoCustomLabel(input);
}

function closeColorPresetPopover() {
  restoreInputFromCustomLabel();
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
    "emiTeamAColor", "emiTeamBColor",
  ].forEach(enhanceColorInput);

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

// Maps a master-list settings key to its paired league-association map key.
var LEAGUE_MAP_KEY_BY_LIST = {
  masterTeamNames: "teamLeagues",
  masterAgeCategories: "ageCategoryLeagues",
  masterLocations: "locationLeagues",
};

var COMBO_FIELDS = [
  { inputId: "cfgTeamA", listKey: "masterTeamNames", filterByLeague: true, leagueInputId: "cfgLeague" },
  { inputId: "cfgTeamB", listKey: "masterTeamNames", filterByLeague: true, leagueInputId: "cfgLeague" },
  { inputId: "cfgLocation", listKey: "masterLocations", filterByLeague: true, leagueInputId: "cfgLeague" },
  { inputId: "cfgAgeCategory", listKey: "masterAgeCategories", filterByLeague: true, leagueInputId: "cfgLeague" },
  { inputId: "cfgLeague", listKey: "masterLeagues", filterByEntries: [
      { inputId: "cfgTeamA", mapKey: "teamLeagues" },
      { inputId: "cfgTeamB", mapKey: "teamLeagues" },
      { inputId: "cfgAgeCategory", mapKey: "ageCategoryLeagues" },
      { inputId: "cfgLocation", mapKey: "locationLeagues" },
    ] },
  { inputId: "emiTeamA", listKey: "masterTeamNames", filterByLeague: true, leagueInputId: "emiLeague" },
  { inputId: "emiTeamB", listKey: "masterTeamNames", filterByLeague: true, leagueInputId: "emiLeague" },
  { inputId: "emiLocation", listKey: "masterLocations", filterByLeague: true, leagueInputId: "emiLeague" },
  { inputId: "emiAgeCategory", listKey: "masterAgeCategories", filterByLeague: true, leagueInputId: "emiLeague" },
  { inputId: "emiLeague", listKey: "masterLeagues", filterByEntries: [
      { inputId: "emiTeamA", mapKey: "teamLeagues" },
      { inputId: "emiTeamB", mapKey: "teamLeagues" },
      { inputId: "emiAgeCategory", mapKey: "ageCategoryLeagues" },
      { inputId: "emiLocation", mapKey: "locationLeagues" },
    ] },
];

var _comboInput = null;   // input currently showing the dropdown
var _comboOptions = [];   // current filtered option strings
var _comboActiveIndex = -1;

function enhanceComboInput(field) {
  var input = $(field.inputId);
  if (!input || input.dataset.comboEnhanced) return;
  input.dataset.comboEnhanced = "1";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-autocomplete", "list");

  input.addEventListener("focus", function () { openComboDropdown(input, field); });
  // Dismissing the dropdown (e.g. tapping a non-focusable area) doesn't always blur
  // the input, so a second tap on an already-focused field wouldn't refire "focus" —
  // "click" fires every tap regardless, so it reliably reopens the dropdown.
  input.addEventListener("click", function () { openComboDropdown(input, field); });
  input.addEventListener("input", function () { openComboDropdown(input, field); });
  input.addEventListener("keydown", function (e) { handleComboKeydown(e, input); });
  // mousedown on an option calls preventDefault (see below), so blur only fires
  // for genuine focus-away actions (Tab, clicking elsewhere) — safe to close here.
  input.addEventListener("blur", function () { closeComboDropdown(); });
}

function openComboDropdown(input, field) {
  var values = settings[field.listKey] || [];
  // Hard-filter Team/Age-Category suggestions to the currently selected League's
  // members — but only once that league is itself a known, saved league; while
  // typing a brand-new league there's nothing to filter by yet, so fall back to
  // the full unfiltered list rather than blocking the flow.
  if (field.filterByLeague) {
    var leagueInput = $(field.leagueInputId);
    var league = leagueInput ? leagueInput.value.trim() : "";
    if (league) {
      var knownLeague = (settings.masterLeagues || []).some(function (l) { return l.toLowerCase() === league.toLowerCase(); });
      if (knownLeague) {
        var mapKey = LEAGUE_MAP_KEY_BY_LIST[field.listKey];
        values = values.filter(function (v) { return isEntryInLeague(mapKey, v, league); });
      }
    }
  }
  // Reverse direction (League field only): narrow league suggestions to the
  // union of leagues already associated with whichever Team A/B/Age Category
  // fields have something typed in — falls back to the full list if none of
  // them have any known associations yet.
  if (field.filterByEntries) {
    var leagueSet = null;
    field.filterByEntries.forEach(function (fe) {
      var otherInput = $(fe.inputId);
      var val = otherInput ? otherInput.value.trim() : "";
      if (!val) return;
      getEntryLeagues(fe.mapKey, val).forEach(function (l) {
        leagueSet = leagueSet || {};
        leagueSet[l.toLowerCase()] = true;
      });
    });
    if (leagueSet) values = values.filter(function (v) { return leagueSet[v.toLowerCase()]; });
  }
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
  COMBO_FIELDS.forEach(function (f) { enhanceComboInput(f); });

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
  el.style.removeProperty("--glow-color"); // a win/action glow uses the Action Alert color
  el.classList.remove("action-glow");
  void el.offsetWidth; // force reflow to restart animation
  el.classList.add("action-glow");
  var duration = (settings.actionGlowDuration || 2) * 1000;
  setTimeout(function () {
    el.classList.remove("action-glow");
  }, duration + 100);
}

// Short one-shot glow on a team's score digit and the +/- button just pressed.
function applyPointGlow(team, delta) {
  [$("scoreVal" + team), $("btnScore" + team + (delta > 0 ? "Plus" : "Minus"))].forEach(function (el) {
    if (!el) return;
    el.style.setProperty("--glow-color", "var(--team-" + team.toLowerCase() + "-point-glow)");
    el.classList.remove("point-glow");
    void el.offsetWidth; // force reflow to restart animation
    el.classList.add("point-glow");
    setTimeout(function () { el.classList.remove("point-glow"); }, 900);
  });
}

