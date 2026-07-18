// Minimal inline SVG icon set (stroke-based, inherits currentColor).
const p = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

export const Icon = {
  Back: (x) => <svg {...p} {...x}><path d="M15 18l-6-6 6-6" /></svg>,
  Menu: (x) => <svg {...p} {...x}><path d="M4 6h16M4 12h16M4 18h16" /></svg>,
  List: (x) => <svg {...p} {...x}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>,
  Aa: (x) => <svg {...p} {...x}><path d="M4 19l5-13 5 13M6 14h6M15 19l3-8 3 8M16.2 16.5h3.6" /></svg>,
  Search: (x) => <svg {...p} {...x}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>,
  Bookmark: (x) => <svg {...p} {...x}><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" /></svg>,
  Highlight: (x) => <svg {...p} {...x}><path d="M4 20h16M6 16l8-8 4 4-8 8H6v-4z" /></svg>,
  Settings: (x) => <svg {...p} {...x}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 12.9H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 6l-.1-.1a2 2 0 1 1 2.8-2.8L7.4 3a1.6 1.6 0 0 0 2.7-1.1V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></svg>,
  Close: (x) => <svg {...p} {...x}><path d="M18 6L6 18M6 6l12 12" /></svg>,
  ChevronLeft: (x) => <svg {...p} {...x}><path d="M15 18l-6-6 6-6" /></svg>,
  ChevronRight: (x) => <svg {...p} {...x}><path d="M9 18l6-6-6-6" /></svg>,
  Translate: (x) => <svg {...p} {...x}><path d="M4 5h7M9 3v2c0 4-2.5 7-6 8M5 9c0 2.5 2.5 4.5 5 5.5M12 20l4-9 4 9M13.5 17h5" /></svg>,
  Plus: (x) => <svg {...p} {...x}><path d="M12 5v14M5 12h14" /></svg>,
  Upload: (x) => <svg {...p} {...x}><path d="M12 15V3M8 7l4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>,
  Download: (x) => <svg {...p} {...x}><path d="M12 3v12M8 11l4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>,
  Trash: (x) => <svg {...p} {...x}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" /></svg>,
  Book: (x) => <svg {...p} {...x}><path d="M4 4h11a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" /><path d="M4 4v14" /></svg>,
  Note: (x) => <svg {...p} {...x}><path d="M4 4h16v12l-4 4H4z" /><path d="M16 20v-4h4" /></svg>,
  Sun: (x) => <svg {...p} {...x}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></svg>,
  Dots: (x) => <svg {...p} {...x}><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></svg>,
  Copy: (x) => <svg {...p} {...x}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
}
