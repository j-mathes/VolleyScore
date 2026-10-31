// ============================================================
// VolleyScore — js/reports.js  (Reports page, Match Log report, Game Report)
// Classic script: shares one global scope with the other js/*.js files.
// Load order is set by the <script> tags in index.html and listed in sw.js.
// © 2025 Jared Mathes — CC BY-NC-SA 4.0
// ============================================================

"use strict";

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
        scoreStr: pickTeam(ev.team, sc2.A + ":" + sc2.B, sc2.B + ":" + sc2.A),
      });
    } else if (ev.type === "DELAY_SANCTION") {
      var sc3 = score(ev.setNumber);
      rows.push({
        col: ev.sanctionType === "penalty" ? "P" : "W", value: "D", team: ev.team, setNumber: ev.setNumber,
        scoreStr: pickTeam(ev.team, sc3.A + ":" + sc3.B, sc3.B + ":" + sc3.A),
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

function buildGrRemarksBoxHtml(state) {
  var remarks = state.remarks || [];
  var bodyHtml;
  if (!remarks.length) {
    bodyHtml = '<div class="gr-remark-row gr-remarks-empty">None</div>';
  } else {
    bodyHtml = remarks.map(function (r, i) {
      return '<div class="gr-remark-row">' +
        '<span class="gr-remark-num">' + (i + 1) + ".</span>" +
        '<span class="gr-remark-time">' + esc(remarkTimeLabel(r, formatTime24)) + '</span>' +
        '<span class="gr-remark-context">' + esc(remarkContextLabel(r.setNumber, r.scoreA, r.scoreB)) + '</span>' +
        '<span class="gr-remark-text">' + esc(r.text) + '</span>' +
        '</div>';
    }).join("");
  }
  return '<div class="gr-remarks-box">' +
    '<div class="gr-box-header"><span class="gr-box-title">Remarks</span></div>' +
    '<div class="gr-remarks-list">' + bodyHtml + '</div>' +
    '</div>';
}

function buildGameReportPageHtml(record, state) {
  return '<div class="gr-page">' +
    buildReportPrintHeaderHtml("Game Report") +
    buildGrInfoBoxHtml(state) +
    buildGrSanctionsBoxHtml(buildGameReportSanctionRows(record), state) +
    buildGrResultsBoxHtml(buildGameReportResults(state), state) +
    buildGrRemarksBoxHtml(state) +
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
    rows.push([]);
    rows.push(["Remarks"]);
    var remarks = state.remarks || [];
    if (!remarks.length) {
      rows.push(["None"]);
    } else {
      remarks.forEach(function (r, i) {
        rows.push([(i + 1) + ".", remarkTimeLabel(r, formatTime24), remarkContextLabel(r.setNumber, r.scoreA, r.scoreB), r.text]);
      });
    }

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
  wireEditMatchInfoExtras();
  $("editMatchInfoModal").addEventListener("click", function (e) {
    if (e.target === $("editMatchInfoModal")) closeEditMatchInfoModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("editMatchInfoModal").hidden) closeEditMatchInfoModal();
  });

  // Remarks section — pencil toggles edit mode; preventDefault so it doesn't also
  // collapse/expand the <details> it sits inside of
  $("btnEditRemarks").addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    _detailRemarksEditMode = !_detailRemarksEditMode;
    renderDetailRemarks(_detailState);
  });
  $("detailRemarksBody").addEventListener("click", function (e) {
    var saveBtn = e.target.closest(".remark-save-btn");
    if (saveBtn && selectedDetailGameId) {
      var row = saveBtn.closest(".remark-row");
      var textarea = row ? row.querySelector(".remark-edit-input") : null;
      if (!textarea) return;
      var newText = textarea.value.trim();
      if (!newText) return;
      // Brief "Saved!" flash so it's clear the click did something, without
      // hiding the row's edit controls (pencil stays on for every remark).
      saveBtn.textContent = "Saved!";
      saveBtn.disabled = true;
      var remarkId = saveBtn.getAttribute("data-remark-id");
      var gid = selectedDetailGameId;
      void (async function () {
        await saveRemarkEdit(gid, remarkId, newText);
        await new Promise(function (r) { setTimeout(r, 500); });
        if (selectedDetailGameId === gid) await selectDetailGame(gid);
      })();
      return;
    }
    var deleteBtn = e.target.closest(".remark-delete-btn");
    if (deleteBtn && selectedDetailGameId) {
      if (!confirm("Delete this remark? This cannot be undone.")) return;
      void deleteRemark(selectedDetailGameId, deleteBtn.getAttribute("data-remark-id"));
    }
  });
  $("btnDetailAddRemark").addEventListener("click", function () {
    if (!selectedDetailGameId) return;
    var input = $("detailRemarksAddInput");
    if (!input.value.trim()) return;
    void addPostMatchRemark(selectedDetailGameId, input.value).then(function () {
      input.value = "";
    });
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

