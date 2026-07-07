# VolleyScore

VolleyScore is a browser-based volleyball scorekeeper. No install, no build step — open `index.html` directly in any modern browser or host it on GitHub Pages.

## Live App

**[https://j-mathes.github.io/VolleyScore/](https://j-mathes.github.io/VolleyScore/)**

Works on desktop and iPad/iPhone. No install required.

> **Note for iPad/iPhone users:** Use the hosted link above. Opening `index.html` as a local file on iOS is not supported due to browser storage restrictions.

> **Not seeing recent changes?** Hard-reload the page: **Ctrl+Shift+R** (Windows/Linux) or **Cmd+Shift+R** (Mac). On iPhone/iPad: **Settings → Safari → Clear History and Website Data**, then reopen the link.

## Features

- **Scoring** — large tap-friendly +/− buttons optimized for mobile landscape use
- **Serve tracking** — automatic serve indicator updates with each point scored
- **Timeouts** — visual filled/empty dot display; alerts when all timeouts are used
- **Substitutions** — per-team counter with exhaustion warning
- **Misconduct sanctions** — Warning, Penalty, Expulsion, Disqualification; issued to Player, Head Coach, Asst. Coach, Trainer, or Medical; all remain in effect for the entire match
- **Delay sanctions** — Delay Warning and Delay Penalty applied to the entire team; Delay Penalty awards a point to the opponent
- **Improper requests** — one free per team per match; tracked and flagged if the free request has already been used
- **Set management** — End Set, choose who serves next, Start Next Set; set summary table
- **Undo / Redo** — correct mistakes without disrupting the event timeline
- **Event log** — time-stamped, color-coded log of every game event (same format as Triangle Stats)
- **Game history** — browse, resume, review, export, delete saved games
- **Import / Export** — JSON export per game or all games at once; import from file
- **Dark mode** — toggle in Setup
- **Customizable team colors** — applies across the scoreboard and event log
- **localStorage + IndexedDB** — data persists across sessions; automatic fallback to IndexedDB when localStorage quota is exceeded

## Game Formats

| Format | Sets Played | Win Condition |
|--------|-------------|---------------|
| Single Set | 1 | First to 25, win by 2 |
| 2 Straight Sets | 2 | Play all sets |
| Best of 3 | up to 3 | First team to win 2 sets |
| Best of 5 | up to 5 | First team to win 3 sets |

## Scorekeeper Workflow

1. Open the app (local file or hosted URL).
2. On the **Score** page, fill in team names, format, variation, and who serves first.
3. Press **Start Game** — Set 1 begins immediately.
4. Tap **+** to award points. The serve indicator moves automatically.
5. Use **TO**, **Sub**, and the card icon for timeouts, substitutions, and sanctions.
6. Press **End Set** when the set is over, choose who serves next, and press **Start Set 2**.
7. Press **End Game** when the match is complete.
8. Review the set summary and event log inline, or go to **Games** for full history.

## Pages

| Page | Purpose |
|------|---------|
| **Score** | Live scorekeeping — new game setup and active scoreboard |
| **Games** | Browse saved games; view set summary and event log; resume, export, or delete |
| **Setup** | Appearance (dark mode, font size, team colors) and game defaults |

## Triple Ball

Triple Ball is a volleyball variation where three balls are fed in sequence before rotating. VolleyScore tracks the six-phase cycle:

```
A Serves  →  Toss to B  →  Toss to A  │  B Serves  →  Toss to A  →  Toss to B
```

The active phase is highlighted in green and advances automatically with each point scored.

### Penalties in Triple Ball

When a Red card penalty or Delay Penalty is issued during a Triple Ball game, a point is awarded to the opponent and the sequence advances — but **the referee must know which ball slot was consumed**. A toast notification appears automatically identifying the replaced slot.

Two scenarios are supported via a toggle in the sanction dialog (only visible during Triple Ball games):

| Scenario | When to use | Toast says |
|----------|-------------|------------|
| **After rally** *(default)* | Penalty issued after a rally completed normally | "…replaces next ball in sequence" |
| **Mid-rally** *(check the box)* | Referee cancels an in-progress rally and awards penalty instead | "…replaces current ball (current ball cancelled)" |

The toggle resets to the default (after rally) each time the sanction dialog opens.

## Sanctions

### Misconduct Sanctions (individual)

Misconduct sanctions are issued to a specific individual. When issuing a sanction, select the recipient from the role picker:

| Recipient | Role code shown |
|-----------|-----------------|
| Player | #jersey or "Player" |
| Head Coach | HC |
| Assistant Coach | AC |
| Trainer | Tr |
| Medical | Md |

| Sanction | Cards shown | Effect | Match scope |
|----------|-------------|--------|-------------|
| Warning | 🟨 | No point awarded | Entire match |
| Penalty | 🟥 | Point + serve to opponent | Entire match |
| Expulsion | 🟨🟥 (together) | Player/staff removed for rest of set | Entire match |
| Disqualification | 🟨 🟥 (separate) | Player/staff removed for rest of match | Entire match |

All misconduct sanctions remain in effect for the remainder of the match regardless of which set they were issued in.

### Delay Sanctions (entire team)

Delay sanctions apply to the team, not an individual.

| Sanction | Effect |
|----------|--------|
| Delay Warning | No point awarded — caution only |
| Delay Penalty | Point + serve to opponent |

### Improper Request (1 free per team per match)

Each team is entitled to one free improper request per match. The first carries no penalty and no point is awarded. Subsequent improper requests may result in a Delay Penalty at the referee's discretion. VolleyScore tracks whether each team has used their free request and shows a warning if the button is pressed a second time.

All sanctions and improper requests are recorded in the event log with timestamp, set number, score at time of issue, and recipient.

## Data & Storage

Game data is saved automatically as you score. All data stays in your browser — nothing is sent to a server.

- **Primary:** `localStorage` (fast, synchronous)
- **Fallback:** IndexedDB (used automatically when localStorage quota is exceeded)

### Export

| Location | Action | Result |
|----------|--------|--------|
| Games page → select game → Export JSON | Exports one game | `volleyscore_TeamA_vs_TeamB_YYYY-MM-DD.json` |
| Setup page → Export All Games | Exports every saved game | `volleyscore_export_YYYY-MM-DD.json` |

Exported files contain the full event timeline, including all scores, sanctions, timeouts, substitutions, and improper requests — enough to fully reconstruct the game.

### Import

Import works from both the **Games page** (Import button) and the **Setup page**. The app accepts:

- A single-game file previously exported from VolleyScore
- A multi-game export file
- A raw game JSON record (advanced use)

If a game with the same ID already exists it is overwritten. Importing does not delete existing games.

### Transfer to Another Device

1. On the source device: **Games → select game → Export JSON** (or **Setup → Export All**)
2. Transfer the file (email, AirDrop, cloud storage, etc.)
3. On the destination device: **Games → Import** or **Setup → Import Games**, then select the file.

## Tech

- Vanilla JavaScript (ES6+, `"use strict"`) — no frameworks, no build step
- Single `app.js` file for all logic
- CSS custom properties for theming (dark mode, team colors)
- Mobile-landscape-first layout; also works on desktop and portrait mobile

## License

Copyright &copy; 2025 Jared Mathes

Licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — the same license as [Triangle Stats](https://github.com/j-mathes/volleyball-triangle-stats).
