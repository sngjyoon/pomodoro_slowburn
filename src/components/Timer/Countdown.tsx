// Large mm:ss readout. Each character sits in a fixed-width box so the
// numbers never shift sideways, whatever the font's figure widths.

import { formatClock } from '../../lib/timer'

export function Countdown({ ms }: { ms: number }) {
  const text = formatClock(ms)
  return (
    <div className="countdown" role="timer" aria-live="off" aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={i} className={ch === ':' ? 'countdown-colon' : 'countdown-digit'} aria-hidden="true">
          {ch}
        </span>
      ))}
    </div>
  )
}
