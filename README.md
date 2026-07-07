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
- **Timeouts** — visual filled/empty dot display; count enforced by fair play rule; **blocked mid-sequence in triple ball** (only available before a serve)
- **Substitutions** — per-team counter; blocked by fair play rules and **by triple ball sequence timing** when applicable; toast fires when Partial FP unlocks subs at 15 points
- **Misconduct sanctions** — Warning, Penalty, Expulsion, Disqualification; issued to Player, Head Coach, Asst. Coach, Trainer, or Medical; **one warning per team per match enforced**; individual escalation enforced (Warning → Penalty → Expulsion → Disqualification); all remain in effect for the entire match
- **Delay sanctions** — Delay Warning 🟨⌚ and Delay Penalty 🟥⌚ applied to the entire team; **one delay warning per team per match enforced**; Delay Penalty awards a point to the opponent
- **Improper requests** — one free per team per match; tracked and flagged if the free request has already been used
- **Fair play rules** — None, Triple Ball, Full, or Partial; enforces per-set timeout counts and substitution restrictions automatically; Timeouts/Subs setup fields hidden when a fair play rule is active (the rule sets those values)
- **Set management** — End Set, choose who serves next (pre-suggested), pulsing Start Next Set button; match ends automatically when all sets are played
- **End Game flow** — scoreboard stays visible with final score; Undo available immediately to reverse an accidental End Game; press **Done** (also pulsing) to return to the new game screen
- **Side switching** — ⇄ Sides button swaps which panel each team appears on for court-side tracking; resets on new game
- **Undo / Redo** — available during an active game and immediately after End Game; disabled when reviewing completed games from history
- **Match Log page** — dedicated nav button (visible during active games) with full event log and set-by-set summary; tap a set number to filter the log to that set
- **Game history** — browse, resume, review, export, delete saved games
- **Import / Export** — JSON export per game or all games at once; import from file
- **Dark mode** — toggle in Setup
- **Customizable colors** — Team A/B colors, Start Set / Done button fill and pulse/outline color (with live preview in Setup)
- **Triple Ball** — 6-phase sequence indicator; penalty toast notifications with mid-rally override; timeouts and subs enforced at sequence boundaries only
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
2. On the **Score** page, fill in team names, format, variation, fair play rule, and who serves first.
3. Press **Start Game** — Set 1 begins immediately.
4. Tap **+** to award points. The serve indicator moves automatically.
5. Use **TO**, **Sub**, and the card icon for timeouts, substitutions, and sanctions.
6. Press **End Set** when the set is over. Choose who serves the next set and press the pulsing **Start Set** button.
7. Press **End Game** when the match is complete. The button enables automatically when all sets are played.
8. The scoreboard shows the final score — press **Undo** immediately if you ended the game by mistake, or press **Done** to return to the new game screen.
9. Tap **Match Log** in the nav bar at any point during the game to review the event log. Tap a set number to filter it.

## Pages

| Page | Purpose |
|------|---------|
| **Score** | Live scorekeeping — new game setup and active scoreboard |
| **Match Log** | Set summary and full event log; visible in the nav during an active game |
| **Games** | Browse saved games; view set summary and event log; resume, export, or delete |
| **Setup** | Appearance, color customization, and game defaults |

## Triple Ball

Triple Ball is a volleyball variation where three balls are fed in sequence before rotating. VolleyScore tracks the six-phase cycle:

```
A Serves  →  Toss to B  →  Toss to A  │  B Serves  →  Toss to A  →  Toss to B
```

The active phase is highlighted in green and advances automatically with each point scored.

### Timeouts and Substitutions in Triple Ball

In triple ball, timeouts and substitutions (where permitted) can only be called **at the end of a 3-ball sequence — after the last toss and before the next serve**. This corresponds to phases 0 (before A serves) and 3 (before B serves) in the indicator. The TO and Sub buttons are automatically disabled at all other phases.

### Penalties in Triple Ball

