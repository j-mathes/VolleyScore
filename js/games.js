// ============================================================
// VolleyScore — js/games.js  (Match log page, recent games, Games page, Edit Match Info)
// Classic script: shares one global scope with the other js/*.js files.
// Load order is set by the <script> tags in index.html and listed in sw.js.
// © 2025 Jared Mathes — CC BY-NC-SA 4.0
// ============================================================

"use strict";

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
    // Actual start (first set's start) takes priority over the pre-configured scheduled time
    var dateStr = formatDateTimeShort(g.startedAt || g.createdAt || g.scheduledAt || g.updatedAt);
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
var _detailRemarksEditMode = false; // toggled via the pencil icon in the Remarks section

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
    // Actual start (first set's start) takes priority over the pre-configured scheduled time
    var dateStr = formatDateTimeShort(g.startedAt || g.createdAt || g.scheduledAt || g.updatedAt);

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
  if (gameId !== selectedDetailGameId) _detailRemarksEditMode = false; // reset only on a real navigation, not a re-render after saving an edit
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

  // Remarks
  renderDetailRemarks(state);
}

function clearGameDetail() {
  selectedDetailGameId = null;
  selectedDetailSetFilter = null;
  _detailState = null;
  _detailTimeline = null;
  _detailRemarksEditMode = false;
  $("gameDetailPlaceholder").hidden = false;
  $("gameDetailContent").hidden = true;
}

function renderDetailRemarks(state) {
  var body = $("detailRemarksBody");
  if (!body) return;
  var remarks = (state && state.remarks) || [];
  var editBtn = $("btnEditRemarks");
  if (editBtn) editBtn.classList.toggle("active", _detailRemarksEditMode);
  var addBox = $("detailRemarksAdd");
  if (addBox) addBox.hidden = !(state && state.endedAt && _detailRemarksEditMode);

  if (!remarks.length) {
    body.innerHTML = '<div class="event-log-empty">No remarks recorded.</div>';
    return;
  }

  body.innerHTML = remarks.map(function (r, i) {
    var num = (i + 1) + ".";
    var time = esc(remarkTimeLabel(r, formatTime));
    var context = esc(remarkContextLabel(r.setNumber, r.scoreA, r.scoreB));
    if (_detailRemarksEditMode) {
      return '<div class="remark-row remark-row-editing">' +
        '<span class="remark-num">' + num + '</span>' +
        '<span class="remark-time">' + time + '</span>' +
        '<span class="remark-context">' + context + '</span>' +
        '<textarea class="remark-edit-input" data-remark-id="' + esc(r.id) + '">' + esc(r.text) + '</textarea>' +
        '<div class="remark-edit-actions">' +
        '<button class="remark-delete-btn ctrl-btn danger-btn" type="button" data-remark-id="' + esc(r.id) + '">Delete</button>' +
        '<button class="remark-save-btn ctrl-btn" type="button" data-remark-id="' + esc(r.id) + '">Save</button>' +
        '</div>' +
        '</div>';
    }
    return '<div class="remark-row">' +
      '<span class="remark-num">' + num + '</span>' +
      '<span class="remark-time">' + time + '</span>' +
      '<span class="remark-context">' + context + '</span>' +
      '<span class="remark-text">' + esc(r.text) + '</span>' +
      '</div>';
  }).join("");
}

// Adds a remark after the fact (typically once a game has ended) — no set/score
// context applies, so setNumber/scoreA/scoreB are left null; remarkContextLabel
// renders that as "Post-Match" instead of a set/score line. Timestamp is always
// the real moment the remark is added, same as a live in-game remark.
async function addPostMatchRemark(gameId, text) {
  var trimmed = (text || "").trim();
  if (!trimmed || !gameId) return;
  var newEvent = {
    type: "REMARK_ADDED",
    remarkId: crypto.randomUUID(),
    text: trimmed,
    timestamp: new Date().toISOString(),
    setNumber: null,
    scoreA: null,
    scoreB: null,
  };
  // Always mutate a fresh disk load (not controller.timeline directly) so this
  // can never silently overwrite events that exist on disk but not yet in an
  // out-of-sync in-memory controller (e.g. after an import); re-hydrate the
  // controller afterward if this happens to be the active game, to match.
  var record = await dbLoadGame(gameId);
  if (!record) return;
  var events = record.events || [];
  var cursor = record.cursor != null ? record.cursor : events.length;
  var kept = events.slice(0, cursor);
  kept.push(newEvent);
  record.events = kept;
  record.cursor = kept.length;
  await dbSaveGame(record);
  if (gameId === controller.currentGameId) controller.hydrate(record);
  if (selectedDetailGameId === gameId) await selectDetailGame(gameId);
}

