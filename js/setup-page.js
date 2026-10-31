// ============================================================
// VolleyScore — js/setup-page.js  (Setup page)
// Classic script: shares one global scope with the other js/*.js files.
// Load order is set by the <script> tags in index.html and listed in sw.js.
// © 2025 Jared Mathes — CC BY-NC-SA 4.0
// ============================================================

"use strict";

// ---- Setup Page -----------------------------------------

function renderSetupPage() {
  $("cfgDarkMode").checked = settings.darkMode;
  $("cfgFontSize").value = settings.fontSize;
  $("cfgTeamAColor").value = settings.teamAColor;
  $("cfgTeamBColor").value = settings.teamBColor;
  $("cfgSidebarBtnBorder").value = settings.sidebarBtnBorder || "#000000";
  $("cfgTbBoxSize").textContent = settings.tbBoxSize || 84;
  $("cfgTbHighlight").value = settings.tbHighlightColor || "#15803d";
  $("cfgTbSpeed").value = String(settings.tbScrollSpeed !== undefined ? settings.tbScrollSpeed : 280);
  $("cfgStartSetColor").value = settings.startSetBgColor || settings.startSetColor || "#15803d";
  $("cfgStartSetPulseColor").value = settings.startSetPulseColor || settings.startSetColor || "#15803d";
  $("cfgDefaultFormat").value = settings.defaultFormat;
  var defVarRadio = document.querySelector('input[name="cfgDefVariation"][value="' + (settings.defaultVariation || "standard") + '"]');
  if (defVarRadio) defVarRadio.checked = true;
  $("cfgDefFairPlay").value = settings.defaultFairPlay || "none";
  $("cfgAutoSwitchSidesBetweenSets").checked = !!settings.autoSwitchSidesBetweenSets;
  $("cfgStartSidesSwapped").checked = !!settings.startMatchSidesSwapped;
  $("cfgPromptSwitchSidesMidDecider").checked = !!settings.promptSwitchSidesMidDecider;
  $("cfgDefTimeouts").textContent = settings.defaultTimeouts;
  $("cfgDefSubs").textContent = settings.defaultSubs;
  $("cfgTimeoutTimerEnabled").checked = !!settings.timeoutTimerEnabled;
  $("cfgTimeoutTimerCountUp").checked = !!settings.timeoutTimerCountUp;
  updateTimeoutTimerCountUpEnabled();
  $("cfgTimeoutTimerDuration").textContent = settings.timeoutTimerDuration !== undefined ? settings.timeoutTimerDuration : 60;
  $("cfgNotchEnabled").checked = !!settings.notchEnabled;
  $("notchOptions").hidden = !settings.notchEnabled;
  var notchSideRadio = document.querySelector('input[name="cfgNotchSide"][value="' + (settings.notchSide || "left") + '"]');
  if (notchSideRadio) notchSideRadio.checked = true;
  $("cfgNotchPad").textContent = settings.notchPad !== undefined ? settings.notchPad : 50;
  $("cfgScoreBtnLayout").value = settings.scoreBtnLayout || "mirrorPlus";
  $("cfgScoreBtnSize").textContent = (settings.scoreBtnSize !== undefined ? settings.scoreBtnSize : 100) + "%";
  $("cfgKeepAwake").checked   = !!settings.keepScreenAwake;
  $("cfgConfirmUndo").checked = !!settings.confirmUndo;
  $("cfgShowMlEditIcons").checked = !!settings.showMasterListEditIcons;
  $("cfgPersistNewGameData").checked = !!settings.persistNewGameData;
  $("cfgRefereeName").value = settings.refereeName || "";
  $("cfgDefTeamA").value    = settings.defaultTeamA    || "";
  $("cfgDefTeamB").value    = settings.defaultTeamB    || "";
  $("cfgDefLocation").value = settings.defaultLocation || "";
  $("cfgDefGender").value = settings.defaultGender || "";
  renderMasterListEditors();
  renderDefaultPickerOptions();
  _remarkPresetEditingIndex = null;
  renderRemarkPresetList();
  // Scoring defaults
  $("cfgDefSetWinScore").textContent    = settings.defaultSetWinScore    !== undefined ? settings.defaultSetWinScore    : 25;
  $("cfgDefSetWinBy").textContent       = settings.defaultSetWinBy       !== undefined ? settings.defaultSetWinBy       : 2;
  var defSetWinCap = settings.defaultSetWinCap !== undefined ? settings.defaultSetWinCap : 0;
  $("chkDefSetWinCap").checked = defSetWinCap > 0;
  $("cfgDefSetWinCap").textContent = defSetWinCap > 0 ? defSetWinCap : (settings.defaultSetWinScore || 25);
  $("cfgDefDeciderWinScore").textContent = settings.defaultDeciderWinScore !== undefined ? settings.defaultDeciderWinScore : 15;
  $("cfgDefDeciderWinBy").textContent   = settings.defaultDeciderWinBy   !== undefined ? settings.defaultDeciderWinBy   : 2;
  var defDeciderWinCap = settings.defaultDeciderWinCap !== undefined ? settings.defaultDeciderWinCap : 0;
  $("chkDefDeciderWinCap").checked = defDeciderWinCap > 0;
  $("cfgDefDeciderWinCap").textContent = defDeciderWinCap > 0 ? defDeciderWinCap : (settings.defaultDeciderWinScore || 15);
  $("cfgWinGlowColor").value    = settings.winGlowColor    || "#f59e0b";
  $("cfgWinGlowDuration").textContent = settings.winGlowDuration !== undefined ? settings.winGlowDuration : 3;
  $("cfgWinToastDuration").textContent = settings.winToastDuration !== undefined ? settings.winToastDuration : 3;
  $("cfgActionGlowColor").value = settings.actionGlowColor || "#a855f7";
  $("cfgActionGlowDuration").textContent = settings.actionGlowDuration !== undefined ? settings.actionGlowDuration : 2;

  // About: show app version and active SW cache name
  var verLine = $("appVersionLine");
  if (verLine) {
    var cacheLabel = "no cache";
    if ("caches" in window) {
      caches.keys().then(function (keys) {
        verLine.textContent = "Version " + APP_VERSION + "  \u00B7  cache: " + (keys.length ? keys.join(", ") : "none");
      });
    } else {
      verLine.textContent = "Version " + APP_VERSION;
    }
  }
  // Apply cap toggle visibility after all values are set
  updateDefScoringRuleInteractivity();
  syncColorSwatchButtons();
}

