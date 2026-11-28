// Turns focus sessions into a GitHub-style 53 × 7 grid of daily focus time.
//
// All date math uses local calendar days via `new Date(y, m, d + n)`, never
// "+ 86_400_000", so DST transitions (23h / 25h days) bucket correctly.

import type { FocusSession } from './sessions'

export const WEEKS = 53
export type Level = 0 | 1 | 2 | 3 | 4

/** A day needs at least this much focus to get a colored square (and count toward streaks). */
export const ACTIVE_DAY_MIN_MS = 60_000

export function isActiveDay(ms: number): boolean {
  return ms >= ACTIVE_DAY_MIN_MS
}

/**
 * Level relative to the busiest day in view (like GitHub): levels 1–4 cover
 * (0, ¼], (¼, ½], (½, ¾] and (¾, 1] of `maxMs`, so the busiest day is always 4.
 */
export function levelFor(ms: number, maxMs: number): Level {
  if (!isActiveDay(ms) || maxMs <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((4 * ms) / maxMs))) as Level
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/** Local calendar date as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Focused ms per local day. A session spanning midnight is split across days in
 * proportion to its wall-clock time on each side (pauses are assumed evenly spread).
 */
export function focusByDay(sessions: readonly FocusSession[]): Map<string, number> {
  const byDay = new Map<string, number>()
  const add = (key: string, ms: number) => byDay.set(key, (byDay.get(key) ?? 0) + ms)

  for (const s of sessions) {
    const wall = s.end - s.start
    if (wall <= 0) {
      add(dayKey(new Date(s.start)), s.focusedMs)
      continue
    }
    let cursor = s.start
    while (cursor < s.end) {
      const next = Math.min(s.end, addDays(startOfDay(new Date(cursor)), 1).getTime())
      add(dayKey(new Date(cursor)), (s.focusedMs * (next - cursor)) / wall)
      cursor = next
    }
  }
  return byDay
}

export interface HeatmapCell {
  key: string
  date: Date
  ms: number
  level: Level
}

export interface MonthLabel {
  col: number
  label: string
}

export interface Heatmap {
  /** WEEKS columns of 7 days (Sunday first). Days after today are null. */
  weeks: (HeatmapCell | null)[][]
  months: MonthLabel[]
  totalMs: number
  /** Sessions that started inside the window. */
  sessionCount: number
  /** Days with at least one minute of focus (a colored square). */
  activeDays: number
}

/** The heatmap's time window: from the first grid Sunday up to the end of today (exclusive). */
export function heatmapWindow(now: number): { from: number; to: number } {
  const today = startOfDay(new Date(now))
  return { from: addDays(today, -today.getDay() - (WEEKS - 1) * 7).getTime(), to: addDays(today, 1).getTime() }
}

export function buildHeatmap(sessions: readonly FocusSession[], now: number): Heatmap {
  const byDay = focusByDay(sessions)
  const today = startOfDay(new Date(now))
  const gridStart = new Date(heatmapWindow(now).from)

  let totalMs = 0
  let activeDays = 0
  let maxMs = 0
  const weeks: (HeatmapCell | null)[][] = []
  for (let w = 0; w < WEEKS; w++) {
    const col: (HeatmapCell | null)[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(gridStart, w * 7 + d)
      if (date > today) {
        col.push(null)
        continue
      }
      const key = dayKey(date)
      const ms = byDay.get(key) ?? 0
      totalMs += ms
      maxMs = Math.max(maxMs, ms)
      if (isActiveDay(ms)) activeDays += 1
      col.push({ key, date, ms, level: 0 })
    }
    weeks.push(col)
  }
  // Levels need the window's busiest day, so they are set in a second pass.
  for (const col of weeks) for (const cell of col) if (cell) cell.level = levelFor(cell.ms, maxMs)

  const { from, to } = heatmapWindow(now)
  const sessionCount = sessions.filter((s) => s.start >= from && s.start < to).length
  return { weeks, months: monthLabels(weeks), totalMs, sessionCount, activeDays }
}

/** A label at each column whose Sunday starts a new month (like GitHub). */
function monthLabels(weeks: (HeatmapCell | null)[][]): MonthLabel[] {
  const labels: MonthLabel[] = []
  let prevMonth = -1
  weeks.forEach((col, i) => {
    const sunday = col[0]
    if (!sunday) return
    const month = sunday.date.getMonth()
    if (month !== prevMonth) labels.push({ col: i, label: sunday.date.toLocaleString('en-US', { month: 'short' }) })
    prevMonth = month
  })
  // The first column's partial month would collide with the next label.
  if (labels.length > 1 && labels[0].col === 0 && labels[1].col < 3) labels.shift()
  return labels
}

/** "2h 05m", "45m", "0m". Rounds to the nearest minute. */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}