// Edits a remark's text in place (post-hoc correction, mirrors saveMatchInfoEdits).
// Deliberately does NOT re-render the Game Detail panel itself — the caller
// controls that timing so a brief "Saved!" confirmation can stay on screen.
async function saveRemarkEdit(gameId, remarkId, newText) {
  function applyEdit(events) {
    var ev = events.find(function (e) { return e.type === "REMARK_ADDED" && e.remarkId === remarkId; });
    if (ev) ev.text = newText;
  }
  var record = await dbLoadGame(gameId);
  if (!record) return;
  applyEdit(record.events || []);
  await dbSaveGame(record);
  if (gameId === controller.currentGameId) controller.hydrate(record);
}

// Removes a REMARK_ADDED event outright; shifts cursor down by 1 if the
// deleted event was at or before it, so undo/redo positioning stays correct.
function deleteRemarkFromEvents(events, cursor, remarkId) {
  var idx = events.findIndex(function (e) { return e.type === "REMARK_ADDED" && e.remarkId === remarkId; });
  if (idx === -1) return cursor;
  events.splice(idx, 1);
  return idx < cursor ? cursor - 1 : cursor;
}

// Deletes a remark entirely (post-hoc correction, e.g. added by mistake)
async function deleteRemark(gameId, remarkId) {
  var record = await dbLoadGame(gameId);
  if (!record) return;
  record.events = record.events || [];
  record.cursor = deleteRemarkFromEvents(record.events, record.cursor != null ? record.cursor : record.events.length, remarkId);
  await dbSaveGame(record);
  if (gameId === controller.currentGameId) controller.hydrate(record);
  if (selectedDetailGameId === gameId) await selectDetailGame(gameId);
}

// ---- Edit Match Info (post-hoc correction for finished/in-progress games) --

var _emiGameId = null; // gameId currently open in the Edit Match Info modal
var _emiRecord = null; // record loaded fresh from storage when the modal opened
var _emiEvents = null; // working copy of its events (up to the cursor); edited here, written on Save
var _emiEventsDirty = false;

var EMI_KIND_LABEL = {
  yellow: "Warning", red: "Penalty", expulsion: "Expulsion", disqualification: "Disqualification",
  "delay-warning": "Delay Warning", "delay-penalty": "Delay Penalty", improper: "Improper Request",
};

function emiState() {
  return deriveGameState({ events: _emiEvents, cursor: _emiEvents.length });
}

function emiTeamName(team) {
  var raw = $(pickTeam(team, "emiTeamA", "emiTeamB")).value.trim();
  return raw || ("Team " + team);
}

async function openEditMatchInfoModal(gameId) {
  var record = await dbLoadGame(gameId);
  if (!record) return;
  var cursor = record.cursor != null ? record.cursor : (record.events || []).length;
  var events = JSON.parse(JSON.stringify((record.events || []).slice(0, cursor)));
  var state = deriveGameState({ events: events, cursor: events.length });
  if (!state) return;
  _emiGameId = gameId;
  _emiRecord = record;
  _emiEvents = events;
  _emiEventsDirty = false;
  $("emiTeamA").value = state.teamA || "";
  $("emiTeamB").value = state.teamB || "";
  $("emiLocation").value = state.location || "";
  $("emiGender").value = state.gender || "";
  $("emiAgeCategory").value = state.ageCategory || "";
  $("emiLeague").value = state.league || "";
  $("emiTeamAColor").value = state.teamAColor || settings.teamAColor;
  $("emiTeamBColor").value = state.teamBColor || settings.teamBColor;
  syncColorSwatchButtons();
  $("emiStartedAt").value = state.startedAt ? toLocalDatetimeValue(new Date(state.startedAt)) : "";
  $("emiNewRemark").value = "";
  renderEmiRemarks();
  populateEmiSanctionForm();
  renderEmiSanctions();
  $("editMatchInfoModal").removeAttribute("hidden");
}

function closeEditMatchInfoModal() {
  _emiGameId = null;
  _emiRecord = null;
  _emiEvents = null;
  _emiEventsDirty = false;
  $("editMatchInfoModal").hidden = true;
}

