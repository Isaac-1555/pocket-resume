# AGENTS.md

This file provides guidance to AI coding agents and human contributors when working on this repository. It is intentionally public so contributors and AI tools can share a common operating manual.

## What this repo is

PocketResume is a **Chrome Extension (Manifest V3)** built with **vanilla HTML/CSS/JS**. No bundler / build pipeline for app code; the only build step is `esbuild` for the Pro (Clerk) bundle. Edit source files, reload the unpacked extension in Chrome.

Key runtime entrypoints (declared in `manifest.json`):

- **Background service worker**: `background.js` — pipeline orchestration + AI API calls
- **Content script**: `content.js` — extracts page text from the active tab
- **Popup UI**: `popup.html` + `popup.js` — user actions + PDF generation for PocketResume layouts
- **Options page**: `options.html` + `options.js` — API keys + multiple resumes + toggles
- **Resume renderers**: `resume-renderers.js` — Jake, Deedy, Academic CV PDF layouts
- **Analytics**: `analytics.js` (service-worker client) + `track-client.js` (page-side helper) — anonymous usage stats sent to the Convex backend
- **Pro (optional)**: `src/cloud-sync.js` (source) → `cloud-sync.js` (bundle, gitignored) — auth, plan gating, pricing, resume sync
- **Convex backend (optional)**: `convex/` — auth config + resume schema/functions + analytics functions

## Common commands

### Install JS deps

The extension runs without Node at runtime, but the repo uses npm to manage dependencies (and to bundle `cloud-sync.js` + update the vendored jsPDF build).

```sh
npm ci
# or
npm install
```

### Build the Pro (Clerk) bundle

`src/cloud-sync.js` (Pro sign-in, plan gating, pricing table, resume sync) is bundled by esbuild into `cloud-sync.js` at the repo root (gitignored). Required env vars (`CLERK_PUBLISHABLE_KEY`, `CONVEX_URL`) are injected at build time. See `.env.example` and `package.json` → `scripts/build-clerk.mjs`.

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

### Update vendored LDRS loader

`tracker.html` loads the Newton's Cradle loader from `libs/ldrs-newtons-cradle.js` (vendored esbuild bundle of the `ldrs` web component, used as the plan-check loader in the Job Tracker header). If you bump `ldrs`, rebuild the bundle:

