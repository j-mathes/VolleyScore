// ============================================================
// VolleyScore — js/lists.js  (Master lists, remark presets, league associations)
// Classic script: shares one global scope with the other js/*.js files.
// Load order is set by the <script> tags in index.html and listed in sw.js.
// © 2025 Jared Mathes — CC BY-NC-SA 4.0
// ============================================================

"use strict";

// ---- Master lists (Team Names, Locations, Age Categories, Leagues) -------

// Coerces to a string, treating any non-string value (e.g. malformed hand-edited
// import data — a number, object, null, etc.) as empty rather than throwing when
// .trim() is called on it downstream. Use this at the entry point for any value
// arriving from outside the app (JSON/Excel imports) before trimming/lowercasing it.
function safeStr(x) {
  return typeof x === "string" ? x : "";
}

// Adds a trimmed value to the named master list (case-insensitive de-dupe); returns true if added.
// Always reassigns a new array rather than mutating in place, so DEFAULT_SETTINGS'
// shared array references are never modified (that literal is reused via Object.assign).
function addToMasterList(listName, rawValue) {
  var value = safeStr(rawValue).trim();
  if (!value) return false;
  var list = Array.isArray(settings[listName]) ? settings[listName] : [];
  var exists = list.some(function (v) { return v.toLowerCase() === value.toLowerCase(); });
  if (exists) return false;
  settings[listName] = list.concat([value]).sort(function (a, b) { return a.localeCompare(b); });
  saveSettings();
  return true;
}

// Case-insensitive membership check against a master list — used to guard against
// importing a league association that references a name never added to its list
// (e.g. a hand-edited file with an orphaned/typo'd reference).
function masterListHasCI(listName, value) {
  var v = safeStr(value).trim().toLowerCase();
  if (!v) return false;
  return (settings[listName] || []).some(function (item) { return item.toLowerCase() === v; });
}

function removeFromMasterList(listName, value) {
  if (!Array.isArray(settings[listName])) return;
  settings[listName] = settings[listName].filter(function (v) { return v !== value; });
  if (listName === "masterTeamNames") removeEntryLeagueMapEntry("teamLeagues", value);
  if (listName === "masterAgeCategories") removeEntryLeagueMapEntry("ageCategoryLeagues", value);
  if (listName === "masterLocations") removeEntryLeagueMapEntry("locationLeagues", value);
  if (listName === "masterLeagues") removeLeagueEverywhere(value);
  saveSettings();
}

// Renames an existing entry in place (case-insensitive de-dupe against other entries).
// Returns true if renamed; alerts and returns false on an empty/duplicate/unchanged name.
function renameInMasterList(listName, oldValue, rawNewValue) {
  var newValue = safeStr(rawNewValue).trim();
  if (!newValue || newValue === oldValue) return false;
  var list = Array.isArray(settings[listName]) ? settings[listName] : [];
  var duplicate = list.some(function (v) { return v !== oldValue && v.toLowerCase() === newValue.toLowerCase(); });
  if (duplicate) {
    alert('"' + newValue + '" already exists in this list.');
    return false;
  }
  settings[listName] = list.map(function (v) { return v === oldValue ? newValue : v; })
    .sort(function (a, b) { return a.localeCompare(b); });
  if (listName === "masterTeamNames") renameRememberedTeamColor(oldValue, newValue);
  if (listName === "masterTeamNames") renameEntryLeagueKey("teamLeagues", oldValue, newValue);
  if (listName === "masterAgeCategories") renameEntryLeagueKey("ageCategoryLeagues", oldValue, newValue);
  if (listName === "masterLocations") renameEntryLeagueKey("locationLeagues", oldValue, newValue);
  if (listName === "masterLeagues") renameLeagueEverywhere(oldValue, newValue);
  saveSettings();
  return true;
}

// ---- Remark presets (Setup \u2192 Pre-defined Remarks) --------------------
// Plain ordered string list \u2014 unlike the master lists above, order is
// user-controlled (never auto-sorted) since it drives the order shown in the
// live Remarks picker.

function addRemarkPreset(rawText) {
  var text = safeStr(rawText).trim();
  if (!text) return false;
  var list = Array.isArray(settings.remarkPresets) ? settings.remarkPresets : [];
  settings.remarkPresets = list.concat([text]);
  saveSettings();
  return true;
}

