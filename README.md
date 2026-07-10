# VolleyScore

Browser-based volleyball scorekeeper. Open `index.html` in any modern browser -- no install, no build step.

**[https://j-mathes.github.io/VolleyScore/](https://j-mathes.github.io/VolleyScore/)**

## Installing as an App (PWA)

VolleyScore is a Progressive Web App -- it can be installed on your device for a full-screen, offline-capable experience with no browser chrome.

### iOS (iPhone / iPad)

**Safari** is the primary method. **Chrome and Edge on iOS 17+** also support installation via their Share button.

**Safari:**
1. Open **Safari** and navigate to the hosted link above
2. Tap the **Share** button (⎙) in the toolbar
3. Scroll down and tap **"Add to Home Screen"**
4. Edit the name if desired → tap **Add**
5. **iOS 17.4+:** when prompted, choose **"As Web App"** (not "In Safari")

**Chrome or Edge (iOS 17+):**
1. Open **Chrome** or **Edge** and navigate to the hosted link
2. Tap the **Share** button (⎙) in the URL bar
3. Tap **"Add to Home Screen"** → **Add**

The app icon will appear on your home screen. Opening from there launches it full-screen (no browser UI) and works offline after the first load.

### Android

1. Open **Chrome** and navigate to the hosted link
2. Tap the **⋮** menu → **"Add to Home Screen"** (or tap the install banner if it appears)
3. Tap **Add**

### Desktop (Chrome / Edge)

1. Navigate to the hosted link
2. Click the **install icon** (⊕) in the address bar, or open the browser menu → **"Install VolleyScore"**
3. Click **Install**

The app opens in its own window without browser chrome, and can be launched from the taskbar or app launcher.

---

## Features

- **Scoring** -- tap-friendly +/- buttons; serve indicator advances automatically
- **Win condition alerts** -- glow, highlight, and toast when a team reaches the set-win score; also alerts when a set win would clinch the match; does not auto-end anything (see [Win Alerts](#win-alerts))
- **Action alerts** -- one-shot glow on the relevant indicator when a timeout is taken, a substitution is recorded, or a sanction is issued; color and duration configurable independently from win alerts (see [Action Alerts](#action-alerts))
- **Configurable scoring rules** -- per-game win target, win-by margin, and score cap for both regular sets and the deciding set (see [Scoring Rules](#scoring-rules))
- **Timeouts** -- diamond-dot indicator (filled = used, outlined = remaining); count enforced per fair play rule; blocked mid-sequence in triple ball
- **Substitutions** -- per-team counter; fair play restrictions enforced automatically; deciding-set limits applied automatically
- **Misconduct sanctions** -- Warning → Penalty → Expulsion → Disqualification; one warning per team per match; individual escalation enforced
- **Delay sanctions** -- Delay Warning (one per team per match) + Delay Penalty; penalty awards a point
- **Improper requests** -- first is free per team per match; subsequent flags a warning
- **Fair play rules** -- None / Triple Ball / Full / Partial; timeout and sub limits enforced per set, including 12-sub deciding sets
- **Set management** -- End Set, serve picker inline in the bar, pulsing Start Next Set
- **End Game** -- final score stays on screen; Undo available immediately (with optional confirm); Done returns to setup
- **Side switching** -- Sides button swaps panels for court-side reference; TB indicator arrows update accordingly
- **Undo / Redo** -- active during games and immediately after End Game
- **Match Log** -- event log + set summary; tap a set number pill to filter; available during active games
- **Games history** -- browse, resume, export, delete; event log filterable by set
- **Import / Export** -- JSON per game or all at once
- **Triple Ball** -- animated sequence indicator between team panels; directional arrows; configurable
- **Dark mode & colors** -- full dark mode with proper contrast; team colors, sidebar, and button colors all customizable
- **Keep Screen Awake** -- optional Wake Lock prevents display sleep during a game (iOS 16.4+ PWA, Android, desktop Chrome)
- **Auto-update toast** -- when a new version of the app is cached in the background, a "Update available — tap to refresh" toast appears; tapping it reloads to the new version
- **Mobile Display** -- auto safe-area handling for notch/rounded-corner phones; manual notch padding configurable in Setup

## Game Formats

| Format | Sets | Win condition |
|--------|------|--------------|
| Single Set | 1 | First to reach set win score (default 25), win by 2 |
| 2 Straight Sets | 2 | Both sets must be won; regular set rules apply to all sets |
| Best of 3 | up to 3 | First to win 2 sets; set 3 uses deciding set rules |
| Best of 5 | up to 5 | First to win 3 sets; set 5 uses deciding set rules |

Default rules: regular sets to 25, win by 2; deciding set to 15, win by 2. All configurable per game and in Setup → Scoring Defaults.

## Scoring Rules

Each game stores its own win conditions, set at game start and configurable in Setup → Scoring Defaults as global defaults.

**Regular sets** and the **deciding set** (set 3 in Best of 3, set 5 in Best of 5) can each have independent rules:

| Setting | Description | Default |
|---------|-------------|---------|
| Win at | Score a team must reach to be eligible to win | 25 (regular) / 15 (decider) |
| Win by | Minimum lead required once Win at is reached | 2 |
| Cap | Hard ceiling -- reaching this score wins immediately, regardless of lead (0 = no cap) | 0 |

**Examples:**
- Standard: Win at 25, Win by 2, no cap → play until 25+ with a 2-point lead (26–24, 27–25, …)
- Capped at 27: Win at 25, Win by 2, Cap 27 → if tied at 26–26, next point wins; score cannot exceed 27
- 2 Straight Sets to 15, capped at 17: set Win at 15 / Win by 2 / Cap 17 for regular sets
- Best of 3, decider capped at 7: set decider Win at 5 / Win by 2 / Cap 7

## Win Alerts

When a team's score meets the win condition the app **alerts without acting** -- it never automatically ends a set or match.

**What triggers an alert:**

| Situation | Triggered by |
|-----------|-------------|
| Set win condition met | Scoring a point that satisfies Win at + Win by (or reaches Cap) |
| Match win pending | Same point would also clinch enough sets to win the match |
| Match won (between sets) | Ending a set that gives one team the required number of sets |

**Visual indicators:**
- **End Set** button -- glow/outline
- Winning team **name** -- glow/outline
- Winning team **score** -- glow/outline
- **End Game** button -- glow/outline when match winner is determined (between sets)

**Toast notifications:**
- Set win: `🥅 Team A at set win! (25–22 in Set 1)`
- Match win during scoring: `🏆 Team A wins the MATCH! (25–22 in Set 2 · Sets 2–0)`
- Match win after End Set: `🏆 Team A wins the match! (2–0 sets)`

Glows and toasts reset on Undo so they re-fire if the winning point is re-scored.

**Configurable in Setup → Scoring Defaults → Win Alert:**

| Setting | Default |
|---------|---------|
| Glow / highlight color | Amber (#f59e0b) |
| Glow duration | 3 seconds |

The glow pulses for the configured duration, then holds a steady outline until the set is ended or the score changes.

## Action Alerts

A one-shot glow flashes on the relevant indicator whenever a timeout, substitution, or sanction is recorded. No toast is shown -- the glow is the notification.

| Action | Glows on |
|--------|----------|
| Timeout taken | TO indicator (label + dots + count) for that team |
| Substitution recorded | Sub counter for that team |
| Misconduct sanction issued | The new sanction chip in the sanctions bar |
| Delay sanction issued | The new sanction chip in the sanctions bar |
| Improper request recorded | The IR chip in the sanctions bar |

For sanctions the glow targets only the chip just added -- existing chips are not re-glowed.

The animation runs once and fades out completely; a rapid second action on the same indicator correctly restarts the animation.

**Configurable in Setup → Scoring Defaults → Action Alert:**

| Setting | Default |
|---------|---------|
| Glow / highlight color | Purple (#a855f7) |
| Glow duration | 2 seconds |

## Workflow

1. **Score** -- fill in teams, format, fair play rule, first server -- **Start Game**
2. Tap **+** to score; serve indicator moves automatically
3. Use sidebar buttons for **TO**, **Sub**, and sanctions
4. **End Set** -- pick who serves -- pulsing **Start Set**
5. **End Game** when the match is complete -- **Done** to return to setup
6. **Match Log** nav button -- full event log (tap a set number to filter)

## Pages

| Page | Purpose |
|------|---------|
| Score | Live scorekeeping |
| Match Log | Event log + set summary (active games only) |
| Games | Saved games -- resume, export, delete |
| Setup | Colors, defaults, import/export |

## Triple Ball

Three balls fed in sequence before rotating. Six-phase cycle:

```
A Serves -->  ->B Toss  <-A Toss  |  B Serves <--  <-A Toss  ->B Toss
   [0]          [1]       [2]     |     [3]           [4]       [5]
```

First toss matches the serve direction; second toss reverses it.

### Sequence Indicator

A vertical column (landscape) or horizontal strip (portrait) between the team panels shows the preceding / current / next phase. The current phase sits inside a stationary green ring; phases scroll through it as points are scored.

Each box shows the team letter, action (Serves / Toss), and a directional arrow showing ball flow -- flips automatically on side-swap.

- **Serve dot** stays on the serving team for the full 3-ball half; winning a rally does not transfer the serve
- **- button** acts as Undo in triple ball, stepping the sequence back
- **Configurable** in Setup -> Triple Ball: box size (default 84 px), highlight color, scroll speed

### Timeouts & Substitutions

Allowed only **between sequences** -- at phase 0 (before first server's serve) or phase 3 (before second server's serve). TO and Sub buttons disable at other phases.

### Penalties

Red card or Delay Penalty awards a point and advances the sequence. A toast identifies the replaced slot. A toggle in the sanction dialog handles mid-rally vs after-rally scenarios.

## Fair Play Rules

| Rule | Sets 1-2 | Deciding set |
|------|----------|--------------|
| None | Standard | Standard |
| Triple Ball | 3 TOs, no subs | 2 TOs, 12 subs (after last toss only) |
| Full | 3 TOs, no subs | 2 TOs, 12 subs (any time) |
| Partial | 2 TOs, subs unlock at 15 pts | 2 TOs, subs any time |

When a fair play rule is active the Timeouts/Set and Subs/Set fields are hidden -- the rule sets those values. For Partial, a toast fires when either team reaches 15 points.

## Sanctions

### Misconduct (individual)

| Sanction | Cards | Effect |
|----------|-------|--------|
| Warning | 🟨 | No point; one per team per match |
| Penalty | 🟥 | Point + serve to opponent |
| Expulsion | 🟨🟥 | Player removed for rest of set |
| Disqualification | 🟨 🟥 | Player removed for rest of match |

**Escalation** -- next sanction must always be higher; app enforces this and disables lower buttons. Asst. Coach escalation is not individually tracked (different ACs may each receive a penalty); team-level warning still applies.

### Delay (team)

| Sanction | Effect |
|----------|--------|
| Delay Warning 🟨⌚ | Caution only; one per team per match |
| Delay Penalty 🟥⌚ | Point + serve to opponent |

### Improper Request

One free per team per match; app tracks usage and warns if the free request has already been used.

## Setup

| Section | Key settings |
|---------|-------------|
| Appearance | Dark mode, font size, team colors, sidebar border color, Start Set button colors, Keep Screen Awake, Confirm before Undo |
| Mobile Display | Notch padding -- enable and choose left/right side to push team panels away from the phone notch in landscape mode; padding size configurable |
| Game Defaults | Default team names, default location, default format, variation, fair play, timeouts/set, subs/set |
| Scoring Defaults | Per-set win rules (Win at / Win by / Cap) for both regular sets and the deciding set; Win Alert color and glow duration; Action Alert color and glow duration |
| Triple Ball | Phase box size, highlight color, scroll speed |
| Data | Export all games, import, clear all |
| About | App version and active cache name; a toast appears automatically when a new version is ready |

## Side Switching

**Sides** button swaps which panel each team appears on -- useful when teams change ends. Visual only; all data stays attached to the correct team. In triple ball the directional arrows update to match. Resets on new game.

## Data & Storage

Saves automatically to `localStorage` (IndexedDB fallback when quota exceeded). Export/import via JSON -- single game or full collection. Transfer between devices by exporting and importing the file.

## Tech

Vanilla JavaScript, no frameworks, no build step. Single `app.js` + `styles.css` + `index.html` + `manifest.json` + `sw.js` (service worker for offline/PWA support) + `icons/`.

## License

Copyright (c) 2025 Jared Mathes -- [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)