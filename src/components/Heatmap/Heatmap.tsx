import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { BreakdownRow, TagFilter } from '../../lib/breakdown'
import { WEEKS, formatDuration, type Heatmap as HeatmapData, type HeatmapCell } from '../../lib/heatmap'
import { TagBreakdown } from './TagBreakdown'
import './Heatmap.css'

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']
const LEVELS = [0, 1, 2, 3, 4] as const

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const describe = (c: HeatmapCell, tagName: string | null) =>
  `${dateFormat.format(c.date)}: ${
    c.ms >= 60_000 ? `${formatDuration(c.ms)} ${tagName ? `of ${tagName}` : 'focused'}` : `no ${tagName ? `${tagName} ` : 'focus '}time`
  }`

const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`

function headline({ sessionCount, activeDays }: HeatmapData, tagName: string | null): string {
  const what = tagName ? `${tagName} session` : 'session'
  if (sessionCount === 0) return `No ${what}s in the last year${tagName ? '' : ' yet'}`
  return `${plural(sessionCount, what)} across ${plural(activeDays, 'day')} in the last year`
}

interface Tip {
  text: string
  x: number
  y: number
}

interface Props {
  data: HeatmapData
  todayKey: string
  breakdown: BreakdownRow[]
  filter: TagFilter
  onFilter: (filter: TagFilter) => void
}

export function Heatmap({ data, todayKey, breakdown, filter, onFilter }: Props) {
  const filterName = filter === null ? null : (breakdown.find((r) => r.key === filter)?.name ?? null)
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)

  // Roving tabindex: one cell is tabbable, arrow keys move between days.
  const cells = data.weeks.flat()
  const todayIndex = cells.findIndex((c) => c?.key === todayKey)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const tabIndex = activeIndex !== null && cells[activeIndex] ? activeIndex : todayIndex

  // Size cells in whole pixels so every square renders identically, filling the card's width.
  const daysRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ cell: number; gap: number; pad: number } | null>(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      const width = el.clientWidth - 8 - (daysRef.current?.offsetWidth ?? 0)
      const next = cellSize(width)
      setSize((prev) => (prev && prev.cell === next.cell && prev.gap === next.gap && prev.pad === next.pad ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Start scrolled to the most recent week on narrow screens.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [size])

  const showTip = (el: HTMLElement, cell: HeatmapCell) => {
    const panel = panelRef.current?.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (!panel) return
    setTip({ text: describe(cell, filterName), x: r.left - panel.left + r.width / 2, y: r.top - panel.top })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[e.key]
    if (step === undefined) return
    e.preventDefault()
    let next = tabIndex + step
    // Skip the empty future days at the end.
    while (next >= 0 && next < cells.length && !cells[next]) next += step > 0 ? 1 : -1
    if (next < 0 || next >= cells.length) return
    setActiveIndex(next)
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)
    el?.focus()
  }

  return (
    <section
      className="heatmap panel"
      aria-labelledby="heatmap-heading"
      ref={panelRef}
      style={size ? { ['--cell' as string]: `${size.cell}px`, ['--gap' as string]: `${size.gap}px` } : undefined}
    >
      <header className="heatmap-header">
        <h2 id="heatmap-heading" aria-live="polite">
          {headline(data, filterName)}
        </h2>
        <div className="heatmap-header-side">
          {filter !== null && (
            <button type="button" className="link-btn" onClick={() => onFilter(null)}>
              Show all tags
            </button>
          )}
          <Legend />
        </div>
      </header>

      <div className="heatmap-scroll" ref={scrollRef} onScroll={() => setTip(null)}>
        <div
          className="heatmap-grid"
          style={{
            ['--weeks' as string]: WEEKS,
            marginLeft: size?.pad,
          }}
        >
          <div className="heatmap-months" aria-hidden="true">
            {data.months.map((m) => (
              <span key={m.col} style={{ gridColumn: m.col + 1 }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="heatmap-weekdays" aria-hidden="true" ref={daysRef}>
            {WEEKDAY_LABELS.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div
            className="heatmap-cells"
            role="group"
            aria-label="Daily focus time, use arrow keys to move between days"
            onKeyDown={onKeyDown}
            onMouseLeave={() => setTip(null)}
          >
            {cells.map((cell, i) =>
              cell ? (
                <div
                  key={cell.key}
                  data-index={i}
                  className="cell"
                  data-level={cell.level}
                  data-today={cell.key === todayKey || undefined}
                  role="img"
                  aria-label={describe(cell, filterName)}
                  tabIndex={i === tabIndex ? 0 : -1}
                  onMouseEnter={(e) => showTip(e.currentTarget, cell)}
                  onFocus={(e) => {
                    setActiveIndex(i)
                    showTip(e.currentTarget, cell)
                  }}
                  onBlur={() => setTip(null)}
                />
              ) : (
                <div key={`empty-${i}`} className="cell cell-empty" aria-hidden="true" />
              ),
            )}
          </div>
        </div>
      </div>

      {data.sessionCount === 0 && filter === null && (
        <p className="heatmap-empty">Finish a focus session and it lands here, one square per day.</p>
      )}

      <TagBreakdown rows={breakdown} filter={filter} onFilter={onFilter} />

      {tip && (
        <div className="heatmap-tip" role="presentation" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </section>
  )
}

const MIN_PITCH = 13
const MAX_PITCH = 20

/** Whole-pixel cell + gap whose 53 columns fill `width` as closely as possible. */
function cellSize(width: number): { cell: number; gap: number; pad: number } {
  const pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, Math.floor((width + 4) / WEEKS)))
  const gap = pitch >= 16 ? 4 : 3
  const used = WEEKS * pitch - gap
  return { cell: pitch - gap, gap, pad: Math.max(0, Math.floor((width - used) / 2)) }
}

function Legend() {
  return (
    <div className="heatmap-legend" aria-label="Color scale from less to more focus time">
      <span>Less</span>
      {LEVELS.map((l) => (
        <span key={l} className="cell" data-level={l} aria-hidden="true" />
      ))}
      <span>More</span>
    </div>
  )
}