function editRemarkPreset(index, rawText) {
  var text = safeStr(rawText).trim();
  var list = Array.isArray(settings.remarkPresets) ? settings.remarkPresets : [];
  if (!text || index < 0 || index >= list.length) return false;
  settings.remarkPresets = list.map(function (v, i) { return i === index ? text : v; });
  saveSettings();
  return true;
}

function removeRemarkPreset(index) {
  var list = Array.isArray(settings.remarkPresets) ? settings.remarkPresets : [];
  settings.remarkPresets = list.filter(function (v, i) { return i !== index; });
  saveSettings();
}

function moveRemarkPreset(index, delta) {
  var list = Array.isArray(settings.remarkPresets) ? settings.remarkPresets.slice() : [];
  var newIndex = index + delta;
  if (newIndex < 0 || newIndex >= list.length) return;
  var tmp = list[index];
  list[index] = list[newIndex];
  list[newIndex] = tmp;
  settings.remarkPresets = list;
  saveSettings();
}

// ---- Remark preset placeholders ({TEAM}/{SET}/{SCORE}/{PLAYER}/{STAFF}) --
// Lets a preset like "TEAM {TEAM} captain change, SET {SET}, SCORE ({SCORE}),
// {PLAYER} -> {PLAYER}" auto-fill what the live game already knows and only
// prompt for the rest, instead of the referee typing it all out live.
// {PLAYER} only ever prompts for a jersey number (no staff roles) — use it
// where only a player could plausibly be involved; {STAFF} prompts for a
// jersey number OR a staff role (Head Coach/Asst. Coach/Trainer/Medical),
// same picker as a sanction — use it where a staff member is also possible.
var REMARK_PERSON_TOKEN_RE = /\{PLAYER\}|\{STAFF\}/g;

// {TEAM}/{PLAYER}/{STAFF} need an explicit pick from the referee (team + who);
// {SET}/{SCORE} never need a prompt, they always come straight from the game.
function remarkPresetNeedsFillIn(text) {
  return /\{TEAM\}|\{PLAYER\}|\{STAFF\}/.test(text || "");
}

// Replaces {SET}/{SCORE}/{TEAM} using live game context. chosenTeam (if given)
// is which team the referee picked for this remark: {SCORE} then lists THAT
// team's score first (matches how the referee would say/write it aloud), and
// {TEAM} becomes that team's real name; with no chosenTeam (preset had no
// {TEAM} token), everything defaults to Team A's perspective.
function resolveAutoRemarkTokens(text, state, chosenTeam) {
  var ctx = currentRemarkContext(state);
  var scoreStr = chosenTeam === "B" ? (ctx.scoreB + " - " + ctx.scoreA) : (ctx.scoreA + " - " + ctx.scoreB);
  var teamName = chosenTeam === "B" ? (state ? state.teamB : "Team B") : (state ? state.teamA : "Team A");
  return (text || "")
    .replace(/\{SET\}/g, String(ctx.setNumber))
    .replace(/\{SCORE\}/g, scoreStr)
    .replace(/\{TEAM\}/g, teamName);
}

// Replaces {PLAYER}/{STAFF} tokens in true left-to-right order (regardless of
// which of the two appears where) using the matching entry in `players`
// ({role, number}) — a numbered player becomes "#4", a staff role becomes its
// label (e.g. "Head Coach"), same as a sanction.
function resolvePlayerRemarkTokens(text, players) {
  var list = players || [];
  var i = 0;
  return (text || "").replace(REMARK_PERSON_TOKEN_RE, function () {
    var p = list[i++];
    if (!p) return "";
    return p.role === "player" ? ("#" + (p.number || "?")) : (ROLE_LABEL[p.role] || p.role);
  });
}

// Inserts literal text at the current cursor position of an <input>/<textarea>
// (used by the Setup token-insert toolbar) — falls back to appending at the
// end if nothing is selected/focused.
function insertTokenAtCursor(el, token) {
  if (!el) return;
  var start = el.selectionStart != null ? el.selectionStart : el.value.length;
  var end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
  el.value = el.value.slice(0, start) + token + el.value.slice(end);
  var newPos = start + token.length;
  el.focus();
  el.setSelectionRange(newPos, newPos);
}

