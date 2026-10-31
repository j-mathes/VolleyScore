// ============================================================
// VolleyScore — js/export-import.js  (JSON/Excel/CSV export and import)
// Classic script: shares one global scope with the other js/*.js files.
// Load order is set by the <script> tags in index.html and listed in sw.js.
// © 2025 Jared Mathes — CC BY-NC-SA 4.0
// ============================================================

"use strict";

// ---- Export / Import ------------------------------------

async function downloadFile(filename, content, mimeType) {
  // Prefer the native Share Sheet when the browser can share files — this is what
  // actually lets the user save/send the file on mobile. iOS Safari ignores
  // <a download> entirely, and opening the blob in a new tab (the old fallback)
  // just displays the raw JSON as text instead of offering any way to save it.
  try {
    var file = new File([content], filename, { type: mimeType });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return; // user cancelled the share sheet
    // otherwise fall through to the blob download/tab fallback below
  }

  var blob = new Blob([content], { type: mimeType });
  var url = URL.createObjectURL(blob);
  if (_isIOS) {
    // iOS Safari ignores <a download>; open in new tab so user can save
    window.open(url, "_blank");
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  } else {
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

function gameFilename(record) {
  var slug = (record.gameName || "game").replace(/[^a-zA-Z0-9_-]/g, "_");
  var date = (record.scheduledAt || record.createdAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  return "volleyscore_" + slug + "_" + date + ".json";
}

function exportRecord(record) {
  var payload = {
    version: 1,
    type: "volleyscore-game",
    exportedAt: new Date().toISOString(),
    game: record,
  };
  downloadFile(gameFilename(record), JSON.stringify(payload, null, 2), "application/json");
}

async function exportAllGames() {
  var index = dbListGames();
  var games = [];
  for (var i = 0; i < index.length; i++) {
    var r = await dbLoadGame(index[i].gameId);
    if (r) games.push(r);
  }
  var payload = {
    version: 1,
    type: "volleyscore-export",
    exportedAt: new Date().toISOString(),
    games: games,
  };
  downloadFile("volleyscore_export_" + new Date().toISOString().slice(0, 10) + ".json",
    JSON.stringify(payload, null, 2), "application/json");
}

// Exports the given gameIds (2+ selected from the Games page) as a single multi-game file.
async function exportSelectedGames(gameIds) {
  var games = [];
  for (var i = 0; i < gameIds.length; i++) {
    var r = await dbLoadGame(gameIds[i]);
    if (r) games.push(r);
  }
  if (!games.length) { alert("No games selected."); return; }
  var payload = {
    version: 1,
    type: "volleyscore-export",
    exportedAt: new Date().toISOString(),
    games: games,
  };
  var suffix = games.length + (games.length === 1 ? "game" : "games");
  downloadFile("volleyscore_export_" + suffix + "_" + new Date().toISOString().slice(0, 10) + ".json",
    JSON.stringify(payload, null, 2), "application/json");
}

// Adds a game's teamA/teamB/location/ageCategory/league to the master lists if not already present.
// Returns the number of new entries added.
function populateMasterListsFromGame(record) {
  var startEv = (record.events || []).find(function (e) { return e.type === "GAME_STARTED"; });
  if (!startEv) return 0;
  var added = 0;
  if (addToMasterList("masterTeamNames", startEv.teamA)) added++;
  if (addToMasterList("masterTeamNames", startEv.teamB)) added++;
  if (addToMasterList("masterLocations", startEv.location)) added++;
  if (addToMasterList("masterAgeCategories", startEv.ageCategory)) added++;
  if (addToMasterList("masterLeagues", startEv.league)) added++;
  return added;
}

async function importGamesFromJson(text) {
  var payload;
  try { payload = JSON.parse(text); } catch (e) { alert("Invalid JSON file."); return; }

  var games = [];
  if (payload.type === "volleyscore-game" && payload.game) {
    games = [payload.game];
  } else if (payload.type === "volleyscore-export" && Array.isArray(payload.games)) {
    games = payload.games;
  } else if (payload.gameId) {
    // Raw game record
    games = [payload];
  } else {
    alert("Unrecognized file format.");
    return;
  }

  var imported = 0;
  var listEntriesAdded = 0;
  for (var i = 0; i < games.length; i++) {
    var g = games[i];
    if (!g.gameId || !Array.isArray(g.events)) continue;
    await dbSaveGame(g);
    listEntriesAdded += populateMasterListsFromGame(g);
    imported++;
  }
  if (listEntriesAdded) {
    renderMasterListEditors();
    renderDefaultPickerOptions();
  }
  var msg = "Imported " + imported + " game" + (imported === 1 ? "" : "s") + ".";
  if (listEntriesAdded) msg += " Added " + listEntriesAdded + " new match info entr" + (listEntriesAdded === 1 ? "y" : "ies") + ".";
  alert(msg);
  await renderGamesList();
}

// ---- Match Info Lists: export / import (JSON) ------------

function exportCategoriesJson() {
  var payload = {
    version: 1,
    type: "volleyscore-categories",
    exportedAt: new Date().toISOString(),
    teamNames: settings.masterTeamNames || [],
    locations: settings.masterLocations || [],
    ageCategories: settings.masterAgeCategories || [],
    leagues: settings.masterLeagues || [],
    teamColors: settings.teamColors || {},
    teamLeagues: settings.teamLeagues || {},
    ageCategoryLeagues: settings.ageCategoryLeagues || {},
    locationLeagues: settings.locationLeagues || {},
  };
  downloadFile("volleyscore_categories_" + new Date().toISOString().slice(0, 10) + ".json",
    JSON.stringify(payload, null, 2), "application/json");
}

// Merges a {name: [league, ...]} payload map into the given association map via
// addEntryLeague (shared by JSON import). Skips (rather than crashing on) any
// name or league that isn't a real, already-known master-list entry — guards
// against a hand-edited file referencing something that was never added (a
// dangling/typo'd reference), not just against wrong data types. Returns the
// number of links added.
function importLeagueAssociationsMap(mapKey, payloadMap) {
  var added = 0;
  if (!payloadMap || typeof payloadMap !== "object") return added;
  var masterListKey = MASTER_LIST_KEY_BY_LEAGUE_MAP[mapKey];
  for (var name in payloadMap) {
    if (!payloadMap.hasOwnProperty(name)) continue;
    if (!masterListHasCI(masterListKey, name)) continue;
    var leagues = payloadMap[name];
    if (!Array.isArray(leagues)) continue;
    leagues.forEach(function (league) {
      if (typeof league === "string" && masterListHasCI("masterLeagues", league) && addEntryLeague(mapKey, name, league)) added++;
    });
  }
  return added;
}

function importCategoriesFromJson(text) {
  var payload;
  try { payload = JSON.parse(text); } catch (e) { alert("Invalid JSON file."); return; }
  if (payload.type !== "volleyscore-categories") { alert("Unrecognized file format."); return; }

  var added = 0;
  var skipped = 0;
  // Non-string entries (a hand-edited file with e.g. a stray number) are counted
  // and skipped rather than passed to addToMasterList, which would otherwise
  // just silently no-op on them now that it's hardened — this just gives the
  // user visible feedback that something in the file wasn't right.
  function importList(listName, arr) {
    (arr || []).forEach(function (v) {
      if (typeof v !== "string") { skipped++; return; }
      if (addToMasterList(listName, v)) added++;
    });
  }
  importList("masterTeamNames", payload.teamNames);
  importList("masterLocations", payload.locations);
  importList("masterAgeCategories", payload.ageCategories);
  importList("masterLeagues", payload.leagues);

  var colorsImported = 0;
  if (payload.teamColors && typeof payload.teamColors === "object") {
    for (var key in payload.teamColors) {
      if (!payload.teamColors.hasOwnProperty(key)) continue;
      var hex = payload.teamColors[key];
      if (typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex)) { rememberTeamColor(key, hex); colorsImported++; }
    }
  }
  var associationsImported = importLeagueAssociationsMap("teamLeagues", payload.teamLeagues) +
    importLeagueAssociationsMap("ageCategoryLeagues", payload.ageCategoryLeagues) +
    importLeagueAssociationsMap("locationLeagues", payload.locationLeagues);

  renderMasterListEditors();
  renderDefaultPickerOptions();
  var msg = "Imported " + added + " new entr" + (added === 1 ? "y" : "ies") + ".";
  if (colorsImported) msg += " Updated " + colorsImported + " team color" + (colorsImported === 1 ? "" : "s") + ".";
  if (associationsImported) msg += " Linked " + associationsImported + " league association" + (associationsImported === 1 ? "" : "s") + ".";
  if (skipped) msg += " Skipped " + skipped + " invalid entr" + (skipped === 1 ? "y" : "ies") + " in the file.";
  alert(msg);
}

// ---- Match Info Lists: export as .xlsx (hand-rolled, stored/uncompressed ZIP) ----
// Each category gets its own sheet/tab. Import only supports JSON — .xlsx export
// is meant for viewing/sharing in Excel, not as a round-trip import format.

var CRC32_TABLE = (function () {
  var table = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  var crc = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function concatUint8(arrays) {
  var total = arrays.reduce(function (s, a) { return s + a.length; }, 0);
  var out = new Uint8Array(total);
  var offset = 0;
  arrays.forEach(function (a) { out.set(a, offset); offset += a.length; });
  return out;
}

// Builds a ZIP archive (stored/no-compression entries) from [{ name, data: Uint8Array }].
function buildZip(files) {
  var localChunks = [];
  var centralChunks = [];
  var offset = 0;

  files.forEach(function (f) {
    var nameBytes = new TextEncoder().encode(f.name);
    var crc = crc32(f.data);
    var size = f.data.length;

    var local = new Uint8Array(30 + nameBytes.length);
    var lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x21, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localChunks.push(local, f.data);

    var central = new Uint8Array(46 + nameBytes.length);
    var cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralChunks.push(central);

    offset += local.length + f.data.length;
  });

  var centralStart = offset;
  var centralBlock = concatUint8(centralChunks);

  var eocd = new Uint8Array(22);
  var ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralBlock.length, true);
  ev.setUint32(16, centralStart, true);

  return concatUint8(localChunks.concat([centralBlock, eocd]));
}

function xlsxColLetter(i) {
  var s = "";
  i++;
  while (i > 0) {
    var rem = (i - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

// footerText, if given, becomes the printed page footer (Excel's own page-footer
// feature — shows when the sheet itself is printed, independent of our HTML report footer).
// footerText, if given, becomes the printed page footer (Excel's own page-footer
// feature — shows when the sheet itself is printed, independent of our HTML report footer).
// merges is an optional array of "A1:B1"-style ranges to merge (e.g. a team name
// spanning that team's columns). boldCenterRows is an optional array of 0-based
// row indices whose cells should render bold + centered (style index 1).
function xlsxSheetXml(rows, footerText, merges, boldCenterRows) {
  var boldCenterSet = {};
  (boldCenterRows || []).forEach(function (ri) { boldCenterSet[ri] = true; });
  var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  rows.forEach(function (row, ri) {
    xml += '<row r="' + (ri + 1) + '">';
    var styleAttr = boldCenterSet[ri] ? ' s="1"' : '';
    row.forEach(function (val, ci) {
      var ref = xlsxColLetter(ci) + (ri + 1);
      xml += '<c r="' + ref + '"' + styleAttr + ' t="inlineStr"><is><t xml:space="preserve">' + esc(String(val)) + '</t></is></c>';
    });
    xml += '</row>';
  });
  xml += '</sheetData>';
  if (merges && merges.length) {
    xml += '<mergeCells count="' + merges.length + '">' +
      merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join("") +
      '</mergeCells>';
  }
  if (footerText) {
    xml += '<headerFooter><oddFooter>&amp;C&amp;"Calibri"' + esc(footerText) + '</oddFooter></headerFooter>';
  }
  xml += '</worksheet>';
  return xml;
}

function xlsxWorkbookXml(sheetNames) {
  var sheets = sheetNames.map(function (name, i) {
    return '<sheet name="' + esc(name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
  }).join("");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' + sheets + '</sheets></workbook>';
}

function xlsxWorkbookRelsXml(sheetCount) {
  var rels = "";
  for (var i = 0; i < sheetCount; i++) {
    rels += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
  }
  rels += '<Relationship Id="rId' + (sheetCount + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>';
}

function xlsxContentTypesXml(sheetCount) {
  var overrides = '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
  for (var i = 0; i < sheetCount; i++) {
    overrides += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' + overrides + '</Types>';
}

var XLSX_ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

var XLSX_STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
  '</cellXfs>' +
  '</styleSheet>';

function exportCategoriesXlsx() {
  var sheetsData = [
    { name: "Team Names", values: settings.masterTeamNames || [] },
    { name: "Locations", values: settings.masterLocations || [] },
    { name: "Age Categories", values: settings.masterAgeCategories || [] },
    { name: "Leagues", values: settings.masterLeagues || [] },
  ];

  var enc = new TextEncoder();
  var files = [
    { name: "[Content_Types].xml", data: enc.encode(xlsxContentTypesXml(sheetsData.length)) },
    { name: "_rels/.rels", data: enc.encode(XLSX_ROOT_RELS) },
    { name: "xl/workbook.xml", data: enc.encode(xlsxWorkbookXml(sheetsData.map(function (s) { return s.name; }))) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(xlsxWorkbookRelsXml(sheetsData.length)) },
    { name: "xl/styles.xml", data: enc.encode(XLSX_STYLES_XML) },
  ];
  sheetsData.forEach(function (sheet, i) {
    var rows;
    if (sheet.name === "Team Names") {
      rows = [[sheet.name, "Color", "Leagues"]].concat(sheet.values.map(function (v) {
        return [v, getRememberedTeamColor(v) || "", getEntryLeagues("teamLeagues", v).join(", ")];
      }));
    } else if (sheet.name === "Age Categories") {
      rows = [[sheet.name, "Leagues"]].concat(sheet.values.map(function (v) {
        return [v, getEntryLeagues("ageCategoryLeagues", v).join(", ")];
      }));
    } else if (sheet.name === "Locations") {
      rows = [[sheet.name, "Leagues"]].concat(sheet.values.map(function (v) {
        return [v, getEntryLeagues("locationLeagues", v).join(", ")];
      }));
    } else {
      rows = [[sheet.name]].concat(sheet.values.map(function (v) { return [v]; }));
    }
    files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: enc.encode(xlsxSheetXml(rows)) });
  });

  var zipBytes = buildZip(files);
  downloadFile("volleyscore_categories_" + new Date().toISOString().slice(0, 10) + ".xlsx",
    zipBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

// ---- Match Info Lists: import from .xlsx (hand-rolled ZIP reader + DOM XML parsing) ----
// Supports both "stored" (uncompressed) and "deflate" entries — the latter via the
// browser's native DecompressionStream, so no hand-written inflate is needed. Sheets are
// matched to a category by name; column A values become that category's list entries.

function findZipEocd(bytes) {
  var minPos = Math.max(0, bytes.length - 65557); // max comment length (65535) + EOCD record (22)
  for (var i = bytes.length - 22; i >= minPos; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return i;
  }
  return -1;
}

// Reads the central directory into a { name: {method, compSize, localOffset} } map.
function readZipEntries(bytes) {
  var eocdPos = findZipEocd(bytes);
  if (eocdPos === -1) throw new Error("Not a valid .xlsx (zip) file.");
  var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  var entryCount = dv.getUint16(eocdPos + 10, true);
  var pos = dv.getUint32(eocdPos + 16, true);

  var entries = {};
  for (var i = 0; i < entryCount; i++) {
    if (dv.getUint32(pos, true) !== 0x02014b50) break;
    var method = dv.getUint16(pos + 10, true);
    var compSize = dv.getUint32(pos + 20, true);
    var nameLen = dv.getUint16(pos + 28, true);
    var extraLen = dv.getUint16(pos + 30, true);
    var commentLen = dv.getUint16(pos + 32, true);
    var localOffset = dv.getUint32(pos + 42, true);
    var name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    entries[name] = { method: method, compSize: compSize, localOffset: localOffset };
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readZipEntryData(bytes, entry) {
  var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  var pos = entry.localOffset;
  if (dv.getUint32(pos, true) !== 0x04034b50) throw new Error("Corrupt .xlsx (zip) entry.");
  var nameLen = dv.getUint16(pos + 26, true);
  var extraLen = dv.getUint16(pos + 28, true);
  var dataStart = pos + 30 + nameLen + extraLen;
  var raw = bytes.subarray(dataStart, dataStart + entry.compSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("This browser can't open Excel files that use compression. Try a newer browser, or import the JSON export instead.");
    }
    var stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error("Unsupported compression in .xlsx file.");
}

function xlsxPartPath(target) {
  var t = target.replace(/^\.?\//, "");
  return /^xl\//.test(t) ? t : "xl/" + t;
}

function xmlText(el) {
  return el ? Array.prototype.map.call(el.getElementsByTagName("t"), function (t) { return t.textContent; }).join("") : "";
}

var CATEGORY_SHEET_NAMES = {
  "team names": "masterTeamNames",
  "locations": "masterLocations",
  "age categories": "masterAgeCategories",
  "leagues": "masterLeagues",
};

// Reads a single XLSX cell's text content, resolving shared-string references.
function xlsxCellText(cell, sharedStrings) {
  if (!cell) return "";
  var type = cell.getAttribute("t");
  var text;
  if (type === "inlineStr") {
    text = xmlText(cell.getElementsByTagName("is")[0]);
  } else if (type === "s") {
    var vEl = cell.getElementsByTagName("v")[0];
    text = sharedStrings[vEl ? parseInt(vEl.textContent, 10) : -1] || "";
  } else {
    var vEl2 = cell.getElementsByTagName("v")[0];
    text = vEl2 ? vEl2.textContent : (cell.textContent || "");
  }
  return (text || "").trim();
}

async function importCategoriesFromXlsx(arrayBuffer) {
  var bytes = new Uint8Array(arrayBuffer);
  var decoder = new TextDecoder();
  var parser = new DOMParser();
  var entries;

  try {
    entries = readZipEntries(bytes);
  } catch (e) {
    alert("Could not read that file as an Excel workbook.");
    return;
  }

  async function readPart(name) {
    var entry = entries[name];
    if (!entry) return null;
    var data = await readZipEntryData(bytes, entry);
    return parser.parseFromString(decoder.decode(data), "application/xml");
  }

  var added = 0;
  var colorsAdded = 0;
  var associationsAdded = 0;
  try {
    var workbookXml = await readPart("xl/workbook.xml");
    if (!workbookXml) throw new Error("Missing workbook.xml.");

    var relsXml = await readPart("xl/_rels/workbook.xml.rels");
    var relMap = {};
    if (relsXml) {
      Array.prototype.forEach.call(relsXml.getElementsByTagName("Relationship"), function (rel) {
        relMap[rel.getAttribute("Id")] = rel.getAttribute("Target");
      });
    }

    var sharedStrings = [];
    var sstXml = await readPart("xl/sharedStrings.xml");
    if (sstXml) {
      Array.prototype.forEach.call(sstXml.getElementsByTagName("si"), function (si) {
        sharedStrings.push(xmlText(si));
      });
    }

    var sheetEls = workbookXml.getElementsByTagName("sheet");
    var sheetsData = []; // collected per-sheet, applied in two passes below (see comment there)
    for (var i = 0; i < sheetEls.length; i++) {
      var sheetName = (sheetEls[i].getAttribute("name") || "").trim();
      var listKey = CATEGORY_SHEET_NAMES[sheetName.toLowerCase()];
      if (!listKey) continue;

      var rId = sheetEls[i].getAttribute("r:id") ||
        sheetEls[i].getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      var target = relMap[rId];
      if (!target) continue;

      var sheetXml = await readPart(xlsxPartPath(target));
      if (!sheetXml) continue;

      var isTeamNames = listKey === "masterTeamNames";
      var isAgeCategories = listKey === "masterAgeCategories";
      var isLocations = listKey === "masterLocations";
      // Team Names: A=name, B=color, C=leagues. Age Categories/Locations: A=name, B=leagues.
      var leagueColIndex = isTeamNames ? 2 : ((isAgeCategories || isLocations) ? 1 : -1);
      var leagueMapKey = LEAGUE_MAP_KEY_BY_LIST[listKey] || null;
      var values = [];
      var colorsByName = {}; // Team Names sheet only — column B holds the hex color, if any
      var leaguesByName = {}; // Team Names/Age Categories sheets only — comma-joined league list
      var rows = sheetXml.getElementsByTagName("row");
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].getElementsByTagName("c");
        var text = xlsxCellText(cells[0], sharedStrings);
        if (!text) continue;
        values.push(text);
        if (isTeamNames) {
          var colorText = xlsxCellText(cells[1], sharedStrings);
          if (/^#[0-9a-f]{6}$/i.test(colorText)) colorsByName[text] = colorText;
        }
        if (leagueColIndex >= 0) {
          var leaguesText = xlsxCellText(cells[leagueColIndex], sharedStrings);
          if (leaguesText) {
            leaguesByName[text] = leaguesText.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
          }
        }
      }

      // Drop the header row (our own export repeats the category name there)
      if (values.length && values[0].toLowerCase() === sheetName.toLowerCase()) values.shift();
      sheetsData.push({ listKey: listKey, values: values, colorsByName: colorsByName, leagueMapKey: leagueMapKey, leaguesByName: leaguesByName });
    }

    // Pass 1: add every sheet's plain values to their master lists FIRST, across
    // ALL sheets, before touching any league associations below. This matters
    // because our own sheet order is Team Names/Locations/Age Categories/Leagues,
    // but a hand-reordered workbook could put "Leagues" first — associations are
    // only accepted for names/leagues that already exist in their master list
    // (see importLeagueAssociationsMap's sibling guard below), so every sheet's
    // plain entries must be committed before any association is evaluated,
    // regardless of what order the sheets happen to appear in the file.
    sheetsData.forEach(function (sd) {
      sd.values.forEach(function (v) { if (addToMasterList(sd.listKey, v)) added++; });
    });

    // Pass 2: colors and league associations, now that every sheet's names are
    // guaranteed to already be in their master lists.
    sheetsData.forEach(function (sd) {
      if (sd.listKey === "masterTeamNames") {
        sd.values.forEach(function (v) {
          if (sd.colorsByName[v]) { rememberTeamColor(v, sd.colorsByName[v]); colorsAdded++; }
        });
      }
      if (sd.leagueMapKey) {
        var masterListKey = MASTER_LIST_KEY_BY_LEAGUE_MAP[sd.leagueMapKey];
        sd.values.forEach(function (v) {
          if (!masterListHasCI(masterListKey, v)) return;
          (sd.leaguesByName[v] || []).forEach(function (league) {
            if (masterListHasCI("masterLeagues", league) && addEntryLeague(sd.leagueMapKey, v, league)) associationsAdded++;
          });
        });
      }
    });
  } catch (e) {
    alert(e.message || "Could not import that Excel file.");
    return;
  }

  renderMasterListEditors();
  renderDefaultPickerOptions();
  var msg = "Imported " + added + " new entr" + (added === 1 ? "y" : "ies") + " from Excel.";
  if (colorsAdded) msg += " Updated " + colorsAdded + " team color" + (colorsAdded === 1 ? "" : "s") + ".";
  if (associationsAdded) msg += " Linked " + associationsAdded + " league association" + (associationsAdded === 1 ? "" : "s") + ".";
  alert(msg);
}

// ---- Pre-defined Remarks: export / import (JSON, Excel, CSV) -------------
// Unlike Match Info Lists, order matters here, so importing only ever
// APPENDS new (case-insensitive de-duped) entries to the end — it never
// reorders or replaces what's already there.

function exportRemarkPresetsJson() {
  var payload = {
    version: 1,
    type: "volleyscore-remark-presets",
    exportedAt: new Date().toISOString(),
    remarkPresets: settings.remarkPresets || [],
  };
  downloadFile("volleyscore_remarks_" + new Date().toISOString().slice(0, 10) + ".json",
    JSON.stringify(payload, null, 2), "application/json");
}

function exportRemarkPresetsXlsx() {
  var rows = [["Remarks"]].concat((settings.remarkPresets || []).map(function (v) { return [v]; }));
  var enc = new TextEncoder();
  var files = [
    { name: "[Content_Types].xml", data: enc.encode(xlsxContentTypesXml(1)) },
    { name: "_rels/.rels", data: enc.encode(XLSX_ROOT_RELS) },
    { name: "xl/workbook.xml", data: enc.encode(xlsxWorkbookXml(["Remarks"])) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(xlsxWorkbookRelsXml(1)) },
    { name: "xl/styles.xml", data: enc.encode(XLSX_STYLES_XML) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(xlsxSheetXml(rows)) },
  ];
  var zipBytes = buildZip(files);
  downloadFile("volleyscore_remarks_" + new Date().toISOString().slice(0, 10) + ".xlsx",
    zipBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function csvEscapeField(value) {
  var v = String(value == null ? "" : value);
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function exportRemarkPresetsCsv() {
  var rows = [["Remarks"]].concat((settings.remarkPresets || []).map(function (v) { return [v]; }));
  var csv = rows.map(function (r) { return r.map(csvEscapeField).join(","); }).join("\r\n");
  downloadFile("volleyscore_remarks_" + new Date().toISOString().slice(0, 10) + ".csv", csv, "text/csv");
}

// Minimal RFC-4180-ish CSV parser: handles quoted fields with embedded commas,
// newlines, and escaped ("") quotes. Good enough for a simple single-column file.
function parseCsv(text) {
  var rows = [];
  var row = [];
  var field = "";
  var inQuotes = false;
  // Strip a leading UTF-8 BOM, which Excel adds to CSVs it writes.
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\r") {
      // handled on the following \n
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Appends new (case-insensitive de-duped) preset strings; returns how many were added.
function mergeRemarkPresets(candidates) {
  var added = 0;
  candidates.forEach(function (text) {
    if (typeof text !== "string") return;
    var trimmed = text.trim();
    if (!trimmed) return;
    var exists = (settings.remarkPresets || []).some(function (v) { return v.toLowerCase() === trimmed.toLowerCase(); });
    if (exists) return;
    if (addRemarkPreset(trimmed)) added++;
  });
  return added;
}

function importRemarkPresetsFromJson(text) {
  var payload;
  try { payload = JSON.parse(text); } catch (e) { alert("Invalid JSON file."); return; }
  var list = Array.isArray(payload) ? payload
    : (payload && payload.type === "volleyscore-remark-presets" && Array.isArray(payload.remarkPresets)) ? payload.remarkPresets
    : null;
  if (!list) { alert("Unrecognized file format."); return; }
  var added = mergeRemarkPresets(list);
  renderRemarkPresetList();
  alert("Imported " + added + " new remark" + (added === 1 ? "" : "s") + ".");
}

function importRemarkPresetsFromCsv(text) {
  var rows = parseCsv(text);
  if (rows.length && (rows[0][0] || "").trim().toLowerCase().replace(/s$/, "") === "remark") rows.shift();
  var added = mergeRemarkPresets(rows.map(function (r) { return r[0]; }));
  renderRemarkPresetList();
  alert("Imported " + added + " new remark" + (added === 1 ? "" : "s") + ".");
}

async function importRemarkPresetsFromXlsx(arrayBuffer) {
  var bytes = new Uint8Array(arrayBuffer);
  var decoder = new TextDecoder();
  var parser = new DOMParser();
  var added = 0;

  try {
    var entries = readZipEntries(bytes);
    async function readPart(name) {
      var entry = entries[name];
      if (!entry) return null;
      var data = await readZipEntryData(bytes, entry);
      return parser.parseFromString(decoder.decode(data), "application/xml");
    }

    var workbookXml = await readPart("xl/workbook.xml");
    if (!workbookXml) throw new Error("Missing workbook.xml.");
    var relsXml = await readPart("xl/_rels/workbook.xml.rels");
    var relMap = {};
    if (relsXml) {
      Array.prototype.forEach.call(relsXml.getElementsByTagName("Relationship"), function (rel) {
        relMap[rel.getAttribute("Id")] = rel.getAttribute("Target");
      });
    }
    var sharedStrings = [];
    var sstXml = await readPart("xl/sharedStrings.xml");
    if (sstXml) {
      Array.prototype.forEach.call(sstXml.getElementsByTagName("si"), function (si) {
        sharedStrings.push(xmlText(si));
      });
    }

    var sheetEls = workbookXml.getElementsByTagName("sheet");
    var values = null;
    for (var i = 0; i < sheetEls.length; i++) {
      var sheetName = (sheetEls[i].getAttribute("name") || "").trim();
      if (sheetName.toLowerCase().replace(/s$/, "") !== "remark") continue;
      var rId = sheetEls[i].getAttribute("r:id") ||
        sheetEls[i].getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      var target = relMap[rId];
      if (!target) continue;
      var sheetXml = await readPart(xlsxPartPath(target));
      if (!sheetXml) continue;
      values = [];
      var rows = sheetXml.getElementsByTagName("row");
      for (var r = 0; r < rows.length; r++) {
        var text = xlsxCellText(rows[r].getElementsByTagName("c")[0], sharedStrings);
        if (text) values.push(text);
      }
      if (values.length && values[0].toLowerCase().replace(/s$/, "") === "remark") values.shift();
      break;
    }
    if (!values) throw new Error('No "Remarks" sheet found in that workbook.');
    added = mergeRemarkPresets(values);
  } catch (e) {
    alert(e.message || "Could not import that Excel file.");
    return;
  }

  renderRemarkPresetList();
  alert("Imported " + added + " new remark" + (added === 1 ? "" : "s") + " from Excel.");
}

