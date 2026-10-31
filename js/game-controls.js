// ============================================================
// VolleyScore — js/game-controls.js  (Score controls, sanctions, event log, remarks modals)
// Classic script: shares one global scope with the other js/*.js files.
// Load order is set by the <script> tags in index.html and listed in sw.js.
// © 2025 Jared Mathes — CC BY-NC-SA 4.0
// ============================================================

"use strict";

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

  // Timeout countdown overlay — dismiss, or undo if it was called by accident
  $("btnEndTimeoutTimer").addEventListener("click", closeTimeoutCountdown);
  $("btnPauseTimeoutTimer").addEventListener("click", function () {
    setTimeoutTimerPaused(!_timeoutTimerPaused);
  });
  $("btnUndoTimeoutTimer").addEventListener("click", function () {
    if (settings.confirmUndo && !confirm("Undo the timeout?")) return;
    controller.undo();
    renderScoreboard();
    closeTimeoutCountdown();
  });

  // Undo / Redo
  $("btnUndo").addEventListener("click", function () {
    var state = controller.getState();
    if (state && state.cursor === 1 && !state.endedAt) {
      // Nothing has actually happened yet (no set started) — this is an
      // accidental "Start Game" tap, not something to undo through the
      // normal timeline (see cancelJustStartedGame for why). No confirm()
      // here on purpose: the whole point is a fast one-tap way back out.
      void cancelJustStartedGame();
      return;
    }
    if (settings.confirmUndo && !confirm("Undo last action?")) return;
    controller.undo();
    renderScoreboard();
    closeTimeoutCountdown(); // an undone timeout shouldn't leave a stale countdown showing
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
        var mTeamName = teamLabel(stateAfterEnd, matchWinner);
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
      server = lastSet ? otherTeam(lastSet.firstServer) : "A";
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
    if (state.canUndo) { controller.undo(); renderScoreboard(); applyPointGlow(team, delta); }
    return;
  }
  // Don't allow score below 0
  var activeSet = state.sets.find(function (s) { return s.setNumber === state.activeSetNumber; });
  if (delta < 0 && activeSet) {
    if (pickTeam(team, activeSet.scoreA, activeSet.scoreB) <= 0) return;
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
  applyPointGlow(team, delta);
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
      applyActionGlow($(pickTeam(stateAfter.setWinnerTeam, "sbTeamAName", "sbTeamBName")));
      applyActionGlow($(pickTeam(stateAfter.setWinnerTeam, "scoreValA", "scoreValB")));
      var winTeamName = teamLabel(stateAfter, stateAfter.setWinnerTeam);
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
        var leaderName = teamLabel(stateAfter, leaderTeam);
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
  var used = pickTeam(team, activeSet.timeoutsA, activeSet.timeoutsB);
  if (used >= state.effectiveTimeoutsPerSet) {
    alert(teamLabel(state, team) + " has no timeouts remaining.");
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
  startTimeoutCountdown(team);
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
  var used = pickTeam(team, activeSet.subsA, activeSet.subsB);
  if (used >= state.subsPerSet) {
    alert(teamLabel(state, team) + " has no substitutions remaining.");
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
    return acc.concat(pickTeam(team, s.sanctionsA, s.sanctionsB));
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
    var ds = pickTeam(team, s.delaySanctionsA, s.delaySanctionsB);
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
  var teamName = state ? teamLabel(state, team) : ("Team " + team);
  $("sanctionTeamName").textContent = teamName;
  updatePlayerNumDisplay();

  // Reset role selector to Player
  document.querySelectorAll(".role-btn").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-role") === "player");
  });
  $("playerNumLabel").hidden = false;

  // Improper request — disable if already used
  var irUsed = !!(state && pickTeam(team, state.improperRequestA, state.improperRequestB));
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

// Award the opponent of `offender` a point + serve for a penalty. In triple ball, toast that the
// penalty replaces the current/next ball (captured before the point advances the sequence).
function awardPenaltyPoint(state, offender, midRallyLabel, label) {
  var tbPhase = (state.variation === "triplebal" && state.activeSetNumber) ? state.tripleBallPhase : -1;
  var isMidRally = tbPhase >= 0 && $("cbTbMidRally").checked;
  controller.dispatch({
    type: "POINT_SCORED",
    team: otherTeam(offender),
    setNumber: state.activeSetNumber,
    delta: 1,
    timestamp: new Date().toISOString(),
  });
  if (tbPhase >= 0) {
    if (isMidRally) {
      showToast("\uD83D\uDFE5 " + midRallyLabel + " \u2014 replaces \u201c" + TB_PHASE_LABELS[tbPhase] + "\u201d (current ball cancelled)");
    } else {
      showToast("\uD83D\uDFE5 " + label + " \u2014 replaces \u201c" + TB_PHASE_LABELS[tbPhase] + "\u201d (next ball in sequence)");
    }
  }
}

// Glow the newest chip (last in the bar) for the sanctioned team.
function glowNewestSanctionChip(team) {
  var bar = $("sanctionsBar" + team);
  if (!bar) return;
  var chips = bar.querySelectorAll(".sanction-chip");
  if (chips.length) applyActionGlow(chips[chips.length - 1]);
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
  if (stype === "red") awardPenaltyPoint(state, sanctionTargetTeam, "Mid-rally penalty", "Red card penalty");
  closeSanctionModal();
  renderScoreboard();
  glowNewestSanctionChip(glowTeam);
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
  if (dtype === "penalty") awardPenaltyPoint(state, sanctionTargetTeam, "Mid-rally delay penalty", "Delay penalty");
  closeSanctionModal();
  renderScoreboard();
  glowNewestSanctionChip(glowTeam);
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
             e.type === "REMARK_ADDED" ||
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
  var remarkNum = 0; // running 1-based count of REMARK_ADDED events seen so far

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
        '<span class="elr-detail">First serve: ' + esc(teamLabel(state, ev.firstServer)) + '</span>' +
        '</div>');
    } else if (ev.type === "FIRST_SERVER_CORRECTED") {
      rows.push('<div class="event-log-row event-log-system">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score">0 – 0</span>' +
        '<span class="elr-desc">Set ' + ev.setNumber + ' first serve corrected</span>' +
        '<span class="elr-detail">First serve: ' + esc(teamLabel(state, ev.firstServer)) + '</span>' +
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
      var teamName = teamLabel(state, ev.team);
      rows.push('<div class="event-log-row ' + rowClass + '">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score' + scoreClass + '">' + psc.A + ' – ' + psc.B + '</span>' +
        '<span class="elr-desc">' + esc(action) + '</span>' +
        '<span class="elr-detail">' + esc(teamName) + (leadChange ? ' — Lead' : '') + '</span>' +
        '</div>');
    } else if (ev.type === "TIMEOUT_TAKEN") {
      var tosc = getScore(ev.setNumber);
      var toTeam = teamLabel(state, ev.team);
      var rowClassTo = "event-log-team-" + ev.team.toLowerCase();
      rows.push('<div class="event-log-row ' + rowClassTo + '">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score">' + tosc.A + ' – ' + tosc.B + '</span>' +
        '<span class="elr-desc">Timeout</span>' +
        '<span class="elr-detail">' + esc(toTeam) + '</span>' +
        '</div>');
    } else if (ev.type === "SUBSTITUTION") {
      var subsc = getScore(ev.setNumber);
      var subTeam = teamLabel(state, ev.team);
      var rowClassSub = "event-log-team-" + ev.team.toLowerCase();
      rows.push('<div class="event-log-row ' + rowClassSub + '">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score">' + subsc.A + ' – ' + subsc.B + '</span>' +
        '<span class="elr-desc">Substitution</span>' +
        '<span class="elr-detail">' + esc(subTeam) + '</span>' +
        '</div>');
    } else if (ev.type === "SANCTION") {
      var sansc = getScore(ev.setNumber);
      var sanTeam = teamLabel(state, ev.team);
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
      var dsTeam = teamLabel(state, ev.team);
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
      var irTeam = teamLabel(state, ev.team);
      var irRowClass = "event-log-team-" + ev.team.toLowerCase();
      rows.push('<div class="event-log-row ' + irRowClass + '">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score">' + irsc.A + ' \u2013 ' + irsc.B + '</span>' +
        '<span class="elr-desc">Improper Request</span>' +
        '<span class="elr-detail">' + esc(irTeam) + '</span>' +
        '</div>');
    } else if (ev.type === "SERVE_CHANGED") {
      var seTeam = teamLabel(state, ev.team);
      var seRowClass = "event-log-team-" + ev.team.toLowerCase();
      rows.push('<div class="event-log-row ' + seRowClass + '">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score"></span>' +
        '<span class="elr-desc">Serve changed</span>' +
        '<span class="elr-detail">' + esc(seTeam) + ' serves</span>' +
        '</div>');
    } else if (ev.type === "REMARK_ADDED") {
      remarkNum++;
      rows.push('<div class="event-log-row event-log-system event-log-remark">' +
        '<span class="elr-time">' + esc(time) + '</span>' +
        '<span class="elr-score">' + (ev.scoreA || 0) + ' \u2013 ' + (ev.scoreB || 0) + '</span>' +
        '<span class="elr-desc">Remark ' + remarkNum + '</span>' +
        '<span class="elr-detail">' + esc(ev.text) + '</span>' +
        '</div>');
    }
  }

  return rows.join("") || '<div class="event-log-empty">No events recorded yet.</div>';
}

