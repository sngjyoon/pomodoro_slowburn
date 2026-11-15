// Pure Pomodoro timer state machine.
//
// Time is never counted by summing ticks. A running phase stores when the current
// run segment started (`runStartedAt`) plus the time accumulated before it
// (`elapsedBeforeMs`); everything else is derived from `now`. This keeps the timer
// correct in throttled background tabs and across page reloads.

import { MIN_SESSION_MS, type NewSession } from './sessions'

const MINUTE = 60_000

export type Phase = 'focus' | 'break' | 'longBreak'
export type Status = 'idle' | 'running' | 'paused'

export interface Settings {
  focusMin: number
  breakMin: number
  longBreakMin: number
  longBreaksEnabled: boolean
  autoStart: boolean
  countEarlyStops: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  focusMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  longBreaksEnabled: false,
  autoStart: false,
  countEarlyStops: true,
}

export const LIMITS = {
  focusMin: { min: 1, max: 120 },
  breakMin: { min: 1, max: 60 },
  longBreakMin: { min: 5, max: 60 },
} as const

/** Every Nth break is a long break when long breaks are enabled. */
export const LONG_BREAK_EVERY = 4

const clampInt = (value: unknown, { min, max }: { min: number; max: number }, fallback: number) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, n))
}

const boolOr = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)

/** Builds valid settings from anything (user input or stored JSON), filling gaps with defaults. */
export function normalizeSettings(input: unknown): Settings {
  const s = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const d = DEFAULT_SETTINGS
  return {
    focusMin: clampInt(s.focusMin, LIMITS.focusMin, d.focusMin),
    breakMin: clampInt(s.breakMin, LIMITS.breakMin, d.breakMin),
    longBreakMin: clampInt(s.longBreakMin, LIMITS.longBreakMin, d.longBreakMin),
    longBreaksEnabled: boolOr(s.longBreaksEnabled, d.longBreaksEnabled),
    autoStart: boolOr(s.autoStart, d.autoStart),
    countEarlyStops: boolOr(s.countEarlyStops, d.countEarlyStops),
  }
}

export interface TimerState {
  status: Status
  phase: Phase
  /** Length of the current phase, fixed when the phase begins. */
  durationMs: number
  /** Time elapsed in this phase before the current run segment. */
  elapsedBeforeMs: number
  /** Start of the current run segment; set only while running. */
  runStartedAt: number | null
  /** When this phase was first started; null until it has run at all. */
  phaseStartedAt: number | null
  /** When the timer was paused; set only while paused. */
  pausedAt: number | null
  /** Focus phases completed since the timer left idle (drives long breaks). */
  completedFocus: number
}

export const IDLE: TimerState = {
  status: 'idle',
  phase: 'focus',
  durationMs: 0,
  elapsedBeforeMs: 0,
  runStartedAt: null,
  phaseStartedAt: null,
  pausedAt: null,
  completedFocus: 0,
}

export function phaseDurationMs(phase: Phase, settings: Settings): number {
  const min = phase === 'focus' ? settings.focusMin : phase === 'break' ? settings.breakMin : settings.longBreakMin
  return min * MINUTE
}

export function elapsedMs(state: TimerState, now: number): number {
  const running = state.status === 'running' && state.runStartedAt !== null ? now - state.runStartedAt : 0
  return Math.min(state.durationMs, Math.max(0, state.elapsedBeforeMs + running))
}

export function remainingMs(state: TimerState, now: number): number {
  return state.durationMs - elapsedMs(state, now)
}

/** True when paused at the very start of a phase (waiting for the user to begin it). */
export function isAwaitingStart(state: TimerState): boolean {
  return state.status === 'paused' && state.phaseStartedAt === null
}

/** Settings may only change before a pomodoro starts. */
export function canEditSettings(state: TimerState): boolean {
  return state.status === 'idle'
}