// ---- Edit Match Info: remarks ----

function renderEmiRemarks() {
  var rows = [];
  _emiEvents.forEach(function (ev) {
    if (ev.type !== "REMARK_ADDED") return;
    var hasCtx = ev.setNumber !== null && ev.setNumber !== undefined;
    var time = remarkTimeLabel({ timestamp: ev.timestamp, setNumber: ev.setNumber }, formatTime);
    var ctx = remarkContextLabel(hasCtx ? ev.setNumber : null, ev.scoreA || 0, ev.scoreB || 0);
    rows.push(
      '<div class="remark-row remark-row-editing">' +
      '<span class="remark-time">' + esc(time) + ' &middot; ' + esc(ctx) + '</span>' +
      '<textarea class="remark-edit-input emi-remark-text" rows="2" data-remark-id="' + esc(ev.remarkId) + '">' + esc(ev.text) + '</textarea>' +
      '<div class="remark-edit-actions"><button class="remark-delete-btn ctrl-btn danger-btn emi-remark-delete" type="button" data-remark-id="' + esc(ev.remarkId) + '">Delete</button></div>' +
      '</div>');
  });
  $("emiRemarksList").innerHTML = rows.join("") || '<div class="event-log-empty">No remarks recorded.</div>';
}

function addEmiRemark() {
  var text = $("emiNewRemark").value.trim();
  if (!text) return;
  var state = emiState();
  // Same convention as the Game Detail "add after the match" box: once the game has ended there's no set/score to attach.
  var ctx = state.endedAt ? { setNumber: null, scoreA: null, scoreB: null } : currentRemarkContext(state);
  _emiEvents.push({
    type: "REMARK_ADDED",
    remarkId: crypto.randomUUID(),
    text: text,
    timestamp: new Date().toISOString(),
    setNumber: ctx.setNumber,
    scoreA: ctx.scoreA,
    scoreB: ctx.scoreB,
  });
  _emiEventsDirty = true;
  $("emiNewRemark").value = "";
  renderEmiRemarks();
}

// ---- Edit Match Info: sanctions ----

// Walks the working events, tracking each set's running score, and lists every sanction-type event.
function emiSanctionRows() {
  var scores = {};
  var rows = [];
  _emiEvents.forEach(function (ev, idx) {
    if (ev.type === "SET_STARTED") {
      scores[ev.setNumber] = { a: 0, b: 0 };
    } else if (ev.type === "POINT_SCORED") {
      var s = scores[ev.setNumber] || (scores[ev.setNumber] = { a: 0, b: 0 });
      if (ev.team === "A") s.a = Math.max(0, s.a + ev.delta);
      else s.b = Math.max(0, s.b + ev.delta);
    } else if (ev.type === "SANCTION" || ev.type === "DELAY_SANCTION" || ev.type === "IMPROPER_REQUEST") {
      var cur = scores[ev.setNumber] || { a: 0, b: 0 };
      rows.push({ idx: idx, ev: ev, a: cur.a, b: cur.b });
    }
  });
  return rows;
}

function emiSanctionLabel(ev) {
  var kind;
  if (ev.type === "SANCTION") kind = EMI_KIND_LABEL[ev.sanctionType] || ev.sanctionType;
  else if (ev.type === "DELAY_SANCTION") kind = ev.sanctionType === "penalty" ? "Delay Penalty" : "Delay Warning";
  else kind = "Improper Request";
  var who = "";
  if (ev.type === "SANCTION") {
    who = " \u2014 " + (ROLE_LABEL[ev.role] || "Player") + (ev.role === "player" && ev.playerNumber ? " #" + ev.playerNumber : "");
  }
  return kind + who;
}

function renderEmiSanctions() {
  var rows = emiSanctionRows().map(function (r) {
    var team = emiTeamName(r.ev.team);
    return '<div class="emi-row">' +
      '<span class="emi-row-text"><strong>' + esc(team) + '</strong> \u2014 ' + esc(emiSanctionLabel(r.ev)) +
      ' <span class="remark-context">(Set ' + esc(r.ev.setNumber) + ', ' + r.a + '\u2013' + r.b + ')</span></span>' +
      '<button class="emi-edit-btn" type="button" data-idx="' + r.idx + '" aria-label="Edit this sanction" title="Edit this sanction">&#9998;</button>' +
      '<button class="emi-remove-btn" type="button" data-idx="' + r.idx + '" aria-label="Remove this sanction" title="Remove this sanction">&times;</button>' +
      '</div>';
  });
  $("emiSanctionsList").innerHTML = rows.join("") || '<div class="event-log-empty">No sanctions recorded.</div>';
  var teamSel = $("emiSanTeam");
  var chosen = teamSel.value || "A";
  teamSel.innerHTML = '<option value="A">' + esc(emiTeamName("A")) + '</option><option value="B">' + esc(emiTeamName("B")) + '</option>';
  teamSel.value = chosen;
}