// ---- Remarks Modal (live game notepad) -------------------

// Set/score context captured at the moment a remark is added: while a set is
// active, its live score; before the first set (or between sets), the score
// is 0-0 and the set number is the count of sets completed so far (0, 1, ...).
function currentRemarkContext(state) {
  if (!state) return { setNumber: 0, scoreA: 0, scoreB: 0 };
  if (state.activeSetNumber) {
    var activeSet = state.sets.find(function (s) { return s.setNumber === state.activeSetNumber; });
    return {
      setNumber: state.activeSetNumber,
      scoreA: activeSet ? activeSet.scoreA : 0,
      scoreB: activeSet ? activeSet.scoreB : 0,
    };
  }
  return { setNumber: state.sets.length, scoreA: 0, scoreB: 0 };
}

function remarkContextLabel(setNumber, scoreA, scoreB) {
  if (setNumber === null || setNumber === undefined) return "Post-Match";
  return "Set " + setNumber + " \u2013 (A) " + scoreA + " - " + scoreB + " (B)";
}

// Post-match remarks (added well after the match itself) show the date
// alongside the time, since they aren't necessarily same-day; live in-match
// remarks only need the time. timeFormatter is whichever time-only formatter
// the caller already uses (formatTime / formatTime24).
function remarkTimeLabel(r, timeFormatter) {
  var timeStr = timeFormatter(r.timestamp);
  if (r.setNumber === null || r.setNumber === undefined) {
    return formatDateYMD(r.timestamp) + " " + timeStr;
  }
  return timeStr;
}

