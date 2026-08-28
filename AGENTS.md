# AGENTS.md

This file provides guidance to AI coding agents and human contributors when working on this repository. It is intentionally public so contributors and AI tools can share a common operating manual.

## What this repo is

PocketResume is a **Chrome Extension (Manifest V3)** built with **vanilla HTML/CSS/JS**. No bundler / build pipeline for app code; the only build step is `esbuild` for the cloud-sync bundle. Edit source files, reload the unpacked extension in Chrome.

Key runtime entrypoints (declared in `manifest.json`):

- **Background service worker**: `background.js` — pipeline orchestration + AI API calls
- **Content script**: `content.js` — extracts page text from the active tab
- **Popup UI**: `popup.html` + `popup.js` — user actions + PDF generation for PocketResume layouts
- **Options page**: `options.html` + `options.js` — API keys + multiple resumes + toggles
- **Resume renderers**: `resume-renderers.js` — Jake, Deedy, Academic CV PDF layouts
- **Cloud sync (optional)**: `src/cloud-sync.js` (source) → `cloud-sync.js` (bundle, gitignored)
- **Convex backend (optional)**: `convex/` — auth config + resume schema/functions

## Common commands

### Install JS deps

The extension runs without Node at runtime, but the repo uses npm to manage dependencies (and to bundle `cloud-sync.js` + update the vendored jsPDF build).

```sh
npm ci
# or
npm install
```

### Build cloud-sync bundle

`src/cloud-sync.js` is bundled by esbuild into `cloud-sync.js` at the repo root (gitignored). Required env vars (`CLERK_PUBLISHABLE_KEY`, `CONVEX_URL`) are injected at build time. See `.env.example` and `package.json` → `scripts/build-clerk.mjs`.

```sh
cp .env.example .env.local
# fill in your own Clerk + Convex values
npm run build:clerk
```

### Update vendored jsPDF

`popup.html` loads jsPDF from `libs/jspdf.umd.min.js` (vendored). If you bump `jspdf`, copy the built artifact into `libs/`.

```sh
npm install jspdf@latest
cp node_modules/jspdf/dist/jspdf.umd.min.js libs/jspdf.umd.min.js
```

### Run / debug in Chrome

No dev server.

- Load as unpacked extension: `chrome://extensions` → Developer mode → **Load unpacked** → select repo root
- After edits, click **Reload** on the extension card

Debugging:

- **Service Worker**: extension card → **Service worker** (Inspect)
- **Popup**: right-click popup → Inspect
- **Content Script**: target page's DevTools console

### Convex backend (optional)

```sh
npx convex dev
```

Requires `CONVEX_DEPLOYMENT` in `.env.local`. Generated code goes to `convex/_generated/` (gitignored).

### Tests / lint

None configured. No test runner or linter. Validate by hand: load unpacked, generate a resume with a real API key, inspect the PDF + the service worker console.

## High-level architecture

### Generation pipeline (main user flow)

1. **User clicks "Generate" in popup** (`popup.js`).
2. Popup calls `chrome.runtime.sendMessage({ type: 'START_GENERATION', payload: { tabId, resumeStyle, resumeId } })`.
3. **Background service worker** (`background.js`) handles `START_GENERATION`:
   - Reads settings from `chrome.storage.local` (API key per provider, resumes, cover letter toggle).
   - Requests page content from content script via `GET_PAGE_CONTENT`. Falls back to injecting `content.js` via `chrome.scripting.executeScript(...)`.
   - Calls the active AI provider:
     - Resume generation as **strict JSON text** (no markdown fences)
     - If cover letter is enabled, a second call generates the cover letter as **strict JSON text**
4. Background replies: `{ status: 'success', data: <resumeJsonString>, coverLetterData: <coverLetterJsonString|null> }` or `{ status: 'error', message: <string> }`.
5. Popup (success):
   - Strips accidental Markdown fences.
   - `JSON.parse(...)` the model output.
   - Generates / downloads PDFs via jsPDF:
     - PocketResume layouts (basic / professional / faang): `generatePDF(...)` in `popup.js`
     - Alternative layouts (jake / deedy / academic-cv): `window.ResumeRenderers.generateResumePDF(...)` in `resume-renderers.js`
   - Cover letter: `generateCoverLetterPDF(...)` in `popup.js`
6. Popup (error): `setError()` stores the raw message, maps it to a short human-readable string via `mapErrorMessage(...)`, and persists the red `data-status="error"` state until the popup closes or Generate is clicked again. It also reveals the "?" button (`#errorInfoBtn`), which opens the error modal (`#errorModal`) with the mapped message plus a Copy Details button for the full raw error. Exception: a missing/unconfigured API key or resume no longer produces the red error — the setup card shows instead (see onboarding flow below).

### Onboarding flow

New/unconfigured users get a setup card in the popup plus a spotlight tour on the options page instead of a red error.

