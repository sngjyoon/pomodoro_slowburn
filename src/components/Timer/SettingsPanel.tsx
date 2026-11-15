import { useState, type KeyboardEvent } from 'react'
import { LIMITS, type Settings } from '../../lib/timer'

interface Props {
  settings: Settings
  locked: boolean
  onChange: (patch: Partial<Settings>) => void
}

export function SettingsPanel({ settings, locked, onChange }: Props) {
  return (
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

      <p className="settings-note" aria-live="polite">
        {locked ? 'Stop the timer to change settings.' : ' '}
      </p>
    </form>
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
