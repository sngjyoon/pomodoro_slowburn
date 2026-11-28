// Per-tag focus totals for the heatmap's 52-week window, and the tag filter.

import { addDays, dayKey, focusByDay, heatmapWindow, isActiveDay, startOfDay } from './heatmap'
import type { FocusSession } from './sessions'
import type { Tag } from './tags'

/** Filter key for sessions without a tag. Cannot collide with tag ids (UUIDs / lowercase words). */
export const UNTAGGED = '__untagged__'

/** null shows everything; otherwise a tag id or UNTAGGED. */
export type TagFilter = string | null

export const sessionKey = (s: FocusSession) => s.tag ?? UNTAGGED

export function filterSessions(sessions: readonly FocusSession[], filter: TagFilter): readonly FocusSession[] {
  return filter === null ? sessions : sessions.filter((s) => sessionKey(s) === filter)
}

/**
 * Sessions whose tag is a known tag (archived ones included). Untagged sessions from before tags
 * were required, and unknown tag ids, are left out of the heatmap and the breakdown alike.
 */
export function taggedSessions(sessions: readonly FocusSession[], tags: readonly Tag[]): readonly FocusSession[] {
  const ids = new Set(tags.map((t) => t.id))
  return sessions.filter((s) => s.tag !== null && ids.has(s.tag))
}

/** Focused ms of a session that falls inside [from, to), assuming pauses are evenly spread. */
export function clippedMs(s: FocusSession, from: number, to: number): number {
  const wall = s.end - s.start
  if (wall <= 0) return s.start >= from && s.start < to ? s.focusedMs : 0
  const overlap = Math.min(s.end, to) - Math.max(s.start, from)
  return overlap > 0 ? (s.focusedMs * overlap) / wall : 0
}

export interface Streak {
  /** Consecutive days up to today, or up to yesterday if today has no focus yet. */
  current: number
  /** Longest run of consecutive days ever. */
  longest: number
}

const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Streak of days with at least a minute of focus (the same rule that colors a heatmap square). */
export function streakFor(sessions: readonly FocusSession[], now: number): Streak {
  const days = new Set([...focusByDay(sessions)].filter(([, ms]) => isActiveDay(ms)).map(([k]) => k))

  let longest = 0
  let run = 0
  let prev: string | null = null
  for (const key of [...days].sort()) {
    run = prev !== null && dayKey(addDays(fromKey(prev), 1)) === key ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = key
  }

  // Today without focus yet doesn't break the streak; it's still in progress.
  let day = startOfDay(new Date(now))
  if (!days.has(dayKey(day))) day = addDays(day, -1)
  let current = 0
  while (days.has(dayKey(day))) {
    current += 1
    day = addDays(day, -1)
  }
  return { current, longest }
}

export interface BreakdownRow {
  key: string
  name: string
  ms: number
  streak: Streak
  /** Fraction of all tagged focus time in the window, 0–1. */
  share: number
  archived: boolean
}

/**
 * Tags with focus time in the heatmap window, most time first. Untagged time (sessions from
 * before tags were required, or with unknown tag ids) is left out, and shares are of tagged time.
 */
export function tagBreakdown(sessions: readonly FocusSession[], tags: readonly Tag[], now: number): BreakdownRow[] {
  const { from, to } = heatmapWindow(now)
  const byId = new Map(tags.map((t) => [t.id, t]))
  const keyOf = (s: FocusSession) => (s.tag !== null && byId.has(s.tag) ? s.tag : UNTAGGED)
  const totals = new Map<string, number>()
  const byKey = new Map<string, FocusSession[]>()
  let all = 0

  for (const s of sessions) {
    const key = keyOf(s)
    const group = byKey.get(key)
    if (group) group.push(s)
    else byKey.set(key, [s])
    const ms = clippedMs(s, from, to)
    if (ms <= 0 || key === UNTAGGED) continue
    totals.set(key, (totals.get(key) ?? 0) + ms)
    all += ms
  }

  return [...totals]
    .map(([key, ms]) => {
      const tag = byId.get(key)
      return {
        key,
        ms,
        share: all > 0 ? ms / all : 0,
        name: tag?.name ?? 'Untagged',
        archived: Boolean(tag?.archived),
        streak: streakFor(byKey.get(key) ?? [], now),
      }
    })
    .sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name))
}