// ---- League ↔ Team / Age Category associations -----------------------
// mapKey is always "teamLeagues" or "ageCategoryLeagues" (settings keys), each
// a lowercased/trimmed-name -> array-of-league-strings map, many-to-many.

// Maps a league-association settings key to the master list it's paired with —
// used by the import guards to reject associations for names never added there.
var MASTER_LIST_KEY_BY_LEAGUE_MAP = {
  teamLeagues: "masterTeamNames",
  ageCategoryLeagues: "masterAgeCategories",
  locationLeagues: "masterLocations",
};

function getEntryLeagues(mapKey, name) {
  var key = safeStr(name).trim().toLowerCase();
  if (!key) return [];
  var map = settings[mapKey] || {};
  return Array.isArray(map[key]) ? map[key] : [];
}

function isEntryInLeague(mapKey, name, league) {
  var target = safeStr(league).trim().toLowerCase();
  if (!target) return false;
  return getEntryLeagues(mapKey, name).some(function (l) { return l.toLowerCase() === target; });
}

// Adds a league to an entry's association list; returns true if it changed anything.
// Always rebuilds a new object (never mutates settings[mapKey] in place), same
// precaution as addToMasterList/rememberTeamColor.
function addEntryLeague(mapKey, name, league) {
  var key = safeStr(name).trim().toLowerCase();
  var leagueTrimmed = safeStr(league).trim();
  if (!key || !leagueTrimmed || isEntryInLeague(mapKey, name, leagueTrimmed)) return false;
  var map = settings[mapKey] || {};
  var next = {};
  for (var k in map) { if (map.hasOwnProperty(k)) next[k] = map[k]; }
  next[key] = (next[key] || []).concat([leagueTrimmed]);
  settings[mapKey] = next;
  saveSettings();
  return true;
}

function removeEntryLeague(mapKey, name, league) {
  var key = safeStr(name).trim().toLowerCase();
  var target = safeStr(league).trim().toLowerCase();
  if (!key) return;
  var map = settings[mapKey] || {};
  if (!map[key]) return;
  var next = {};
  for (var k in map) { if (map.hasOwnProperty(k)) next[k] = map[k]; }
  next[key] = next[key].filter(function (l) { return l.toLowerCase() !== target; });
  if (!next[key].length) delete next[key];
  settings[mapKey] = next;
  saveSettings();
}

// Carries an entry's associations over to its new name after a master-list rename
// (called from renameInMasterList — that function saves once at the end, so this
// one doesn't call saveSettings() itself).
function renameEntryLeagueKey(mapKey, oldName, newName) {
  var oldKey = safeStr(oldName).trim().toLowerCase();
  var newKey = safeStr(newName).trim().toLowerCase();
  if (!oldKey || !newKey || oldKey === newKey) return;
  var map = settings[mapKey] || {};
  if (!Object.prototype.hasOwnProperty.call(map, oldKey)) return;
  var next = {};
  for (var k in map) { if (map.hasOwnProperty(k) && k !== oldKey) next[k] = map[k]; }
  next[newKey] = map[oldKey];
  settings[mapKey] = next;
}

// Deletes an entry's association list entirely (called when the team/age category
// itself is removed from its master list — no saveSettings(), same reason as above).
function removeEntryLeagueMapEntry(mapKey, name) {
  var key = safeStr(name).trim().toLowerCase();
  if (!key) return;
  var map = settings[mapKey] || {};
  if (!Object.prototype.hasOwnProperty.call(map, key)) return;
  var next = {};
  for (var k in map) { if (map.hasOwnProperty(k) && k !== key) next[k] = map[k]; }
  settings[mapKey] = next;
}

// Renames a league string wherever it appears across BOTH association maps
// (called when a League itself is renamed in the master list).
function renameLeagueEverywhere(oldLeague, newLeague) {
  var oldLower = safeStr(oldLeague).trim().toLowerCase();
  if (!oldLower) return;
  ["teamLeagues", "ageCategoryLeagues", "locationLeagues"].forEach(function (mapKey) {
    var map = settings[mapKey] || {};
    var next = {};
    var changed = false;
    for (var k in map) {
      if (!map.hasOwnProperty(k)) continue;
      next[k] = map[k].map(function (l) {
        if (l.toLowerCase() === oldLower) { changed = true; return newLeague; }
        return l;
      });
    }
    if (changed) settings[mapKey] = next;
  });
}

