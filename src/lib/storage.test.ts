import { describe, expect, it } from 'vitest'
import { appendSessions, MIN_SESSION_MS, parseSessions } from './sessions'
import { KEYS, loadSessions, loadSettings, loadTimer, saveSessions, saveSettings, type KeyValueStore } from './storage'
import { DEFAULT_SETTINGS, IDLE } from './timer'

const memoryStore = (init: Record<string, string> = {}): KeyValueStore => {
  const data = new Map(Object.entries(init))
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  }
}

const throwingStore: KeyValueStore = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

const valid = { id: 'a', start: 1000, end: 2000, focusedMs: 1000 }

describe('sessions', () => {
  it('keeps valid records and drops invalid ones', () => {
    expect(parseSessions([valid, { id: 'b' }, null, { ...valid, end: 0 }])).toEqual([valid])
    expect(parseSessions({ not: 'an array' })).toEqual([])
  })

  it('appends sessions with ids and drops ones under a minute', () => {
    let n = 0
    const out = appendSessions(
      [valid],
      [
        { start: 0, end: MIN_SESSION_MS, focusedMs: MIN_SESSION_MS },
        { start: 0, end: 1000, focusedMs: MIN_SESSION_MS - 1 },
      ],
      () => `id${++n}`,
    )
    expect(out).toEqual([valid, { id: 'id1', start: 0, end: MIN_SESSION_MS, focusedMs: MIN_SESSION_MS }])
  })
})

describe('storage', () => {
  it('round-trips settings and sessions', () => {
    const store = memoryStore()
    const s = { ...DEFAULT_SETTINGS, focusMin: 50, autoStart: true }
    expect(saveSettings(s, store)).toBe(true)
    expect(loadSettings(store)).toEqual(s)
    saveSessions([valid], store)
    expect(loadSessions(store)).toEqual([valid])
  })

  it('falls back to defaults on corrupted JSON', () => {
    const store = memoryStore({ [KEYS.settings]: '{oops', [KEYS.timer]: 'nope', [KEYS.sessions]: '[' })
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS)
    expect(loadTimer(store)).toEqual(IDLE)
    expect(loadSessions(store)).toEqual([])
  })

  it('falls back to defaults when storage is missing or throws', () => {
    for (const store of [null, throwingStore]) {
      expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS)
      expect(loadTimer(store)).toEqual(IDLE)
      expect(loadSessions(store)).toEqual([])
      expect(saveSessions([valid], store)).toBe(false)
    }
  })
})
