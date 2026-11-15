import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  IDLE,
  canChangeTag,
  canStart,
  canEditSettings,
  formatClock,
  isAwaitingStart,
  isTimerState,
  needsTag,
  normalizeSettings,
  pause,
  remainingMs,
  setTag,
  start,
  stop,
  tick,
  type Settings,
} from './timer'

const M = 60_000
const T0 = Date.UTC(2026, 10, 15, 14, 0) // arbitrary fixed start
const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over })
// Idle with a tag selected; starting focus requires one.
const READY = setTag(IDLE, 'study')

describe('normalizeSettings', () => {
  it('fills defaults for missing or invalid input', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('garbage')).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings({ focusMin: 'x', autoStart: 1 })).toEqual(DEFAULT_SETTINGS)
  })

  it('clamps and rounds minutes into range', () => {
    const s = normalizeSettings({ focusMin: 500, breakMin: 0, longBreakMin: 7.6 })
    expect(s.focusMin).toBe(120)
    expect(s.breakMin).toBe(1)
    expect(s.longBreakMin).toBe(8)
  })
})

describe('start / pause', () => {
  it('starts a focus phase from idle', () => {
    const s = start(READY, settings(), T0)
    expect(s.status).toBe('running')
    expect(s.phase).toBe('focus')
    expect(remainingMs(s, T0 + 10 * M)).toBe(15 * M)
  })

  it('preserves elapsed time across pause and resume', () => {
    let s = start(READY, settings(), T0)
    s = pause(s, T0 + 10 * M)
    // Time passing while paused does not count.
    expect(remainingMs(s, T0 + 60 * M)).toBe(15 * M)
    s = start(s, settings(), T0 + 60 * M)
    expect(remainingMs(s, T0 + 65 * M)).toBe(10 * M)
    expect(s.phaseStartedAt).toBe(T0)
  })

  it('locks settings once started', () => {
    expect(canEditSettings(READY)).toBe(true)
    const s = start(READY, settings(), T0)
    expect(canEditSettings(s)).toBe(false)
    expect(canEditSettings(pause(s, T0 + M))).toBe(false)
  })
})

describe('tick', () => {
  it('does nothing before the phase ends', () => {
    const s = start(READY, settings(), T0)
    const r = tick(s, settings(), T0 + 24 * M)
    expect(r.state).toBe(s)
    expect(r.ended).toEqual([])
  })

  it('without auto-start, records the session and waits at the start of the break', () => {
    const s = start(READY, settings(), T0)
    const r = tick(s, settings(), T0 + 30 * M)
    expect(r.ended).toEqual(['focus'])
    expect(r.sessions).toEqual([{ start: T0, end: T0 + 25 * M, focusedMs: 25 * M, tag: 'study' }])
    expect(r.state.phase).toBe('break')
    expect(isAwaitingStart(r.state)).toBe(true)
    expect(remainingMs(r.state, T0 + 100 * M)).toBe(5 * M)
  })

  it('counts paused time out of the session but keeps wall-clock start/end', () => {
    let s = start(READY, settings(), T0)
    s = pause(s, T0 + 10 * M)
    s = start(s, settings(), T0 + 20 * M)
    const r = tick(s, settings(), T0 + 40 * M)
    expect(r.sessions).toEqual([{ start: T0, end: T0 + 35 * M, focusedMs: 25 * M, tag: 'study' }])
  })

  it('with auto-start, catches up through several phases from their real end times', () => {
    const cfg = settings({ autoStart: true })
    const s = start(READY, cfg, T0)
    // focus 0–25, break 25–30, focus 30–55, break 55–60, focus 60–85
    const r = tick(s, cfg, T0 + 61 * M)
    expect(r.ended).toEqual(['focus', 'break', 'focus', 'break'])
    expect(r.sessions.map((x) => x.start)).toEqual([T0, T0 + 30 * M])
    expect(r.state.phase).toBe('focus')
    expect(r.state.phaseStartedAt).toBe(T0 + 60 * M)
    expect(remainingMs(r.state, T0 + 61 * M)).toBe(24 * M)
  })

  it('makes every 4th break a long break when enabled', () => {
    const cfg = settings({ autoStart: true, focusMin: 1, breakMin: 1, longBreakMin: 5, longBreaksEnabled: true })
    const s = start(READY, cfg, T0)
    const r = tick(s, cfg, T0 + 7 * M + 5 * M) // 4 focus + 3 short breaks = 7m, then 5m long break
    expect(r.ended).toEqual(['focus', 'break', 'focus', 'break', 'focus', 'break', 'focus', 'longBreak'])
  })

  it('never uses long breaks when disabled', () => {
    const cfg = settings({ autoStart: true, focusMin: 1, breakMin: 1 })
    const r = tick(start(READY, cfg, T0), cfg, T0 + 20 * M)
    expect(r.ended).not.toContain('longBreak')
  })
})

