# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## What this repo is
PocketResume is a **Chrome Extension (Manifest V3)** built with **vanilla HTML/CSS/JS**. No bundler/build pipeline; edit source files and reload unpacked extension in Chrome.

Key runtime entrypoints (declared in `manifest.json`):
- **Background service worker**: `background.js` (pipeline orchestration + AI API calls)
- **Content script**: `content.js` (extracts page text)
- **Popup UI**: `popup.html` + `popup.js` (user actions + PDF generation for PocketResume layouts)
- **Options page**: `options.html` + `options.js` (API keys + multiple resumes + toggles)
- **Resume renderers**: `resume-renderers.js` (Jake, Deedy, Academic CV PDF layouts)

## Common commands
### Install JS deps
The extension runs without Node at runtime, but the repo uses npm to manage dependencies (and update vendored jsPDF build).

```sh
npm ci
# or
npm install
```

### Update vendored jsPDF bundle
`popup.html` loads jsPDF from `libs/jspdf.umd.min.js` (vendored). If you bump `jspdf`, copy built artifact into `libs/`.

```sh
npm install jspdf@latest
cp node_modules/jspdf/dist/jspdf.umd.min.js libs/jspdf.umd.min.js
```

### Run / debug in Chrome
No dev server.
- Load as unpacked extension: `chrome://extensions` → Developer mode → **Load unpacked** → select repo root.
- After edits, use **Reload** on extension card.
- Debugging:
  - **Service worker**: extension card → **Service worker** (Inspect)
  - **Popup**: right-click popup → Inspect
  - **Content script**: target page's DevTools console

### Tests / lint
None configured. No test runner or linter.

## High-level architecture

### Generation pipeline (main user flow)
1. **User clicks "Generate" in popup** (`popup.js`).
2. Popup calls `chrome.runtime.sendMessage({ type: 'START_GENERATION', payload: { tabId, resumeStyle, resumeId } })`.
3. **Background service worker** (`background.js`) handles `START_GENERATION`:
   - Reads settings from `chrome.storage.local` (API key per provider, resumes, cover letter toggle).
   - Requests page content from content script via `GET_PAGE_CONTENT`. Falls back to injecting `content.js` via `chrome.scripting.executeScript(...)`.
   - Calls AI provider:
     - `callGemini(...)` generates resume as **strict JSON text**.
     - If enabled, `callGeminiCoverLetter(...)` generates cover letter as **strict JSON text**.
4. Background replies: `{ status: 'success', data: <resumeJsonString>, coverLetterData: <coverLetterJsonString|null> }`.
5. Popup:
   - Strips accidental Markdown fences.
   - `JSON.parse(...)` the model output.
   - Generates/downloads PDFs via jsPDF:
     - PocketResume layouts (basic/professional/faang): `generatePDF(...)` in `popup.js`.
     - Alternative layouts (jake/deedy/academic-cv): `window.ResumeRenderers.generateResumePDF(...)` in `resume-renderers.js`.
   - Cover letter: `generateCoverLetterPDF(...)` in `popup.js`.

### Resume refinement flow
1. User clicks "Refine Resume" on options page (`options.js`).
2. Options sends `REFINE_RESUME` to background with source text.
3. Background calls `callGeminiResumeRefinement(...)` — rewrites source into cross-style master resume (no job description tailoring).
4. Options shows side-by-side review panel with change summary and warnings.
5. User can Apply (replaces source text) or Cancel. Undo restores last pre-refine backup.

### Resume JSON extraction flow
1. User clicks "Extract JSON" on options page.
2. Options sends `EXTRACT_RESUME_JSON` to background with source text.
3. Background calls `callGeminiResumeExtraction(...)` — extracts structured JSON profile from raw text.
4. JSON is saved as `jsonContent` on the resume entry and persisted. Used as `jsonContent` in generation pipeline.

## Resume styles & layout mapping (`getResumeStyleConfig` in background.js)
| UI Style | promptStyle | layout | PDF Renderer |
|---|---|---|---|
| basic | basic | pocketresume | popup.js `generatePDF` |
| professional | professional | pocketresume | popup.js `generatePDF` |
| faang | faang | pocketresume | popup.js `generatePDF` |
| jake | faang | jake | resume-renderers.js `renderJakeLayout` |
| deedy | faang | deedy | resume-renderers.js `renderDeedyLayout` |
| academic-cv | academic-cv | academic-cv | resume-renderers.js `renderAcademicCvLayout` |

## Settings + persistence
Settings stored in `chrome.storage.local`, managed in `options.js`.

Important keys:
- `apiProvider`: "google" | "openrouter" | "openai" | "anthropic"
- `geminiApiKey` / `openrouterApiKey` / `openaiApiKey` / `anthropicApiKey`: string
- `resumes`: array of `{ id, label, content, jsonContent, lastRefineBackup, lastRefineAppliedAt }` (up to 3)
- `selectedResumeId`: which resume is active in popup
- `resumeType`: "basic" | "professional" | "faang" | "jake" | "deedy" | "academic-cv"
- `coverLetterEnabled`: boolean

Legacy migration: `userProfile` → `resumes[0].content`

## AI provider support
Four providers supported, selected via `apiProvider`:
- **Google Gemini**: model `gemini-2.5-flash`, API key from Google AI Studio
- **OpenAI**: model `gpt-4o-mini`, API key from OpenAI Platform
- **Anthropic**: model `claude-3-5-haiku-20241022`, API key from Anthropic Console
- **OpenRouter**: model `openai/gpt-oss-120b:free`, API key from OpenRouter

Each has matching `callGemini*` variants for all 3 pipelines (generation, cover letter, extraction, refinement).

## Where to make common product changes
- **Change AI model, prompts, or JSON schema**: `background.js` (`callGemini`, `callGeminiCoverLetter`, `callGeminiResumeExtraction`, `callGeminiResumeRefinement`).
- **Change what we extract from page**: `content.js` (`extractPageText`) and truncation in `background.js` line 818.
- **Change PocketResume PDF layout**: `popup.js` (`generatePDF` / `generateCoverLetterPDF`).
- **Change Jake/Deedy/Academic CV PDF layouts**: `resume-renderers.js` (`renderJakeLayout` / `renderDeedyLayout` / `renderAcademicCvLayout`).
- **Change settings UI / resume management**: `options.js` / `options.html`.
- **Change popup UI**: `popup.html` / `popup.js`.
- **Change permissions or extension wiring**: `manifest.json`.
