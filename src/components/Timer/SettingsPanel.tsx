import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { backupFileName, type Backup } from '../../lib/backup'
import { LIMITS, type Settings } from '../../lib/timer'
import type { ImportResult } from '../../hooks/usePomodoro'

interface Props {
  settings: Settings
  locked: boolean
  onChange: (patch: Partial<Settings>) => void
  onExport: () => Backup
  onImport: (text: string) => ImportResult
}

const LOCKED_NOTE = 'Stop the timer to change settings'

export function SettingsPanel({ settings, locked, onChange, onExport, onImport }: Props) {
  return (
    <div className="settings-wrap">
      <form className="settings panel" aria-label="Timer settings" onSubmit={(e) => e.preventDefault()}>
        <fieldset disabled={locked}>
          <legend className="visually-hidden">Durations</legend>
          <MinutesField
            label="Focus"
            value={settings.focusMin}
            limits={LIMITS.focusMin}
            onCommit={(focusMin) => onChange({ focusMin })}
          />
          <MinutesField
            label="Break"
            value={settings.breakMin}
            limits={LIMITS.breakMin}
            onCommit={(breakMin) => onChange({ breakMin })}
          />
          {settings.longBreaksEnabled && (
            <MinutesField
              label="Long break"
              value={settings.longBreakMin}
              limits={LIMITS.longBreakMin}
              onCommit={(longBreakMin) => onChange({ longBreakMin })}
            />
          )}
        </fieldset>

        <fieldset disabled={locked} className="settings-toggles">
          <legend className="visually-hidden">Options</legend>
          <Toggle
            label="Long breaks"
            hint="Every 4th break runs longer"
            checked={settings.longBreaksEnabled}
            onChange={(longBreaksEnabled) => onChange({ longBreaksEnabled })}
          />
          <Toggle
            label="Auto-start"
            hint="Begin the next phase without a click"
            checked={settings.autoStart}
            onChange={(autoStart) => onChange({ autoStart })}
          />
          <Toggle
            label="Count early stops"
            hint="Keep focus time when you stop early"
            checked={settings.countEarlyStops}
            onChange={(countEarlyStops) => onChange({ countEarlyStops })}
          />
        </fieldset>

        <fieldset disabled={locked}>
          <legend className="visually-hidden">History</legend>
          <BackupControls onExport={onExport} onImport={onImport} />
        </fieldset>

        <p className="visually-hidden" aria-live="polite">
          {locked ? `${LOCKED_NOTE}.` : ''}
        </p>
      </form>
      {/* Decorative twin of the live region: slides out from under the card while locked. */}
      <div className="settings-locked" data-shown={locked} aria-hidden="true">
        <span>{LOCKED_NOTE}</span>
      </div>
    </div>
  )
}

interface BackupControlsProps {
  onExport: () => Backup
  onImport: (text: string) => ImportResult
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** History lives in this browser only; export/import moves it between browsers. */
function BackupControls({ onExport, onImport }: BackupControlsProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')

  const download = () => {
    const backup = onExport()
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = backupFileName(backup.exportedAt)
    a.click()
    URL.revokeObjectURL(url)
    setMessage(`Exported ${plural(backup.sessions.length, 'session')}.`)
  }

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const file = input.files?.[0]
    input.value = '' // allow choosing the same file again
    if (!file) return
    let text: string
    try {
      text = await file.text()
    } catch {
      setMessage('Couldn’t read that file.')
      return
    }
    const r = onImport(text)
    if (!r.ok) setMessage('That file isn’t a Slowburn backup.')
    else if (r.addedSessions === 0 && r.addedTags === 0) setMessage('Nothing new to import.')
    else
      setMessage(
        `Imported ${plural(r.addedSessions, 'session')}${r.addedTags ? ` and ${plural(r.addedTags, 'tag')}` : ''}.`,
      )
  }

  return (
    <div className="backup">
      <div className="toggle-text">
        <span className="toggle-label">History</span>
        <span className="toggle-hint">Saved in this browser only</span>
      </div>
      <div className="backup-actions">
        <button type="button" className="link-btn" onClick={download}>
          Export
        </button>
        <button type="button" className="link-btn" onClick={() => fileInput.current?.click()}>
          Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={upload}
        />
      </div>
      <p className="backup-message" aria-live="polite">
        {message}
      </p>
    </div>
  )
}

interface MinutesFieldProps {
  label: string
  value: number
  limits: { min: number; max: number }
  onCommit: (value: number) => void
}

function MinutesField({ label, value, limits, onCommit }: MinutesFieldProps) {
  // Local text lets the user clear the field while typing; it commits on blur or Enter.
  const [draft, setDraft] = useState<string | null>(null)
  const id = `minutes-${label.toLowerCase().replace(/\s+/g, '-')}`

  const commit = () => {
    if (draft !== null && draft.trim() !== '') onCommit(Number(draft))
    setDraft(null)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      setDraft(null)
      e.currentTarget.blur()
    }
  }

  return (
    <div className="minutes">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <button
          type="button"
          aria-label={`${label} one minute shorter`}
          disabled={value <= limits.min}
          onClick={() => onCommit(value - 1)}
        >
          −
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={limits.min}
          max={limits.max}
          value={draft ?? value}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        <span className="stepper-unit" aria-hidden="true">
          min
        </span>
        <button
          type="button"
          aria-label={`${label} one minute longer`}
          disabled={value >= limits.max}
          onClick={() => onCommit(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  )
}

interface ToggleProps {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="toggle" onClick={() => onChange(!checked)}>
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        <span className="toggle-hint">{hint}</span>
      </span>
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </button>
  )
}