// Strips a removed league from every association array across both maps
// (dangling-reference cleanup when a League is removed from the master list).
function removeLeagueEverywhere(league) {
  var target = safeStr(league).trim().toLowerCase();
  if (!target) return;
  ["teamLeagues", "ageCategoryLeagues", "locationLeagues"].forEach(function (mapKey) {
    var map = settings[mapKey] || {};
    var next = {};
    var changed = false;
    for (var k in map) {
      if (!map.hasOwnProperty(k)) continue;
      var filtered = map[k].filter(function (l) { return l.toLowerCase() !== target; });
      if (filtered.length !== map[k].length) changed = true;
      if (filtered.length) next[k] = filtered;
    }
    if (changed) settings[mapKey] = next;
  });
}

// Auto-associates a newly-used team/age-category with the given league at game-
// start time: silent when the entry has zero existing associations (the common
// case), but confirms first when it's already tied to OTHER leagues (genuinely
// ambiguous — it might not actually belong to this one too).
function autoAssociateWithLeague(mapKey, name, league) {
  var trimmedLeague = safeStr(league).trim();
  if (!trimmedLeague || !name) return;
  if (isEntryInLeague(mapKey, name, trimmedLeague)) return;
  var existing = getEntryLeagues(mapKey, name);
  if (existing.length && !confirm('"' + name + '" is already linked to ' + existing.join(", ") + '. Also link it to "' + trimmedLeague + '"?')) return;
  addEntryLeague(mapKey, name, trimmedLeague);
}

// Tracks the single chip currently in inline-rename mode, e.g. { listName, value }.
// window.prompt() is unusable here since standalone iOS PWAs silently no-op it.
var _mlEditing = null;

// Per-list chip filter text, keyed by listName — lets a long list be searched
// instead of scrolling through every chip on a small screen.
var _mlFilter = {
  masterTeamNames: "",
  masterLocations: "",
  masterAgeCategories: "",
  masterLeagues: "",
};

var ML_COUNT_ELS = {
  masterTeamNames: "mlCountTeamNames",
  masterLocations: "mlCountLocations",
  masterAgeCategories: "mlCountAgeCategories",
  masterLeagues: "mlCountLeagues",
};

// Fill shown on a Team Names chip's color swatch when no color has been remembered yet
var ML_CHIP_NO_COLOR = "#9ca3af";

