import { useEffect, useRef, useState } from 'react'
import { THEMES, type ThemePref } from '../../lib/theme'
import './ThemeMenu.css'

const LABELS: Record<ThemePref, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' }

interface Props {
  theme: ThemePref
  onChange: (theme: ThemePref) => void
}

/** Sun button in the top-right corner that opens an Auto / Light / Dark menu. */
export function ThemeMenu({ theme, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    // Move focus to the current choice so arrow keys / Tab start from there.
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next].focus()
  }

  const choose = (t: ThemePref) => {
    onChange(t)
    setOpen(false)
    button.current?.focus()
  }

  return (
    <div className="theme-menu" ref={root}>
      <button
        ref={button}
        type="button"
        className="theme-button"
        aria-label={`Theme: ${LABELS[theme]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <SunIcon />
      </button>
      {open && (
        <div className="theme-list" role="menu" aria-label="Theme" onKeyDown={onMenuKey}>
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              role="menuitemradio"
              aria-checked={t === theme}
              className="theme-option"
              onClick={() => choose(t)}
            >
              {LABELS[t]}
              <span className="theme-check" aria-hidden="true">
                ✓
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SunIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}
