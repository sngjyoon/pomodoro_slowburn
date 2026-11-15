// Focus session records: the only data the heatmap is built from.

export interface FocusSession {
  id: string
  /** Wall-clock time the focus phase was first started (ms since epoch). */
  start: number
  /** Wall-clock time the focus phase ended or was stopped. */
  end: number
  /** Time actually spent focusing; less than end - start if the phase was paused. */
  focusedMs: number
}

/** A session as produced by the timer, before it gets an id. */
export type NewSession = Omit<FocusSession, 'id'>

/** Sessions shorter than this are not recorded. */
export const MIN_SESSION_MS = 60_000

const isFiniteNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

export function isFocusSession(x: unknown): x is FocusSession {
  if (typeof x !== 'object' || x === null) return false
  const s = x as Record<string, unknown>
  return (
    typeof s.id === 'string' &&
    isFiniteNumber(s.start) &&
    isFiniteNumber(s.end) &&
    isFiniteNumber(s.focusedMs) &&
    s.end >= s.start &&
    s.focusedMs >= 0
  )
}

/** Keeps the valid records from stored data and drops the rest, so one bad entry doesn't lose all history. */
export function parseSessions(x: unknown): FocusSession[] {
  return Array.isArray(x) ? x.filter(isFocusSession) : []
}

/** Returns a new list with the given sessions appended; sessions under MIN_SESSION_MS are dropped. */
export function appendSessions(
  existing: readonly FocusSession[],
  added: readonly NewSession[],
  makeId: () => string = () => crypto.randomUUID(),
): FocusSession[] {
  const kept = added.filter((s) => s.focusedMs >= MIN_SESSION_MS).map((s) => ({ id: makeId(), ...s }))
  return kept.length ? [...existing, ...kept] : [...existing]
}
