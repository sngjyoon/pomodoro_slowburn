// Runs with TZ=America/New_York (see vite.config.ts) so DST cases are real.
import { describe, expect, it } from 'vitest'
import { WEEKS, addDays, buildHeatmap, dayKey, focusByDay, formatDuration, levelFor } from './heatmap'
import type { FocusSession } from './sessions'

const M = 60_000
const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
const session = (start: number, end: number, focusedMs = end - start): FocusSession => ({
  id: String(start),
  start,
  end,
  focusedMs,
})

it('runs in a DST-observing time zone', () => {
  expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(300)
  expect(new Date(2026, 6, 15).getTimezoneOffset()).toBe(240)
})

describe('levelFor', () => {
  it.each([
    [0, 0],
    [0.5 * M, 0],
    [1 * M, 1],
    [29 * M, 1],
    [30 * M, 2],
    [89 * M, 2],
    [90 * M, 3],
    [179 * M, 3],
    [180 * M, 4],
    [600 * M, 4],
  ])('%d ms → level %d', (ms, level) => {
    expect(levelFor(ms)).toBe(level)
  })
})

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(0)).toBe('0m')
    expect(formatDuration(45 * M)).toBe('45m')
    expect(formatDuration(125 * M)).toBe('2h 05m')
    expect(formatDuration(59.6 * M)).toBe('1h 00m')
  })
})

describe('focusByDay', () => {
  it('buckets by local calendar day', () => {
    const byDay = focusByDay([session(at(2026, 11, 15, 9), at(2026, 11, 15, 9, 25))])
    expect(byDay.get('2026-11-15')).toBe(25 * M)
  })

  it('splits a session across midnight', () => {
    const byDay = focusByDay([session(at(2026, 11, 14, 23, 30), at(2026, 11, 15, 0, 30))])
    expect(byDay.get('2026-11-14')).toBe(30 * M)
    expect(byDay.get('2026-11-15')).toBe(30 * M)
  })

  it('splits paused sessions in proportion to wall-clock time', () => {
    // 2h on the clock, 1h focused: half on each side of midnight.
    const byDay = focusByDay([session(at(2026, 11, 14, 23), at(2026, 11, 15, 1), 60 * M)])
    expect(byDay.get('2026-11-14')).toBe(30 * M)
    expect(byDay.get('2026-11-15')).toBe(30 * M)
  })

  it('splits correctly across midnight on a DST change day', () => {
    // 2026-03-08 is 23 hours long in New York.
    const byDay = focusByDay([session(at(2026, 3, 8, 23), at(2026, 3, 9, 1))])
    expect(byDay.get('2026-03-08')).toBe(60 * M)
    expect(byDay.get('2026-03-09')).toBe(60 * M)
  })

  it('handles zero-length sessions', () => {
    const t = at(2026, 11, 15, 9)
    expect(focusByDay([session(t, t, 5 * M)]).get('2026-11-15')).toBe(5 * M)
  })
})

describe('buildHeatmap', () => {
  const now = at(2026, 11, 18, 15) // Wednesday
  const { weeks, months, totalMs } = buildHeatmap([], now)
  const cells = weeks.flat()

  it('has 53 columns of 7 days, Sunday first', () => {
    expect(weeks).toHaveLength(WEEKS)
    weeks.forEach((col) => expect(col).toHaveLength(7))
    expect(weeks[0][0]?.date.getDay()).toBe(0)
  })

  it('ends at today and leaves later days of this week empty', () => {
    const last = weeks[WEEKS - 1]
    expect(last[3]?.key).toBe('2026-11-18')
    expect(last.slice(4)).toEqual([null, null, null])
    expect(cells.filter((c) => c === null)).toHaveLength(3)
  })

  it('covers consecutive days with no gaps or repeats across DST changes', () => {
    const real = cells.filter((c) => c !== null)
    real.slice(1).forEach((c, i) => expect(c.key).toBe(dayKey(addDays(real[i].date, 1))))
    expect(new Set(real.map((c) => c.key)).size).toBe(real.length)
  })

  it('starts at the Sunday 52 weeks before this week', () => {
    expect(weeks[0][0]?.key).toBe('2025-11-16')
  })

  it('includes sessions inside the window and drops ones before it', () => {
    const h = buildHeatmap(
      [
        session(at(2025, 11, 15, 10), at(2025, 11, 15, 11)), // day before window
        session(at(2025, 11, 16, 10), at(2025, 11, 16, 10, 45)), // first day
        session(at(2026, 11, 18, 9), at(2026, 11, 18, 12)), // today
      ],
      now,
    )
    expect(h.weeks[0][0]).toMatchObject({ ms: 45 * M, level: 2 })
    expect(h.weeks[WEEKS - 1][3]).toMatchObject({ ms: 180 * M, level: 4 })
    expect(h.totalMs).toBe(225 * M)
  })

  it('has zero total with no sessions', () => {
    expect(totalMs).toBe(0)
  })

  it('labels the column where each month starts', () => {
    expect(months.map((m) => m.label)).toEqual([
      'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov',
    ])
    expect(months[0].col).toBe(0)
    expect(months[1].col).toBe(3) // 2025-12-07 is the first December Sunday
  })

  it('drops the first-column label when the next month starts within 2 columns', () => {
    // Window starts Sunday 2025-11-23; December's first Sunday (12-07) is column 2.
    const h = buildHeatmap([], at(2026, 11, 25, 12))
    expect(h.months[0]).toEqual({ col: 2, label: 'Dec' })
  })
})
