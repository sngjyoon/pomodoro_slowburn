import { useEffect, useMemo, useState } from 'react'
import { Heatmap } from './components/Heatmap/Heatmap'
import { ThemeMenu } from './components/ThemeMenu/ThemeMenu'
import { Timer } from './components/Timer/Timer'
import { usePomodoro } from './hooks/usePomodoro'
import { useTheme } from './hooks/useTheme'
import { filterSessions, tagBreakdown, taggedSessions, type TagFilter } from './lib/breakdown'
import { buildHeatmap, dayKey, focusByDay } from './lib/heatmap'
import { formatClock, remainingMs } from './lib/timer'

const PHASE_TITLES = { focus: 'Focus', break: 'Break', longBreak: 'Long break' } as const

export default function App() {
  const p = usePomodoro()
  const [theme, setTheme] = useTheme()
  const todayKey = dayKey(new Date(p.now))

  const [filter, setFilter] = useState<TagFilter>(null)

  // Rebuild only when sessions/filter change or the day rolls over, not on every tick.
  // `now` matters only through `todayKey`.
  /* eslint-disable react-hooks/exhaustive-deps */
  const tagged = useMemo(() => taggedSessions(p.sessions, p.tags), [p.sessions, p.tags])
  const heatmap = useMemo(() => buildHeatmap(filterSessions(tagged, filter), p.now), [tagged, filter, todayKey])
  const breakdown = useMemo(() => tagBreakdown(p.sessions, p.tags, p.now), [p.sessions, p.tags, todayKey])
  /* eslint-enable react-hooks/exhaustive-deps */
  const todayMs = useMemo(() => focusByDay(tagged).get(todayKey) ?? 0, [tagged, todayKey])

  const title =
    p.timer.status === 'idle'
      ? 'Slowburn'
      : `${formatClock(remainingMs(p.timer, p.now))} ${PHASE_TITLES[p.timer.phase]}${p.timer.status === 'paused' ? ' (paused)' : ''}`
  useEffect(() => {
    document.title = title
  }, [title])

  return (
    <main className="app">
      <h1 className="visually-hidden">Slowburn Pomodoro timer</h1>
      <ThemeMenu theme={theme} onChange={setTheme} />
      <Timer
        settings={p.settings}
        timer={p.timer}
        now={p.now}
        todayMs={todayMs}
        tags={p.tags}
        onSelectTag={p.selectTag}
        onAddTag={p.addTag}
        onRemoveTag={p.removeTag}
        onSettingsChange={p.updateSettings}
        onStart={p.start}
        onPause={p.pause}
        onStop={p.stop}
        onExport={p.exportBackup}
        onImport={p.importBackup}
      />
      <Heatmap data={heatmap} todayKey={todayKey} breakdown={breakdown} filter={filter} onFilter={setFilter} />
    </main>
  )
}
