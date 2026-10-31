// ============================================================
// VolleyScore — js/main.js  (Navigation wiring and app boot)
// Classic script: shares one global scope with the other js/*.js files.
// Load order is set by the <script> tags in index.html and listed in sw.js.
// © 2025 Jared Mathes — CC BY-NC-SA 4.0
// ============================================================

"use strict";

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
  wireRemarksModal();
  wireRemarkFillModal();
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
