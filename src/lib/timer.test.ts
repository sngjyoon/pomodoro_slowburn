import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  IDLE,
  canEditSettings,
  isAwaitingStart,
  isTimerState,
  normalizeSettings,
  pause,
  remainingMs,
  start,
  stop,
  tick,
  type Settings,
} from './timer'

const M = 60_000
const T0 = Date.UTC(2026, 10, 15, 14, 0) // arbitrary fixed start
const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over })

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
    const s = start(IDLE, settings(), T0)
    expect(s.status).toBe('running')
    expect(s.phase).toBe('focus')
    expect(remainingMs(s, T0 + 10 * M)).toBe(15 * M)
  })

  it('preserves elapsed time across pause and resume', () => {
    let s = start(IDLE, settings(), T0)
    s = pause(s, T0 + 10 * M)
    // Time passing while paused does not count.
    expect(remainingMs(s, T0 + 60 * M)).toBe(15 * M)
    s = start(s, settings(), T0 + 60 * M)
    expect(remainingMs(s, T0 + 65 * M)).toBe(10 * M)
    expect(s.phaseStartedAt).toBe(T0)
  })

  it('locks settings once started', () => {
    expect(canEditSettings(IDLE)).toBe(true)
    const s = start(IDLE, settings(), T0)
    expect(canEditSettings(s)).toBe(false)
    expect(canEditSettings(pause(s, T0 + M))).toBe(false)
  })
})

describe('tick', () => {
  it('does nothing before the phase ends', () => {
    const s = start(IDLE, settings(), T0)
    const r = tick(s, settings(), T0 + 24 * M)
    expect(r.state).toBe(s)
    expect(r.ended).toEqual([])
  })

  it('without auto-start, records the session and waits at the start of the break', () => {
    const s = start(IDLE, settings(), T0)
    const r = tick(s, settings(), T0 + 30 * M)
    expect(r.ended).toEqual(['focus'])
    expect(r.sessions).toEqual([{ start: T0, end: T0 + 25 * M, focusedMs: 25 * M }])
    expect(r.state.phase).toBe('break')
    expect(isAwaitingStart(r.state)).toBe(true)
    expect(remainingMs(r.state, T0 + 100 * M)).toBe(5 * M)
  })

  it('counts paused time out of the session but keeps wall-clock start/end', () => {
    let s = start(IDLE, settings(), T0)
    s = pause(s, T0 + 10 * M)
    s = start(s, settings(), T0 + 20 * M)
    const r = tick(s, settings(), T0 + 40 * M)
    expect(r.sessions).toEqual([{ start: T0, end: T0 + 35 * M, focusedMs: 25 * M }])
  })

  it('with auto-start, catches up through several phases from their real end times', () => {
    const cfg = settings({ autoStart: true })
    const s = start(IDLE, cfg, T0)
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
    const s = start(IDLE, cfg, T0)
    const r = tick(s, cfg, T0 + 7 * M + 5 * M) // 4 focus + 3 short breaks = 7m, then 5m long break
    expect(r.ended).toEqual(['focus', 'break', 'focus', 'break', 'focus', 'break', 'focus', 'longBreak'])
  })

  it('never uses long breaks when disabled', () => {
    const cfg = settings({ autoStart: true, focusMin: 1, breakMin: 1 })
    const r = tick(start(IDLE, cfg, T0), cfg, T0 + 20 * M)
    expect(r.ended).not.toContain('longBreak')
  })
})

describe('stop', () => {
  it('records a partial focus session when counting early stops', () => {
    const s = start(IDLE, settings(), T0)
    const r = stop(s, settings(), T0 + 10 * M)
    expect(r.state).toEqual(IDLE)
    expect(r.sessions).toEqual([{ start: T0, end: T0 + 10 * M, focusedMs: 10 * M }])
  })

  it('records nothing when counting early stops is off', () => {
    const cfg = settings({ countEarlyStops: false })
    const r = stop(start(IDLE, cfg, T0), cfg, T0 + 10 * M)
    expect(r.sessions).toEqual([])
  })

  it('ignores partial sessions under one minute', () => {
    const r = stop(start(IDLE, settings(), T0), settings(), T0 + 59_000)
    expect(r.sessions).toEqual([])
  })

  it('ends a paused session at the pause time, not the stop time', () => {
    const s = pause(start(IDLE, settings(), T0), T0 + 10 * M)
    const r = stop(s, settings(), T0 + 90 * M)
    expect(r.sessions).toEqual([{ start: T0, end: T0 + 10 * M, focusedMs: 10 * M }])
  })

  it('records a finished focus phase in full even if stop arrives late', () => {
    const r = stop(start(IDLE, settings(), T0), settings(), T0 + 27 * M)
    expect(r.sessions).toEqual([{ start: T0, end: T0 + 25 * M, focusedMs: 25 * M }])
  })

  it('records nothing when stopped during a break', () => {
    const cfg = settings({ autoStart: true })
    const r = stop(start(IDLE, cfg, T0), cfg, T0 + 27 * M)
    expect(r.sessions).toHaveLength(1) // only the completed focus phase
  })
})

describe('persistence', () => {
  it('survives a JSON round trip and resumes correctly', () => {
    const s = start(IDLE, settings(), T0)
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