function renderMasterListChips(containerId, listName) {
  var container = $(containerId);
  if (!container) return;
  var values = settings[listName] || [];
  var filterText = (_mlFilter[listName] || "").trim().toLowerCase();
  var shown = filterText ? values.filter(function (v) { return v.toLowerCase().indexOf(filterText) !== -1; }) : values;

  var countEl = $(ML_COUNT_ELS[listName]);
  if (countEl) {
    countEl.textContent = filterText ? (shown.length + " of " + values.length) : (values.length ? String(values.length) : "");
  }

  if (!values.length) {
    container.innerHTML = '<span class="no-data-msg">None yet</span>';
    return;
  }
  if (!shown.length) {
    container.innerHTML = '<span class="no-data-msg">No matches</span>';
    return;
  }
  var isTeamNames = listName === "masterTeamNames";
  var isLeagues = listName === "masterLeagues";
  var leagueMapKey = LEAGUE_MAP_KEY_BY_LIST[listName] || null;
  container.innerHTML = shown.map(function (v) {
    var isEditingThis = _mlEditing && _mlEditing.listName === listName && _mlEditing.value === v;
    var color = isTeamNames ? (getRememberedTeamColor(v) || ML_CHIP_NO_COLOR) : null;
    if (isEditingThis) {
      // Full edit mode (entered via the pencil): the color becomes editable here too.
      var colorBtn = isTeamNames ?
        '<button type="button" class="ml-chip-color" data-value="' + esc(v) + '" style="background:' + esc(color) + '" aria-label="Set color for ' + esc(v) + '" title="Set color for ' + esc(v) + '"></button>' : "";
      return '<span class="ml-chip ml-chip-editing">' + colorBtn +
        '<input type="text" class="ml-chip-input" data-list="' + listName + '" data-value="' + esc(v) + '" value="' + esc(v) + '"></span>';
    }
    // Outside edit mode, the color is just a static display dot — editing it
    // requires clicking the pencil first (same as renaming).
    var colorDot = isTeamNames ? '<span class="ml-chip-color-dot" style="background:' + esc(color) + '" aria-hidden="true"></span>' : "";
    // League-tags badge: read-only display of this entry's league associations
    // (editing happens in the League's own "manage members" modal, not here).
    var leagueTagsHtml = leagueMapKey ? renderLeagueTagsHtml(getEntryLeagues(leagueMapKey, v)) : "";
    // League chips get an always-visible "manage members" button (a primary
    // action, unlike rename which is decorative and gated behind the pencil setting).
    // Uses an inline SVG (fill="currentColor") rather than the 👥 emoji — emoji
    // glyphs render with their own fixed color regardless of theme, which made
    // this icon too dark to read against both light and dark chip backgrounds.
    var manageBtn = isLeagues ?
      '<button type="button" class="ml-chip-manage-btn" data-value="' + esc(v) + '" aria-label="Manage teams, age categories, and locations for ' + esc(v) + '" title="Manage teams, age categories &amp; locations">' +
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0ZM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0ZM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122ZM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003Z"/></svg>' +
      '</button>' : "";
    return '<span class="ml-chip">' + colorDot + esc(v) + leagueTagsHtml + manageBtn +
      (settings.showMasterListEditIcons ? '<button type="button" class="ml-chip-edit" data-list="' + listName + '" data-value="' + esc(v) + '" aria-label="Rename ' + esc(v) + '">&#9998;</button>' : "") +
      '<button type="button" class="ml-chip-remove" data-list="' + listName + '" data-value="' + esc(v) + '" aria-label="Remove ' + esc(v) + '">&times;</button></span>';
  }).join("");
  if (_mlEditing && _mlEditing.listName === listName) {
    var input = container.querySelector(".ml-chip-input");
    if (input) { input.focus(); input.select(); }
  }
}

// Renders a read-only row of small league-name pills for a Team Name/Age
// Category chip, or "" if the entry has no league associations yet.
function renderLeagueTagsHtml(leagues) {
  if (!leagues || !leagues.length) return "";
  return '<span class="ml-chip-league-tags">' +
    leagues.map(function (l) { return '<span class="ml-chip-league-tag">' + esc(l) + '</span>'; }).join("") +
    '</span>';
}

// Renders the Setup → Match Info Lists editors (add input + chip list) for all four master lists.
function renderMasterListEditors() {
  renderMasterListChips("mlListTeamNames", "masterTeamNames");
  renderMasterListChips("mlListLocations", "masterLocations");
  renderMasterListChips("mlListAgeCategories", "masterAgeCategories");
  renderMasterListChips("mlListLeagues", "masterLeagues");
}

// ---- Remark presets editor (Setup) ----------------------------------

var _remarkPresetEditingIndex = null; // index currently in inline-edit mode, or null

