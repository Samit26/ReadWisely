import { Icon } from '../common/Icon.jsx'

export default function EmptyState({ onBrowse }) {
  return (
    <section className="empty-state">
      <div className="empty-state__intro">
        <span className="empty-state__eyebrow">Your private reading space</span>
        <h2>Build a library that stays with you.</h2>
        <p className="muted">Import books, pick up where you left off, and read without an account or a cloud upload.</p>
      </div>

      <div className="empty-state__upload-card">
        <div className="empty-state__art"><Icon.Book width={46} height={46} /></div>
        <div>
          <h3>Add your first book</h3>
          <p>Drop an EPUB or PDF anywhere on this page, or choose a file from your device.</p>
        </div>
        <button className="btn btn--primary" onClick={onBrowse}>
          <Icon.Upload width={18} height={18} /> Choose a file
        </button>
        <span className="empty-state__formats">EPUB and PDF · Multiple files supported</span>
      </div>

      <div className="empty-state__features" aria-label="Reader features">
        <div><span className="empty-state__feature-icon">⌁</span><strong>Private by design</strong><p>Books are stored locally in this browser.</p></div>
        <div><span className="empty-state__feature-icon">◒</span><strong>Resume instantly</strong><p>Your reading position is saved automatically.</p></div>
        <div><span className="empty-state__feature-icon">✦</span><strong>Made for focus</strong><p>Comfortable themes and distraction-free reading.</p></div>
      </div>
    </section>
  )
}