function addRemark(text) {
  var trimmed = (text || "").trim();
  if (!trimmed || !controller.currentGameId) return;
  var ctx = currentRemarkContext(controller.getState());
  controller.dispatch({
    type: "REMARK_ADDED",
    remarkId: crypto.randomUUID(),
    text: trimmed,
    timestamp: new Date().toISOString(),
    setNumber: ctx.setNumber,
    scoreA: ctx.scoreA,
    scoreB: ctx.scoreB,
  });
}

function buildRemarksModalListHtml(remarks) {
  if (!remarks.length) return '<div class="remarks-modal-empty">No remarks yet.</div>';
  return remarks.map(function (r, i) {
    return '<div class="remark-row">' +
      '<span class="remark-num">' + (i + 1) + '.</span>' +
      '<span class="remark-time">' + esc(remarkTimeLabel(r, formatTime)) + '</span>' +
      '<span class="remark-context">' + esc(remarkContextLabel(r.setNumber, r.scoreA, r.scoreB)) + '</span>' +
      '<span class="remark-text">' + esc(r.text) + '</span>' +
      '</div>';
  }).join("");
}

function renderRemarksModalList() {
  var state = controller.getState();
  var list = $("remarksModalList");
  if (list) list.innerHTML = buildRemarksModalListHtml((state && state.remarks) || []);
}

function openRemarksModal() {
  renderRemarksModalList();
  $("remarksModalInput").value = "";
  $("remarksPresetPanel").hidden = true;
  $("remarksModal").removeAttribute("hidden");
  $("remarksModalInput").focus();
}

function closeRemarksModal() {
  $("remarksModal").hidden = true;
}

// ---- Remark Fill-In modal (resolves {TEAM}/{PLAYER}/{STAFF} placeholders) -
var _remarkFillRawText = "";
var _remarkFillTeam = null;
var _remarkFillPlayers = []; // [{role:"player", number:""}, ...] one per {PLAYER}/{STAFF} occurrence, in order