function renderRemarkPresetList() {
  var container = $("remarkPresetList");
  if (!container) return;
  var list = settings.remarkPresets || [];

  if (!list.length) {
    container.innerHTML = '<span class="no-data-msg">None yet</span>';
    return;
  }

  container.innerHTML = list.map(function (text, i) {
    if (_remarkPresetEditingIndex === i) {
      // A full <textarea> (not a single-line, select-all-on-focus input) so long
      // remark text wraps and stays fully visible/editable, with explicit Save/
      // Cancel buttons instead of committing on blur — on mobile, a pre-selected
      // input makes tapping mid-text bring up the copy/replace menu instead of
      // placing the cursor, and losing focus (e.g. to dismiss that menu) would
      // otherwise silently commit or lose the in-progress edit.
      return '<div class="remark-preset-row remark-preset-row-editing">' +
        '<textarea class="remark-preset-input" data-index="' + i + '">' + esc(text) + '</textarea>' +
        '<div class="remark-token-toolbar">' +
        '<span class="remark-token-hint">Insert:</span>' +
        '<button type="button" class="remark-token-btn" data-token="{TEAM}">Team</button>' +
        '<button type="button" class="remark-token-btn" data-token="{SET}">Set</button>' +
        '<button type="button" class="remark-token-btn" data-token="{SCORE}">Score</button>' +
        '<button type="button" class="remark-token-btn" data-token="{PLAYER}">Player</button>' +
        '<button type="button" class="remark-token-btn" data-token="{STAFF}">Staff</button>' +
        '</div>' +
        '<div class="remark-preset-edit-actions">' +
        '<button type="button" class="remark-preset-save-btn ctrl-btn" data-index="' + i + '">Save</button>' +
        '<button type="button" class="remark-preset-cancel-btn" data-index="' + i + '">Cancel</button>' +
        '</div>' +
        '</div>';
    }
    return '<div class="remark-preset-row">' +
      '<div class="remark-preset-reorder">' +
      '<button type="button" class="remark-preset-move-btn" data-dir="up" data-index="' + i + '"' + (i === 0 ? " disabled" : "") + ' aria-label="Move up">&#9650;</button>' +
      '<button type="button" class="remark-preset-move-btn" data-dir="down" data-index="' + i + '"' + (i === list.length - 1 ? " disabled" : "") + ' aria-label="Move down">&#9660;</button>' +
      '</div>' +
      '<span class="remark-preset-text">' + esc(text) + '</span>' +
      '<button type="button" class="remark-preset-edit-btn" data-index="' + i + '" aria-label="Edit remark">&#9998;</button>' +
      '<button type="button" class="remark-preset-remove-btn" data-index="' + i + '" aria-label="Remove remark">&times;</button>' +
      '</div>';
  }).join("");

  if (_remarkPresetEditingIndex !== null) {
    var input = container.querySelector(".remark-preset-input");
    // Focus with the cursor at the end (not select-all) so normal tap-to-position
    // editing works right away, and no accidental full-text overwrite on the
    // first keystroke.
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }
}

// ---- League "manage members" modal ---------------------------------

var _lmLeague = null; // league name currently open in the modal, or null
var _lmTeamFilter = "";
var _lmAgeCategoryFilter = "";
var _lmLocationFilter = "";

function openLeagueMembersModal(league) {
  _lmLeague = league;
  _lmTeamFilter = "";
  _lmAgeCategoryFilter = "";
  _lmLocationFilter = "";
  $("lmTeamFilter").value = "";
  $("lmAgeCategoryFilter").value = "";
  $("lmLocationFilter").value = "";
  $("leagueMembersModalTitle").textContent = "Manage \u201c" + league + "\u201d";
  renderLeagueMembersModal();
  $("leagueMembersModal").removeAttribute("hidden");
}

function closeLeagueMembersModal() {
  _lmLeague = null;
  $("leagueMembersModal").hidden = true;
}

function renderLeagueMembersCheckList(containerId, listName, mapKey, filterText) {
  var container = $(containerId);
  if (!container || !_lmLeague) return;
  var values = settings[listName] || [];
  var q = (filterText || "").trim().toLowerCase();
  var shown = q ? values.filter(function (v) { return v.toLowerCase().indexOf(q) !== -1; }) : values;
  if (!shown.length) {
    container.innerHTML = '<span class="no-data-msg">' + (values.length ? "No matches" : "None yet") + '</span>';
    return;
  }
  container.innerHTML = shown.map(function (v) {
    var checked = isEntryInLeague(mapKey, v, _lmLeague);
    return '<label class="lm-check-row"><input type="checkbox" data-map="' + mapKey + '" data-value="' + esc(v) + '"' + (checked ? " checked" : "") + '> ' + esc(v) + '</label>';
  }).join("");
}

function renderLeagueMembersModal() {
  renderLeagueMembersCheckList("lmTeamList", "masterTeamNames", "teamLeagues", _lmTeamFilter);
  renderLeagueMembersCheckList("lmAgeCategoryList", "masterAgeCategories", "ageCategoryLeagues", _lmAgeCategoryFilter);
  renderLeagueMembersCheckList("lmLocationList", "masterLocations", "locationLeagues", _lmLocationFilter);
}

// ---- Backfill league associations from saved game history -------------