/** Starts from idle, or resumes a paused phase. No-op while running. */
export function start(state: TimerState, settings: Settings, now: number): TimerState {
  if (state.status === 'running') return state
  if (state.status === 'idle') {
    return {
      ...IDLE,
      status: 'running',
      phase: 'focus',
      durationMs: phaseDurationMs('focus', settings),
      runStartedAt: now,
      phaseStartedAt: now,
    }
  }
  return { ...state, status: 'running', runStartedAt: now, pausedAt: null, phaseStartedAt: state.phaseStartedAt ?? now }
}

/** Pauses a running phase. No-op otherwise. */
export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== 'running') return state
  return { ...state, status: 'paused', elapsedBeforeMs: elapsedMs(state, now), runStartedAt: null, pausedAt: now }
}

function nextPhase(phase: Phase, completedFocus: number, settings: Settings): Phase {
  if (phase !== 'focus') return 'focus'
  return settings.longBreaksEnabled && completedFocus % LONG_BREAK_EVERY === 0 ? 'longBreak' : 'break'
}

export interface TickResult {
  state: TimerState
  /** Phases that finished during this tick, in order (more than one if the tab slept through several). */
  ended: Phase[]
  /** Completed focus sessions to record. */
  sessions: NewSession[]
}

// Upper bound on phases processed in one tick; guards against corrupted state looping forever.
const MAX_PHASES_PER_TICK = 10_000

/** Advances through any phases that have finished by `now`. Call on every animation frame / interval and on load. */
export function tick(state: TimerState, settings: Settings, now: number): TickResult {
  const ended: Phase[] = []
  const sessions: NewSession[] = []
  let s = state

  for (let i = 0; i < MAX_PHASES_PER_TICK; i++) {
    if (s.status !== 'running' || s.runStartedAt === null || remainingMs(s, now) > 0) break

    const endedAt = s.runStartedAt + s.durationMs - s.elapsedBeforeMs
    let completedFocus = s.completedFocus
    if (s.phase === 'focus') {
      completedFocus += 1
      sessions.push({ start: s.phaseStartedAt ?? endedAt - s.durationMs, end: endedAt, focusedMs: s.durationMs })
    }
    ended.push(s.phase)

    const phase = nextPhase(s.phase, completedFocus, settings)
    const base = { ...IDLE, phase, durationMs: phaseDurationMs(phase, settings), completedFocus }
    s = settings.autoStart
      ? { ...base, status: 'running', runStartedAt: endedAt, phaseStartedAt: endedAt }
      : { ...base, status: 'paused', pausedAt: endedAt }
  }

  return { state: s, ended, sessions }
}

/**
 * Stops the pomodoro and returns to idle. Finishes any phases that already ended first,
 * then records the partial focus phase if `countEarlyStops` is on and it reached MIN_SESSION_MS.
 */
export function stop(state: TimerState, settings: Settings, now: number): TickResult {
  const result = tick(state, settings, now)
  const s = result.state

  if (s.status !== 'idle' && s.phase === 'focus' && settings.countEarlyStops && s.phaseStartedAt !== null) {
    const focusedMs = elapsedMs(s, now)
    if (focusedMs >= MIN_SESSION_MS) {
      const end = s.status === 'paused' ? (s.pausedAt ?? now) : now
      result.sessions.push({ start: s.phaseStartedAt, end, focusedMs })
    }
  }

  return { ...result, state: IDLE }
}

const PHASES: readonly string[] = ['focus', 'break', 'longBreak']
const STATUSES: readonly string[] = ['idle', 'running', 'paused']
const numOrNull = (x: unknown) => x === null || (typeof x === 'number' && Number.isFinite(x))
const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x)

/** Validates timer state loaded from storage. */
export function isTimerState(x: unknown): x is TimerState {
  if (typeof x !== 'object' || x === null) return false
  const s = x as Record<string, unknown>
  if (!(typeof s.status === 'string' && STATUSES.includes(s.status))) return false
  if (!(typeof s.phase === 'string' && PHASES.includes(s.phase))) return false
  if (!num(s.durationMs) || !num(s.elapsedBeforeMs) || !num(s.completedFocus)) return false
  if (!numOrNull(s.runStartedAt) || !numOrNull(s.phaseStartedAt) || !numOrNull(s.pausedAt)) return false
  if (s.status === 'running' && s.runStartedAt === null) return false
  return true
}
