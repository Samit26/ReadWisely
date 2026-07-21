# ReadWisely (BookReader Web) — Complete Feature Reference

A **free, fully client-side** EPUB & PDF ebook reader. No backend, no accounts, no hosting cost — books, annotations, positions, reading stats, and your AI key all live in your own browser (IndexedDB + localStorage). The only network call the app ever makes with your data is an optional Gemini AI request, sent **directly** from your browser to Google using your own key.

- **Stack:** React 18, Vite 5, epub.js, pdf.js, tesseract.js (OCR), JSZip, idb, vite-plugin-pwa
- **Deploy:** static hosting only (Netlify config included; any static host works)
- **Routing:** hash-based (`#/` library, `#/read/<bookId>` reader) — back button works, reads are linkable

---

## 1. Library

### 1.1 Shelves & filtering
- Three shelves, **derived automatically from reading progress** (no manual moves):
  - **To read** — progress = 0
  - **Reading** — progress between 0 and 98%
  - **Finished** — progress ≥ 98%
- Filter bar: **All** + each shelf, each with a live count.
- Legacy books saved with a mismatched shelf are **auto-migrated/normalized** on load.

### 1.2 Search
- Case-insensitive substring search over combined `title + author`, scoped to the active shelf.

### 1.3 Importing books
- **Drag-and-drop** (`UploadZone`) — overlay prompt "Drop EPUB or PDF files to add them"; works over the empty library or over an existing grid (compact mode).
- **File picker** — accepts `.epub, .pdf, application/epub+zip, application/pdf`, multiple files; input resets so re-picking the same file works.
- Format detection by extension, falling back to MIME type; non-EPUB/PDF files are rejected with a toast.
- **PDF import options modal** — when a PDF is selected, offers to convert PDF → reflowable EPUB (better results), with a "Proceed anyway" option to keep the raw PDF and an external link to FreeConvert for offline conversion.
- **Converting overlay** — full-screen status while importing ("extracting text"; warns scanned PDFs may take minutes).
- **Quota handling** — friendly "Storage full" toast on `QuotaExceededError`.
- On success: toast "Added N book(s)."

### 1.4 Metadata & cover extraction
- **EPUB:** parsed directly with JSZip + DOMParser (avoids epub.js teardown races) — reads `container.xml` → OPF → `dc:title`/`dc:creator`; cover from EPUB3 `cover-image` property or EPUB2 `<meta name="cover">`, downscaled to a 240px-wide JPEG data URL.
- **PDF:** pdf.js `getMetadata()` for Title/Author; renders page 1 to a 240px-wide JPEG as the cover; also returns page count.
- **Filename fallback:** strips extension, `Title (Author)` pattern parsing; rejects UUID-shaped / "untitled"/"unknown" junk titles from online converters.

### 1.5 Book cards
- Cover (falls back to `/default-book-cover.png`), lazy-loaded, staggered entrance animation, decorative sheen.
- **Progress overlay** bar on cover (`{pct}% read` tooltip), **format tag** (epub/pdf).
- Click cover or meta to open the book.
- **Kebab menu:** shows size + `% read`; **Edit / "Fix book details"** (label switches to "Fix" when cover/author missing or title looks like a UUID); **Remove**.
- **"Fix book details" modal** — edit Title (required), Author, and Cover (pick a local image via file input, previewed as a data URL).
- **Remove confirmation modal** — warns it also deletes saved position, highlights, and bookmarks from this browser; cannot be undone; cannot be dismissed mid-removal.

### 1.6 Home / library screen sections
- **Brand header** — logo/name (resets filters), streak chip, settings button.
- **Editorial hero** — quiet-reading / privacy / offline copy.
- **"Pick up where you left off"** focus card — the most-recently-opened in-progress book, with cover, progress bar, "% complete", and **Resume →**. Falls back to an import CTA when nothing is in progress.
- **Library-at-a-glance meter** — total count + proportional bars for Reading / To read.
- **Book grid** — with loading spinner, "Add a book" tile, and "No matching books" empty search state.
- **First-run empty state** (`EmptyState`) — onboarding copy, "Choose a file", and a feature trio (Private by design / Resume instantly / Made for focus).

---

## 2. Reading Engines

A common engine interface (`readerEngine.js`) lets the UI treat EPUB (reflowable) and PDF (fixed-layout) uniformly. Each engine implements `init / destroy / next / prev / goTo / getLocation / getProgress / getToc / applySettings / search / getReadText / addHighlight / removeHighlight` and emits `relocated / selected / loaded / error / tap / keydown / highlight-click` via a shared `Emitter`. Locations are opaque: a **CFI string** for EPUB, `{ page, scrollRatio }` for PDF.