function updateEmiSanctionFormVisibility() {
  var kind = $("emiSanKind").value;
  var misconduct = kind === "yellow" || kind === "red" || kind === "expulsion" || kind === "disqualification";
  $("emiSanRole").hidden = !misconduct;
  $("emiSanPlayer").hidden = !misconduct || $("emiSanRole").value !== "player";
}

var _emiEditingSanIdx = null; // index in _emiEvents of the sanction being edited, or null when adding

// Resets and hides the sanction form; "Add Sanction" is only usable once a set has started.
function populateEmiSanctionForm() {
  _emiEditingSanIdx = null;
  $("emiSanForm").hidden = true;
  $("btnEmiAddSanction").hidden = false;
  $("btnEmiAddSanction").disabled = !emiState().sets.length;
}

// idx === null opens a blank form (score 0–0 so it's obvious the user must set it);
// otherwise loads that sanction into the form for editing.
function openEmiSanctionForm(idx) {
  var state = emiState();
  _emiEditingSanIdx = idx;
  renderEmiSanctions();
  $("emiSanSet").innerHTML = state.sets.map(function (s) {
    return '<option value="' + s.setNumber + '">Set ' + s.setNumber + '</option>';
  }).join("");

  if (idx === null) {
    $("emiSanTeam").value = "A";
    $("emiSanKind").value = "yellow";
    $("emiSanRole").value = "player";
    $("emiSanPlayer").value = "";
    $("emiSanSet").value = String(state.sets[state.sets.length - 1].setNumber);
    $("emiSanScoreA").value = 0;
    $("emiSanScoreB").value = 0;
  } else {
    var ev = _emiEvents[idx];
    var row = emiSanctionRows().find(function (r) { return r.idx === idx; });
    $("emiSanTeam").value = ev.team;
    if (ev.type === "SANCTION") $("emiSanKind").value = ev.sanctionType;
    else if (ev.type === "DELAY_SANCTION") $("emiSanKind").value = "delay-" + ev.sanctionType;
    else $("emiSanKind").value = "improper";
    $("emiSanRole").value = ev.role || "player";
    $("emiSanPlayer").value = ev.playerNumber || "";
    $("emiSanSet").value = String(ev.setNumber);
    $("emiSanScoreA").value = row ? row.a : 0;
    $("emiSanScoreB").value = row ? row.b : 0;
  }
  $("btnEmiSaveSanction").textContent = idx === null ? "Add" : "Update";
  updateEmiSanctionFormVisibility();
  $("emiSanForm").hidden = false;
  $("btnEmiAddSanction").hidden = true;
}

// Where to put a new sanction so the Game Report/Match Log show it at the right score:
// right after the point that made the set score a–b, else at the end of that set.
function emiFindSanctionInsertion(setNumber, a, b) {
  var scoreA = 0, scoreB = 0, matchIdx = -1, endIdx = -1, lastIdx = -1;
  _emiEvents.forEach(function (ev, i) {
    if (ev.setNumber !== setNumber) return;
    lastIdx = i;
    if (ev.type === "SET_STARTED") {
      scoreA = 0; scoreB = 0;
    } else if (ev.type === "POINT_SCORED") {
      if (ev.team === "A") scoreA = Math.max(0, scoreA + ev.delta);
      else scoreB = Math.max(0, scoreB + ev.delta);
    } else if (ev.type === "SET_ENDED") {
      endIdx = i;
    }
    if (matchIdx === -1 && ev.type !== "SET_ENDED" && scoreA === a && scoreB === b) matchIdx = i;
  });
  if (matchIdx !== -1) return { index: matchIdx + 1, timestamp: _emiEvents[matchIdx].timestamp, exact: true };
  if (endIdx !== -1) return { index: endIdx, timestamp: _emiEvents[endIdx].timestamp, exact: false };
  return { index: lastIdx + 1, timestamp: lastIdx >= 0 ? _emiEvents[lastIdx].timestamp : new Date().toISOString(), exact: false };
}

