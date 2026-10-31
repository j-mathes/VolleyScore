// ============================================================
// VolleyScore — js/scoreboard.js  (Main scoreboard render, toast, timeout and serve timers)
// Classic script: shares one global scope with the other js/*.js files.
// Load order is set by the <script> tags in index.html and listed in sw.js.
// © 2025 Jared Mathes — CC BY-NC-SA 4.0
// ============================================================

"use strict";

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
      : otherTeam(activeSet.firstServer);
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
      pendingServePickTeam = lastEndedSet ? otherTeam(lastEndedSet.firstServer) : "A";
    }
    $("servePickerChipTeam").textContent = teamLabel(state, pendingServePickTeam);
  } else if (canCorrectActiveServe) {
    $("servePickerSetNum").textContent = state.activeSetNumber;
    $("servePickerChipTeam").textContent = teamLabel(state, activeSet.firstServer);
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

  // Undo / Redo — Undo is disabled for completed games unless they were just ended.
  // Special case: cursor === 1 means only GAME_STARTED has happened (no set
  // started yet) — canUndo is false there (see deriveGameState), but the button
  // stays enabled anyway as a one-tap "cancel this accidental Start Game" action
  // (handled separately in the click handler) instead of a normal timeline undo.
  var canCancelFreshGame = state.cursor === 1 && !state.endedAt;
  $("btnUndo").disabled = (!state.canUndo && !canCancelFreshGame) || (!!state.endedAt && !_justEndedGame);
  $("btnUndo").innerHTML = canCancelFreshGame ? "&#8617; Undo Start" : "&#8617; Undo";
  $("btnUndo").title = canCancelFreshGame ? "Undo starting this game and return to setup" : "Undo last action";
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

  // Show/hide the Match Log / Remarks nav buttons
  $("navLogBtn").hidden = false;
  $("navRemarksBtn").hidden = false;
  $("navServeTimerBtn").hidden = currentPage !== "score";
  $("navServeTimerBtn").disabled = !hasActiveSet || isGameOver;
  if (!hasActiveSet || isGameOver) closeServeTimer();

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
    return firstServer === "B" ? otherTeam(letter) : letter;
  }
  var team   = flip(TB_PHASE_TEAMS[idx]);
  var type   = TB_PHASE_TYPES[idx];
  var toward = flip(TB_PHASE_TOWARD[idx]);
  var teamCls   = pickTeam(team, "tb-a", "tb-b");
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

// ---- Timeout Countdown Overlay ---------------------------

// Count-up only makes sense while the countdown timer itself is on.
function updateTimeoutTimerCountUpEnabled() {
  var on = !!settings.timeoutTimerEnabled;
  $("cfgTimeoutTimerCountUp").disabled = !on;
  $("rowTimeoutTimerCountUp").classList.toggle("setting-row-disabled", !on);
}

var _timeoutTimerInterval = null;
var _timeoutTimerAutoHideTimer = null;
var _timeoutTimerPaused = false;

// Shared by the timeout and serve timer overlays.
function syncPauseButton(btnId, paused) {
  var btn = $(btnId);
  btn.textContent = paused ? "Resume" : "Pause";
  btn.classList.toggle("active", paused);
  btn.setAttribute("aria-pressed", String(paused));
}

function restartPulse(countEl) {
  countEl.classList.remove("timeout-timer-pulse");
  void countEl.offsetWidth; // restart the CSS animation on every tick
  countEl.classList.add("timeout-timer-pulse");
}

function setTimeoutTimerPaused(paused) {
  _timeoutTimerPaused = paused;
  syncPauseButton("btnPauseTimeoutTimer", paused);
}