describe('stop', () => {
  it('records a partial focus session when counting early stops', () => {
    const s = start(READY, settings(), T0)
    const r = stop(s, settings(), T0 + 10 * M)
    expect(r.state).toEqual(READY)
    expect(r.sessions).toEqual([{ start: T0, end: T0 + 10 * M, focusedMs: 10 * M, tag: 'study' }])
  })

  it('records nothing when counting early stops is off', () => {
    const cfg = settings({ countEarlyStops: false })
    const r = stop(start(READY, cfg, T0), cfg, T0 + 10 * M)
    expect(r.sessions).toEqual([])
  })

  it('ignores partial sessions under one minute', () => {
    const r = stop(start(READY, settings(), T0), settings(), T0 + 59_000)
    expect(r.sessions).toEqual([])
  })

  it('ends a paused session at the pause time, not the stop time', () => {
    const s = pause(start(READY, settings(), T0), T0 + 10 * M)
    const r = stop(s, settings(), T0 + 90 * M)
    expect(r.sessions).toEqual([{ start: T0, end: T0 + 10 * M, focusedMs: 10 * M, tag: 'study' }])
  })

  it('records a finished focus phase in full even if stop arrives late', () => {
    const r = stop(start(READY, settings(), T0), settings(), T0 + 27 * M)
    expect(r.sessions).toEqual([{ start: T0, end: T0 + 25 * M, focusedMs: 25 * M, tag: 'study' }])
  })

  it('records nothing when stopped during a break', () => {
    const cfg = settings({ autoStart: true })
    const r = stop(start(READY, cfg, T0), cfg, T0 + 27 * M)
    expect(r.sessions).toHaveLength(1) // only the completed focus phase
  })
})

describe('persistence', () => {
  it('survives a JSON round trip and resumes correctly', () => {
    const s = start(READY, settings(), T0)
    const restored: unknown = JSON.parse(JSON.stringify(s))
    expect(isTimerState(restored)).toBe(true)
    if (!isTimerState(restored)) return
    expect(remainingMs(restored, T0 + 5 * M)).toBe(20 * M)
    expect(tick(restored, settings(), T0 + 26 * M).ended).toEqual(['focus'])
  })

  it('rejects malformed state', () => {
    expect(isTimerState(null)).toBe(false)
    expect(isTimerState({ ...IDLE, status: 'weird' })).toBe(false)
    expect(isTimerState({ ...IDLE, status: 'running', runStartedAt: null })).toBe(false)
    expect(isTimerState({ ...IDLE, durationMs: '5' })).toBe(false)
  })
})

describe('formatClock', () => {
  it('rounds up to whole seconds and pads', () => {
    expect(formatClock(25 * M)).toBe('25:00')
    expect(formatClock(24 * M + 59_001)).toBe('25:00')
    expect(formatClock(61_000)).toBe('01:01')
    expect(formatClock(1)).toBe('00:01')
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(-5)).toBe('00:00')
    expect(formatClock(120 * M)).toBe('120:00')
  })
})

describe('tags', () => {
  it('records the tag on completed and early-stopped sessions', () => {
    const s = setTag(IDLE, 'research')
    expect(tick(start(s, settings(), T0), settings(), T0 + 26 * M).sessions[0].tag).toBe('research')
    expect(stop(start(s, settings(), T0), settings(), T0 + 5 * M).sessions[0].tag).toBe('research')
  })

  it('keeps the tag after stopping, so the next pomodoro reuses it', () => {
    const r = stop(start(setTag(IDLE, 'reading'), settings(), T0), settings(), T0 + 5 * M)
    expect(r.state.tag).toBe('reading')
    expect(r.state.status).toBe('idle')
  })

  it('allows changing the tag only before starting or between phases', () => {
    const running = start(READY, settings(), T0)
    expect(canChangeTag(running)).toBe(false)
    expect(setTag(running, 'study')).toBe(running)
    expect(setTag(pause(running, T0 + M), 'reading').tag).toBe('study')

    const between = tick(running, settings(), T0 + 26 * M).state // awaiting break
    expect(canChangeTag(between)).toBe(true)
    const retagged = setTag(between, 'study')
    const r = tick(start(start(retagged, settings(), T0 + 26 * M), settings(), T0 + 26 * M), settings(), T0 + 31 * M)
    // Break ends at 31m; the next focus phase awaits with the new tag.
    expect(r.state.tag).toBe('study')
  })

  it('loads stored state from before tags existed', () => {
    const { tag: _omit, ...old } = start(READY, settings(), T0)
    expect(isTimerState(old)).toBe(true)
    expect(isTimerState({ ...old, tag: 5 })).toBe(false)
  })
})

describe('tag required to start', () => {
  it('does not start focus without a tag', () => {
    expect(canStart(IDLE)).toBe(false)
    expect(start(IDLE, settings(), T0)).toBe(IDLE)
    expect(canStart(READY)).toBe(true)
  })

  it('does not start the next focus phase if the tag was cleared between phases', () => {
    const cfg = settings({ breakMin: 1 })
    let s = tick(start(READY, cfg, T0), cfg, T0 + 25 * M).state // awaiting break
    expect(needsTag(s)).toBe(false) // breaks don't need a tag
    s = tick(start(s, cfg, T0 + 25 * M), cfg, T0 + 26 * M).state // awaiting focus
    s = setTag(s, null)
    expect(needsTag(s)).toBe(true)
    expect(start(s, cfg, T0 + 27 * M)).toBe(s)
  })

  it('resumes a paused focus phase regardless', () => {
    const paused = pause(start(READY, settings(), T0), T0 + M)
    expect(canStart(paused)).toBe(true)
  })
})