function wireSetupPage() {
  wireToggle("cfgDarkMode", "darkMode", applyTheme);

  $("cfgFontSize").addEventListener("change", function () {
    settings.fontSize = this.value;
    applyFontSize();
    saveSettings();
  });

  $("cfgScoreBtnLayout").addEventListener("change", function () {
    settings.scoreBtnLayout = this.value;
    applyScoreBtnLayout();
    saveSettings();
  });

  // Score button size — 100% is the original/smallest size; steps of 25% for
  // speed. Past 200% only the button's height keeps growing (see
  // updateTeamColors), so the max here is higher than the point where width
  // stops scaling.
  wireSettingStepper("btnScoreBtnSizeDown", "btnScoreBtnSizeUp", "cfgScoreBtnSize", "scoreBtnSize", 100, {
    min: 100, max: 300, step: 25,
    fmt: function (n) { return n + "%"; },
    onChange: function () { updateTeamColors(); saveSettings(); }
  });

  $("cfgTeamAColor").addEventListener("input", function () {
    settings.teamAColor = this.value;
    updateTeamColors();
    saveSettings();
  });

  $("cfgTeamBColor").addEventListener("input", function () {
    settings.teamBColor = this.value;
    updateTeamColors();
    saveSettings();
  });

  $("cfgSidebarBtnBorder").addEventListener("input", function () {
    settings.sidebarBtnBorder = this.value;
    updateTeamColors();
    saveSettings();
  });

  wireSettingStepper("btnTbSzDown", "btnTbSzUp", "cfgTbBoxSize", "tbBoxSize", 84, {
    min: 36, max: 112, step: 4,
    onChange: function () { updateTeamColors(); saveSettings(); }
  });

  $("cfgTbHighlight").addEventListener("input", function () {
    settings.tbHighlightColor = this.value;
    updateTeamColors();
    saveSettings();
  });

  $("cfgTbSpeed").addEventListener("change", function () {
    settings.tbScrollSpeed = parseInt(this.value, 10);
    saveSettings();
  });

  $("cfgStartSetColor").addEventListener("input", function () {
    settings.startSetBgColor = this.value;
    updateTeamColors();
    saveSettings();
  });

  $("cfgStartSetPulseColor").addEventListener("input", function () {
    settings.startSetPulseColor = this.value;
    updateTeamColors();
    saveSettings();
  });

  $("cfgDefaultFormat").addEventListener("change", function () {
    settings.defaultFormat = this.value;
    saveSettings();
  });

  document.querySelectorAll('input[name="cfgDefVariation"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      settings.defaultVariation = this.value;
      saveSettings();
    });
  });

  $("cfgDefFairPlay").addEventListener("change", function () {
    settings.defaultFairPlay = this.value;
    saveSettings();
  });

  wireToggle("cfgStartSidesSwapped", "startMatchSidesSwapped");
  wireToggle("cfgAutoSwitchSidesBetweenSets", "autoSwitchSidesBetweenSets");
  wireToggle("cfgPromptSwitchSidesMidDecider", "promptSwitchSidesMidDecider");

  // Default timeouts and subs steppers
  wireSettingStepper("btnDefToDown", "btnDefToUp", "cfgDefTimeouts", "defaultTimeouts", 2, { min: 0, max: 5 });
  wireSettingStepper("btnDefSubsDown", "btnDefSubsUp", "cfgDefSubs", "defaultSubs", 6, { min: 0, max: 18 });

  // Timeout countdown timer
  wireToggle("cfgTimeoutTimerCountUp", "timeoutTimerCountUp");
  wireToggle("cfgTimeoutTimerEnabled", "timeoutTimerEnabled", updateTimeoutTimerCountUpEnabled);
  wireSettingStepper("btnTimeoutTimerDurDown", "btnTimeoutTimerDurUp", "cfgTimeoutTimerDuration", "timeoutTimerDuration", 60, {
    min: 10, max: 300, step: 5
  });

  // Scoring defaults — regular sets
  wireSettingStepper("btnDefSetWinScoreDown", "btnDefSetWinScoreUp", "cfgDefSetWinScore", "defaultSetWinScore", 25, {
    min: 1, max: 50, onChange: updateDefScoringRuleInteractivity
  });
  wireSettingStepper("btnDefSetWinByDown", "btnDefSetWinByUp", "cfgDefSetWinBy", "defaultSetWinBy", 2, { min: 1, max: 10 });
  $("chkDefSetWinCap").addEventListener("change", function () {
    if (this.checked && (settings.defaultSetWinCap || 0) === 0) {
      settings.defaultSetWinCap = settings.defaultSetWinScore || 25;
      $("cfgDefSetWinCap").textContent = settings.defaultSetWinCap;
    }
    updateDefScoringRuleInteractivity();
  });
  wireSettingStepper("btnDefSetWinCapDown", "btnDefSetWinCapUp", "cfgDefSetWinCap", "defaultSetWinCap", 0, {
    min: function () { return settings.defaultSetWinScore || 25; }, max: 60,
    onChange: updateDefScoringRuleInteractivity
  });

  // Scoring defaults — deciding set
  wireSettingStepper("btnDefDeciderWinScoreDown", "btnDefDeciderWinScoreUp", "cfgDefDeciderWinScore", "defaultDeciderWinScore", 15, {
    min: 1, max: 50, onChange: updateDefScoringRuleInteractivity
  });
  wireSettingStepper("btnDefDeciderWinByDown", "btnDefDeciderWinByUp", "cfgDefDeciderWinBy", "defaultDeciderWinBy", 2, { min: 1, max: 10 });
  $("chkDefDeciderWinCap").addEventListener("change", function () {
    if (this.checked && (settings.defaultDeciderWinCap || 0) === 0) {
      settings.defaultDeciderWinCap = settings.defaultDeciderWinScore || 15;
      $("cfgDefDeciderWinCap").textContent = settings.defaultDeciderWinCap;
    }
    updateDefScoringRuleInteractivity();
  });
  wireSettingStepper("btnDefDeciderWinCapDown", "btnDefDeciderWinCapUp", "cfgDefDeciderWinCap", "defaultDeciderWinCap", 0, {
    min: function () { return settings.defaultDeciderWinScore || 15; }, max: 60,
    onChange: updateDefScoringRuleInteractivity
  });

  // Win alert — glow color
  $("cfgWinGlowColor").addEventListener("input", function () {
    settings.winGlowColor = this.value;
    updateTeamColors();
    saveSettings();
  });

  // Win alert — glow duration
  wireSettingStepper("btnWinGlowDurDown", "btnWinGlowDurUp", "cfgWinGlowDuration", "winGlowDuration", 3, {
    min: 1, max: 30, onChange: function () { updateTeamColors(); saveSettings(); }
  });

  // Win alert — toast duration
  wireSettingStepper("btnWinToastDurDown", "btnWinToastDurUp", "cfgWinToastDuration", "winToastDuration", 3, { min: 1, max: 30 });

  // Action alert — glow color
  $("cfgActionGlowColor").addEventListener("input", function () {
    settings.actionGlowColor = this.value;
    updateTeamColors();
    saveSettings();
  });

  // Action alert — glow duration
  wireSettingStepper("btnActionGlowDurDown", "btnActionGlowDurUp", "cfgActionGlowDuration", "actionGlowDuration", 2, { min: 1, max: 30 });

  // Keep screen awake
  wireToggle("cfgKeepAwake", "keepScreenAwake", function (on) {
    if (on) { var st = controller.getState(); if (st && !st.endedAt) requestWakeLock(); }
    else releaseWakeLock();
  });

  // Confirm before Undo
  wireToggle("cfgConfirmUndo", "confirmUndo");
  wireToggle("cfgShowMlEditIcons", "showMasterListEditIcons", renderMasterListEditors);
  wireToggle("cfgPersistNewGameData", "persistNewGameData");

  $("cfgRefereeName").addEventListener("input", function () {
    settings.refereeName = this.value; saveSettings();
  });

  // Default team names and location
  $("cfgDefTeamA").addEventListener("input", function () {
    settings.defaultTeamA = this.value; saveSettings();
  });
  $("cfgDefTeamB").addEventListener("input", function () {
    settings.defaultTeamB = this.value; saveSettings();
  });
  $("cfgDefLocation").addEventListener("input", function () {
    settings.defaultLocation = this.value; saveSettings();
  });
  $("cfgDefGender").addEventListener("change", function () {
    settings.defaultGender = this.value; saveSettings();
  });
  $("cfgDefAgeCategory").addEventListener("change", function () {
    settings.defaultAgeCategory = this.value; saveSettings();
  });
  $("cfgDefLeague").addEventListener("change", function () {
    settings.defaultLeague = this.value; saveSettings();
  });

  // Match Info Lists — add new entries
  function wireMasterListAdd(inputId, listName, colorInputId) {
    var input = $(inputId);
    var colorInput = colorInputId ? $(colorInputId) : null;
    function add() {
      var value = input.value;
      if (addToMasterList(listName, value)) {
        if (colorInput && colorInput.value.toLowerCase() !== ML_CHIP_NO_COLOR) {
          rememberTeamColor(value, colorInput.value);
        }
        input.value = "";
        if (colorInput) setColorInputValue(colorInput, ML_CHIP_NO_COLOR);
        renderMasterListEditors();
        renderDefaultPickerOptions();
      }
    }
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); add(); } });
    return add;
  }
  $("btnAddTeamName").addEventListener("click", wireMasterListAdd("cfgAddTeamName", "masterTeamNames", "cfgAddTeamNameColor"));
  $("btnAddLocation").addEventListener("click", wireMasterListAdd("cfgAddLocation", "masterLocations"));
  $("btnAddAgeCategory").addEventListener("click", wireMasterListAdd("cfgAddAgeCategory", "masterAgeCategories"));
  $("btnAddLeague").addEventListener("click", wireMasterListAdd("cfgAddLeague", "masterLeagues"));

  // Match Info Lists — filter chips shown per list (delegated; inputs render statically in HTML)
  document.addEventListener("input", function (e) {
    var input = e.target.closest(".ml-filter-input");
    if (!input) return;
    var listName = input.getAttribute("data-list");
    _mlFilter[listName] = input.value;
    renderMasterListChips("mlList" + listName.replace("master", ""), listName);
  });

  // Match Info Lists — remove entries unused by any saved game
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".ml-prune-btn");
    if (!btn) return;
    void removeUnusedMasterListEntries(btn.getAttribute("data-list"), btn.getAttribute("data-label"));
  });

  // Match Info Lists — remove an entry (delegated for the dynamically rendered chips)
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".ml-chip-remove");
    if (!btn) return;
    removeFromMasterList(btn.getAttribute("data-list"), btn.getAttribute("data-value"));
    renderMasterListEditors();
    renderDefaultPickerOptions();
  });

  // Match Info Lists — rename an entry inline (delegated for the dynamically rendered chips)
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".ml-chip-edit");
    if (!btn) return;
    _mlEditing = { listName: btn.getAttribute("data-list"), value: btn.getAttribute("data-value") };
    renderMasterListEditors();
  });

  // Match Info Lists — open the color picker for a Team Names chip's swatch.
  // mousedown must preventDefault so clicking it (while the sibling rename
  // input is focused) doesn't blur that input first — a blur commits/exits
  // the rename and re-renders the chip list, which would detach this very
  // button before its own "click" handler runs (the popover would then open
  // anchored to a removed, zero-sized element).
  document.addEventListener("mousedown", function (e) {
    if (e.target.closest(".ml-chip-color")) e.preventDefault();
  });
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".ml-chip-color");
    if (!btn) return;
    e.stopPropagation();
    openTeamColorPickerForChip(btn.getAttribute("data-value"), btn);
  });

  document.addEventListener("keydown", function (e) {
    var input = e.target.closest(".ml-chip-input");
    if (!input) return;
    if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    else if (e.key === "Escape") { e.preventDefault(); _mlEditing = null; renderMasterListEditors(); }
  });

  document.addEventListener("focusout", function (e) {
    var input = e.target.closest(".ml-chip-input");
    if (!input || !_mlEditing) return;
    var listName = input.getAttribute("data-list");
    var oldValue = input.getAttribute("data-value");
    _mlEditing = null;
    renameInMasterList(listName, oldValue, input.value);
    renderMasterListEditors();
    renderDefaultPickerOptions();
  });

  // Pre-defined Remarks — add, reorder, edit, remove
  $("btnAddRemarkPreset").addEventListener("click", function () {
    var input = $("cfgAddRemarkPreset");
    if (addRemarkPreset(input.value)) { input.value = ""; renderRemarkPresetList(); }
  });
  $("cfgAddRemarkPreset").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); $("btnAddRemarkPreset").click(); }
  });
  document.addEventListener("click", function (e) {
    var moveBtn = e.target.closest(".remark-preset-move-btn");
    if (moveBtn) {
      var idx = parseInt(moveBtn.getAttribute("data-index"), 10);
      moveRemarkPreset(idx, moveBtn.getAttribute("data-dir") === "up" ? -1 : 1);
      renderRemarkPresetList();
      return;
    }
    var editBtn = e.target.closest(".remark-preset-edit-btn");
    if (editBtn) {
      _remarkPresetEditingIndex = parseInt(editBtn.getAttribute("data-index"), 10);
      renderRemarkPresetList();
      return;
    }
    var saveBtn = e.target.closest(".remark-preset-save-btn");
    if (saveBtn) {
      var row = saveBtn.closest(".remark-preset-row");
      var textarea = row ? row.querySelector(".remark-preset-input") : null;
      _remarkPresetEditingIndex = null;
      if (textarea) editRemarkPreset(parseInt(saveBtn.getAttribute("data-index"), 10), textarea.value);
      renderRemarkPresetList();
      return;
    }
    var cancelBtn = e.target.closest(".remark-preset-cancel-btn");
    if (cancelBtn) {
      _remarkPresetEditingIndex = null;
      renderRemarkPresetList();
      return;
    }
    var removeBtn = e.target.closest(".remark-preset-remove-btn");
    if (removeBtn) {
      removeRemarkPreset(parseInt(removeBtn.getAttribute("data-index"), 10));
      renderRemarkPresetList();
      return;
    }
    var tokenBtn = e.target.closest(".remark-token-btn");
    if (tokenBtn) {
      var editingRow = tokenBtn.closest(".remark-preset-row-editing");
      var target = editingRow ? editingRow.querySelector(".remark-preset-input") : $("cfgAddRemarkPreset");
      insertTokenAtCursor(target, tokenBtn.getAttribute("data-token"));
    }
  });
  document.addEventListener("keydown", function (e) {
    var input = e.target.closest(".remark-preset-input");
    if (!input) return;
    if (e.key === "Escape") { e.preventDefault(); _remarkPresetEditingIndex = null; renderRemarkPresetList(); }
  });

  // League "manage members" modal — open, close, filter, toggle membership
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".ml-chip-manage-btn");
    if (!btn) return;
    openLeagueMembersModal(btn.getAttribute("data-value"));
  });
  $("btnCloseLeagueMembersModal").addEventListener("click", closeLeagueMembersModal);
  $("leagueMembersModal").addEventListener("click", function (e) {
    if (e.target === $("leagueMembersModal")) closeLeagueMembersModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("leagueMembersModal").hidden) closeLeagueMembersModal();
  });
  $("lmTeamFilter").addEventListener("input", function () {
    _lmTeamFilter = this.value;
    renderLeagueMembersCheckList("lmTeamList", "masterTeamNames", "teamLeagues", _lmTeamFilter);
  });
  $("lmAgeCategoryFilter").addEventListener("input", function () {
    _lmAgeCategoryFilter = this.value;
    renderLeagueMembersCheckList("lmAgeCategoryList", "masterAgeCategories", "ageCategoryLeagues", _lmAgeCategoryFilter);
  });
  $("lmLocationFilter").addEventListener("input", function () {
    _lmLocationFilter = this.value;
    renderLeagueMembersCheckList("lmLocationList", "masterLocations", "locationLeagues", _lmLocationFilter);
  });
  document.addEventListener("change", function (e) {
    var chk = e.target.closest("#leagueMembersModal input[type=checkbox]");
    if (!chk || !_lmLeague) return;
    var mapKey = chk.getAttribute("data-map");
    var value = chk.getAttribute("data-value");
    if (chk.checked) addEntryLeague(mapKey, value, _lmLeague);
    else removeEntryLeague(mapKey, value, _lmLeague);
    renderMasterListEditors(); // keep the underlying chip's league tags in sync
  });

  // Match Info Lists — infer league associations from saved game history
  $("btnBackfillLeagueAssociations").addEventListener("click", function () {
    void backfillLeagueAssociationsFromGames();
  });

  // Match Info Lists — export / import
  $("btnExportCategoriesJson").addEventListener("click", function () {
    exportCategoriesJson();
  });
  $("btnExportCategoriesXlsx").addEventListener("click", function () {
    exportCategoriesXlsx();
  });
  $("btnImportCategories").addEventListener("click", function () {
    $("importCategoriesFileInput").click();
  });
  $("importCategoriesFileInput").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var isXlsx = /\.xlsx$/i.test(file.name);
    var reader = new FileReader();
    reader.onload = function (ev) {
      if (isXlsx) void importCategoriesFromXlsx(ev.target.result);
      else importCategoriesFromJson(ev.target.result);
    };
    if (isXlsx) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
    e.target.value = "";
  });

  // Pre-defined Remarks — export / import (JSON, Excel, CSV)
  $("btnExportRemarkPresetsJson").addEventListener("click", exportRemarkPresetsJson);
  $("btnExportRemarkPresetsXlsx").addEventListener("click", exportRemarkPresetsXlsx);
  $("btnExportRemarkPresetsCsv").addEventListener("click", exportRemarkPresetsCsv);
  $("btnImportRemarkPresets").addEventListener("click", function () {
    $("importRemarkPresetsFileInput").click();
  });
  $("importRemarkPresetsFileInput").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var isXlsx = /\.xlsx$/i.test(file.name);
    var isCsv = /\.csv$/i.test(file.name);
    var reader = new FileReader();
    reader.onload = function (ev) {
      if (isXlsx) void importRemarkPresetsFromXlsx(ev.target.result);
      else if (isCsv) importRemarkPresetsFromCsv(ev.target.result);
      else importRemarkPresetsFromJson(ev.target.result);
    };
    if (isXlsx) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
    e.target.value = "";
  });

  // Notch padding
  wireToggle("cfgNotchEnabled", "notchEnabled", function (on) {
    $("notchOptions").hidden = !on;
    applyNotchPadding();
  });

  document.querySelectorAll('input[name="cfgNotchSide"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      settings.notchSide = this.value;
      applyNotchPadding();
      saveSettings();
    });
  });

  wireSettingStepper("btnNotchPadDown", "btnNotchPadUp", "cfgNotchPad", "notchPad", 50, {
    min: 8, max: 128, step: 4,
    onChange: function () { applyNotchPadding(); saveSettings(); }
  });

  // Export all
  $("btnExportAll").addEventListener("click", function () {
    void exportAllGames();
  });

  // Import (setup page)
  $("btnImportSetup").addEventListener("click", function () {
    $("importSetupFileInput").click();
  });
  $("importSetupFileInput").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) { void importGamesFromJson(ev.target.result); };
    reader.readAsText(file);
    e.target.value = "";
  });

  // Clear all (setup page)
  $("btnClearAllSetup").addEventListener("click", function () {
    if (!confirm("Delete ALL saved games and settings? This cannot be undone.\n\nTip: Export first to keep a backup.")) return;
    void (async function () {
      await dbClearAll();
      controller.clear();
      clearGameDetail();
      // Reset settings
      settings = Object.assign({}, DEFAULT_SETTINGS);
      saveSettings();
      applyTheme();
      applyFontSize();
      updateTeamColors();
      applyScoreBtnLayout();
      renderSetupPage();
    })();
  });
}

function applyNotchPadding() {
  var pad = settings.notchEnabled ? (settings.notchPad !== undefined ? settings.notchPad : 50) : 0;
  document.documentElement.style.setProperty("--notch-pad", pad + "px");
  document.body.classList.toggle("notch-left",  settings.notchEnabled && settings.notchSide !== "right");
  document.body.classList.toggle("notch-right", settings.notchEnabled && settings.notchSide === "right");
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", settings.darkMode ? "dark" : "light");
  updateTeamColorContrastOutlines(); // background colors just changed — re-check contrast
}

function applyFontSize() {
  document.documentElement.classList.remove("fs-small", "fs-medium", "fs-large");
  document.documentElement.classList.add("fs-" + (settings.fontSize || "medium"));
}

function applyScoreBtnLayout() {
  document.documentElement.classList.remove("score-layout-plusMinus", "score-layout-mirrorPlus", "score-layout-mirrorMinus");
  var layout = settings.scoreBtnLayout || "mirrorPlus";
  if (layout !== "minusPlus") document.documentElement.classList.add("score-layout-" + layout);
}