### 2.1 EPUB engine (epub.js)
- **Two flow modes** (fixed at init, rebuilds on toggle):
  - **Paginated** (default) — reflowable pages, auto spread.
  - **Scrolled** — uses the *continuous* manager for one uninterrupted scroll across the whole book (not per-chapter).
- `allowScriptedContent: false` — no scripts run in book iframes.
- **User styling injected as a real stylesheet** into every chapter iframe with `!important` on a broad text selector, so user font/size/spacing/theme **beat the book's own CSS**.
- **Accurate progress** via background `book.locations.generate(1024)`; falls back to `loc.start.percentage` until ready. Page info is location-based (`Loc X of Y`).
- Relays iframe `click` → `tap` and `keydown` → arrow-key page turns (events don't escape the iframe).
- Themed webkit scrollbar in scrolled mode; scrollbars hidden in paginated mode.

### 2.2 PDF engine (pdf.js)
- **Continuous vertical scroll** with **lazy page rendering** — spacer divs sized by aspect ratio up front (correct scroll height), pages rendered via `IntersectionObserver` (800px margin) as they approach the viewport.
- Canvas rendered at `devicePixelRatio` (capped at 2) for crispness.
- **Text layer** built from pdf.js `TextLayer` for selection + search, CSS-scaled to stay aligned at any zoom/window size (kept in sync via `ResizeObserver`).
- **Zoom** — debounced 250ms; re-rasterizes at higher scale, keeps off-screen pages lazy.
- Page info is page-based (`Page X of Y`); progress from scroll position.

---

## 3. Reader UI

### 3.1 Navigation
- **Keyboard:** →/PageDown = next, ←/PageUp = prev, **Ctrl/Cmd+F** = search, **Esc** = close panels; ignored while typing in inputs.
- **Edge tap zones** (`‹` / `›`) for prev/next (paginated EPUB & PDF).
- **Center tap** toggles chrome (immersive mode) — hides toolbar + footer.
- Arrow-key navigation also works from inside EPUB iframes.

### 3.2 Toolbar (top bar)
- **Back to library**, title + live progress %.
- Action buttons: **Recap**, **Search** (Ctrl+F), **Contents (TOC)**, **Highlights**, **Add bookmark**, **Bookmarks list**, **Typography (Text & theme)**.
- Auto-hides in immersive mode.

### 3.3 Footer / progress bar
- `Page X of Y` or `Loc X of Y`, filled progress bar (`{pct}% read` tooltip), percentage label. Shown only when chrome is visible.

### 3.4 Sidebar drawer (right side, with scrim)
- **Contents** — flattened, depth-indented TOC; jumps to href. (PDF TOC resolved from the PDF outline → page numbers.)
- **Highlights & notes** — list sorted by time; colored bar, quoted text (click to jump), inline note editing (textarea, Cancel/Save), "+ Add note", delete.
- **Bookmarks** — newest first; label = progress %, localized date; jump or remove.
- **Search** — in-book search box, loading state, match count, per-result excerpt + optional page number, click to navigate.

### 3.5 In-book search
- **EPUB:** iterates spine items via epub.js `find` (caps ~200 results), returns excerpt + CFI.
- **PDF:** case-insensitive scan of all page text with ±40-char context (caps 300 results), returns excerpt + page.

### 3.6 Highlights (5 colors)
- Colors: yellow `#ffd54a`, green `#7ee787`, blue `#7cc4ff`, pink `#ff9db1`, purple `#c9a0ff`.
- **EPUB** highlights use epub.js **CFI ranges** (`fill-opacity 0.35`, `mix-blend-mode: multiply`).
- **PDF** highlights use **normalized fractional rects per page** (`{x,y,w,h}` in 0–1), drawn as overlay divs.
- Highlights carry an optional **note** (truncated text stored, max 500 chars), click a highlight to open the panel, both formats share the same IndexedDB store.

### 3.7 Bookmarks
- One-tap bookmark of the current location, labeled with progress %; toast "Bookmark added."; removable.

### 3.8 Selection menu (floating)
- Appears on text selection, auto-positioned above/below the selection and clamped to the viewport.
- **Color dots** (highlight), **Translate**, **Copy** (writes to clipboard, toast "Copied.").

### 3.9 Position persistence & resume
- Saved position restored on open; highlights re-applied to freshly rendered content.
- Debounced save (500ms) + immediate save on teardown so a rebuilt engine resumes exactly.
- `lastOpenedAt` updated on open; library progress kept in sync (drives shelf + focus card).

### 3.10 Error states (`ReaderError`)
- Friendly full-screen cards for **DRM/password-locked** ("This book is locked"), **malformed/corrupted** ("Couldn't open this book"), and **missing** ("Book not found"), each with a "Back to library" button. Never crashes on a bad file.

---

## 4. AI Features (BYOK Gemini)

All AI is **bring-your-own-key** — the key is stored only in your browser and requests go straight to Google (`generativelanguage.googleapis.com`), never through a server of the app's. Structured JSON output is enforced via `responseSchema`. Typed errors (`no-key`, `invalid-key`, `rate-limit`, `network`, `blocked`, `unknown`) drive tailored recovery UI everywhere.

### 4.1 Translate / Explain popover
- Auto-runs on text selection.
- **Translation mode** (text is in another language) — translation, detected source language, short meaning, optional equivalent in a secondary language.
- **Explanation mode** (text already in your target language) — definition, example sentence, part-of-speech badge, optional secondary-language equivalent.
- **Copy** assembles a plain-text version; **no-key** and **error** states offer "Add API key" / "Fix key in Settings" / "Retry".

### 4.2 "Where you left off" Recap
- Spoiler-safe AI recap that summarizes only what you've read (never predicts ahead).
- **Scope choice:** *Recent chapters* (current + previous, ~15k chars) or *From the start* (whole story so far, up to 600k chars using Gemini's large context).
- Both engines expose `getReadText({ maxChars, scope })` (EPUB by spine sections, PDF walking backward from current page).
- Output: a recap paragraph + optional "Right before you stopped" beat; loading/empty/no-key/error states; auto-reruns after a key is added.

### 4.3 Automatic author enrichment
- If a Gemini key exists and a book has no author, the app guesses the author from the title (throttled: up to 10 books, 1500ms apart, stops on rate-limit/bad-key). Silent, failure-tolerant, "Do not guess" prompt with confidence filtering.

### 4.4 Models & languages
- Models: **Gemini 3.5 Flash** (default/recommended), 3.1 Flash-Lite, 3.1 Pro, 2.5 Flash. Legacy 1.5/2.0 model IDs auto-migrate to 3.5 Flash.
- 20 languages for primary target + secondary (English, Spanish, French, German, Italian, Portuguese, Hindi, Urdu, Bengali, Tamil, Telugu, Marathi, Arabic, Chinese, Japanese, Korean, Russian, Turkish, Indonesian, Vietnamese).
- **Test key** validation ping in Settings.

---

## 5. PDF → EPUB Conversion

Converts PDFs into **searchable, resizable reflowable EPUB text** (not rasterized page images), so full typography controls apply.

- **Text-geometry reflow pipeline:** reconstructs lines from glyph positions, detects & reorders two-column layouts, strips repeated headers/footers/page numbers, infers body font size & margin, rebuilds paragraphs (heading detection, gap/indent splitting, de-hyphenation), and splits into chapters by PDF outline or `h2` headings.
- **OCR fallback (tesseract.js):** when extractable text is below ~400 chars (scanned PDFs), renders each page at 1.75× and OCRs it into reflowable text (progress reported; strips known watermark noise e.g. Flexcil lines).
- **Output:** a valid EPUB3 zip (mimetype, container, styled CSS, per-chapter XHTML, nav TOC, content.opf, optional cover). Limits: max 1000 pages. Strategy tagged `reflowable-text` or `ocr-reflowable-text`. Falls back to keeping the original PDF if conversion isn't viable.

---

## 6. Reading Stats & Streaks

- **Reading-time tracking** — active seconds accumulated per activity (page turn/tap), each gap **capped at 30s** so an idle open book doesn't inflate time. Stored per local day (`YYYY-MM-DD`).
- **Streak chip** in the header (candle icon), lit when the current streak > 0.
- **Streak dialog** — current streak hero + milestone copy (tiers at 1/3/7/30/100 days), Longest / Total days / This year, and a **month calendar** marking qualifying days (prev/next navigation, can't browse the future). A day "counts" once reading exceeds **120 seconds**.
- **Stats dashboard** (`StatsSection`, hidden until you've logged time) — Total time read, This month, Days read, Avg per reading day, Best day, Best month, Books finished.

---

## 7. Typography & Theming

### 7.1 Themes (4)
- **Light** (`#faf9f7`/`#1a1a1a`), **Sepia** (`#f4ecd8`/`#4a3b2a`, default), **Dark** (`#15171c`/`#d7d9de`), **Night / AMOLED** (`#000000`/`#c7c9ce`). Applied instantly; browser `theme-color` meta updates to match.

### 7.2 EPUB typography controls
- **Font size** stepper (60–220%), **font family** (Serif/Sans/**Dyslexic** (OpenDyslexic)/Mono), **line spacing** (1.2–2.2), **margins** (0–20), **alignment** (Left/Justify), **layout** (Pages/Scroll), **page transition** (Slide/Fade/None).

### 7.3 PDF controls
- **Zoom** stepper (50–300%), **margins**, and **theme tint** (CSS filter). A note explains PDF's fixed layout can't change font/spacing/align.

### 7.4 Settings persistence
- Applied globally via CSS custom properties + data attributes on `<html>` (`--reader-font-scale`, `--reader-line-height`, `--reader-margin`, `--reader-text-align`, `--reader-font-family`, `data-theme`).

---

## 8. Data, Backup & Storage

### 8.1 Storage layers
- **IndexedDB** (`bookreader` db): `books` (metadata, indexed by `addedAt`/`shelf`), `blobs` (raw file bytes, kept separate so the list loads fast), `highlights`, `bookmarks` (both indexed by `bookId`). Deleting a book cascades across all four stores.
- **localStorage** keys: `br.settings`, `br.pos.<bookId>`, `br.gemini.key`, `br.gemini.model`, `br.translate.lang`, `br.translate.lang2`, `br.reading.log`.

### 8.2 Backup / restore (manual, the deliberate substitute for cloud sync)
- **Export** the whole library as a ZIP — `manifest.json` (version, timestamp, each book record + cover + embedded highlights/bookmarks/position) plus raw bytes at `books/<id>.<format>`, DEFLATE level 6. Downloads as `bookreader-backup-YYYY-MM-DD.zip`.
- **Import** a backup ZIP — validates the manifest, restores blobs + records + all annotations + positions. Toast "Imported N book(s)."
- **BackupBar** UI with export/import buttons, busy spinners, and empty-library guard.

### 8.3 Storage-quota warnings
- Reads `navigator.storage.estimate()`; shows a dismissible warning at **≥80%** ("Storage filling up — consider exporting a backup") and a critical variant at **≥95%** ("New books may fail to save").

---

## 9. Platform / PWA / Infrastructure

- **Installable PWA** — web manifest (`readwisely`, standalone, 192/512 + maskable icons), apple-touch-icon for iOS home screen.
- **Offline** — Workbox precaches the app shell (`js/css/html/svg/png/woff2`, ≤5MB), `navigateFallback` to `index.html`; **service worker auto-updates**. User book blobs live in IndexedDB (not precached). Gemini API calls use **NetworkOnly** (never cached).
- **Build:** manual chunks isolate `pdfjs-dist` and `epubjs`; ES-module workers.
- **Netlify:** `npm run build` → `dist`, SPA rewrite `/*` → `/index.html` (200), security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`).
- **Viewport:** edge-to-edge / notch-safe, pinch-zoom to 5×.

---

## 10. Shared UI Primitives

- **Modal** — portal-rendered, Escape to close, body scroll lock, click-outside-to-close, accessible (`role="dialog"`, `aria-modal`), optional `wide`/footer.
- **Toasts** — `success` (4s, ✓), `error` (6s, !), `info` (4s, i); auto-dismiss or click-to-dismiss; `aria-live="polite"`.
- **Icon set** — inline stroke SVGs (Back, Menu, List, Aa, Search, Bookmark, Highlight, Settings, Close, Chevrons, Translate, Plus, Upload, Download, Trash, Book, Note, Sun, Dots, Copy, Candle, Recap).
- **Context providers** — nested ToastProvider → SettingsProvider → LibraryProvider so library/settings errors surface as toasts.

---

## Privacy Model (summary)

- Books, highlights, positions, reading log, and your Gemini key are stored **on your device only** (IndexedDB/localStorage).
- The only network call made with your data is the Gemini request, sent **directly to Google** with your own key — no server of the app's in the middle.
- Your key is visible in your own browser's devtools (normal for BYOK) — don't paste it into browsers you don't trust.