1. Popup load (`popup.js`): if the config check (API key per provider / custom endpoint + resume content) fails, `renderSetupCard(...)` shows `#setupCard` — a checklist (provider / API key / master resume / save settings) with live checkmarks. Generate stays disabled.
2. Each "Do it" button writes `onboarding: { step: N }` to `chrome.storage.local` (N is 1-based into `TOUR_STEPS` in `options.js`) and calls `chrome.runtime.openOptionsPage()`. "Skip setup" sets `onboarding.dismissed = true`, which collapses the card to the compact `#setupCompact` variant on later opens (the red error never returns for a missing-config state).
3. Options page load (`options.js`): if `onboarding.step` is a number, the spotlight tour opens at that step. A `chrome.storage.onChanged` listener also starts the tour if the options page is already open when the popup sets the step.
4. `TOUR_STEPS` (options.js) walks through: provider icons → API key → model (optional) → `#resumeContentTextarea` → `#refineResumeBtn` (explain only, no AI call forced) → `#save`. The highlight uses a box-shadow spotlight and is `pointer-events: none`, so the user interacts with the real UI while the tour guides.
5. "Next"/"Back" persist the current step; Skip, Escape, or the final "Done" set `onboarding: { step: null, dismissed: true }`. Clicking Save Settings while the tour is active (`tourNotifySaved()`) jumps straight to the finish card.
6. When the config check passes and `onboardingCompleted` is not yet set, the popup shows the one-time "Setup complete" card and persists `onboardingCompleted: true`.

### Resume refinement flow

1. User clicks "Refine Resume" on the options page (`options.js`).
2. Options sends `REFINE_RESUME` to background with source text.
3. Background calls the provider's `*ResumeRefinement(...)` function — rewrites source into a cross-style master resume (no job-description tailoring).
4. Options shows a side-by-side review panel with change summary and warnings.
5. User can Apply (replaces source text) or Cancel. Undo restores the last pre-refine backup.

### Resume JSON extraction flow

1. User clicks "Extract JSON" on the options page.
2. Options sends `EXTRACT_RESUME_JSON` to background with source text.
3. Background calls the provider's `*ResumeExtraction(...)` function — extracts structured JSON profile from raw text.
4. JSON is saved as `jsonContent` on the resume entry and persisted. Used as `jsonContent` in the generation pipeline.

## Resume styles & layout mapping

Configured by `getResumeStyleConfig(...)` in `background.js`:

| UI Style     | promptStyle  | layout       | PDF Renderer                                                       |
| ------------ | ------------ | ------------ | ------------------------------------------------------------------ |
| basic        | basic        | pocketresume | `popup.js` → `generatePDF`                                         |
| professional | professional | pocketresume | `popup.js` → `generatePDF`                                         |
| faang        | faang        | pocketresume | `popup.js` → `generatePDF`                                         |
| jake         | faang        | jake         | `resume-renderers.js` → `renderJakeLayout`                         |
| deedy        | faang        | deedy        | `resume-renderers.js` → `renderDeedyLayout`                        |
| academic-cv  | academic-cv  | academic-cv  | `resume-renderers.js` → `renderAcademicCvLayout`                   |

## Settings + persistence

Settings are stored in `chrome.storage.local`, managed in `options.js`.

Important keys:

- `apiProvider`: `"google" | "openrouter" | "openai" | "anthropic" | "custom"`
- `geminiApiKey` / `openrouterApiKey` / `openaiApiKey` / `anthropicApiKey`: string
- `googleModel` / `openaiModel` / `anthropicModel` / `openrouterModel`: string model override ("" = provider default)
- `customEndpoints`: array of `{ id, name, baseUrl, apiKey, model, extraBody }` (OpenAI-compatible endpoints; `apiKey` may be empty for local servers; `extraBody` is an optional raw JSON string shallow-merged into the request body)
- `activeCustomEndpointId`: which custom endpoint is active when `apiProvider` is `"custom"`
- `resumes`: array of `{ id, label, content, jsonContent, lastRefineBackup, lastRefineAppliedAt }` (up to 3)
- `selectedResumeId`: which resume is active in the popup
- `resumeType`: `"basic" | "professional" | "faang" | "jake" | "deedy" | "academic-cv"`
- `coverLetterEnabled`: boolean
- `cloudSyncStatus`: `"idle" | "syncing" | "synced" | "error"` (cloud-sync feature only)

Legacy migration: `userProfile` → `resumes[0].content`

## AI provider support

Five providers supported, selected via `apiProvider`:

- **Google Gemini**: default model `gemini-2.5-flash`, API key from Google AI Studio
- **OpenAI**: default model `gpt-4o-mini`, API key from OpenAI Platform
- **Anthropic**: default model `claude-3-5-haiku-20241022`, API key from Anthropic Console
- **OpenRouter**: default model `openai/gpt-oss-120b:free`, API key from OpenRouter
- **Custom / Local**: any OpenAI-compatible endpoint (Ollama, LM Studio, NVIDIA NIM, Groq, ...). Saved endpoints live in `customEndpoints`; the active one is used. No API key required for local servers.

Model overrides per provider are stored in the `*Model` keys; empty string falls back to the defaults in `PROVIDER_DEFAULT_MODELS` (`background.js`). The options page can fetch available models from each provider's list endpoint.

