# BookReader Web

A free, **fully client-side** ebook reader for EPUB and PDF. No backend, no accounts, no hosting cost — everything lives in your browser. Differentiated by careful theming/typography and **BYOK (bring-your-own-key) Gemini translation**.

## Features

- **EPUB + PDF** rendering (epub.js / pdf.js) behind a common engine interface — EPUB is paginated with reflowable text, PDF is continuous-scroll with lazy page rendering for large files
- **Library** with shelves (Reading / To read / Finished), search, drag-and-drop import, cover extraction
- **Themes**: light, dark, sepia, AMOLED night — plus font size, font family (serif / sans / dyslexia-friendly / mono), line spacing, margins, and justification controls
- **Reading position** remembered per book ("continue reading"), progress % in the library
- **Highlights** in 5 colors (CFI ranges for EPUB, page + normalized rects for PDF), **notes** on highlights, **bookmarks**, **in-book search**
- **Select text → Translate** with the user's own Gemini API key, called directly from the browser. Clear onboarding when no key is set, and explicit error states for invalid key / rate limit / offline
- **Export / Import** the whole library (books + annotations + positions) as a zip — the manual alternative to cloud sync
- **PWA**: installable, works offline once loaded (translation excepted)
- Storage-quota warnings, graceful errors for malformed or DRM/password-locked files

## Privacy model

- Books, highlights, positions, and your Gemini key are stored in IndexedDB/localStorage **on your device only**.
- The only network call the app ever makes with your data is the translation request, sent **directly to Google's Gemini API** with your own key. There is no server of ours in the middle.
- Your key is visible in your own browser's devtools — normal for BYOK. Don't paste your key into browsers you don't trust.

## Develop

```bash
npm install
npm run dev       # local dev server
npm run build     # production build -> dist/
npm run preview   # serve the production build locally
```

## Deploy

Static hosting only. `netlify.toml` is included — connect the repo to Netlify and it builds `dist/` with SPA fallback. Any static host (GitHub Pages, Cloudflare Pages) works the same way.

## Architecture notes

- `src/lib/reader/readerEngine.js` — the common engine interface. epub.js reflows text and pdf.js is fixed-layout, so they are **not** forced into one renderer; each engine implements `init / next / prev / goTo / getLocation / getProgress / getToc / search / addHighlight / …` and emits `relocated / selected / loaded / error` events. Locations are opaque to the UI (CFI string for EPUB, `{page, scrollRatio}` for PDF).
- `src/lib/db.js` — IndexedDB stores: `books` (metadata), `blobs` (raw file bytes, kept separate so the library list loads fast), `highlights`, `bookmarks`.
- `src/lib/storage.js` — localStorage: settings, per-book positions, Gemini key.
- `src/lib/gemini.js` — translation calls with typed errors (`no-key`, `invalid-key`, `rate-limit`, `network`, `blocked`) so the UI never fails silently.
- The dyslexia-friendly font uses OpenDyslexic if installed on the device, falling back to broadly-available rounded fonts (bundling the font is a nice future improvement).