function startTimeoutCountdown(team) {
  if (!settings.timeoutTimerEnabled) return;
  var state = controller.getState();
  var teamName = state ? teamLabel(state, team) : ("Team " + team);
  var remaining = settings.timeoutTimerDuration || 60;

  clearTimeoutCountdown();

  // Score + timeout diamonds for both teams, placed left/right to match
  // whichever side of the court each team is currently shown on (sidesSwapped
  // mirrors the main scoreboard's panel order).
  var activeSet = state ? state.sets.find(function (s) { return s.setNumber === state.activeSetNumber; }) : null;
  var leftTeam = sidesSwapped ? "B" : "A";
  var rightTeam = sidesSwapped ? "A" : "B";
  var totalTimeouts = state ? state.effectiveTimeoutsPerSet : 0;
  function scoreFor(t) { return activeSet ? pickTeam(t, activeSet.scoreA, activeSet.scoreB) : 0; }
  function timeoutsUsedFor(t) { return activeSet ? pickTeam(t, activeSet.timeoutsA, activeSet.timeoutsB) : 0; }
  var scoreLeftEl = $("timeoutTimerScoreLeft");
  var scoreRightEl = $("timeoutTimerScoreRight");
  scoreLeftEl.textContent = scoreFor(leftTeam);
  scoreLeftEl.className = "timeout-timer-team-score timeout-timer-score-" + leftTeam.toLowerCase();
  scoreRightEl.textContent = scoreFor(rightTeam);
  scoreRightEl.className = "timeout-timer-team-score timeout-timer-score-" + rightTeam.toLowerCase();
  renderTimeoutDots("timeoutTimerDotsLeft", "", timeoutsUsedFor(leftTeam), totalTimeouts);
  renderTimeoutDots("timeoutTimerDotsRight", "", timeoutsUsedFor(rightTeam), totalTimeouts);

  var countEl = $("timeoutTimerCount");
  countEl.textContent = remaining;
  countEl.classList.remove("timeout-timer-done", "timeout-timer-pulse");
  setTimeoutTimerPaused(false);
  $("btnPauseTimeoutTimer").hidden = true;
  $("timeoutTimerTeam").textContent = teamName;
  $("timeoutTimerOverlay").removeAttribute("hidden");

  var overtime = 0;
  _timeoutTimerInterval = setInterval(function () {
    if (remaining <= 0) {
      if (_timeoutTimerPaused) return;
      overtime++;
      countEl.textContent = "\u2212" + overtime;
      restartPulse(countEl);
      return;
    }
    remaining--;
    if (remaining <= 0) {
      countEl.textContent = 0;
      countEl.classList.add("timeout-timer-done");
      if (settings.timeoutTimerCountUp) {
        $("btnPauseTimeoutTimer").hidden = false;
        return;
      }
      clearInterval(_timeoutTimerInterval);
      _timeoutTimerInterval = null;
      var hideMs = (settings.winToastDuration || 3) * 1000;
      _timeoutTimerAutoHideTimer = setTimeout(closeTimeoutCountdown, hideMs);
    } else {
      countEl.textContent = remaining;
    }
  }, 1000);
}

// Stops any running countdown/auto-hide timers without touching the overlay's visibility.
function clearTimeoutCountdown() {
  if (_timeoutTimerInterval) { clearInterval(_timeoutTimerInterval); _timeoutTimerInterval = null; }
  if (_timeoutTimerAutoHideTimer) { clearTimeout(_timeoutTimerAutoHideTimer); _timeoutTimerAutoHideTimer = null; }
}

function closeTimeoutCountdown() {
  clearTimeoutCountdown();
  var overlay = $("timeoutTimerOverlay");
  if (overlay) overlay.hidden = true;
}

// ---- Serve Timer (reference only — nothing is recorded) ----

var SERVE_TIMER_LIMIT = 8;
var SERVE_TIMER_AUTO_DISMISS = 20;
var _serveTimerInterval = null;
var _serveTimerPaused = false;

function setServeTimerPaused(paused) {
  _serveTimerPaused = paused;
  syncPauseButton("btnPauseServeTimer", paused);
}

function startServeTimer() {
  closeServeTimer();
  setServeTimerPaused(false);
  var count = 1; // a referee's count starts at 1, not 0
  var countEl = $("serveTimerCount");
  countEl.textContent = count;
  countEl.className = "timeout-timer-count serve-timer-count serve-timer-ok";
  $("serveTimerOverlay").hidden = false;

  _serveTimerInterval = setInterval(function () {
    if (_serveTimerPaused) return;
    count++;
    if (count >= SERVE_TIMER_AUTO_DISMISS) { closeServeTimer(); return; }
    countEl.textContent = count;
    if (count > SERVE_TIMER_LIMIT) {
      countEl.classList.remove("serve-timer-ok");
      countEl.classList.add("timeout-timer-done");
      restartPulse(countEl);
    }
  }, 1000);
}

function closeServeTimer() {
  if (_serveTimerInterval) { clearInterval(_serveTimerInterval); _serveTimerInterval = null; }
  var overlay = $("serveTimerOverlay");
  if (overlay) overlay.hidden = true;
}

