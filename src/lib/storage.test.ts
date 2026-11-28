import { describe, expect, it } from 'vitest'
import { appendSessions, MIN_SESSION_MS, parseSessions } from './sessions'
import {
  KEYS,
  loadSessions,
  loadSettings,
  loadTags,
  loadTheme,
  loadTimer,
  saveSessions,
  saveSettings,
  saveTags,
  saveTheme,
  type KeyValueStore,
} from './storage'
import { DEFAULT_TAGS } from './tags'
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

const valid = { id: 'a', start: 1000, end: 2000, focusedMs: 1000, tag: null }

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
        { start: 0, end: MIN_SESSION_MS, focusedMs: MIN_SESSION_MS, tag: null },
        { start: 0, end: 1000, focusedMs: MIN_SESSION_MS - 1, tag: null },
      ],
      () => `id${++n}`,
    )
    expect(out).toEqual([valid, { id: 'id1', start: 0, end: MIN_SESSION_MS, focusedMs: MIN_SESSION_MS, tag: null }])
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

describe('migration and tags', () => {
  it('loads sessions saved before tags existed as untagged', () => {
    const store = memoryStore({ [KEYS.sessions]: JSON.stringify([{ id: 'a', start: 1, end: 2, focusedMs: 1 }]) })
    expect(loadSessions(store)).toEqual([{ id: 'a', start: 1, end: 2, focusedMs: 1, tag: null }])
  })

  it('gives default tags on first run, then respects the stored list', () => {
    expect(loadTags(memoryStore())).toEqual(DEFAULT_TAGS)
    const store = memoryStore()
    saveTags([], store)
    expect(loadTags(store)).toEqual([])
  })
})

describe('theme', () => {
  it('defaults to auto, round-trips, and ignores junk or broken storage', () => {
    expect(loadTheme(memoryStore())).toBe('auto')
    const store = memoryStore()
    saveTheme('light', store)
    expect(loadTheme(store)).toBe('light')
    expect(loadTheme(memoryStore({ [KEYS.theme]: '"purple"' }))).toBe('auto')
    expect(loadTheme(memoryStore({ [KEYS.theme]: '{oops' }))).toBe('auto')
    expect(loadTheme(throwingStore)).toBe('auto')
    expect(loadTheme(null)).toBe('auto')
  })
})
