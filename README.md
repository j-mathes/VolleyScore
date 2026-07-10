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

1. **Score page** — enter team names, pick a format, fair play rule, and first server → **Start Game**
2. Tap **+** to score a point; the serve indicator updates automatically
3. Sidebar buttons: **TO** (timeout), **Sub** (substitution), card icon (sanctions)
4. **End Set** → choose who serves → **Start Set 2** (pulses green when ready)
5. Repeat until the match is complete → **End Game** → **Done** to return to setup
6. **Match Log** (nav bar) — full event log; tap a set number pill to filter by set

---

## Pages

| Page | Purpose |
|------|---------|
| Score | Live scorekeeping |
| Match Log | Event log + set summary (active games only) |
| Games | Browse, resume, export, or delete saved games |
| Setup | Appearance, scoring defaults, data management |

---

## Features

- **Scoring** — tap +/− per team; serve dot follows the last scorer automatically
- **Timeouts** — dot indicator (filled = used); count enforced per fair play rule; blocked mid-sequence in Triple Ball
- **Substitutions** — per-team counter; fair play restrictions applied automatically
- **Sanctions** — full misconduct and delay sanction system with escalation enforcement (see [Sanctions](#sanctions))
- **Fair Play rules** — None / Triple Ball / Full / Partial; all timeout and sub limits enforced automatically (see [Fair Play Rules](#fair-play-rules))
- **Configurable scoring** — per-game win target, win-by margin, and score cap for regular and deciding sets (see [Scoring Rules](#scoring-rules))
- **Win & action alerts** — visual glow + toast when a win condition is met; glow on the TO/sub indicator and sanction chip when actions are recorded (see [Alerts](#alerts))
- **Triple Ball** — animated 6-phase sequence indicator with directional arrows (see [Triple Ball](#triple-ball))
- **Set & match management** — End Set, between-sets serve picker, Start Next Set
- **Undo / Redo** — available during play and immediately after End Game (with optional confirmation)
- **Side switching** — swap which panel each team appears on; Triple Ball arrows update accordingly
- **Match Log** — filterable event log with per-set score summary
- **Games history** — browse, resume, export (JSON), or delete saved games
- **Dark mode & custom colors** — team colors, sidebar border, Start Set button, and alert colors all customizable
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

In Best of 3 and Best of 5, the final possible set (set 3 or set 5) uses the **deciding set** scoring rules. All other sets use the **regular set** rules. Both are configurable.

---

## Scoring Rules

Each game stores its own win conditions, configured at game start. Global defaults live in **Setup → Scoring Defaults**.

| Setting | Description | Default (regular / deciding) |
|---------|-------------|------------------------------|
| Win at | Score a team must reach to be eligible to win | 25 / 15 |
| Win by | Minimum lead required once Win at is reached | 2 / 2 |
| Cap | Reaching this score wins immediately regardless of lead; 0 = no cap | 0 / 0 |

**Examples**

| Scenario | Regular sets | Deciding set |
|----------|-------------|--------------|
| Standard volleyball | Win at 25, Win by 2 | Win at 15, Win by 2 |
| Capped standard | Win at 25, Win by 2, Cap 27 | — |
| 2 Straight Sets to 15, capped at 17 | Win at 15, Win by 2, Cap 17 | n/a |
| Best of 3, short decider | Win at 25, Win by 2 | Win at 5, Win by 2, Cap 7 |

With a cap: if the score reaches the cap value, that team wins regardless of the lead.

---

## Alerts

The app never automatically ends a set or match — it only draws attention to win conditions.

### Win Alerts

When a team's score meets the set-win condition:

- **End Set** button, winning team **name**, and winning team **score** all glow
- A toast appears: `🥅 Team A at set win! (25–22 in Set 1)`
- If that win also clinches the match: `🏆 Team A wins the MATCH! (25–22 in Set 2 · Sets 2–0)`
- After **End Set** reveals a match winner: `🏆 Team A wins the match! (2–0 sets)`
- **End Game** button glows between sets when a match winner is already determined

Glows and toasts reset on Undo and re-fire if the winning point is re-scored.

Configure in **Setup → Scoring Defaults → Win Alert**: color (default amber) and duration (default 3 s).

### Action Alerts

A one-shot glow flashes on the relevant indicator when an action is recorded — no toast.

| Action | Glows on |
|--------|----------|
| Timeout taken | TO indicator (label + dots + count) |
| Substitution recorded | Sub counter |
| Sanction / delay sanction issued | The new chip in the sanctions bar |
| Improper request recorded | The IR chip |

Only the chip just added glows — existing chips are not re-glowed. Rapid repeat actions restart the animation.

Configure in **Setup → Scoring Defaults → Action Alert**: color (default purple) and duration (default 2 s).

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

Escalation is enforced — each sanction must be higher than the last for the same individual. Two roles are exempt from individual tracking:

- **Unnumbered players** — if no jersey number is entered, the app cannot identify the individual, so escalation is not tracked and all levels remain available. The team-level one-warning limit still applies.
- **Asst. Coach** — different assistants may each receive their own sanctions; escalation is not tracked per-assistant. The team-level warning limit still applies.

### Delay (team)

| Sanction | Effect |
|----------|--------|
| Delay Warning 🟨⌚ | Caution only; one per team per match |
| Delay Penalty 🟥⌚ | Point + serve to opponent |

### Improper Request

One free per team per match. The button is disabled once the free request has been used.

---

## Triple Ball

Three balls are played in sequence before the serve rotates. The six-phase cycle:

```
A Serves →   → B Toss   ← A Toss  |  B Serves ←   ← A Toss   → B Toss
   [0]          [1]        [2]     |     [3]           [4]         [5]
```

The first toss follows the serve direction; the second toss reverses it.

### Sequence Indicator

A scrolling column (landscape) or strip (portrait) between the team panels shows the previous, current, and next phase inside a stationary highlighted ring. Each box shows the team letter, action type, and a directional arrow that flips automatically on side-swap.

- The **serve dot** stays on the serving team for the full 3-ball half — scoring a rally does not transfer it
- The **− button** acts as Undo, stepping the sequence back
- Configurable in **Setup → Triple Ball**: box size, highlight color, scroll speed

### Timeouts & Substitutions

Only allowed at phase 0 (before A serves) or phase 3 (before B serves). TO and Sub buttons disable at all other phases.

### Penalties

A Red card or Delay Penalty awards a point and advances the sequence. A toast identifies which phase slot was replaced. A toggle in the sanction dialog handles mid-rally vs. after-rally.

---

## Setup

| Section | Settings |
|---------|----------|
| Appearance | Dark mode, font size, team colors, sidebar border, Start Set button colors, Keep Screen Awake, Confirm before Undo |
| Mobile Display | Notch padding — side (left/right) and amount; useful in landscape when a phone notch covers the sidebar buttons |
| Game Defaults | Default team names, location, format, variation, fair play rule, timeouts/set, subs/set |
| Scoring Defaults | Win at / Win by / Cap for regular and deciding sets; Win Alert and Action Alert color and duration |
| Triple Ball | Phase box size, highlight color, scroll speed |
| Data | Export all games (JSON), import, clear all data |
| About | App version and cache name; an update toast appears automatically when a new version is cached |

---

## Data & Storage

Games save automatically to `localStorage` with an IndexedDB fallback when storage is nearly full. Export and import via JSON — one game at a time or the full collection. Transfer between devices by exporting on one and importing on the other.

---

## Tech

Vanilla JavaScript — no frameworks, no build step. Files: `app.js`, `styles.css`, `index.html`, `manifest.json`, `sw.js` (service worker), `icons/`.

---

## License

Copyright © 2025 Jared Mathes — [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