```sh
npm install ldrs@latest
npm run build:ldrs
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
      - PocketResume layouts (professional / faang): `generatePDF(...)` in `popup.js`
      - Alternative layouts (deedy / academic-cv): `window.ResumeRenderers.generateResumePDF(...)` in `resume-renderers.js`
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

### Resume refinement flow (v8.2 — question pass)

1. User clicks "Refine Resume" on the options page (`options.js` → `handleRefineResume`).
2. Options first sends `GET_REFINE_QUESTIONS` with source text. Background `generateRefineQuestions(...)` does one strict-JSON call: reads the master resume and returns up to 5 grounded questions about gaps that materially affect the rewrite (company problem before joining, team size, project scope/ownership, scale). Empty array → no popup. Pre-pass failure → refine proceeds without questions (feature never blocks).
3. If questions remain, options shows `#refineQuestionsModal`: one question at a time, textarea, and a single primary button that reads "Skip, let AI fill it" when the textarea is empty and "Next" (or "Refine Resume" on the last question) otherwise; Back appears from question 2, Cancel sits right-aligned. Existing answers are pre-seeded from `resume.refineAnswers` (matched by normalized question text) and marked "(from last time)".
4. Options sends `REFINE_RESUME` with `answers: [{ id, question, answer, skipped }]`. Background `refineResumeSource(context, sourceText, answers)` — answered Q&A is highest-authority fact; skipped questions get conservative in-scope AI filler (no invented specific numbers/names) reported in the response's `aiFilled` array.
5. Options shows the side-by-side review panel with an **ATS hero** (ring-gauge odometer animating the shared `ats.before` → `ats.after` scores, "Before X → After Y" line), a **"Critical ATS issues" card** (each row: issue + why an ATS trips on it + reveal-only **Fix** button showing `suggestedFix`; amber "You'll need to:" lines for `userMustFix` items, shown even at score 100), change summary, "AI filled in (please double-check)" card, and warnings.
6. User can Apply (replaces source text; merges the run's answers into `resume.refineAnswers`, newest first) or Cancel. Undo restores the last pre-refine backup (refineAnswers untouched).
7. `resume.refineAnswers` (`[{ question, answer, skipped, updatedAt }]`, max 10) persists with the other resume fields via Save Settings.

### Resume JSON extraction flow

1. User clicks "Extract JSON" on the options page.
2. Options sends `EXTRACT_RESUME_JSON` to background with source text.
3. Background calls the provider's `*ResumeExtraction(...)` function — extracts structured JSON profile from raw text.
4. JSON is saved as `jsonContent` on the resume entry and persisted. Used as `jsonContent` in the generation pipeline.

### ATS check flow (v8.2)

- **"Check ATS" button** next to "Refine Resume" on the options page (`#checkAtsBtn` → `handleCheckAts`): one `CHECK_ATS` message per click → background `generateAtsCheck(context, sourceText)` (one strict-JSON call, fresh every time) → `#atsResultModal`: ring-gauge odometer count-up 0 → score with the shared `renderAtsIssuesCard` issues list ("Fix" reveals + "You'll need to:" lines). Scores the current resume text in the textarea.
- Scoring rules live in `buildAtsScoringRules()` (`background.js`), shared verbatim by `generateAtsCheck` and the refine prompt, so scores are comparable across the two flows.
- Refine results embed the same block as `ats: { before, after, criticalIssues }` inside the refine response (`before` = source resume, `after` = proposed refinedText; `userMustFix` items listed even when `after` = 100). A failing or missing ats block never blocks the refine — the hero is simply hidden.

### Form filler setup (Application Questions, v8.0)

One-time onboarding for Form Filler: the user answers common application-form questions once; fills reuse them.

1. **Questionnaire**: Options page → "Form Filler Setup" section (`#appProfileDetails`, left panel). Groups: Basics (first/last name, email, phone), Location (street, apt, city, state, postal code, country), Work eligibility (authorized / sponsorship / 18+ / relocate / remote preference — Yes/No selects), Preferences (salary amount + currency + period, start date, years of experience), Links (LinkedIn, portfolio, GitHub), opt-in **EEO self-identification** (gender, race, hispanic/Latino, veteran, disability — only used when a form asks; local only), and **Custom Q&A** (free-form question/answer rows matched by question text).
2. **"Auto-fill from my resume"**: options sends `PROFILE_AUTOFILL` with the active resume's `jsonContent` (fallback `content`). Background `generateApplicationProfileFromResume(...)` does one strict-JSON extraction call → options fills **empty inputs only** and reports "Filled X of Y fields".
3. **Persistence**: saved as `applicationProfile` via the global Save Settings button. Completion = non-empty `firstName` + `lastName`; the section's status pill shows "Ready" / "Not set up".
4. **Entry points**: the v8.0 What's New modal ("Set up Form Filler") and the popup fill-gating card both set `appProfileOnboarding: { active: true }` and open the options page; options consumes the flag and starts the **profile spotlight tour** (`PROFILE_TOUR_STEPS`, reuses the tour overlay via `tourOpenAt(step, 'profile')`). "Guide me" in the section restarts it. Saved answers keep working if the tour is skipped.5. **Fill gating**: popup Fill with an incomplete profile shows `#fillProfileCard` ("Complete setup" → same trigger) instead of running the fill. Generation flow is unaffected.

### Form filler flow

1. User clicks "Fill Form" in the popup (next to the Job Tracker button). Popup first checks `applicationProfile` completeness (see Form filler setup above) and blocks with the setup card if incomplete.
2. Popup sends `FILL_APPLICATION_FORM` to background with `{ tabId, resumeId }`.
3. Background resolves the profile (same resolution as `START_GENERATION`), injects `form-filler.js` into all frames via `chrome.scripting.executeScript`, then runs `__PocketResumeForm.detect(...)` per frame and merges results (field ids are frame-token prefixed). Detection covers text inputs, textareas, selects (only placeholder-unselected ones; matched by option text **and** value), radio groups, checkbox groups, single question-style checkboxes (consent labels excluded), email/url/date inputs, and contenteditables.
4. **Saved-answers-first resolution**: `resolveFormAnswers(fields, applicationProfile)` in `form-profile.js` splits fields. Tier 1: canonical label matchers → `applicationProfile` values (name split, address, salary formatting by field type incl. hourly conversion, yes/no, EEO gated by `eeoOptIn`). Tier 2: `customQA` match (normalized equality, containment, Jaccard ≥ 0.85). Select/radio/checkbox-group answers must fuzzy-match one of the field's options, else the field falls to AI. Single checkboxes get boolean intent (`Yes` → check, `No` → leave unchecked). Zero tokens for resolved fields.
5. `generateFormAnswers(context, userProfile, unresolvedFields, applicationProfile)` — one AI call for **only the unresolved fields** (essays, company-specific questions). Same prompt + a `SAVED PROFILE` JSON line for grounding; skipped entirely when nothing is unresolved (0 tokens).
6. Merged answers run through `normalizeFormAnswers` (id validation + maxLength truncation), then `__PocketResumeForm.fill(...)` per frame (native value setters + `input`/`change` events for React/Vue compatibility). Checkbox groups: only matching options are checked, never unchecked; already-ticked groups are skipped entirely.
7. Background toasts on the page's main frame (`"... (N from saved answers)"`), replies `{ status: 'success', filled, total, cached }`, and logs `[FormFill] Filled X of Y fields. (Z saved, W AI)`. `form_filled` analytics carries `cached` (string count; whitelisted in `PARAM_FIELDS` on both sides).
8. Popup shows "Filled X/Y" on the button; errors go through the standard `setError` path. The popup background glows via `body[data-fill-status]`: `filling` (amber pulse) → `fill-success` (green, auto-reverts after 4s) or `fill-failure` (red, persists until the next Fill/Generate click). Kept separate from `body[data-status]` so the two flows never fight over the glow.

Safety rules (enforced in `form-filler.js` + prompt): never submits the form, never overwrites already-filled fields, never unchecks anything the user already ticked, checkbox/consent widgets with consent-style labels (consent/agree/terms/privacy/newsletter/marketing/subscribe/opt-in/gdpr/cookies) are never touched, skips hidden/disabled/readonly/captcha/search fields, caps at 30 fields. Known gap: custom div widgets (`[role="checkbox"]`/`[role="radio"]` without real inputs, legacy Workday) are not detected.

## Resume styles & layout mapping

Configured by `getResumeStyleConfig(...)` in `background.js`:

| UI Style     | promptStyle  | layout       | PDF Renderer                                                       |
| ------------ | ------------ | ------------ | ------------------------------------------------------------------ |
| professional | professional | pocketresume | `popup.js` → `generatePDF`                                         |
| faang        | faang        | pocketresume | `popup.js` → `generatePDF`                                         |
| deedy        | faang        | deedy        | `resume-renderers.js` → `renderDeedyLayout`                        |
| academic-cv  | academic-cv  | academic-cv  | `resume-renderers.js` → `renderAcademicCvLayout`                   |

Bullet-format rules in `generateTailoredResume(...)` (`background.js`): `professional` promptStyle gets an exact 2-bullet problem/solution format per experience and project; `faang` promptStyle (FAANG, Double Sided) gets an exact 3-bullet problem/solution/impact-metric format per experience and project, with estimated metrics allowed only there; `academic-cv` keeps the original prompt with no bullet-format rule.

Cover letter tone in `generateCoverLetterText(...)` (`background.js`, `buildCoverLetterToneGuide`) forks on the **raw UI style** (not `promptStyle`, because `deedy` maps to a `faang` promptStyle but gets the corporate letter): `professional` + `deedy` → corporate story tone (why company/role, skills-to-need, no resume recitation, portfolio-website emphasis); `faang` → para 1 corporate-style fit, para 2 metrics-heavy results proof (metrics grounded in the `tailoredResumeJson` passed at the call site; fallback to raw profile; never invent numbers); `academic-cv` → research/scholar tone (methods + tools + JD research-area fit, learner posture). Shared: 250-350 words, JSON-only, no invented facts, same JSON schema.

The stored `"deedy"` value corresponds to the UI label "Double Sided" — renaming the value would break existing users' saved settings, so keep `"deedy"` as the internal id.

## Settings + persistence

Settings are stored in `chrome.storage.local`, managed in `options.js`.

Important keys:

- `apiProvider`: `"google" | "openrouter" | "openai" | "anthropic" | "custom"`
- `geminiApiKey` / `openrouterApiKey` / `openaiApiKey` / `anthropicApiKey`: string
- `googleModel` / `openaiModel` / `anthropicModel` / `openrouterModel`: string model override ("" = provider default)
- `customEndpoints`: array of `{ id, name, baseUrl, apiKey, model, extraBody }` (OpenAI-compatible endpoints; `apiKey` may be empty for local servers; `extraBody` is an optional raw JSON string shallow-merged into the request body)
- `activeCustomEndpointId`: which custom endpoint is active when `apiProvider` is `"custom"`
- `resumes`: array of `{ id, label, content, jsonContent, lastRefineBackup, lastRefineAppliedAt, refineAnswers }` (up to 3)
- `selectedResumeId`: which resume is active in the popup
- `cloudSyncStatus`: `"idle" | "syncing" | "synced" | "error"` (Pro sync indicator, written by `src/cloud-sync.js`)
- `resumeType`: `"professional" | "faang" | "deedy" | "academic-cv"`
- `coverLetterEnabled`: boolean
- `applicationProfile`: Form Filler answers — `{ firstName, lastName, email, phone, streetAddress, addressLine2, city, state, postalCode, country, salaryAmount, salaryCurrency, salaryPeriod, startDate, yearsExperience, workAuthorized, needsSponsorship, over18, willingToRelocate, remotePreference, linkedin, website, github, eeoOptIn, eeo: { gender, race, hispanicLatino, veteran, disability }, customQA: [{ id, question, answer }], updatedAt }`
- `appProfileOnboarding`: `{ active: boolean }` — trigger for the Form Filler setup spotlight tour (set by the popup, consumed by the options page)
- `refineNudge`: `{ active: boolean }` — trigger for the v8.2 "Smarter Refine" spotlight on `#refineResumeBtn` (set by the popup's What's New modal via `startRefineNudge()`, consumed by the options page via `NUDGE_TOUR_STEPS` + a `'nudge'` tour mode)
- `atsNudge`: `{ active: boolean }` — trigger for the v8.2 "Check ATS" spotlight on `#checkAtsBtn` (set by the popup's What's New modal via `startAtsNudge()`, consumed by the options page via `ATS_NUDGE_TOUR_STEPS` + an `'atsnudge'` tour mode)
- `lastSeenAnnouncement`: last version whose What's New modal the user saw (`'8.3'` current)

Legacy migration: `userProfile` → `resumes[0].content`

## AI provider support

Five providers supported, selected via `apiProvider`:

- **Google Gemini**: default model `gemini-3.1-flash-lite`, API key from Google AI Studio
- **OpenAI**: default model `gpt-5-nano`, API key from OpenAI Platform
- **Anthropic**: default model `claude-haiku-4-5`, API key from Anthropic Console
- **OpenRouter**: default model `nvidia/nemotron-3-super-120b-a12b:free`, API key from OpenRouter
- **Custom / Local**: any OpenAI-compatible endpoint (Ollama, LM Studio, NVIDIA NIM, Groq, ...). Saved endpoints live in `customEndpoints`; the active one is used. No API key required for local servers.

Model overrides per provider are stored in the `*Model` keys; empty string falls back to the defaults in `PROVIDER_DEFAULT_MODELS` (`background.js`). The options page can fetch available models from each provider's list endpoint.

All providers share one request path: `executeProviderChat(context, prompt, label)` in `background.js` handles the three wire formats (OpenAI-compatible chat completions, Anthropic messages, Gemini generateContent). The pipelines call it via `generateTailoredResume`, `generateCoverLetterText`, `extractResumeProfileJson`, `generateRefineQuestions`, `refineResumeSource`, `generateFormAnswers`, and `generateApplicationProfileFromResume`.

Custom endpoints require a runtime host permission for the endpoint's origin. `manifest.json` declares `optional_host_permissions: ["https://*/*", "http://*/*"]`; the options page calls `chrome.permissions.request({ origins: [origin + '/*'] })` when saving or testing an endpoint.

## PocketResume Pro (optional feature)

One paid plan ("PocketResume Pro") gates everything: resume cloud sync, plan gating, and the full Job Tracker. Sign-in, the embedded pricing table, and sync run through [Clerk](https://clerk.com) + [Convex](https://convex.dev). The separate "Cloud Sync" plan was merged into PocketResume Pro in v7.9 (Clerk Billing now exposes a single paid plan; live in instance config under `billing.plans`, editable via `clerk config patch` / Dashboard); `hasCloudSyncAccess()` still honors legacy `cloud_sync`/`pro`/`premium` subscriptions and metadata for existing subscribers.

Architecture:

- `src/cloud-sync.js` — IIFE source, bundled by esbuild → `cloud-sync.js` (gitignored). Loaded by `options.html` and `tracker.html` (popup no longer loads it). Provides auth (`signIn`/`isSignedIn`/`getUserProfile`), plan checks (`hasCloudSyncAccess`), the Clerk pricing table mount, and resume sync (`pushAllResumes`/`pullAllResumes`/`onLocalResumesChanged` via Convex)
- `background.js` — auto-pushes resume changes when signed in (`chrome.storage.onChanged` → `onLocalResumesChanged`, debounced 2s)
- `options.js` — account chip (Sign In / See Plans), Push Local to Cloud / Restore from Cloud, pricing table mount under Settings → PocketResume Pro
- `tracker.js` — `checkPlanAccess()` gates the Job Tracker trial/lock via `window.CloudSync`
- `convex/auth.config.ts` — Clerk → Convex auth wiring; requires `CLERK_FRONTEND_API_URL` env var
- `convex/schema.ts` — `resumes` table shape + analytics tables
- `convex/resumes.ts` — `list`, `upsert`, `remove` queries/mutations

Sign-in behavior: all Clerk redirects (`signInForceRedirectUrl`, `signUpForceRedirectUrl`, `afterSignOutUrl`, `signOut redirectUrl`) point at `options.html` — never `popup.html` (navigating the Settings tab to the popup breaks the React tree with `removeChild` errors). The sign-in modal is themed dark via `appearance.variables` passed to `clerk.load(...)` — explicit input colors are required or typed text inherits the page's light color and becomes invisible inside Clerk's light-styled inputs.

Credentials are **never** hardcoded. The build step injects `CLERK_PUBLISHABLE_KEY` and `CONVEX_URL` from `.env.local` into the bundle. Contributors must set up their own Clerk + Convex accounts.

## File layout

```
PocketResume/
├── manifest.json            # Manifest V3 entrypoint wiring
├── background.js            # Service worker: pipeline + AI calls
├── content.js               # Content script: page text extraction
├── form-filler.js           # [injected on demand] Form detect/fill/toast for the Fill Form feature
├── form-profile.js          # Saved-answer resolver: canonical matchers + custom Q&A matching
├── popup.html / popup.js    # Popup UI + PocketResume PDF generation
├── options.html / options.js# Settings: API keys, resumes, toggles
├── resume-renderers.js      # Jake / Deedy / Academic CV PDF layouts
├── analytics.js             # Anonymous usage-stats client (imported by background.js)
├── track-client.js          # Page-side trackEvent helper (popup/options/tracker)
├── src/cloud-sync.js        # Pro auth/plan/pricing/sync source (bundled → cloud-sync.js)
├── cloud-sync.js            # [generated, gitignored] esbuild bundle
├── convex/                  # Convex backend
│   ├── auth.config.ts
│   ├── schema.ts
│   ├── resumes.ts
│   ├── analytics.ts
│   ├── crons.ts
│   └── _generated/          # [generated, gitignored]
├── libs/jspdf.umd.min.js    # Vendored jsPDF
├── libs/ldrs-newtons-cradle.js # [generated, gitignored? no—committed] vendored ldrs Newton's Cradle web component
├── scripts/build-clerk.mjs  # Build script for the Pro (Clerk) bundle
├── .env.example             # Template for .env.local
├── AGENTS.md                # This file
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── LICENSE
└── package.json             # Build scripts only (no runtime deps)
```

## Where to make common product changes

- **Change AI model, prompts, or JSON schema**: `background.js` (`executeProviderChat` + the 5 pipeline functions). Update the style config table above if the schema or layout mapping changes.
- **Change what we extract from a page**: `content.js` (`extractPageText`) and the truncation logic in `background.js`.
- **Change form detection / filling / safety rules**: `form-filler.js` (`detect` / `fill` / `toast`) and the `FILL_APPLICATION_FORM` handler + `generateFormAnswers` prompt in `background.js`.
- **Change saved-answer resolution / canonical matchers**: `form-profile.js` (`CANONICAL_MATCHERS`, `resolveFormAnswers`) — imported by `background.js`.
- **Change Form Filler onboarding / application profile**: `options.html` + `options.js` (`#appProfileDetails` section, `APP_PROFILE_FIELDS`, `PROFILE_TOUR_STEPS`), `background.js` (`PROFILE_AUTOFILL` handler + `generateApplicationProfileFromResume`), popup gating in `popup.js` (`isFormFillerProfileComplete` / `#fillProfileCard`).
- **Change PocketResume PDF layout**: `popup.js` (`generatePDF` / `generateCoverLetterPDF`).
- **Change Double Sided / Academic CV PDF layouts**: `resume-renderers.js` (`renderDeedyLayout` / `renderAcademicCvLayout`).
- **Change settings UI / resume management**: `options.js` / `options.html`.
- **Change popup UI**: `popup.html` / `popup.js`.
- **Change popup error messages / mapping**: `popup.js` (`setError` / `mapErrorMessage`). The keyword-based map turns long provider errors into short friendly strings; un-matched messages truncate to ~200 chars.
- **Change usage analytics events**: `analytics.js` (client: queue + consent + send), `convex/analytics.ts` (ingest + summary + cleanup), `track-client.js` (page-side `trackEvent` helper). Event names must be whitelisted in both `analytics.js` (`EVENT_NAMES`) and `convex/analytics.ts` (`EVENT_NAMES`).
- **Change permissions or extension wiring**: `manifest.json`.
- **Change Pro auth / plan gating / pricing / resume sync**: `src/cloud-sync.js` (then `npm run build:clerk`), `options.js` (account chip + Push/Restore), `background.js` (auto-push listener), `tracker.js` (`checkPlanAccess`).
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

- Stores resumes locally in `chrome.storage.local`; cloud sync is opt-in via PocketResume Pro and only talks to the user's own Convex backend
- Sends data only to the AI provider the user has selected
- Requires the user to supply their own API key
- Collects anonymous usage statistics (random per-install UUID + event counters — never resume content, job text, or account info), on by default and opt-out via Options → Privacy; events go to the project's own Convex backend, raw events auto-delete after 180 days
- Does not include third-party analytics or advertising trackers
