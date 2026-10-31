// ============================================================
// VolleyScore — js/game-setup.js  (New Game form)
// Classic script: shares one global scope with the other js/*.js files.
// Load order is set by the <script> tags in index.html and listed in sw.js.
// © 2025 Jared Mathes — CC BY-NC-SA 4.0
// ============================================================

"use strict";

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
  $("cfgLocFromTeamA").checked = !!last && last.locationFromTeam === "A";
  $("cfgLocFromTeamB").checked = !!last && last.locationFromTeam === "B";
  syncLocationFromTeam();
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
    if (input.value === genericName) {
      input.value = "";
      syncLocationFromTeam();
    }
  });
}

// When a "Loc" box is checked, the location is locked to that team's name and follows it as it changes.
function syncLocationFromTeam() {
  var fromA = $("cfgLocFromTeamA").checked;
  var fromB = $("cfgLocFromTeamB").checked;
  var source = fromA ? $("cfgTeamA") : (fromB ? $("cfgTeamB") : null);
  var loc = $("cfgLocation");
  loc.disabled = !!source;
  if (source) loc.value = source.value.trim();
}

// Wire a -/+ stepper pair. o.get/o.set read and write the value, o.min/o.max (numbers or
// functions) bound it, o.step defaults to 1, o.fmt formats the label, and o.onChange runs
// after each change.
function wireStepper(downId, upId, labelId, o) {
  function bound(x) { return typeof x === "function" ? x() : x; }
  function bump(dir) {
    var v = o.get();
    if (dir < 0 ? v > bound(o.min) : v < bound(o.max)) {
      var n = v + dir * (o.step || 1);
      o.set(n);
      $(labelId).textContent = o.fmt ? o.fmt(n) : n;
      if (o.onChange) o.onChange();
    }
  }
  $(downId).addEventListener("click", function () { bump(-1); });
  $(upId).addEventListener("click", function () { bump(1); });
}

// wireStepper bound to settings[key] (falling back to def when unset); saves settings after
// each change unless o.onChange is given (it then owns any saving).
function wireSettingStepper(downId, upId, labelId, key, def, o) {
  o.get = function () { return settings[key] !== undefined ? settings[key] : def; };
  o.set = function (v) { settings[key] = v; };
  if (!o.onChange) o.onChange = saveSettings;
  wireStepper(downId, upId, labelId, o);
}

// Bind a checkbox to settings[key]; onChange(checked), if given, runs before settings are saved.
function wireToggle(id, key, onChange) {
  $(id).addEventListener("change", function () {
    settings[key] = this.checked;
    if (onChange) onChange(this.checked);
    saveSettings();
  });
}

