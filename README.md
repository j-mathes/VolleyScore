# VolleyScore

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
| Games | Browse, resume, export, or delete saved games (date and time shown for each) |
| Setup | Appearance, game defaults, scoring defaults, Match Info Lists, data management |

---

## Features

- **Scoring** — tap +/− per team; serve dot follows the last scorer automatically
- **Timeouts** — dot indicator (filled = used); count enforced per fair play rule; blocked mid-sequence in Triple Ball
- **Substitutions** — per-team counter; fair play restrictions applied automatically
- **Sanctions** — full misconduct and delay sanction system with escalation enforcement (see [Sanctions](#sanctions))
- **Fair Play rules** — None / Triple Ball / Full / Partial; all timeout and sub limits enforced automatically (see [Fair Play Rules](#fair-play-rules))
- **Configurable scoring** — per-game win target, win-by margin, and score cap for regular and deciding sets (see [Scoring Rules](#scoring-rules))
- **Win & action alerts** — independently configurable glow and win-condition-toast durations; glow on the TO/sub indicator and sanction chip when actions are recorded (see [Alerts](#alerts))
- **Win condition reminder** — current set's rules shown in the game bar during active play
- **Triple Ball** — animated 6-phase sequence indicator with directional arrows (see [Triple Ball](#triple-ball))
- **Set & match management** — End Set, between-sets serve picker, Start Next Set
- **Undo / Redo** — available during play and immediately after End Game (with optional confirm)
- **Side switching** — swap which panel each team appears on, or automatically switch sides between sets; Triple Ball arrows and the sets-won indicator update accordingly
- **Scheduled vs. actual start time** — pre-configure a planned start time in Game Defaults, while the moment **Start Game** is tapped is always recorded as the actual start (see [Match Timing](#match-timing))
- **Match Info** — track Gender, Age Category, and League per game, with pick-or-type fields backed by editable master lists (see [Match Info Lists](#match-info-lists))
- **Persist New Game Data** — optionally carry every New Game field forward from your last match instead of resetting to defaults (see [Persisting New Game Data](#persisting-new-game-data))
- **Score button layout** — choose &minus;/+ or +/&minus; order, or mirror the two team panels so the same symbol always sits toward the middle
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

## Fair Play Rules

| Rule | Sets 1–2 | Deciding set |
|------|----------|--------------|
| None | Standard | Standard |
| Triple Ball | 3 TOs, no subs | 2 TOs, 12 subs (after last toss only) |
| Full | 3 TOs, no subs | 2 TOs, 12 subs (any time) |
| Partial | 2 TOs, subs unlock at 15 pts | 2 TOs, subs any time |

When a fair play rule is active the Timeouts/Set and Subs/Set steppers are hidden — the rule controls those values. For Partial, a toast fires when either team reaches 15 points.

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

- **Unnumbered players** — without a jersey number the app can't identify the individual, so escalation is not tracked and all levels remain available. The team-level one-warning limit still applies.
- **Asst. Coach** — each assistant may receive their own sanctions independently. The team-level warning limit still applies.

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

Separately, the app always records the real-world moment **Start Game** is tapped as the match's actual start time. Wherever a single date/time is shown (Recent Games, Games list), the actual start time is used. In the **Game Detail** view and **Match Log** header, if the scheduled time and actual start differ, both are shown — e.g. `Scheduled Sep 9 7:00 PM · Started Sep 9 7:12 PM`.

### Fixing the First Server

If the wrong team is picked to serve, a compact "Set N serve: Team X" chip stays available in the game bar for the *current* set — not just between sets — as long as its score is still 0–0. Tap the chip to open a popup and pick the other team; the chip disappears once either team scores a point, locking the server in. The correction is recorded in the Match Log.

---

## New Game Team Colors

Each team name field on the **New Game** form has a color swatch, pre-filled with the global default colors (Setup → Appearance → Team A/B Color — blue and red out of the box). Tap a swatch to open a preset color grid, or choose "Custom…" for the full color picker. This only affects that one game; leave it untouched to use the current defaults.

The override applies everywhere team color drives the UI — score panels, serve dot, sanctions bar, event log, Match Log tables, and so on. It doesn't change your saved global defaults, and returning to the New Game form always resets the swatches back to those defaults.

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

Team Name, Location, Age Category, and League fields are pick-or-type: tap the field to see a dropdown of existing values, keep typing to filter it, or type something new. Anything new you type is saved to that field's master list automatically, so it's available to pick next time.

### Managing the Lists

**Setup → Match Info Lists** shows every value in each list with a remove (&times;) button, plus an input to add a new value directly (without creating a game). This is also where you'd clean up a typo added by mistake.

**Setup → Game Defaults** lets you set a default Gender, Age Category, and League (in addition to the existing default team names and location) that pre-fill the New Game form. Each can still be overridden per game.

### Export / Import

**Setup → Data** can export and import the four lists as either:

- **JSON** — the app's own round-trip format.
- **Excel (.xlsx)** — one tab per category (Team Names, Locations, Age Categories, Leagues). You can edit values in Excel/Sheets/LibreOffice and import the file back in; sheets are matched by tab name, and each sheet's column A becomes that category's values.

Either format merges new values into your existing lists (duplicates are skipped) rather than replacing them.

---

## Persisting New Game Data

By default, the New Game form always resets to your configured defaults (Setup → Game Defaults) for a fresh match. Turning on **Setup → Game Defaults → Persist New Game Data Between Matches** changes this: instead of the defaults, the form pre-fills everything from the *last game you actually started* — team names, team colors, location, gender, age category, league, format, variation, fair play rule, timeouts/subs, scoring rules, and first server.

It's all-or-nothing — there's no way to persist only some fields. Scheduled Start is the one exception and always resets to the current time regardless of this setting, since carrying forward a stale timestamp wouldn't make sense. Turning the toggle off reverts to the original default-based behavior immediately.

---

## Setup

| Section | Settings |
|---------|----------|
| Appearance | Dark mode, font size, team colors, sidebar border, Start Set button colors, score button layout (&minus;/+ order and mirroring), Keep Screen Awake, Confirm before Undo |
| Mobile Display | Notch padding — side (left/right) and amount; useful in landscape when the phone notch covers the sidebar |
| Game Defaults | Persist New Game Data toggle (see below); default team names, location, gender, age category, league, scheduled start (see [Match Timing](#match-timing)), format, variation, fair play rule, automatic side switching between sets, timeouts/set, subs/set |
| Scoring Defaults | Win at / Cap / Win by for regular and deciding sets; Win Alert glow and toast color/duration settings; Action Alert color and duration |
| Match Info Lists | Add/remove Team Names, Locations, Age Categories, and Leagues (see [Match Info Lists](#match-info-lists)) |
| Triple Ball | Phase box size, highlight color, scroll speed |
| Data | Export/import all games (JSON); export/import Match Info Lists (JSON or Excel) (see [Match Info Lists](#match-info-lists)); clear all data |
| About | App version and cache name; update toast appears automatically when a new version is cached |

---

## Data & Storage

Games save automatically to `localStorage` with an IndexedDB fallback when storage is nearly full. Export and import via JSON — one game at a time or the full collection. Transfer between devices by exporting on one and importing on the other.

---

## Tech

Vanilla JavaScript — no frameworks, no build step. Files: `app.js`, `styles.css`, `index.html`, `manifest.json`, `sw.js` (service worker), `icons/`.

---

## License

Copyright © 2025 Jared Mathes — [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
