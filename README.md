# VolleyScore

**Version 28**

Browser-based volleyball scorekeeper. No install, no build step — open `index.html` in any modern browser or use the hosted version:

**[https://j-mathes.github.io/VolleyScore/](https://j-mathes.github.io/VolleyScore/)**

---

## Installing as a PWA

VolleyScore is a Progressive Web App. Install it for a full-screen, offline-capable experience.

| Platform | Steps |
|----------|-------|
| **iOS — Safari** | Share ⎙ → Add to Home Screen → Add. On iOS 17.4+, choose "As Web App" when prompted. |
| **iOS — Chrome / Edge (17+)** | Share ⎙ in the URL bar → Add to Home Screen → Add. |
| **Android — Chrome** | ⋮ menu → Add to Home Screen (or tap the install banner) → Add. |
| **Desktop — Chrome / Edge** | Click the install icon ⊕ in the address bar → Install. |

After installing, the app opens full-screen without browser chrome and works offline.

---

## Quickstart

1. **Score page** — enter team names, pick a format, fair play rule, and first server → **Start Game**. The generic `Team A` and `Team B` values clear when focused; saved custom defaults remain available. Each team name has a color swatch to override that team's color for this match only (see [New Game Team Colors](#new-game-team-colors))
2. Confirm (or change) who serves → **Start Set 1** — the same serve picker used before every set, not just Set 1
3. Tap **+** to score a point; the serve indicator updates automatically. Picked the wrong server? A "Set N serve" chip stays in the game bar until the first point of that set is scored — tap it to correct (see [Match Timing](#match-timing))
4. Sidebar buttons: **TO** (timeout), **Sub** (substitution), card icon (sanctions)
5. **End Set** → choose who serves → **Start Set 2** (pulses green when ready)
6. Repeat until done → **End Game** → **Done** to return to setup
7. **Match Log** (nav bar) — full event log; tap a set number pill to filter by set

---

## Pages

| Page | Purpose |
|------|---------|
| Score | Live scorekeeping |
| Match Log | Event log + set summary (active games only) |
| Games | Browse, resume, export (one, several, or all at once), edit match info, or delete saved games (date and time shown for each) |
| Reports | Build printable/exportable reports across multiple saved games at once (see [Reports](#reports)) |
| Setup | Appearance, game defaults, scoring defaults, Match Info Lists, data management |

---

## Features

- **Configurable scoring** — per-game win target, win-by margin, and score cap for regular and deciding sets (see [Scoring Rules](#scoring-rules))
- **Fair Play rules** — None / Triple Ball / Full / Partial; all timeout and sub limits enforced automatically (see [Fair Play Rules](#fair-play-rules))
- **Scoring** — tap +/− per team; serve dot follows the last scorer automatically
- **Timeouts** — dot indicator (filled = used); count enforced per fair play rule; blocked mid-sequence in Triple Ball
- **Timeout Timer** — optional large full-screen countdown popup when a timeout is called, on by default (see [Timeout Timer](#timeout-timer))
- **Substitutions** — per-team counter; fair play restrictions applied automatically
- **Sanctions** — full misconduct and delay sanction system with escalation enforcement (see [Sanctions](#sanctions))
- **Remarks** — a free-form, timestamped notepad per match; add numbered notes during a live game from the top nav, view or edit them from Game Detail, and see them in the Match Log and Game Report (see [Remarks](#remarks))
- **Win & action alerts** — independently configurable glow and win-condition-toast durations; glow on the TO/sub indicator and sanction chip when actions are recorded (see [Alerts](#alerts))
- **Win condition reminder** — current set's rules shown in the game bar during active play
- **Triple Ball** — animated 6-phase sequence indicator with directional arrows (see [Triple Ball](#triple-ball))
- **Set & match management** — End Set, between-sets serve picker, Start Next Set
- **Undo / Redo** — available during play and immediately after End Game (with optional confirm)
- **Side switching** — swap which panel each team appears on manually, automatically between sets, or via prompted coin-toss/mid-decider confirmations; Triple Ball arrows and the sets-won indicator update accordingly (see [Side Switching](#side-switching))
- **Scheduled vs. actual start time** — pre-configure a planned start time in Game Defaults, while the moment **Start Game** is tapped is always recorded as the actual start (see [Match Timing](#match-timing))
- **Match Info** — track Gender, Age Category, and League per game, with pick-or-type fields backed by editable master lists, plus optional League ↔ Team/Age Category/Location associations that filter those fields against each other (see [Match Info Lists](#match-info-lists))
- **Edit match info after the fact** — correct Team A/B names, Location, Gender, Age Category, or League on any saved game — in progress or finished — from the Games page (see [Editing a Game's Match Info](#editing-a-games-match-info))
- **Multi-game export, import & delete** — select any subset (or all) of your saved games from the Games page to export as a single JSON file or delete together; importing populates the Team Names, Locations, Age Categories, and League master lists with any new values found, in addition to restoring the games themselves (see [Selecting Games to Export or Delete](#selecting-games-to-export-or-delete))
- **Reports** — build a Match Log (a multi-game summary table) or a Game Report (an FIVB-style score sheet, one page per game) across any subset of saved games, with an in-app preview, Excel export, and print/PDF output formatted to fit letter-size pages (see [Reports](#reports))
- **Persist New Game Data** — optionally carry every New Game field forward from your last match instead of resetting to defaults (see [Persisting New Game Data](#persisting-new-game-data))
- **Score button layout** — choose &minus;/+ or +/&minus; order, or mirror the two team panels so the same symbol always sits toward the middle
- **Score button size** — scale the +/&minus; buttons up to 2x from their original (smallest) size, in Setup → Appearance
- **Dark mode & custom colors** — team colors, sidebar border, Start Set button, and alert colors all customizable; every color picker opens a quick preset grid (with a "Custom…" option for the full picker) — see [New Game Team Colors](#new-game-team-colors) for per-game overrides
- **Keep Screen Awake** — optional Wake Lock (iOS 16.4+ PWA, Android, desktop Chrome)
- **PWA / offline** — installs to home screen; auto-update toast when a new version is cached

---

## Game Formats

| Format | Sets | Match win |
|--------|------|-----------|
| Single Set | 1 | Win the set |
| 2 Straight Sets | 2 | Win both sets |
| Best of 3 | up to 3 | First to win 2 sets |
| Best of 5 | up to 5 | First to win 3 sets |

In Best of 3 and Best of 5, the last possible set uses **deciding set** scoring rules; all earlier sets use **regular set** rules. Both are independently configurable.

---

## Scoring Rules

Each game stores its own win conditions, set at game start. Global defaults live in **Setup → Scoring Defaults**.

| Setting | Description | Default |
|---------|-------------|---------|
| Win at | Score a team must reach to be eligible to win | 25 (regular) / 15 (deciding) |
| Win by | Minimum lead required once Win at is reached | 2 |
| Cap | Toggle — reaching this score wins immediately regardless of lead; must be ≥ Win at | off |

**Win by is automatically hidden** when Cap is enabled and `Cap − Win at ≤ Win by`, because the cap fires before a win-by lead becomes reachable. Example: Win at 15, Win by 2, Cap 16 — the cap at 16 means a 2-point lead from 15 (needing 16–14) is cut short, so Win by is hidden.

**Examples**

| Scenario | Regular sets | Deciding set |
|----------|-------------|--------------|
| Standard volleyball | Win at 25, Win by 2 | Win at 15, Win by 2 |
| Capped (wide margin) | Win at 25, Win by 2, Cap 28 | — |
| 2 Straight Sets to 15, capped at 17 | Win at 15, Cap 17 *(Win by hidden)* | n/a |
| Best of 3, short decider | Win at 25, Win by 2 | Win at 5, Cap 7 *(Win by hidden)* |

---

## Fair Play Rules

| Rule | Sets 1–2 | Deciding set |
|------|----------|--------------|
| None | Standard | Standard |
| Triple Ball | 3 TOs, no subs | 2 TOs, 12 subs (after last toss only) |
| Full | 3 TOs, no subs | 2 TOs, 12 subs (any time) |
| Partial | 2 TOs, subs unlock at 15 pts | 2 TOs, subs any time |

When a fair play rule is active the Timeouts/Set and Subs/Set steppers are hidden — the rule controls those values. For Partial, a toast fires when either team reaches 15 points.

---

## New Game Team Colors

Each team name field on the **New Game** form has a color swatch, pre-filled with the global default colors (Setup → Appearance → Team A/B Color — blue and red out of the box). Tap a swatch to open a preset color grid, or choose "Custom…" for the full color picker. This only affects that one game; leave it untouched to use the current defaults.

The override applies everywhere team color drives the UI — score panels, serve dot, sanctions bar, event log, Match Log tables, and so on. It doesn't change your saved global defaults, and returning to the New Game form always resets the swatches back to those defaults **unless a color has been remembered for that team name** (see below), in which case that remembered color wins over the global default.

### Remembered Team Colors

The app remembers the last color used for each team name. Type or pick a team that's used a color before (on the New Game form, in **Setup → Match Info Lists**, or when adding a new team name there) and its swatch auto-fills with that color; changing the color anywhere updates what's remembered for next time. In **Setup → Match Info Lists**, each Team Names chip shows a small color dot — tap the pencil (rename) icon to enter edit mode, where the dot becomes a clickable swatch you can change directly, without starting a game.

### Low-Contrast Color Outline

If a chosen team color is too close to the current background to read comfortably — e.g. a near-white pick in light mode, or a near-black pick in dark mode — the app automatically adds a thin outline (black in light mode, white in dark mode) to that team's score, name, and score buttons so they stay legible. This is fully automatic (based on an actual contrast check against the current theme, not just the color itself), re-evaluates whenever you switch dark mode on/off, and only kicks in for colors that are genuinely hard to see — well-contrasted colors are never outlined.

---

## Match Info Lists

The New Game screen tracks four extra pieces of match info, each backed by a master list you can pick from or type a new value into:

| Field | Type | Starts with |
|-------|------|-------------|
| Team Names | Grows from usage | Empty |
| Locations | Grows from usage | Empty |
| Gender | Fixed choice (Women's / Men's / not specified) | n/a — no list |
| Age Category | Editable list | Senior, Junior, 18U, 17U, 16U, 15U, 14U, 13U, 12U |
| League | Editable list | CSHSAA, ISAA, Foothills, Rockyview, Volleyball Alberta |

Team Name, Location, Age Category, and League fields are pick-or-type: tap the field to see a dropdown of existing values, keep typing to filter it, or type something new. Anything new you type is saved to that field's master list automatically **once you actually start the game** (or save an Edit Info change, or add it directly in Setup) — typing into the New Game form alone doesn't add anything to Setup → Match Info Lists until then, so an abandoned/unstarted game leaves no trace there.

### League Associations

Leagues can be linked to specific Team Names, Age Categories, and Locations (many-to-many — a team, age category, or location can belong to multiple leagues). Once a League is picked on the New Game form (or Edit Info), the Team A/B, Age Category, and Location fields only suggest entries already linked to that league — but you can still freely type a brand-new value regardless. Picking a Team A/B, Age Category, or Location *first* narrows the League suggestions the same way, in reverse.

Typing a brand-new value while a League is set links it to that league automatically. Reusing an existing value:

- **Not linked to any league yet** — links it silently, no prompt.
- **Already linked to a *different* league** — asks for confirmation before also linking it to the current one.

Manage links directly in **Setup → Match Info Lists → Leagues** — tap the people icon on any league to open a checklist of every team, age category, and location, and check/uncheck to link or unlink. There's also an **Infer League Associations from Saved Games** button that scans your saved match history and links whatever combinations of team/age category/location/league actually appeared together in a past game — handy for backfilling links for games recorded before this feature existed, without having to redo it all by hand.

### Managing the Lists

**Setup → Match Info Lists** shows every value in each list with a rename (&#9998;) button and a remove (&times;) button, plus an input to add a new value directly (without creating a game). Rename edits the chip in place (Enter or tap away to save, Esc to cancel) and re-sorts the list; it's also how you'd clean up a typo added by mistake without losing games that already reference the old value. The rename button can be hidden via **Setup → Match Info Lists → Show Edit (Pencil) Icons** if you don't want it cluttering the chip list.

Each list also has a filter box (type to narrow down a long list instead of scrolling) and a **Remove Unused** button that deletes any entries not referenced by a saved game — safe to run any time, since games store their own copy of these fields directly and don't depend on the master list.

**Setup → Game Defaults** lets you set a default Gender, Age Category, and League (in addition to the existing default team names and location) that pre-fill the New Game form. Each can still be overridden per game.

### Editing a Game's Match Info

Already started or finished a game with the wrong team name, location, gender, age category, or league? **Games → select the game → Edit Info** opens a form pre-filled with that game's current values for just those five fields. Saving updates the saved game record (and the live scoreboard/Match Log too, if it's the game currently in progress); scores, sets, and event history are untouched. New values you type are added to the relevant master list, same as the New Game form.

### Export / Import

**Setup → Data** can export and import the four lists — plus each Team Name's remembered color and every League association — as either:

- **JSON** — the app's own round-trip format.
- **Excel (.xlsx)** — one tab per category (Team Names, Locations, Age Categories, Leagues); Team Names also gets a Color column, and Team Names/Age Categories/Locations each get a Leagues column (comma-separated). You can edit values in Excel/Sheets/LibreOffice and import the file back in; sheets are matched by tab name, not position, so they can be in any order.

Either format merges into your existing lists rather than replacing them:

- New list values and new league links are added; duplicates (including ones that only differ by case) are skipped.
- A color for a team you already have gets updated to the imported value.
- A hand-edited file with an invalid entry (wrong type, or a league link referencing a team/league that isn't otherwise in the file) is skipped rather than breaking the whole import.

---

## Persisting New Game Data

By default, the New Game form always resets to your configured defaults (Setup → Game Defaults) for a fresh match. Turning on **Setup → Game Defaults → Persist New Game Data Between Matches** changes this: instead of the defaults, the form pre-fills everything from the *last game you actually started* — team names, team colors, location, gender, age category, league, format, variation, fair play rule, timeouts/subs, scoring rules, and first server.

It's all-or-nothing — there's no way to persist only some fields. Scheduled Start is the one exception and always resets to the current time regardless of this setting, since carrying forward a stale timestamp wouldn't make sense. Turning the toggle off reverts to the original default-based behavior immediately.

---

## Alerts

The app never automatically ends a set or match — it only draws attention to win conditions.

### Win Alerts

When a team's score meets the set-win condition:

- **End Set** button glows persistently until the set is ended
- Winning team **name** and **score** flash a one-shot glow (fades out)
- Toast: `🏅 Team A at set win! (25–22 in Set 1)`
- If it also clinches the match: `🏆 Team A wins the MATCH! (25–22 in Set 2 · Sets 2–0)`
- After **End Set** reveals a match winner: `🏆 Team A wins the match! (2–0 sets)`
- **End Game** button glows between sets when a match winner is determined

Glows and toasts reset on Undo and re-fire if the winning point is re-scored.

Configure the glow color, glow duration, and win-condition toast duration independently in **Setup → Scoring Defaults → Win Alert**. Both durations default to 3 s and can be set from 1 to 30 seconds.

### Action Alerts

A one-shot glow (no toast) flashes on the relevant indicator for each action:

| Action | Glows on |
|--------|----------|
| Timeout taken | TO indicator (label + dots + count) |
| Substitution recorded | Sub counter |
| Sanction / delay sanction issued | The new chip in the sanctions bar |
| Improper request recorded | The IR chip |

Only the chip just added glows — existing chips are not re-glowed. Rapid repeat actions restart the animation.

Configure color and duration in **Setup → Scoring Defaults → Action Alert** (default: purple, 2 s).

---

## Timeout Timer

An optional large on-screen countdown for timeouts — on by default.

- Enable it in **Setup → Game Defaults → Timeout Timer** and set the duration in seconds (default 60).
- When on, calling a timeout for either team shows a full-screen popup with the team name and a large, bold, high-contrast countdown (the color is tuned separately for light and dark mode so it stands out either way).
- Each team's current score and timeout diamonds (same outlined/filled style as the score screen) are shown at the top, on the side matching that team's current court side. The score is colored to match that team's color, same as the main scoreboard.
- **End Timeout** lets the referee dismiss it early if the timeout ends before time is up.
- **Undo Timeout** undoes the timeout entirely (in case it was called by accident) and closes the popup — equivalent to tapping the regular **Undo** button.
- If the countdown reaches 0, the popup stays up briefly (using the **Win condition toast duration** from Setup → Scoring Defaults → Win Alert) and then disappears automatically.

---

## Sanctions

### Misconduct (individual)

| Sanction | Display | Effect |
|----------|---------|--------|
| Warning | 🟨 | No point; one per team per match |
| Penalty | 🟥 | Point + serve to opponent |
| Expulsion | 🟨🟥 | Player removed for rest of set |
| Disqualification | 🟨 🟥 | Player removed for rest of match |

Escalation is enforced — each sanction for the same individual must be higher than the last. Two roles are exempt from individual tracking:

- **Unnumbered players** — without a jersey number the app can't identify the individual, so escalation is not tracked and all levels remain available.
- **Asst. Coach** — each assistant may receive their own sanctions independently.

The team-level one-warning limit still applies to both.

### Delay (team)

| Sanction | Effect |
|----------|--------|
| Delay Warning 🟨⌚ | Caution only; one per team per match |
| Delay Penalty 🟥⌚ | Point + serve to opponent |

### Improper Request

One free per team per match. The button disables once used.

---

## Triple Ball

Three balls are played in sequence before the serve rotates. Six-phase cycle:

```
A Serves →   → B Toss   ← A Toss  |  B Serves ←   ← A Toss   → B Toss
   [0]          [1]        [2]     |     [3]           [4]         [5]
```

The first toss follows the serve direction; the second reverses it.

### Sequence Indicator

A scrolling column (landscape) or strip (portrait) between the team panels shows the previous, current, and next phase inside a stationary highlighted ring. Each box shows the team letter, action type, and a directional arrow that flips automatically on side-swap.

- The **serve dot** stays on the serving team for the full 3-ball half — scoring does not transfer it
- The **− button** acts as Undo, stepping the sequence back
- Configurable in **Setup → Triple Ball**: box size, highlight color, scroll speed

### Timeouts & Substitutions

Only allowed at phase 0 (before A serves) or phase 3 (before B serves). TO and Sub buttons disable at all other phases.

### Penalties

A Red card or Delay Penalty awards a point and advances the sequence. A toast identifies the replaced phase slot. A toggle in the sanction dialog handles mid-rally vs. after-rally.

---

## Match Timing

The **Scheduled Start** field (Score page setup, optional) lets you pre-configure a match for a planned time — useful when setting up a game ahead of the actual first serve. It has no effect on match logic.

Separately, the app always records the real-world moment **Start Game** is tapped as the match's actual start time. Wherever a single date/time is shown (Recent Games, Games list), the actual start time is used. In the **Game Detail** view and **Match Log** header, if the scheduled time and actual start differ, both are shown — e.g. `Scheduled Sep 9 19:00 · Started Sep 9 19:12`.

### Fixing the First Server

If the wrong team is picked to serve, a compact "Set N serve: Team X" chip stays available in the game bar for the *current* set — not just between sets — as long as its score is still 0–0. Tap the chip to open a popup and pick the other team; the chip disappears once either team scores a point, locking the server in. The correction is recorded in the Match Log.

### Side Switching

- Tap **⇄ Sides** anytime to swap which panel each team appears on; Triple Ball arrows and the sets-won indicator update immediately, including before the first set starts.
- **Setup → Game Defaults → Auto-switch sides between sets** does this automatically at the end of every set instead.
- Deciding sets always get a fresh coin-toss prompt for serve and side, regardless of that setting — real matches call for a new toss there.
- **Setup → Game Defaults → Prompt to switch sides at 8 pts (deciding set)** (on by default) additionally asks to switch once the first team reaches 8 points in the deciding set; Triple Ball waits for the current 3-ball sequence to finish first, so it may fire at 8, 9, or 10 points. Leave it off to switch manually with **⇄ Sides** whenever you judge best.

---

## Remarks

A free-form, timestamped notepad for each match — for anything the structured event log doesn't capture (delays, weather, injuries, official rulings, and so on).

- While a game is live, a **Remarks** button appears in the top nav next to **Match Log**. Tap it to open a popup, type a note, and tap **Add Remark**.
- Common situations come up again and again, so you can pre-define remark text in **Setup → Pre-defined Remarks** and pick from that list instead of typing it out each time — tap **Choose from List** in the popup, pick one, and it fills the text box (still editable before you tap **Add Remark**, so you can tweak or add detail first). The order you arrange them in Setup (use the ▲▼ arrows) is the order they're listed in that picker. Ships with one default: "Game delayed due to previous match."
- The pre-defined remarks list can be exported/imported separately as JSON, Excel, or CSV (Setup → Pre-defined Remarks) — importing merges in any new entries (duplicates skipped) without touching your existing list or its order.
- You never number remarks yourself — each one is numbered automatically (1, 2, 3, ...) in the order it was added.
- Every remark also records the time, set, and score at the moment it was added, e.g. `Set 2 – (A) 15 - 12 (B)`. Before the first set starts, or between sets, the score is always 0-0 and the set number reflects how many sets have been completed so far (`Set 0` before Set 1 has started, `Set 1` between Sets 1 and 2, and so on).
- Remarks also appear inline in the **Match Log** event log, in time order alongside every other event — its score column shows the score at that moment, since its position in the log already tells you which set it happened in.
- On the **Games** page, the **Game Detail** view has a collapsible **Remarks** section — positioned just above **Event Log** — listing every remark for that game, or "No remarks recorded." if there aren't any. Tap the pencil ✎ icon to enter edit mode and correct a remark's text. Games saved before this feature existed simply show no remarks.
- The **Game Report** (see [Reports](#reports)) includes a Remarks box below Results, listing every remark or "None" if there aren't any.
- Remarks are ordinary game data, so they're included automatically in every export/import path (single game, multi-select, or full export).

---

## Data & Storage

Games save automatically to `localStorage` with an IndexedDB fallback when storage is nearly full. Export and import via JSON — one game, a chosen subset, or the full collection. Transfer between devices by exporting on one and importing on the other.

### Selecting Games to Export or Delete

On the **Games** page, tap **Select** to enter selection mode: a checkbox appears next to each saved game, along with a select-all checkbox and a running count. Check as many games as you want (or **All**), then either **Export Selected** to download them as one JSON file (the same round-trip format used by the single-game and export-all options) or **Delete Selected** to remove just those games (confirmation required — export first if you want a backup). Tap **Done** to leave selection mode.

### Import & Match Info Lists

Importing any game file (single game, a multi-select export, or a full export) also scans each game's Team A/B names, Location, Age Category, and League and adds any values not already present to the corresponding master list — the same lists used by the New Game form's pick-or-type fields (see [Match Info Lists](#match-info-lists)). Existing entries are left untouched; the import summary reports how many new list entries were added alongside the game count.

---

## Reports

The **Reports** page builds printable/exportable reports across any subset of your saved games. Every report shares the same header (VolleyScore, the report title, and when it was generated) and a footer with the project's GitHub URL that repeats on every printed page. If you've set **Setup → Game Defaults → Referee Name**, the header also shows "Referee: [name]" — leave it blank if you're not a referee, since it's entirely optional and simply omitted when unset.

### Match Log

1. Check the games you want in the list at the top (or **Select All** / **Select None**) — the count updates live. The list is sorted by date/time (newest first by default); tap the **Date: Newest/Oldest first** button to flip the order.
2. The report table below builds automatically in the same order as the list above, with columns: Date (`YYYY-MM-DD`), Time (24-hour, prefers each game's scheduled start and falls back to its actual start), Location, Teams, League, Age, Gender, Set Score (e.g. `3-2`), and Set Points (e.g. `25-22, 14-25`). Any field a game doesn't have shows `N/A`.
3. **Preview** opens an in-app, on-screen approximation of the printed report — a simulated letter-size page so you can check it before committing to a file or a printer.
4. **Export Excel** downloads a single-sheet `.xlsx` with the same rows.
5. **Print / PDF** opens the browser's print dialog, formatted to fit a letter-size page and flow across multiple pages automatically if the row count doesn't fit on one.

### Game Report

A detailed, printable score sheet modeled on the official FIVB score sheet, adapted to the fields VolleyScore actually records. Unlike Match Log's single summary table, **each selected game gets its own full page** in the preview, Excel export, and print/PDF, in the same order as the game list above (same **Date: Newest/Oldest first** toggle as Match Log).

- **Match Info** — Date, Time, Location, League, Gender, Age, and both team names next to A/B circles.
- **Sanctions** — one row per sanction, in the order it happened: which of W (Warning) / P (Penalty) / E (Expulsion) / D (Disqualification) applies, who received it (`#12` for a player, or `C` / `AC` / `T` / `M` for Head Coach / Assistant Coach / Trainer / Medical — delay sanctions show `D`), the team and set, and the score at that moment (the sanctioned team's score listed first). A legend explains the abbreviations; the box just reads **None** if there weren't any. Two circle badges next to "Improper Request" mark whether either team has used their one free request, with a bold **X** once it has.
- **Results** — one row per set the format allows (even sets never played, shown blank), with each team's Timeouts, Subs, Won (1/0), and Points, plus the set number, its duration in minutes, and its start time. Sets are always treated as having exactly a 3-minute break between them, regardless of how long the real gap was, matching the official rule; the final set's duration is adjusted so the whole timeline lines up exactly with the game's real end time. A totals row, Match Starting/Ending Time, Total Match Duration, and the Winner (full team name + sets score) finish the box.
- **Remarks** — every remark recorded for the game (see [Remarks](#remarks)), numbered with its time and the set/score it was made at; reads **None** if none were recorded.
- **Preview**, **Export Excel** (one workbook sheet per game, with team names as merged headers over their columns), and **Print / PDF** work the same way as Match Log, just paginated one game per page.

---

## Setup

| Section | Settings |
|---------|----------|
| Appearance | Dark mode, font size, team colors, sidebar border, Start Set button colors, score button layout (&minus;/+ order and mirroring) and size (100%&ndash;200%), Keep Screen Awake, Confirm before Undo, notch padding (side and amount — useful in landscape when the phone notch covers the sidebar) |
| Game Defaults | Persist New Game Data toggle (see [Persisting New Game Data](#persisting-new-game-data)); Referee Name (optional — used on reports, see [Reports](#reports)); default team names, location, gender, age category, league, scheduled start (see [Match Timing](#match-timing)), format, variation, fair play rule, side switching (see [Side Switching](#side-switching)), timeouts/set, subs/set, Timeout Timer (see [Timeout Timer](#timeout-timer)) |
| Scoring Defaults | Win at / Cap / Win by for regular and deciding sets; Win Alert glow and toast color/duration settings; Action Alert color and duration |
| Match Info Lists | Add/rename/remove Team Names, Locations, Age Categories, and Leagues; toggle to show/hide the rename (pencil) icons (see [Match Info Lists](#match-info-lists)) |
| Pre-defined Remarks | Add/edit/remove/reorder the quick-pick remark texts used by the live Remarks picker; export/import the list as JSON, Excel, or CSV (see [Remarks](#remarks)) |
| Data | Export/import all games (JSON, one/several/all — see [Selecting Games to Export or Delete](#selecting-games-to-export-or-delete)); export/import Match Info Lists (JSON or Excel) (see [Match Info Lists](#match-info-lists)); clear all data |
| Triple Ball | Phase box size, highlight color, scroll speed |
| About | App version and cache name; update toast appears automatically when a new version is cached |

---

## Tech

Vanilla JavaScript — no frameworks, no build step. Files: `app.js`, `styles.css`, `index.html`, `manifest.json`, `sw.js` (service worker), `icons/`.

---

## License

Copyright © 2025 Jared Mathes — [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
