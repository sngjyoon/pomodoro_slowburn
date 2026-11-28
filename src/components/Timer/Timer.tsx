import { formatDuration } from '../../lib/heatmap'
import {
  LONG_BREAK_EVERY,
  canChangeTag,
  canStart,
  isAwaitingStart,
  needsTag,
  phaseDurationMs,
  elapsedMs,
  type Phase,
  type Settings,
  type TimerState,
} from '../../lib/timer'
import type { AddTagResult, Tag } from '../../lib/tags'
import type { Backup } from '../../lib/backup'
import type { ImportResult } from '../../hooks/usePomodoro'
import { Countdown } from './Countdown'
import { TagPicker } from './TagPicker'
import { SettingsPanel } from './SettingsPanel'
import './Timer.css'

const PHASE_NAMES: Record<Phase, string> = { focus: 'Focus', break: 'Break', longBreak: 'Long break' }

interface Props {
  settings: Settings
  timer: TimerState
  now: number
  todayMs: number
  tags: Tag[]
  onSelectTag: (id: string | null) => void
  onAddTag: (name: string) => AddTagResult
  onRemoveTag: (id: string) => void
  onSettingsChange: (patch: Partial<Settings>) => void
  onStart: () => void
  onPause: () => void
  onStop: () => void
  onExport: () => Backup
  onImport: (text: string) => ImportResult
}

export function Timer(props: Props) {
  const { settings, timer, now, todayMs, tags, onSettingsChange, onStart, onPause, onStop } = props
  const idle = timer.status === 'idle'
  const awaiting = isAwaitingStart(timer)
  const durationMs = idle ? phaseDurationMs('focus', settings) : timer.durationMs
  const elapsed = idle ? 0 : elapsedMs(timer, now)
  const remaining = durationMs - elapsed
  const progress = durationMs > 0 ? elapsed / durationMs : 0

  // Visual state: accent only while focus is actually running.
  const tone = timer.status === 'paused' && !awaiting ? 'paused' : timer.status === 'running' && timer.phase === 'focus' ? 'focus' : 'rest'

  const round = (timer.completedFocus % LONG_BREAK_EVERY) + 1
  const selectedTag = tags.find((t) => t.id === timer.tag && !t.archived)
  const tagName = tags.find((t) => t.id === timer.tag)?.name
  const missingTag = needsTag(timer) && !selectedTag
  const status = idle
    ? 'Ready when you are'
    : awaiting
      ? `Up next: ${PHASE_NAMES[timer.phase].toLowerCase()}`
      : timer.status === 'paused'
        ? `${PHASE_NAMES[timer.phase]}, paused`
        : PHASE_NAMES[timer.phase]

  return (
    <section className="timer" aria-labelledby="timer-status">
      <div className="timer-main" data-tone={tone}>
        <p className="timer-status" id="timer-status">
          {status}
          {tagName && timer.phase === 'focus' && <span className="timer-tag">{tagName}</span>}
          {settings.longBreaksEnabled && !idle && timer.phase === 'focus' && (
            <span className="timer-round">
              Round {round} of {LONG_BREAK_EVERY}
            </span>
          )}
        </p>

        <Countdown ms={remaining} />

        <div
          className="burn"
          role="progressbar"
          aria-label="Phase progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div className="burn-fill" style={{ transform: `scaleX(${progress})` }} />
        </div>

        <div className="timer-controls">
          {timer.status === 'running' ? (
            <button type="button" className="btn btn-primary" onClick={onPause}>
              Pause
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onStart}
              disabled={missingTag || !canStart(timer)}
              aria-describedby={missingTag ? 'tags-note' : undefined}
            >
              {idle ? 'Start focus' : awaiting ? `Start ${PHASE_NAMES[timer.phase].toLowerCase()}` : 'Resume'}
            </button>
          )}
          {!idle && (
            <button type="button" className="btn btn-quiet" onClick={onStop}>
              Stop
            </button>
          )}
        </div>

        <p className="timer-today">
          {todayMs > 0 ? `${formatDuration(todayMs)} focused today` : 'Nothing focused yet today'}
        </p>

        <TagPicker
          tags={tags}
          selected={timer.tag}
          required={missingTag}
          locked={!canChangeTag(timer)}
          onSelect={props.onSelectTag}
          onAdd={props.onAddTag}
          onRemove={props.onRemoveTag}
        />
      </div>

      <SettingsPanel
        settings={settings}
        locked={!idle}
        onChange={onSettingsChange}
        onExport={props.onExport}
        onImport={props.onImport}
      />
    </section>
  )
}