When a Red card penalty or Delay Penalty is issued during a Triple Ball game, a point is awarded to the opponent and the sequence advances — but **the referee must know which ball slot was consumed**. A toast notification appears automatically identifying the replaced slot.

Two scenarios are supported via a toggle in the sanction dialog (only visible during Triple Ball games):

| Scenario | When to use | Toast says |
|----------|-------------|------------|
| **After rally** *(default)* | Penalty issued after a rally completed normally | "…replaces next ball in sequence" |
| **Mid-rally** *(check the box)* | Referee cancels an in-progress rally and awards penalty instead | "…replaces current ball (current ball cancelled)" |

The toggle resets to the default (after rally) each time the sanction dialog opens.

## Fair Play Rules

Selected when setting up a new game. The rule overrides per-set timeout counts and substitution availability automatically — the referee doesn't need to remember the limits.

| Rule | Sets 1 & 2 | Deciding set |
|------|------------|--------------|
| **None** | Standard rules (configured timeouts, subs any time) | Standard rules |
| **Triple Ball** | 3 timeouts, no substitutions | 2 timeouts, subs after last toss only (enforced automatically) |
| **Full** | 3 timeouts, no substitutions | 2 timeouts, subs any time |
| **Partial** | 2 timeouts, subs blocked until a team reaches 15 points | 2 timeouts, subs any time |

When a fair play rule is selected in the new game form, the Timeouts/Set and Subs/Set fields are hidden — those values are determined by the rule.

For **Partial** fair play, a toast notification fires automatically the moment either team's score reaches 15, alerting the referee that substitutions are now permitted for both teams.

The **deciding set** is any set beyond set 2 (set 3 in Best of 3, sets 3–5 in Best of 5).

## Side Switching

The **⇄ Sides** button in the game control bar swaps which side of the scoreboard each team appears on — useful when teams change ends at the start of the deciding set (or mid-set at 8 points in the deciding set). The swap is purely visual: scoring, serve indicators, and all data remain attached to the correct team. Sides reset to default when a new game is started.

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
| Expulsion | 🟨🟥 | Player/staff removed for rest of set | Entire match |
| Disqualification | 🟨 🟥 | Player/staff removed for rest of match | Entire match |

All misconduct sanctions remain in effect for the remainder of the match regardless of which set they were issued in.

#### Escalation rules (enforced automatically)

- **One warning per team per match.** Once any team member receives a Warning, the Warning button is disabled for all subsequent sanctions against that team. The next sanction must be a Penalty or higher.
- **Individual escalation.** After a specific individual receives a sanction, their next sanction must be one step higher (Warning → Penalty → Expulsion → Disqualification). The appropriate lower-level buttons are disabled when the sanction dialog is opened for that recipient.
- **Assistant Coach exception.** Because the app cannot distinguish between different assistant coaches, individual escalation is not tracked for the Asst. Coach role. Multiple penalties may be applied (e.g. to different ACs); the referee is responsible for applying the correct escalation for each individual. The team-level warning limit still applies.
- **Un-numbered players.** If a player sanction is issued without entering a jersey number, individual escalation is not tracked for that sanction. Always enter a jersey number when possible.

### Delay Sanctions (entire team)

Delay sanctions apply to the team, not an individual.

| Sanction | Effect |
|----------|--------|
| Delay Warning 🟨⌚ | No point awarded — caution only |
| Delay Penalty 🟥⌚ | Point + serve to opponent |

Only one Delay Warning may be issued per team per match. Once a team has received a Delay Warning, the Delay Warning button is disabled and only Delay Penalty is available for subsequent delay infractions.

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
- CSS custom properties for theming (dark mode, team colors, Start Set button colors)
- Mobile-landscape-first layout; also works on desktop and portrait mobile

## License

Copyright &copy; 2025 Jared Mathes

Licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — the same license as [Triangle Stats](https://github.com/j-mathes/volleyball-triangle-stats).
