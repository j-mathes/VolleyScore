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
- **Sanctions** — Yellow card (warning), Red card (penalty + point to opponent), Expulsion, Disqualification; optional player number entry
- **Delay sanctions** — Delay Warning and Delay Penalty (penalty awards a point to opponent) per team
- **Triple Ball** — sequence indicator for all 6 phases (A Serves → Toss B → Toss A → B Serves → Toss A → Toss B), active phase highlighted, advances with each point; penalty toast notification with mid-rally override
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

| Type | Description | Point Awarded? |
|------|-------------|----------------|
| Yellow card | Official warning | No |
| Red card | Penalty | Yes (to opponent) |
| Red + Yellow (together) | Expulsion | No |
| Red + Yellow (separate) | Disqualification | No |
| Delay Warning | Team delay caution | No |
| Delay Penalty | Team delay infraction | Yes (to opponent) |

All sanctions are logged in the event log with player number (if entered) and timestamp.

## Data & Storage

Game data is saved automatically as you score. All data stays in your browser — nothing is sent to a server.

- **Primary:** `localStorage` (fast, synchronous)
- **Fallback:** IndexedDB (used automatically when localStorage quota is exceeded)
- **Export:** Download any game or all games as a JSON file
- **Import:** Load a previously exported JSON file to restore games on another device

## Tech

- Vanilla JavaScript (ES6+, `"use strict"`) — no frameworks, no build step
- Single `app.js` file for all logic
- CSS custom properties for theming (dark mode, team colors)
- Mobile-landscape-first layout; also works on desktop and portrait mobile

## License

Copyright &copy; 2025 Jared Mathes

Licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — the same license as [Triangle Stats](https://github.com/j-mathes/volleyball-triangle-stats).
