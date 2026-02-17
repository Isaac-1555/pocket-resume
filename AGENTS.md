# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## What this repo is
PocketResume is a **Chrome Extension (Manifest V3)** built with **vanilla HTML/CSS/JS**. There is no bundler/build pipeline; you develop by editing source files and reloading the unpacked extension in Chrome.

Key runtime entrypoints (declared in `manifest.json`):
- **Background service worker**: `background.js` (pipeline orchestration + Gemini API calls)
- **Content script**: `content.js` (extracts page text)
- **Popup UI**: `popup.html` + `popup.js` (user actions + PDF generation)
- **Options page**: `options.html` + `options.js` (API key + saved resumes + toggles)

## Common commands
### Install JS deps
The extension runs without Node at runtime, but the repo uses npm to manage dependencies (and to update the vendored jsPDF build).

```sh
npm ci
# or
npm install
```

### Update the vendored jsPDF bundle
`popup.html` loads jsPDF from `libs/jspdf.umd.min.js` (vendored). If you bump the `jspdf` dependency, copy the built artifact into `libs/`.

```sh
npm install jspdf@latest
cp node_modules/jspdf/dist/jspdf.umd.min.js libs/jspdf.umd.min.js
```

### Run / debug in Chrome
There is no "dev server".
- Load the repo as an unpacked extension: `chrome://extensions` → enable Developer mode → **Load unpacked** → select the repo root (the directory containing `manifest.json`).
- After edits, use **Reload** on the extension in `chrome://extensions`.
- Debugging entrypoints:
  - **Service worker logs**: `chrome://extensions` → PocketResume → **Service worker** (Inspect)
  - **Popup logs**: right-click the popup → Inspect
  - **Content script logs**: the target page’s DevTools console

### Tests / lint
No test runner or linter is configured (no `scripts` in `package.json`). If you add one, document it here.

## High-level architecture (message & data flow)
### Generation pipeline (main user flow)
1. **User clicks "Generate" in the popup** (`popup.js`).
2. Popup calls `chrome.runtime.sendMessage({ type: 'START_GENERATION', payload: { tabId, resumeType, resumeId } })`.
3. **Background service worker** (`background.js`) handles `START_GENERATION` and orchestrates:
   - Reads settings from `chrome.storage.local` (API key, resumes/profile, cover letter toggle).
   - Requests page content from the content script via `GET_PAGE_CONTENT`.
     - If the content script isn’t available, background injects `content.js` using `chrome.scripting.executeScript(...)` and retries.
   - Captures a **viewport screenshot** with `chrome.tabs.captureVisibleTab(...)` (best-effort; may fail on restricted pages).
   - Calls Gemini:
     - `callGemini(...)` generates a resume as **strict JSON text**.
     - If enabled, `callGeminiCoverLetter(...)` generates a cover letter as **strict JSON text**.
4. Background replies to the popup with `{ status: 'success', data: <resumeJsonString>, coverLetterData: <coverLetterJsonString|null> }`.
5. Popup:
   - Strips accidental Markdown fences if present.
   - `JSON.parse(...)` the model output.
   - Generates and downloads PDFs via jsPDF (`generatePDF(...)` and `generateCoverLetterPDF(...)`).

### Settings + persistence
Settings are stored in `chrome.storage.local` and managed in `options.js`.

Important keys:
- `geminiApiKey`: string
- `resumes`: array of `{ id, label, content }` (up to 3)
- `selectedResumeId`: which resume is active in the popup
- `resumeType`: "basic" | "professional" | "faang" (style selector)
- `coverLetterEnabled`: boolean

There is a legacy migration path from `userProfile` → `resumes` in both `options.js` and `popup.js`.

## Where to make common product changes
- **Change Gemini model, prompts, or the expected JSON schema**: `background.js` (`callGemini` / `callGeminiCoverLetter`).
- **Change what we extract from the page**: `content.js` (`extractPageText`) and the truncation in `background.js`.
- **Change PDF layout/typography/sections**: `popup.js` (`generatePDF` / `generateCoverLetterPDF`).
- **Change permissions or extension wiring**: `manifest.json`.