All providers share one request path: `executeProviderChat(context, prompt, label)` in `background.js` handles the three wire formats (OpenAI-compatible chat completions, Anthropic messages, Gemini generateContent). The 4 pipelines call it via `generateTailoredResume`, `generateCoverLetterText`, `extractResumeProfileJson`, and `refineResumeSource`.

Custom endpoints require a runtime host permission for the endpoint's origin. `manifest.json` declares `optional_host_permissions: ["https://*/*", "http://*/*"]`; the options page calls `chrome.permissions.request({ origins: [origin + '/*'] })` when saving or testing an endpoint.

## Cloud sync (optional feature)

When enabled, resumes sync across devices via [Clerk](https://clerk.com) (auth) + [Convex](https://convex.dev) (backend).

Architecture:

- `src/cloud-sync.js` — IIFE source, bundled by esbuild → `cloud-sync.js` (gitignored)
- `convex/auth.config.ts` — Clerk → Convex auth wiring; requires `CLERK_FRONTEND_API_URL` env var
- `convex/schema.ts` — `resumes` table shape
- `convex/resumes.ts` — `list`, `upsert`, `remove` queries/mutations

Credentials are **never** hardcoded. The build step injects `CLERK_PUBLISHABLE_KEY` and `CONVEX_URL` from `.env.local` into the bundle. Contributors must set up their own Clerk + Convex accounts.

## File layout

```
PocketResume/
├── manifest.json            # Manifest V3 entrypoint wiring
├── background.js            # Service worker: pipeline + AI calls
├── content.js               # Content script: page text extraction
├── popup.html / popup.js    # Popup UI + PocketResume PDF generation
├── options.html / options.js# Settings: API keys, resumes, toggles
├── resume-renderers.js      # Jake / Deedy / Academic CV PDF layouts
├── src/cloud-sync.js        # Cloud sync source (bundled → cloud-sync.js)
├── cloud-sync.js            # [generated, gitignored] esbuild bundle
├── convex/                  # Convex backend
│   ├── auth.config.ts
│   ├── schema.ts
│   ├── resumes.ts
│   └── _generated/          # [generated, gitignored]
├── libs/jspdf.umd.min.js    # Vendored jsPDF
├── scripts/build-clerk.mjs  # Build script for cloud-sync bundle
├── .env.example             # Template for .env.local
├── AGENTS.md                # This file
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── LICENSE
└── package.json             # Build scripts only (no runtime deps)
```

## Where to make common product changes

- **Change AI model, prompts, or JSON schema**: `background.js` (`executeProviderChat` + the 4 pipeline functions). Update the style config table above if the schema or layout mapping changes.
- **Change what we extract from a page**: `content.js` (`extractPageText`) and the truncation logic in `background.js`.
- **Change PocketResume PDF layout**: `popup.js` (`generatePDF` / `generateCoverLetterPDF`).
- **Change Jake / Deedy / Academic CV PDF layouts**: `resume-renderers.js` (`renderJakeLayout` / `renderDeedyLayout` / `renderAcademicCvLayout`).
- **Change settings UI / resume management**: `options.js` / `options.html`.
- **Change popup UI**: `popup.html` / `popup.js`.
- **Change popup error messages / mapping**: `popup.js` (`setError` / `mapErrorMessage`). The keyword-based map turns long provider errors into short friendly strings; un-matched messages truncate to ~200 chars.
- **Change permissions or extension wiring**: `manifest.json`.
- **Change cloud sync behavior**: `src/cloud-sync.js` (then `npm run build:clerk`).
- **Change Convex schema or functions**: `convex/schema.ts`, `convex/resumes.ts`, `convex/auth.config.ts` (then `npx convex dev`).

## Coding conventions

- 4-space indentation across all JS / TS files (matches `background.js`).
- Vanilla ES2022 JS, no TypeScript outside the `convex/` backend.
- **No new comments in source files** unless behavior is non-obvious. The codebase intentionally ships minimal comments.
- Match the style of the file you're editing — read surrounding context first.
- Use `chrome.storage.local` for persistence; do not introduce new global state.

## Common pitfalls

- **JSON-only AI output** is a hard requirement. The popup parser will fail if the model returns markdown fences. If you change a prompt, validate with a real API call.
- **Manifest `key` field is intentionally absent.** Chrome assigns a fresh extension ID on first load. Do not re-add it (it would lock all contributors to one ID).
- **`host_permissions`** in `manifest.json` includes the Clerk + Convex domains contributors will need to override. Update both the manifest and this file if you add a new provider.
- **Chrome extension service workers can be killed** between messages. Do not store in-memory state across calls — read from `chrome.storage.local` each time.
- **Content script CSP**: avoid inline scripts / eval in `content.js`. The page's CSP applies.
- **Do not commit** `cloud-sync.js` (build artifact), `convex/_generated/`, or anything from `.env.local`. See `.gitignore`.

## Privacy posture

PocketResume is privacy-first by default. See `privacy-policy.md` for the full policy. The Chrome extension:

- Stores everything in `chrome.storage.local` unless the user explicitly enables cloud sync
- Sends data only to the AI provider the user has selected
- Requires the user to supply their own API key
- Does not include telemetry, analytics, or third-party tracking