function saveEmiSanction() {
  var editIdx = _emiEditingSanIdx;
  // Rules are checked against every sanction except the one being edited.
  var baseEvents = editIdx === null ? _emiEvents : _emiEvents.filter(function (e, i) { return i !== editIdx; });
  var state = deriveGameState({ events: baseEvents, cursor: baseEvents.length });
  var team = $("emiSanTeam").value || "A";
  var kind = $("emiSanKind").value;
  var setNumber = parseInt($("emiSanSet").value, 10);
  var scoreA = Math.max(0, parseInt($("emiSanScoreA").value, 10) || 0);
  var scoreB = Math.max(0, parseInt($("emiSanScoreB").value, 10) || 0);
  if (!setNumber) return;

  var ev;
  if (kind === "improper") {
    if (pickTeam(team, state.improperRequestA, state.improperRequestB)) {
      alert("This team has already used its improper request.");
      return;
    }
    ev = { type: "IMPROPER_REQUEST", team: team, setNumber: setNumber };
  } else if (kind === "delay-warning" || kind === "delay-penalty") {
    if (kind === "delay-warning" && !canIssueDelayWarning(team, state)) {
      alert("This team has already received a delay warning. Use a delay penalty.");
      return;
    }
    ev = { type: "DELAY_SANCTION", team: team, sanctionType: kind === "delay-warning" ? "warning" : "penalty", setNumber: setNumber };
  } else {
    var role = $("emiSanRole").value;
    var player = role === "player" ? ($("emiSanPlayer").value.trim() || null) : null;
    var avail = getMisconductAvailability(team, role, player || "", state);
    if (!avail[kind]) {
      alert("That sanction isn't allowed here: an earlier sanction for this team or person means it must be a higher level (or the team already has its one warning).");
      return;
    }
    ev = { type: "SANCTION", team: team, sanctionType: kind, role: role, playerNumber: player, setNumber: setNumber };
  }

  var oldRow = editIdx === null ? null : emiSanctionRows().find(function (r) { return r.idx === editIdx; });
  if (oldRow && oldRow.ev.setNumber === setNumber && oldRow.a === scoreA && oldRow.b === scoreB) {
    // Same set and score: keep its place in the log, just replace the details.
    ev.timestamp = oldRow.ev.timestamp;
    _emiEvents[editIdx] = ev;
  } else {
    var removed = editIdx === null ? null : _emiEvents.splice(editIdx, 1)[0];
    var spot = emiFindSanctionInsertion(setNumber, scoreA, scoreB);
    if (!spot.exact && !confirm("The score " + scoreA + "\u2013" + scoreB + " doesn't appear in the log for Set " + setNumber + ". Put the sanction at the end of that set instead?")) {
      if (removed) _emiEvents.splice(editIdx, 0, removed);
      return;
    }
    ev.timestamp = spot.timestamp;
    _emiEvents.splice(spot.index, 0, ev);
  }
  _emiEventsDirty = true;
  populateEmiSanctionForm();
  renderEmiSanctions();
}

function removeEmiSanction(idx) {
  var ev = _emiEvents[idx];
  if (!ev || !(ev.type === "SANCTION" || ev.type === "DELAY_SANCTION" || ev.type === "IMPROPER_REQUEST")) return;
  if (!confirm("Remove this sanction? This only removes the sanction record, not any point it awarded.")) return;
  _emiEvents.splice(idx, 1);
  _emiEventsDirty = true;
  populateEmiSanctionForm(); // indices shifted, so close any open edit
  renderEmiSanctions();
}

