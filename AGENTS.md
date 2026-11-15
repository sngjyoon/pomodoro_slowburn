# AGENTS.md — pomodoro_slowburn

Instructions for coding agents (Claude Code, Codex, Cursor, etc.) working in this repo.

## Product

A single-page Pomodoro timer with a GitHub-style focus heatmap. Modern, calm, minimal UI.

Layout is two stacked rows:

1. **Timer row** — set focus length and break length, start/pause/reset, show the countdown and current phase (Focus / Break).
2. **Heatmap row** — last 52 weeks of focused time, one cell per day, GitHub contribution-graph style.

Only completed (or partially completed, see below) **focus** time counts toward the heatmap. Break time never counts.

## Stack (defaults — change here if we decide otherwise)

- Vite + React + TypeScript (strict mode)
- Styling: plain CSS with design tokens as CSS custom properties (no UI kit)
- Persistence: `localStorage` only; no backend, no accounts
- Tests: Vitest for logic; no snapshot tests
- Package manager: npm
- Hosting: GitHub Pages via a GitHub Actions workflow (`.github/workflows/deploy.yml`). Vite `base` is `/pomodoro_slowburn/`.

Do not add dependencies without a clear reason. Prefer a few lines of code over a library (e.g. no date library unless date math becomes genuinely hard; no charting library for the heatmap — it is a grid of divs or SVG rects).

## Commands

```bash
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build
npm run test       # vitest
npm run lint       # oxlint
```

Run `npm run build` and `npm run test` before calling a task done.

## Project structure

```
src/
  main.tsx
  App.tsx              # two-row layout
  components/
    Timer/             # settings, countdown, controls
    Heatmap/           # 52-week grid, legend, tooltip
  lib/
    timer.ts           # pure timer state machine
    sessions.ts        # session records + storage
    heatmap.ts         # day bucketing + intensity levels
  styles/
    tokens.css         # colors, spacing, radii, fonts (light + dark)
```

Keep logic in `src/lib/` as pure, tested functions. Components stay thin.

## Domain rules

### Timer

- Settings: focus minutes (default 25, range 1–120) and break minutes (default 5, range 1–60). Persist settings.
- Toggle settings (switches in the timer row, persisted):
  - **Long breaks** (default off): every 4th break is a long break. When on, show a long-break minutes input (default 15, range 5–60).
  - **Auto-start next phase** (default off): when off, the timer stops at phase end and waits for a click.
  - **Count early stops** (default on): when on, a focus phase stopped early still records its focused time.
- All settings, including toggles, are editable only while the timer is `idle`. Disable the controls (not hide them) while a session is running or paused.
- Phases: `idle → focus → break → focus …` (with `longBreak` replacing every 4th break when enabled).
- **Never count down by summing `setInterval` ticks.** Store the phase's `endsAt` timestamp and derive remaining time from `Date.now()`. Background tabs throttle timers; timestamps stay correct.
- Survive reloads: persist running state (`phase`, `endsAt` or `remainingMs` if paused) so a refresh resumes the timer.
- At phase end: play a short sound and, if permission granted, show a browser `Notification`. Update `document.title` with the remaining time while running.

### Sessions and storage

- On focus end (or when the user stops a focus phase early), append a session record:
  ```ts
  type FocusSession = { id: string; start: number; end: number; focusedMs: number };
  ```
- Early-stopped focus time counts only when the "Count early stops" toggle is on. Ignore sessions shorter than 1 minute either way.
- Storage key prefix: `slowburn:`. Version the stored shape (`slowburn:v1:sessions`) so migrations are possible.
- Wrap every `localStorage` access in try/catch; the app must work (without history) if storage is unavailable.

### Heatmap

- 53 columns × 7 rows (weeks × weekdays), ending at today, weeks start on Sunday (match GitHub).
- Bucket sessions by the **user's local calendar day** of the session start. A session spanning midnight is split across both days.
- Intensity: 5 levels (0 = none, 1–4). Use fixed thresholds in minutes (e.g. 1–29, 30–89, 90–179, 180+) so colors mean the same thing over time; do not scale to the max day.
- Month labels across the top, weekday labels (Mon/Wed/Fri) on the left, a "Less ▢▢▢▢▢ More" legend, and a total like "123 hours focused in the last year".
- Hover/focus on a cell shows a tooltip: date + focused time (e.g. "Nov 15, 2026 — 2h 05m").
- Cells are keyboard-focusable and have `aria-label`s.

## Design

- Minimalist and modern: generous whitespace, rounded cards, a large tabular-numeral countdown, no decoration that doesn't carry meaning.
- Dark theme only: black/grey surfaces and neutral grey text. One accent color, `#9dc904` (lime), used sparingly — primary button, active toggle, running-phase indicator, and the heatmap.
- Suggested tokens (all colors live in `tokens.css`; components never hard-code hex values):
  ```css
  --bg: #0a0a0a;          /* page */
  --surface: #141414;     /* cards */
  --surface-2: #1f1f1f;   /* inputs, empty heatmap cells */
  --border: #2a2a2a;
  --text: #ededed;
  --text-muted: #8a8a8a;
  --accent: #9dc904;
  --accent-ink: #0a0a0a;  /* text on accent */
  /* heatmap levels 0–4 */
  --heat-0: #1f1f1f;
  --heat-1: #2f3d0a;
  --heat-2: #4e6b06;
  --heat-3: #769a05;
  --heat-4: #9dc904;
  ```
- Font: system UI stack or Inter; tabular numerals for all times.
- Responsive: on narrow screens the heatmap scrolls horizontally inside its card and starts scrolled to the most recent week; the page itself never scrolls sideways.
- Respect `prefers-reduced-motion`.

## Testing priorities

Test the logic, not the pixels:

- `heatmap.ts`: day bucketing, midnight-spanning sessions, DST transitions, 52-week window boundaries, threshold levels.
- `timer.ts`: phase transitions, pause/resume, reload restoration from persisted state.
- `sessions.ts`: storage read/write, corrupted JSON, missing storage.

Use fake timers / injected `now` rather than real waiting.

## Conventions

- TypeScript strict; no `any` without a comment explaining why.
- Functions take `now: number` as a parameter where time matters, so they are testable.
- Small commits with conventional prefixes (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- Do not commit or push unless asked.

## Out of scope (for now)

Accounts, sync, backend, light theme, task lists, configurable long-break interval, statistics beyond the heatmap. Add to this list or move items into scope deliberately.