// tokenTypes: array of "PLAYER" | "STAFF", one per occurrence in the preset,
// in the order they appear — {PLAYER} sections skip the role picker entirely
// (jersey number only); {STAFF} sections show the full role picker.
function buildRemarkFillPlayersHtml(tokenTypes) {
  var digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  var totalOfType = { PLAYER: 0, STAFF: 0 };
  tokenTypes.forEach(function (t) { totalOfType[t]++; });
  var seenOfType = { PLAYER: 0, STAFF: 0 };
  var html = "";
  tokenTypes.forEach(function (type, i) {
    seenOfType[type]++;
    var baseLabel = type === "STAFF" ? "Staff" : "Player";
    var label = totalOfType[type] > 1 ? (baseLabel + " " + seenOfType[type]) : baseLabel;
    var showRoles = type === "STAFF";
    html += '<div class="modal-section">' +
      '<h4 class="modal-section-title">' + esc(label) + '</h4>';
    if (showRoles) {
      html += '<div class="role-btns rf-role-btns">' +
        '<button type="button" class="role-btn rf-role-btn active" data-role="player" data-player-index="' + i + '">Player</button>' +
        '<button type="button" class="role-btn rf-role-btn" data-role="head_coach" data-player-index="' + i + '">Head Coach</button>' +
        '<button type="button" class="role-btn rf-role-btn" data-role="asst_coach" data-player-index="' + i + '">Asst. Coach</button>' +
        '<button type="button" class="role-btn rf-role-btn" data-role="trainer" data-player-index="' + i + '">Trainer</button>' +
        '<button type="button" class="role-btn rf-role-btn" data-role="medical" data-player-index="' + i + '">Medical</button>' +
        '</div>';
    }
    html += '<div class="player-num-pad rf-num-pad" data-player-index="' + i + '">' +
      '<div class="num-pad-header"><span class="num-pad-label">' + (showRoles ? "Player #" : "Number") + '</span>' +
      '<span class="num-pad-display rf-num-display" data-player-index="' + i + '">\u2014</span></div>' +
      '<div class="num-pad-buttons">' +
      digits.map(function (d) {
        return '<button type="button" class="npb rf-npb" data-digit="' + d + '" data-player-index="' + i + '">' + d + '</button>';
      }).join("") +
      '<button type="button" class="npb npb-del rf-npb-del" data-player-index="' + i + '" aria-label="Delete digit">&#x232B;</button>' +
      '</div></div></div>';
  });
  return html;
}

function updateRemarkFillPlayerDisplay(idx) {
  var el = document.querySelector('.rf-num-display[data-player-index="' + idx + '"]');
  if (el) el.textContent = _remarkFillPlayers[idx].number || "\u2014";
}

function updateRemarkFillInsertEnabled() {
  var needsTeam = _remarkFillRawText.indexOf("{TEAM}") !== -1;
  var teamOk = !needsTeam || !!_remarkFillTeam;
  var playersOk = _remarkFillPlayers.every(function (p) { return p.role !== "player" || p.number.length > 0; });
  $("btnRemarkFillInsert").disabled = !(teamOk && playersOk);
}

function openRemarkFillModal(rawText) {
  _remarkFillRawText = rawText;
  _remarkFillTeam = null;
  var state = controller.getState();
  var needsTeam = rawText.indexOf("{TEAM}") !== -1;
  $("remarkFillTeamSection").hidden = !needsTeam;
  $("rfTeamBtnA").textContent = state ? state.teamA : "Team A";
  $("rfTeamBtnB").textContent = state ? state.teamB : "Team B";
  document.querySelectorAll(".rf-team-btn").forEach(function (b) { b.classList.remove("active"); });

  var tokenTypes = (rawText.match(REMARK_PERSON_TOKEN_RE) || []).map(function (m) { return m === "{STAFF}" ? "STAFF" : "PLAYER"; });
  _remarkFillPlayers = tokenTypes.map(function () { return { role: "player", number: "" }; });
  $("remarkFillPlayersContainer").innerHTML = buildRemarkFillPlayersHtml(tokenTypes);

  updateRemarkFillInsertEnabled();
  $("remarkFillModal").removeAttribute("hidden");
}

function closeRemarkFillModal() {
  $("remarkFillModal").hidden = true;
}

