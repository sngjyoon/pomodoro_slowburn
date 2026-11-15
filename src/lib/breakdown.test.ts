// Runs with TZ=America/New_York (see vite.config.ts).
import { describe, expect, it } from 'vitest'
import { UNTAGGED, clippedMs, filterSessions, streakFor, tagBreakdown, taggedSessions } from './breakdown'
import { buildHeatmap } from './heatmap'
import type { FocusSession } from './sessions'
import { DEFAULT_TAGS } from './tags'

const M = 60_000
const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
let n = 0
const s = (start: number, mins: number, tag: string | null): FocusSession => ({
  id: String(++n),
  start,
  end: start + mins * M,
  focusedMs: mins * M,
  tag,
})

const now = at(2026, 11, 18, 15)
const sessions = [
  s(at(2026, 11, 18, 9), 50, 'research'),
  s(at(2026, 11, 17, 9), 25, 'research'),
  s(at(2026, 11, 17, 14), 25, 'study'),
  s(at(2026, 6, 1, 9), 25, null),
  s(at(2026, 6, 2, 9), 25, 'deleted-long-ago'),
  s(at(2025, 1, 1, 9), 100, 'study'), // outside the 52-week window
]

describe('tagBreakdown', () => {
  const rows = tagBreakdown(sessions, DEFAULT_TAGS, now)

  it('totals each tag in the window, most time first, leaving out untagged time', () => {
    // The null tag and the unknown tag id are both untagged and not listed.
    expect(rows.map((r) => [r.key, r.ms / M])).toEqual([
      ['research', 75],
      ['study', 25],
    ])
  })

  it('computes shares of tagged time that sum to 1', () => {
    expect(rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1)
    expect(rows[0].share).toBeCloseTo(0.75)
  })

  it('marks archived tags', () => {
    const tags = DEFAULT_TAGS.map((t) => (t.id === 'study' ? { ...t, archived: true } : t))
    expect(tagBreakdown(sessions, tags, now).find((r) => r.key === 'study')?.archived).toBe(true)
  })

  it('matches the heatmap total for the same tagged sessions', () => {
    const tagged = sessions.filter((x) => x.tag === 'research' || x.tag === 'study')
    const total = rows.reduce((a, r) => a + r.ms, 0)
    expect(total).toBeCloseTo(buildHeatmap(tagged, now).totalMs)
  })

  it('is empty with no sessions', () => {
    expect(tagBreakdown([], DEFAULT_TAGS, now)).toEqual([])
  })
})

describe('filterSessions', () => {
  it('returns everything for no filter, one tag, or untagged', () => {
    expect(filterSessions(sessions, null)).toHaveLength(sessions.length)
    expect(filterSessions(sessions, 'research')).toHaveLength(2)
    expect(filterSessions(sessions, UNTAGGED)).toHaveLength(1)
  })

  it('drives a filtered heatmap', () => {
    const h = buildHeatmap(filterSessions(sessions, 'study'), now)
    expect(h.totalMs).toBe(25 * M)
  })
})

describe('clippedMs', () => {
  it('counts only the part inside the range', () => {
    const x = s(at(2026, 1, 1, 23, 30), 60, null)
    expect(clippedMs(x, at(2026, 1, 2, 0, 0), at(2026, 1, 3, 0, 0))).toBe(30 * M)
    expect(clippedMs(x, at(2026, 2, 1), at(2026, 3, 1))).toBe(0)
  })
})

describe('streakFor', () => {
  const day = (d: number, tag = 'study') => s(at(2026, 11, d, 10), 25, tag)

  it('counts consecutive days ending today', () => {
    expect(streakFor([day(16), day(17), day(18)], now)).toEqual({ current: 3, longest: 3 })
  })

  it('keeps the streak alive when today has no session yet', () => {
    expect(streakFor([day(16), day(17)], now).current).toBe(2)
  })

  it('resets after a missed day but remembers the longest run', () => {
    expect(streakFor([day(10), day(11), day(12), day(13), day(16)], now)).toEqual({ current: 0, longest: 4 })
  })

  it('counts several sessions on one day once', () => {
    expect(streakFor([day(18), day(18), day(17)], now).current).toBe(2)
  })

  it('ignores days with under a minute of focus', () => {
    const tiny = { ...day(17), focusedMs: 30_000 }
    expect(streakFor([tiny, day(18)], now).current).toBe(1)
  })

  it('handles a streak across a DST change', () => {
    const days = [7, 8, 9].map((d) => s(at(2026, 3, d, 10), 25, 'study'))
    expect(streakFor(days, at(2026, 3, 9, 15)).current).toBe(3)
  })

  it('is attached to each tag row', () => {
    const rows = tagBreakdown(sessions, DEFAULT_TAGS, now)
    expect(rows.find((r) => r.key === 'research')?.streak).toEqual({ current: 2, longest: 2 })
  })
})

describe('taggedSessions', () => {
  it('keeps sessions with a known tag, including archived ones, and drops the rest', () => {
    const tags = [
      { id: 'study', name: 'Study' },
      { id: 'old', name: 'Old', archived: true },
    ]
    const mk = (id: string, tag: string | null) => ({ id, start: 0, end: 60_000, focusedMs: 60_000, tag })
    const kept = taggedSessions([mk('a', 'study'), mk('b', 'old'), mk('c', null), mk('d', 'gone')], tags)
    expect(kept.map((s) => s.id)).toEqual(['a', 'b'])
  })
})