function wireGameSetupForm() {
  clearGenericTeamNameOnFocus($("cfgTeamA"), "Team A");
  clearGenericTeamNameOnFocus($("cfgTeamB"), "Team B");
  // Checking one "Loc" box unchecks the other; unchecking leaves neither selected.
  [["cfgLocFromTeamA", "cfgLocFromTeamB"], ["cfgLocFromTeamB", "cfgLocFromTeamA"]].forEach(function (pair) {
    $(pair[0]).addEventListener("change", function () {
      if (this.checked) $(pair[1]).checked = false;
      syncLocationFromTeam();
    });
  });
  // Also auto-fill that team's remembered color (if any) when its name changes,
  // whether typed to an exact match or picked from the dropdown.
  $("cfgTeamA").addEventListener("input", function () {
    updateFirstServeBtnLabels();
    applyRememberedTeamColor("A");
    syncLocationFromTeam();
  });
  $("cfgTeamB").addEventListener("input", function () {
    updateFirstServeBtnLabels();
    applyRememberedTeamColor("B");
    syncLocationFromTeam();
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

  // Timeout and sub steppers
  wireStepper("btnToDown", "btnToUp", "cfgTimeouts", {
    get: function () { return setupTimeouts; }, set: function (v) { setupTimeouts = v; }, min: 0, max: 5
  });
  wireStepper("btnSubsDown", "btnSubsUp", "cfgSubs", {
    get: function () { return setupSubs; }, set: function (v) { setupSubs = v; }, min: 0, max: 18
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
  wireStepper("btnSetWinScoreDown", "btnSetWinScoreUp", "cfgSetWinScore", {
    get: function () { return setupSetWinScore; }, set: function (v) { setupSetWinScore = v; },
    min: 1, max: 50, onChange: updateScoringRuleInteractivity
  });
  wireStepper("btnSetWinByDown", "btnSetWinByUp", "cfgSetWinBy", {
    get: function () { return setupSetWinBy; }, set: function (v) { setupSetWinBy = v; }, min: 1, max: 10
  });
  $("chkSetWinCap").addEventListener("change", function () {
    if (this.checked && setupSetWinCap === 0) {
      setupSetWinCap = setupSetWinScore;
      $("cfgSetWinCap").textContent = setupSetWinCap;
    }
    updateScoringRuleInteractivity();
  });
  wireStepper("btnSetWinCapDown", "btnSetWinCapUp", "cfgSetWinCap", {
    get: function () { return setupSetWinCap; }, set: function (v) { setupSetWinCap = v; },
    min: function () { return setupSetWinScore; }, max: 60, onChange: updateScoringRuleInteractivity
  });

  // Scoring rule steppers — deciding set
  wireStepper("btnDeciderWinScoreDown", "btnDeciderWinScoreUp", "cfgDeciderWinScore", {
    get: function () { return setupDeciderWinScore; }, set: function (v) { setupDeciderWinScore = v; },
    min: 1, max: 50, onChange: updateScoringRuleInteractivity
  });
  wireStepper("btnDeciderWinByDown", "btnDeciderWinByUp", "cfgDeciderWinBy", {
    get: function () { return setupDeciderWinBy; }, set: function (v) { setupDeciderWinBy = v; }, min: 1, max: 10
  });
  $("chkDeciderWinCap").addEventListener("change", function () {
    if (this.checked && setupDeciderWinCap === 0) {
      setupDeciderWinCap = setupDeciderWinScore;
      $("cfgDeciderWinCap").textContent = setupDeciderWinCap;
    }
    updateScoringRuleInteractivity();
  });
  wireStepper("btnDeciderWinCapDown", "btnDeciderWinCapUp", "cfgDeciderWinCap", {
    get: function () { return setupDeciderWinCap; }, set: function (v) { setupDeciderWinCap = v; },
    min: function () { return setupDeciderWinScore; }, max: 60, onChange: updateScoringRuleInteractivity
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
  var locationFromTeam = $("cfgLocFromTeamA").checked ? "A" : ($("cfgLocFromTeamB").checked ? "B" : null);
  var location = locationFromTeam ? (locationFromTeam === "A" ? teamA : teamB) : $("cfgLocation").value.trim();
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
  autoAssociateWithLeague("teamLeagues", teamA, league);
  autoAssociateWithLeague("teamLeagues", teamB, league);
  autoAssociateWithLeague("ageCategoryLeagues", ageCategory, league);
  autoAssociateWithLeague("locationLeagues", location, league);

  // Snapshot this game's New Game form entries, used next time if "persist New
  // Game data" is on. Captured unconditionally so turning the setting on later
  // immediately has this game's data available rather than nothing at all.
  settings.lastGameSetup = {
    teamA: teamA, teamB: teamB, teamAColor: teamAColor, teamBColor: teamBColor,
    location: location, gender: gender, ageCategory: ageCategory, league: league,
    locationFromTeam: locationFromTeam,
    gameFormat: gameFormat, variation: variation, fairPlay: fairPlay,
    timeoutsPerSet: setupTimeouts, subsPerSet: setupSubs, firstServer: setupFirstServer,
    setWinScore: setupSetWinScore, setWinBy: setupSetWinBy, setWinCap: setupSetWinCap,
    deciderWinScore: setupDeciderWinScore, deciderWinBy: setupDeciderWinBy, deciderWinCap: setupDeciderWinCap,
  };
  saveSettings();

  controller.clear();
  controller.currentGameId = gameId;
  selectedLogSetFilter = null; // reset filter for new game
  sidesSwapped = !!settings.startMatchSidesSwapped;
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

