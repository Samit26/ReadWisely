import { useState } from 'react'
import { Icon } from '../common/Icon.jsx'
import { computeStreak } from '../../lib/storage.js'
import StreakDialog from './StreakDialog.jsx'

export default function StreakChip() {
  const [open, setOpen] = useState(false)
  // Read once on mount — the log only changes while reading, not on the library.
  const [{ current }] = useState(() => computeStreak())

  return (
    <>
      <button
        className={`streak-chip${current > 0 ? ' is-lit' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={current > 0 ? `${current}-day reading streak` : 'Reading days'}
      >
        <Icon.Candle width={16} height={16} />
        <span>{current}</span>
      </button>
      {open && <StreakDialog onClose={() => setOpen(false)} />}
    </>
  )
}
