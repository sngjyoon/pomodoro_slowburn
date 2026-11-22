// Connects the pure timer to React, storage, and alerts.

import { useCallback, useEffect, useRef, useState } from 'react'
import { buildBackup, mergeHistory, parseBackup, type Backup } from '../lib/backup'
import { appendSessions, type FocusSession } from '../lib/sessions'
import {
  loadSessions,
  loadSettings,
  loadTags,
  loadTimer,
  saveSessions,
  saveSettings,
  saveTags,
  saveTimer,
} from '../lib/storage'
import { addTag as addTagTo, removeTag as removeTagFrom, type AddTagResult, type Tag } from '../lib/tags'
import {
  canChangeTag,
  canEditSettings,
  needsTag,
  normalizeSettings,
  pause as pauseTimer,
  setTag as setTimerTag,
  start as startTimer,
  stop as stopTimer,
  tick,
  type Settings,
  type TickResult,
  type TimerState,
} from '../lib/timer'
import { alertPhaseEnded, primeAlerts } from './alerts'

const RUNNING_TICK_MS = 250
// While not running, still refresh occasionally so "today" rolls over at midnight.
const IDLE_TICK_MS = 30_000

export interface Pomodoro {
  settings: Settings
  timer: TimerState
  sessions: FocusSession[]
  tags: Tag[]
  now: number
  selectTag: (id: string | null) => void
  addTag: (name: string) => AddTagResult
  removeTag: (id: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  start: () => void
  pause: () => void
  stop: () => void
  exportBackup: () => Backup
  importBackup: (text: string) => ImportResult
}

export type ImportResult = { ok: true; addedSessions: number; addedTags: number } | { ok: false }

export function usePomodoro(): Pomodoro {
  const [settings, setSettings] = useState(() => loadSettings())
  const [timer, setTimer] = useState(() => loadTimer())
  const [sessions, setSessions] = useState(() => loadSessions())
  const [tags, setTags] = useState(() => loadTags())
  const [now, setNow] = useState(() => Date.now())

  // Refs give event handlers and intervals the latest values without re-subscribing.
  const timerRef = useRef(timer)
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  const commit = useCallback((result: TickResult, { silent = false } = {}) => {
    if (result.state !== timerRef.current) {
      timerRef.current = result.state
      setTimer(result.state)
    }
    if (result.sessions.length) setSessions((prev) => appendSessions(prev, result.sessions))
    if (!silent && result.ended.length) alertPhaseEnded(result.ended[result.ended.length - 1])
  }, [])

  // Catch up on phases that ended while the page was closed, without chiming.
  useEffect(() => {
    commit(tick(timerRef.current, settingsRef.current, Date.now()), { silent: true })
  }, [commit])

  useEffect(() => {
    const update = () => {
      const t = Date.now()
      setNow(t)
      commit(tick(timerRef.current, settingsRef.current, t))
    }
    const id = setInterval(update, timer.status === 'running' ? RUNNING_TICK_MS : IDLE_TICK_MS)
    // Background tabs throttle intervals; refresh immediately when the tab comes back.
    document.addEventListener('visibilitychange', update)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', update)
    }
  }, [timer.status, commit])

  useEffect(() => void saveTimer(timer), [timer])
  useEffect(() => void saveSettings(settings), [settings])
  useEffect(() => void saveSessions(sessions), [sessions])
  useEffect(() => void saveTags(tags), [tags])

  // Read the latest sessions/tags inside callbacks without re-creating them.
  const sessionsRef = useRef(sessions)
  const tagsRef = useRef(tags)
  useEffect(() => {
    sessionsRef.current = sessions
    tagsRef.current = tags
  }, [sessions, tags])

  const selectTag = useCallback(
    (id: string | null) => commit({ state: setTimerTag(timerRef.current, id), ended: [], sessions: [] }),
    [commit],
  )

  const addTag = useCallback((name: string) => {
    const result = addTagTo(tagsRef.current, name)
    if (result.ok) {
      tagsRef.current = result.tags
      setTags(result.tags)
    }
    return result
  }, [])

  const removeTag = useCallback(
    (id: string) => {
      const t = timerRef.current
      const inUse = t.tag === id && !canChangeTag(t)
      const next = removeTagFrom(tagsRef.current, id, sessionsRef.current, inUse)
      tagsRef.current = next
      setTags(next)
      // Don't leave a removed tag selected for the next session.
      if (timerRef.current.tag === id) selectTag(null)
    },
    [selectTag],
  )

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    if (!canEditSettings(timerRef.current)) return
    setSettings((prev) => normalizeSettings({ ...prev, ...patch }))
  }, [])

  const start = useCallback(() => {
    const t0 = timerRef.current
    // The selected tag must still exist; a deleted tag can't start a new focus phase.
    if (needsTag(t0) && !tagsRef.current.some((tag) => tag.id === t0.tag && !tag.archived)) return
    primeAlerts()
    const t = Date.now()
    setNow(t)
    commit({ state: startTimer(timerRef.current, settingsRef.current, t), ended: [], sessions: [] })
  }, [commit])

  const pause = useCallback(() => {
    const t = Date.now()
    setNow(t)
    commit({ state: pauseTimer(timerRef.current, t), ended: [], sessions: [] })
  }, [commit])

  const stop = useCallback(() => {
    const t = Date.now()
    setNow(t)
    commit(stopTimer(timerRef.current, settingsRef.current, t), { silent: true })
  }, [commit])

  const exportBackup = useCallback(
    () => buildBackup({ sessions: sessionsRef.current, tags: tagsRef.current }, Date.now()),
    [],
  )

  const importBackup = useCallback((text: string): ImportResult => {
    const incoming = parseBackup(text)
    if (!incoming) return { ok: false }
    const merged = mergeHistory({ sessions: sessionsRef.current, tags: tagsRef.current }, incoming)
    sessionsRef.current = merged.sessions
    tagsRef.current = merged.tags
    setSessions(merged.sessions)
    setTags(merged.tags)
    return { ok: true, addedSessions: merged.addedSessions, addedTags: merged.addedTags }
  }, [])

  return {
    settings,
    timer,
    sessions,
    tags,
    now,
    selectTag,
    addTag,
    removeTag,
    updateSettings,
    start,
    pause,
    stop,
    exportBackup,
    importBackup,
  }
}
