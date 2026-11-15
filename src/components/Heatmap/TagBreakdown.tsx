import type { BreakdownRow, Streak, TagFilter } from '../../lib/breakdown'
import { formatDuration } from '../../lib/heatmap'

interface Props {
  rows: BreakdownRow[]
  filter: TagFilter
  onFilter: (filter: TagFilter) => void
}

/** Time per tag over the last year. Each row also filters the heatmap above. */
export function TagBreakdown({ rows, filter, onFilter }: Props) {
  if (rows.length === 0) return null
  const max = rows[0].ms

  return (
    <div className="breakdown">
      <ul className="breakdown-list" aria-label="Focus time by tag. Select a tag to filter the heatmap.">
        {rows.map((row) => {
          const pressed = filter === row.key
          return (
            <li key={row.key}>
              <button
                type="button"
                className="breakdown-row"
                aria-pressed={pressed}
                data-dimmed={filter !== null && !pressed ? '' : undefined}
                onClick={() => onFilter(pressed ? null : row.key)}
              >
                <span className="breakdown-name">
                  <span className="breakdown-tag">{row.name}</span>
                  <StreakBadge streak={row.streak} />
                  {row.archived && <span className="breakdown-archived">deleted</span>}
                </span>
                <span className="breakdown-bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(2, (row.ms / max) * 100)}%` }} />
                </span>
                <span className="breakdown-time">{formatDuration(row.ms)}</span>
                <span className="breakdown-share">{Math.round(row.share * 100)}%</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

/** Flame + current streak, shown only while a streak is alive. Best streak is in the tooltip. */
function StreakBadge({ streak }: { streak: Streak }) {
  if (streak.current === 0) return null
  const label = `${days(streak.current)} streak, best ${days(streak.longest)}`
  return (
    <span className="breakdown-streak" title={label} aria-label={label}>
      <FlameIcon />
      {streak.current}
    </span>
  )
}

// Flame outline from Lucide (https://lucide.dev), ISC License.
function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  )
}
