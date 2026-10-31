// ============================================================
// VolleyScore — js/ui-utils.js  (Shared UI helpers and page navigation)
// Classic script: shares one global scope with the other js/*.js files.
// Load order is set by the <script> tags in index.html and listed in sw.js.
// © 2025 Jared Mathes — CC BY-NC-SA 4.0
// ============================================================

"use strict";

// ---- UI Utilities ---------------------------------------

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function $(id) { return document.getElementById(id); }

// Team A/B helpers: pick between two values by team letter, get the other team,
// and get a team's display name (falling back to "Team A"/"Team B").
function pickTeam(team, a, b) { return team === "A" ? a : b; }
function otherTeam(team) { return team === "A" ? "B" : "A"; }
function teamLabel(state, team) { return pickTeam(team, state.teamA, state.teamB) || ("Team " + team); }

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

  // Serve Timer is only for the live score screen, not other pages
  if (page !== "score") closeServeTimer();
  $("navServeTimerBtn").hidden = page !== "score" || $("scoreboard").hidden;

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