function insertRemarkFill() {
  var state = controller.getState();
  var resolved = resolveAutoRemarkTokens(_remarkFillRawText, state, _remarkFillTeam);
  resolved = resolvePlayerRemarkTokens(resolved, _remarkFillPlayers);
  var input = $("remarksModalInput");
  input.value = resolved;
  closeRemarkFillModal();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function wireRemarkFillModal() {
  $("btnCloseRemarkFillModal").addEventListener("click", closeRemarkFillModal);
  $("remarkFillModal").addEventListener("click", function (e) {
    if (e.target === $("remarkFillModal")) { closeRemarkFillModal(); return; }

    var teamBtn = e.target.closest(".rf-team-btn");
    if (teamBtn) {
      _remarkFillTeam = teamBtn.getAttribute("data-team");
      document.querySelectorAll(".rf-team-btn").forEach(function (b) { b.classList.toggle("active", b === teamBtn); });
      updateRemarkFillInsertEnabled();
      return;
    }
    var roleBtn = e.target.closest(".rf-role-btn");
    if (roleBtn) {
      var idx = parseInt(roleBtn.getAttribute("data-player-index"), 10);
      _remarkFillPlayers[idx].role = roleBtn.getAttribute("data-role");
      roleBtn.closest(".rf-role-btns").querySelectorAll(".rf-role-btn").forEach(function (b) { b.classList.toggle("active", b === roleBtn); });
      var numPad = document.querySelector('.rf-num-pad[data-player-index="' + idx + '"]');
      if (numPad) numPad.hidden = _remarkFillPlayers[idx].role !== "player";
      updateRemarkFillInsertEnabled();
      return;
    }
    var digitBtn = e.target.closest(".rf-npb[data-digit]");
    if (digitBtn) {
      var idx2 = parseInt(digitBtn.getAttribute("data-player-index"), 10);
      if (_remarkFillPlayers[idx2].number.length < 2) {
        _remarkFillPlayers[idx2].number += digitBtn.getAttribute("data-digit");
        updateRemarkFillPlayerDisplay(idx2);
        updateRemarkFillInsertEnabled();
      }
      return;
    }
    var delBtn = e.target.closest(".rf-npb-del");
    if (delBtn) {
      var idx3 = parseInt(delBtn.getAttribute("data-player-index"), 10);
      _remarkFillPlayers[idx3].number = _remarkFillPlayers[idx3].number.slice(0, -1);
      updateRemarkFillPlayerDisplay(idx3);
      updateRemarkFillInsertEnabled();
      return;
    }
  });
  $("btnRemarkFillInsert").addEventListener("click", insertRemarkFill);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("remarkFillModal").hidden) closeRemarkFillModal();
  });
}

// Renders the pick-a-preset panel inside the live Remarks modal (not the Setup editor).
function renderRemarksPresetPickerList() {
  var container = $("remarksPresetList");
  var presets = settings.remarkPresets || [];
  if (!presets.length) {
    container.innerHTML = '<div class="remarks-modal-empty">No pre-defined remarks yet. Add some in Setup \u2192 Pre-defined Remarks.</div>';
    return;
  }
  container.innerHTML = presets.map(function (text, i) {
    return '<button type="button" class="remarks-preset-pick-btn" data-index="' + i + '">' + esc(text) + '</button>';
  }).join("");
}

function wireRemarksModal() {
  $("navRemarksBtn").addEventListener("click", openRemarksModal);
  $("navServeTimerBtn").addEventListener("click", startServeTimer);
  $("btnEndServeTimer").addEventListener("click", closeServeTimer);
  $("btnPauseServeTimer").addEventListener("click", function () {
    setServeTimerPaused(!_serveTimerPaused);
  });
  $("btnCloseRemarksModal").addEventListener("click", closeRemarksModal);
  $("remarksModal").addEventListener("click", function (e) {
    if (e.target === $("remarksModal")) closeRemarksModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("remarksModal").hidden) closeRemarksModal();
  });
  $("btnAddRemark").addEventListener("click", function () {
    var input = $("remarksModalInput");
    if (!input.value.trim()) return;
    addRemark(input.value);
    input.value = "";
    renderRemarksModalList();
    renderEventLog();
    // If the Games page detail panel happens to be showing this same in-progress
    // game, keep its Remarks section in sync too.
    if (selectedDetailGameId === controller.currentGameId) renderDetailRemarks(controller.getState());
    input.focus();
  });

  // Choose-from-list toggle + picking a preset just fills the textarea (doesn't
  // add it directly) so the referee can still tweak the wording before submitting.
  $("btnPickRemarkPreset").addEventListener("click", function () {
    var panel = $("remarksPresetPanel");
    panel.hidden = !panel.hidden;
    if (!panel.hidden) renderRemarksPresetPickerList();
  });
  $("remarksPresetList").addEventListener("click", function (e) {
    var btn = e.target.closest(".remarks-preset-pick-btn");
    if (!btn) return;
    var presets = settings.remarkPresets || [];
    var text = presets[parseInt(btn.getAttribute("data-index"), 10)];
    if (text === undefined) return;
    $("remarksPresetPanel").hidden = true;
    if (remarkPresetNeedsFillIn(text)) {
      openRemarkFillModal(text);
      return;
    }
    var input = $("remarksModalInput");
    input.value = resolveAutoRemarkTokens(text, controller.getState(), null);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
}