// Scans every saved game's GAME_STARTED event and, for any that recorded a
// league, links that league to the game's teamA/teamB/ageCategory (if not
// already linked). Opt-in/explicit (button-triggered) — never runs automatically,
// since inferring associations from history could occasionally be wrong (e.g. a
// one-off exhibition match under a league a team doesn't normally play in).
async function backfillLeagueAssociationsFromGames() {
  var index = dbListGames();
  var linked = 0;
  var gamesWithLeague = 0;
  for (var i = 0; i < index.length; i++) {
    var record = await dbLoadGame(index[i].gameId);
    if (!record) continue;
    var startEv = (record.events || []).find(function (e) { return e.type === "GAME_STARTED"; });
    if (!startEv || !startEv.league) continue;
    gamesWithLeague++;
    if (startEv.teamA && addEntryLeague("teamLeagues", startEv.teamA, startEv.league)) linked++;
    if (startEv.teamB && addEntryLeague("teamLeagues", startEv.teamB, startEv.league)) linked++;
    if (startEv.ageCategory && addEntryLeague("ageCategoryLeagues", startEv.ageCategory, startEv.league)) linked++;
    if (startEv.location && addEntryLeague("locationLeagues", startEv.location, startEv.league)) linked++;
  }
  renderMasterListEditors();
  alert(gamesWithLeague ?
    ("Linked " + linked + " association" + (linked === 1 ? "" : "s") + " from " + gamesWithLeague + " game" + (gamesWithLeague === 1 ? "" : "s") + " with a league recorded.") :
    "No saved games have a league recorded — nothing to infer.");
}

// Scans every saved game's GAME_STARTED event and returns, per master list, the
// set of lower-cased values actually referenced by at least one saved game.
async function computeMasterListUsage() {
  var usage = {
    masterTeamNames: new Set(),
    masterLocations: new Set(),
    masterAgeCategories: new Set(),
    masterLeagues: new Set(),
  };
  var index = dbListGames();
  for (var i = 0; i < index.length; i++) {
    var record = await dbLoadGame(index[i].gameId);
    if (!record) continue;
    var startEv = (record.events || []).find(function (e) { return e.type === "GAME_STARTED"; });
    if (!startEv) continue;
    if (startEv.teamA) usage.masterTeamNames.add(startEv.teamA.toLowerCase());
    if (startEv.teamB) usage.masterTeamNames.add(startEv.teamB.toLowerCase());
    if (startEv.location) usage.masterLocations.add(startEv.location.toLowerCase());
    if (startEv.ageCategory) usage.masterAgeCategories.add(startEv.ageCategory.toLowerCase());
    if (startEv.league) usage.masterLeagues.add(startEv.league.toLowerCase());
  }
  return usage;
}

// Removes master-list entries not referenced by any saved game (case-insensitive).
// Safe to run any time — saved games store their own copy of these fields directly
// on the GAME_STARTED event, so pruning the master list never touches game data.
async function removeUnusedMasterListEntries(listName, label) {
  var usage = await computeMasterListUsage();
  var used = usage[listName] || new Set();
  var list = settings[listName] || [];
  var unused = list.filter(function (v) { return !used.has(v.toLowerCase()); });
  if (!unused.length) {
    alert("Every " + label + " entry is used by a saved game — nothing to remove.");
    return;
  }
  var plural = unused.length === 1 ? "y" : "ies";
  if (!confirm("Remove " + unused.length + " unused " + label + " entr" + plural + "?\n\n" +
    "These aren't referenced by any saved game. You can always re-add one by typing it again.")) return;
  unused.forEach(function (v) { removeFromMasterList(listName, v); });
  renderMasterListEditors();
  renderDefaultPickerOptions();
}

function fillSelectOptions(id, values, selected) {
  var el = $(id);
  if (!el) return;
  el.innerHTML = '<option value="">None</option>' + (values || []).map(function (v) {
    return '<option value="' + esc(v) + '"' + (v === selected ? " selected" : "") + '>' + esc(v) + '</option>';
  }).join("");
}

// Refreshes the Setup → Game Defaults "Default Age Category"/"Default League" pickers from the master lists.
function renderDefaultPickerOptions() {
  fillSelectOptions("cfgDefAgeCategory", settings.masterAgeCategories, settings.defaultAgeCategory);
  fillSelectOptions("cfgDefLeague", settings.masterLeagues, settings.defaultLeague);
}

