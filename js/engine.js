// ============================================================
// VolleyScore — js/engine.js  (Event timeline, derived game state, controller, auto-save, wake lock)
// Classic script: shares one global scope with the other js/*.js files.
// Load order is set by the <script> tags in index.html and listed in sw.js.
// © 2025 Jared Mathes — CC BY-NC-SA 4.0
// ============================================================

"use strict";

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
  var remarks = []; // match-wide, chronological — display numbering is derived from array position

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
        var sanList = pickTeam(ev.team, san.sanctionsA, san.sanctionsB);
        sanList.push({ type: ev.sanctionType, player: ev.playerNumber || null, role: ev.role || "player", timestamp: ev.timestamp });
        break;
      }
      case "DELAY_SANCTION": {
        var ds = getOrCreateSet(ev.setNumber);
        var dsList = pickTeam(ev.team, ds.delaySanctionsA, ds.delaySanctionsB);
        dsList.push({ type: ev.sanctionType, timestamp: ev.timestamp });
        break;
      }
      case "IMPROPER_REQUEST": {
        if (ev.team === "A") improperRequestA = true;
        else improperRequestB = true;
        break;
      }
      case "REMARK_ADDED": {
        // setNumber is explicitly null for post-match remarks (added after the
        // game ended, no set/score context applies) — preserve that distinction
        // rather than defaulting it to 0 like a real "before Set 1" remark.
        var remarkHasContext = ev.setNumber !== null && ev.setNumber !== undefined;
        remarks.push({
          id: ev.remarkId, text: ev.text, timestamp: ev.timestamp,
          setNumber: remarkHasContext ? ev.setNumber : null,
          scoreA: remarkHasContext ? (ev.scoreA || 0) : null,
          scoreB: remarkHasContext ? (ev.scoreB || 0) : null,
        });
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

  // The match "starts" when its first set starts, so a game can be set up in advance;
  // until then (or for a game with no sets) it falls back to when Start Game was tapped.
  var firstStartedSet = setsArray.find(function (s) { return s.startedAt; });
  var matchStartedAt = firstStartedSet ? firstStartedSet.startedAt : startEv.timestamp;

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
    startedAt: matchStartedAt,
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
    remarks: remarks,
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
    // > 1, not > 0 — undoing all the way back to (and past) GAME_STARTED leaves
    // deriveGameState with nothing to derive from, so it returns null; since
    // toRecord()/persistGame() also bail out on a null state, that "undo" never
    // actually gets saved, so a saved-then-reloaded game silently resurfaces
    // with the undo lost. Simplest fix: don't let Undo go there in the first
    // place — there's no real reason to "undo starting the game" anyway.
    canUndo: timeline.cursor > 1,
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