function wireEditMatchInfoExtras() {
  ["emiTeamA", "emiTeamB"].forEach(function (id) {
    $(id).addEventListener("input", renderEmiSanctions);
  });
  $("btnEmiAddRemark").addEventListener("click", addEmiRemark);
  $("emiRemarksList").addEventListener("input", function (e) {
    var ta = e.target.closest(".emi-remark-text");
    if (!ta) return;
    var ev = _emiEvents.find(function (x) { return x.type === "REMARK_ADDED" && x.remarkId === ta.getAttribute("data-remark-id"); });
    if (ev) { ev.text = ta.value; _emiEventsDirty = true; }
  });
  $("emiRemarksList").addEventListener("click", function (e) {
    var btn = e.target.closest(".emi-remark-delete");
    if (!btn) return;
    if (!confirm("Delete this remark? This cannot be undone.")) return;
    var i = _emiEvents.findIndex(function (x) { return x.type === "REMARK_ADDED" && x.remarkId === btn.getAttribute("data-remark-id"); });
    if (i !== -1) { _emiEvents.splice(i, 1); _emiEventsDirty = true; renderEmiRemarks(); }
  });
  $("emiSanctionsList").addEventListener("click", function (e) {
    var editBtn = e.target.closest(".emi-edit-btn");
    if (editBtn) { openEmiSanctionForm(parseInt(editBtn.getAttribute("data-idx"), 10)); return; }
    var btn = e.target.closest(".emi-remove-btn");
    if (btn) removeEmiSanction(parseInt(btn.getAttribute("data-idx"), 10));
  });
  $("emiSanKind").addEventListener("change", updateEmiSanctionFormVisibility);
  $("emiSanRole").addEventListener("change", updateEmiSanctionFormVisibility);
  $("btnEmiAddSanction").addEventListener("click", function () { openEmiSanctionForm(null); });
  $("btnEmiSaveSanction").addEventListener("click", saveEmiSanction);
  $("btnEmiCancelSanction").addEventListener("click", populateEmiSanctionForm);
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
  autoAssociateWithLeague("teamLeagues", teamA, league);
  autoAssociateWithLeague("teamLeagues", teamB, league);
  autoAssociateWithLeague("ageCategoryLeagues", ageCategory, league);
  autoAssociateWithLeague("locationLeagues", location, league);
  renderMasterListEditors();
  renderDefaultPickerOptions();

  var teamAColor = $("emiTeamAColor").value || settings.teamAColor;
  var teamBColor = $("emiTeamBColor").value || settings.teamBColor;
  rememberTeamColor(teamA, teamAColor);
  rememberTeamColor(teamB, teamBColor);

  var record = _emiRecord;
  if (!record) return;
  // Only replace the stored events when remarks/sanctions were actually edited, so
  // a plain info edit never drops redo-able events past the cursor.
  var events = _emiEventsDirty ? _emiEvents : (record.events || []);
  var startEv = events.find(function (e) { return e.type === "GAME_STARTED"; });
  if (!startEv) return;

  var startedAtValue = $("emiStartedAt").value;
  // The editable start is the first set's start (see deriveGameState); with no sets it's Start Game.
  var firstSetNum = null;
  events.forEach(function (e) {
    if (e.type === "SET_STARTED" && (firstSetNum === null || e.setNumber < firstSetNum)) firstSetNum = e.setNumber;
  });
  var startTarget = startEv;
  if (firstSetNum !== null) {
    events.forEach(function (e) { if (e.type === "SET_STARTED" && e.setNumber === firstSetNum) startTarget = e; });
  }
  var startChanged = startedAtValue && startedAtValue !== toLocalDatetimeValue(new Date(startTarget.timestamp));
  var newStartIso = startChanged ? new Date(startedAtValue).toISOString() : startTarget.timestamp;
  if (startChanged) {
    var earliestAfter = events.slice(events.indexOf(startTarget) + 1).filter(function (e) { return e.timestamp; })
      .reduce(function (min, e) { return !min || e.timestamp < min ? e.timestamp : min; }, null);
    if (earliestAfter && newStartIso > earliestAfter) {
      alert("The start time can't be later than the next recorded event (" + formatDateTime(earliestAfter) + ").");
      return;
    }
  }

  startEv.gameName = gameName;
  startEv.teamA = teamA;
  startEv.teamB = teamB;
  startEv.location = location;
  startEv.gender = gender;
  startEv.ageCategory = ageCategory;
  startEv.league = league;
  startEv.teamAColor = teamAColor;
  startEv.teamBColor = teamBColor;
  startTarget.timestamp = newStartIso;

  if (_emiEventsDirty) {
    record.events = events;
    record.cursor = events.length;
  }
  record.gameName = gameName;
  record.teamA = teamA;
  record.teamB = teamB;
  record.location = location;
  if (startTarget === startEv) record.createdAt = newStartIso;
  await dbSaveGame(record);

  if (gameId === controller.currentGameId) {
    controller.hydrate(record);
    updateTeamColors(teamAColor, teamBColor);
    renderScoreboard();
  }

  closeEditMatchInfoModal();
  if (selectedDetailGameId === gameId) await selectDetailGame(gameId);
  await renderGamesList();
}

