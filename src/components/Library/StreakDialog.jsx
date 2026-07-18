import { useMemo, useState } from 'react'
import Modal from '../common/Modal.jsx'
import { Icon } from '../common/Icon.jsx'
import { loadReadingLog, computeStreak, dayKey, DAY_THRESHOLD_SECONDS } from '../../lib/storage.js'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// A warm, non-techy line that shifts at milestones.
function milestoneLine(current) {
  if (current >= 100) return 'A hundred days by lamplight. Extraordinary.'
  if (current >= 30) return 'A month of quiet evenings. The habit is yours now.'
  if (current >= 7) return 'A full week, lamp kept lit. Lovely.'
  if (current >= 3) return 'Three days running — the flame steadies.'
  if (current >= 1) return 'The lamp is lit. Come back tomorrow to keep it going.'
  return 'Read for two minutes today to light the lamp.'
}

// Build the day cells for a given month, padded so day 1 lands on its weekday.
function buildMonth(year, month, qualified, todayKey) {
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < first.getDay(); i++) cells.push(null) // leading blanks
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dayKey(new Date(year, month, d))
    cells.push({ day: d, key, active: qualified.has(key), today: key === todayKey })
  }
  return cells
}

export default function StreakDialog({ onClose }) {
  const { stats, todayKey } = useMemo(() => {
    const s = computeStreak(loadReadingLog())
    return { stats: s, todayKey: dayKey() }
  }, [])

  const now = useMemo(() => new Date(), [])
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const atCurrentMonth = view.year === now.getFullYear() && view.month === now.getMonth()

  const cells = useMemo(
    () => buildMonth(view.year, view.month, stats.qualified, todayKey),
    [view, stats.qualified, todayKey]
  )

  const shift = (delta) => setView((v) => {
    const d = new Date(v.year, v.month + delta, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  return (
    <Modal title="Your reading days" onClose={onClose} className="modal--streak">
      <div className="streak">
        <div className="streak__flame" aria-hidden="true">
          <Icon.Candle width={30} height={30} />
        </div>
        <div className="streak__hero">
          <strong>{stats.current}</strong>
          <span>{stats.current === 1 ? 'day in a row' : 'days in a row'}</span>
        </div>
        <p className="streak__line">{milestoneLine(stats.current)}</p>

        <div className="streak__stats">
          <div><b>{stats.longest}</b><span>Longest</span></div>
          <div><b>{stats.totalDays}</b><span>Total days</span></div>
          <div><b>{stats.thisYear}</b><span>This year</span></div>
        </div>

        <div className="streak-cal">
          <div className="streak-cal__head">
            <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month"><Icon.ChevronLeft width={18} height={18} /></button>
            <strong>{MONTHS[view.month]} {view.year}</strong>
            <button className="icon-btn" onClick={() => shift(1)} disabled={atCurrentMonth} aria-label="Next month"><Icon.ChevronRight width={18} height={18} /></button>
          </div>
          <div className="streak-cal__grid streak-cal__grid--dow">
            {WEEKDAYS.map((d, i) => <span key={i} className="streak-cal__dow">{d}</span>)}
          </div>
          <div className="streak-cal__grid">
            {cells.map((cell, i) => cell === null
              ? <span key={`b${i}`} className="streak-cal__cell is-blank" />
              : <span
                  key={cell.key}
                  className={`streak-cal__cell${cell.active ? ' is-active' : ''}${cell.today ? ' is-today' : ''}`}
                  title={cell.active ? `${cell.key} · read` : cell.key}
                >{cell.day}</span>
            )}
          </div>
        </div>
        <p className="streak__legend">Read {Math.round(DAY_THRESHOLD_SECONDS / 60)} minutes to light a day.</p>
      </div>
    </Modal>
  )
}
