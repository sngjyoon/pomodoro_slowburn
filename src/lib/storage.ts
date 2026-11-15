// localStorage persistence. Every access is wrapped so the app keeps working
// (without history) when storage is unavailable, full, or holds corrupted data.

import { parseSessions, type FocusSession } from './sessions'
import { DEFAULT_TAGS, parseTags, type Tag } from './tags'
import { IDLE, isTimerState, normalizeSettings, type Settings, type TimerState } from './timer'

export const KEYS = {
  settings: 'slowburn:v1:settings',
  timer: 'slowburn:v1:timer',
  sessions: 'slowburn:v1:sessions',
  tags: 'slowburn:v1:tags',
} as const

/** The subset of the Storage API we use; tests pass an in-memory implementation. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>

function browserStore(): KeyValueStore | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function readRaw(key: string, store: KeyValueStore | null): unknown {
  if (!store) return undefined
  try {
    const text = store.getItem(key)
    return text === null ? undefined : JSON.parse(text)
  } catch {
    return undefined
  }
}

function write(key: string, value: unknown, store: KeyValueStore | null): boolean {
  if (!store) return false
  try {
    store.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export const loadSettings = (store = browserStore()): Settings => normalizeSettings(readRaw(KEYS.settings, store))
export const saveSettings = (settings: Settings, store = browserStore()) => write(KEYS.settings, settings, store)

export function loadTimer(store = browserStore()): TimerState {
  const raw = readRaw(KEYS.timer, store)
  return isTimerState(raw) ? { ...raw, tag: raw.tag ?? null } : IDLE
}
export const saveTimer = (state: TimerState, store = browserStore()) => write(KEYS.timer, state, store)

export const loadSessions = (store = browserStore()): FocusSession[] => parseSessions(readRaw(KEYS.sessions, store))
export const saveSessions = (sessions: readonly FocusSession[], store = browserStore()) =>
  write(KEYS.sessions, sessions, store)

/** First run (nothing stored) gets the default tags; after that the stored list wins, even if empty. */
export function loadTags(store = browserStore()): Tag[] {
  const raw = readRaw(KEYS.tags, store)
  return raw === undefined ? [...DEFAULT_TAGS] : parseTags(raw)
}
export const saveTags = (tags: readonly Tag[], store = browserStore()) => write(KEYS.tags, tags, store)
