import { useMemo } from 'react'
import { loadReadingLog, computeReadingStats } from '../../lib/storage.js'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtDuration(min) {
  if (!min) return '0m'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`
}

function fmtMonth(key) {
  if (!key) return '—'
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

export default function StatsSection({ books }) {
  const stats = useMemo(() => computeReadingStats(loadReadingLog(), books), [books])

  // Nothing to show until the reader has actually logged some time.
  if (!stats.totalMinutes) return null

  const tiles = [
    { label: 'Total time read', value: fmtDuration(stats.totalMinutes) },
    { label: 'This month', value: fmtDuration(stats.monthMinutes) },
    { label: 'Days read', value: stats.readingDays },
    { label: 'Avg / reading day', value: fmtDuration(stats.avgMinutes) },
    { label: 'Best day', value: fmtDuration(stats.bestDayMinutes) },
    { label: 'Best month', value: fmtMonth(stats.bestMonthKey) },
    { label: 'Books finished', value: stats.booksFinished }
  ]

  return (
    <section className="home-stats">
      <span className="section-tag">Your reading, measured</span>
      <div className="home-stats__grid">
        {tiles.map((t) => (
          <div key={t.label} className="home-stats__tile">
            <b>{t.value}</b>
            <span>{t.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
