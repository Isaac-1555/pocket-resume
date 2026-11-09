# AGENTS.md

This file provides guidance to AI coding agents and human contributors when working on this repository. It is intentionally public so contributors and AI tools can share a common operating manual.

## What this repo is

PocketResume is a **Chrome Extension (Manifest V3)** built with **vanilla HTML/CSS/JS**. No bundler / build pipeline for app code; the only build step is `esbuild` for the Pro (Clerk) bundle. Edit source files, reload the unpacked extension in Chrome.

Key runtime entrypoints (declared in `manifest.json`):

- **Background service worker**: `background.js` — deterministic pipeline + generation gate
- **Content script**: `content.js` — extracts page text from the active tab
- **Popup UI**: `popup.html` + `popup.js` — user actions + PDF generation for PocketResume layouts
- **Feature tour video**: `feature-video.js` / `feature-video.css` (player) + `scripts/capture-tour.mjs` / `assets/tour/` (frames) — scripted cursor-follow walkthrough, popup-only
- **Options page**: `options.html` + `options.js` — resume form + cover letter + account + toggles
- **Resume renderers**: `resume-renderers.js` — Double Sided and Academic CV PDF layouts
- **Pro (optional)**: `src/cloud-sync.js` (source) → `cloud-sync.js` (options page, with Clerk UI) + `cloud-sync-core.js` (popup / tracker / worker, no UI) — both bundles gitignored — auth, plan gating, pricing, resume sync
- **Convex backend (optional)**: `convex/` — auth config + resume schema/functions

## Common commands

### Install JS deps

The extension runs without Node at runtime, but the repo uses npm to manage dependencies (and to bundle `cloud-sync.js` + update the vendored jsPDF build).

```sh
npm ci
# or
npm install
```

### Build the Pro (Clerk) bundle

`src/cloud-sync.js` (Pro sign-in, plan gating, pricing table, resume sync) is bundled by esbuild into **two** outputs at the repo root (both gitignored). Required env vars (`CLERK_PUBLISHABLE_KEY`, `CONVEX_URL`) are injected at build time, and a `__CLERK_UI__` define decides whether Clerk's UI (≈1.9 MB of React) is bundled at all:

| output                 | `__CLERK_UI__` | loaded by                        | size   |
| ---------------------- | -------------- | -------------------------------- | ------ |
| `cloud-sync.js`        | `true`         | `options.html`                   | ~2.8 MB |
| `cloud-sync-core.js`   | `false`        | `popup.html`, `tracker.html`, `background.js` | ~0.9 MB |

The UI build is the only place `@clerk/ui` is imported. **Keep that import inside `if (__CLERK_UI__)`** — a `HAS_CLERK_UI`-style const does not help, because esbuild resolves dynamic imports before its minifier folds the constant, so the whole UI ends up in both bundles. See `.env.example` and `package.json` → `scripts/build-clerk.mjs`.

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

### Rebuild the skill lexicon / run the engine tests

```sh
npm run build:lexicon   # downloads O*NET 31.0 CSVs -> libs/skills-lexicon.js
npm run test:align      # determinism + no-invented-numbers checks (no network)
npm run test:render     # PDF layout: one-page fit, margins, pagination, duplication
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

`npm run test:align` (determinism, no-invented-numbers, parser fixtures, normalization) and `npm run test:render` (Double Sided one-page fit, no text below the page margin, Academic CV pagination + footer, no duplicated projects) are the automated checks. No linter. Otherwise: load unpacked, generate with a real account, inspect the PDF + the service worker console.

### Versioning & changelog

**On every `manifest.json` version bump, you MUST also update `CHANGELOG.md`** and the popup "What's New" announcement:

1. Bump `manifest.json` → `version`.
2. Add a new top entry to `CHANGELOG.md` (`## [X.Y] — YYYY-MM-DD`) summarizing the change under Added / Changed / Fixed / Removed. Newest first.
3. Update the popup "What's New" modal: `ANNOUNCEMENT_VERSION` + `ANNOUNCEMENT_SEEN_VALUE` in `popup.js` and the modal copy in `popup.html` (`#whatsNewModal`). The modal shows once per version.
4. Build the store zip: `npm run build:clerk` first (if `src/cloud-sync.js` changed), then `npm run build:zip` to write `dist/pocketresume-vX.Y.zip` from the runtime file list — see "Store build" below.

### Store build (zip)

Chrome Web Store upload = a zip with `manifest.json` at the root and **only runtime files**. Include:

`manifest.json`, `background.js`, `content.js`, `form-filler.js`, `form-profile.js`, `popup.html`, `popup.js`, `options.html`, `options.js`, `tracker.html`, `tracker.js`, `resume-renderers.js`, `resume-align.js`, `resume-parse.js`, `resume-health.js`, `resume-letter.js`, `skill-lexicon.js`, `feature-video.js`, `feature-video.css`, `cloud-sync.js`, `cloud-sync-core.js`, `icon.png`, `libs/` (jsPDF, ldrs loader, animations, skills lexicon), `assets/tour/`.

Exclude: `node_modules/`, `dist/`, `.git`, `.github/`, `convex/`, `scripts/`, `src/`, `store-assets/`, `redesign/`, `models/`, `*.md`, `package*.json`, `.env*`. Output to `dist/pocketresume-vX.Y.zip`.

`scripts/build-zip.mjs` (`npm run build:zip`) owns that list, reads the version from `manifest.json`, fails loudly if a runtime file is missing (e.g. you forgot `npm run build:clerk`), and prints the archive contents. Prefer it over zipping by hand — the file list has to match the `manifest.json` script graph, and a zip missing `cloud-sync-core.js` kills the service worker on boot.

## High-level architecture

### Resume form + local parser (v10.0)

1. **Settings page** (`options.js`, loaded as `type="module"`) imports `resume-parse.js`.
2. **Paste flow**: `#rfParseBtn` → `parseResumeText(text)` → `normalizeResumeProfile(...)` → `resume._draft`, `resume.legacyContent = text`, `resume.parseReview = { warnings, parsedAt }`. The form re-renders from the draft.
3. **Form editor** (`renderTabContent`): header (name, headline, email, phone, location, links), summary, skills, repeatable experience / projects / education, certifications. Inputs mutate `resume._draft` through `data-rf-*` attributes handled by delegated `input`/`click` listeners.
4. **Save Settings**: `saveCurrentTabToState()` serializes each `_draft` with `serializeProfile()` (normalizes, recomposes `contact` from email/phone/location/links) into `resumes[].jsonContent`, then `getSettingsPayload()` persists.
5. **Migration**: on load, any resume with `content` but no `jsonContent` is parsed, stored, and flagged `parseReview`. The form shows a review banner with a **Looks right — confirm** button; confirming clears `parseReview` and sets `parseConfirmedAt`.
6. **JSON is hidden** from the main UI. Advanced → JSON shows the serialized profile plus Copy / Apply / Refresh.

### Generation pipeline (main user flow, v10.0 — deterministic)

1. **User clicks Generate** in the popup (`popup.js` → `runGeneration('resume' | 'cover-letter')`).
2. `refreshGate()` resolves `{ state: 'signin' | 'setup' | 'review' | 'plan' | 'ready' }` from `checkProAccess()` + stored resumes; non-ready states show `#signinCard` / `#setupCard` / `#reviewCard` / `#planLockCard` and stop the run.
3. Popup sends `chrome.runtime.sendMessage({ type: 'GENERATE', payload: { tabId, resumeStyle, resumeId, output } })`.
4. **Background** (`background.js`, no provider layer):
   - `getGenerationAccess()` reads the page-published `proAccessCache` snapshot and allows only `signedIn && (withinWindow || isPro)`.
   - Requires `resumes[].jsonContent`; blocks with `review_required` while `parseReview && !parseConfirmedAt`.
   - Requests page content from the content script (`GET_PAGE_CONTENT`), injecting `content.js` if needed.
   - `parseJobPosting(...)` → `alignResumeJson(profile, jd, { lexicon, styleConfig })`.
   - When `output !== 'resume'`, builds the letter from the selected resume's `coverLetter` (legacy fallback: `universalCoverLetter`) via `buildCoverLetterFromTemplate(...)`.
   - Replies `{ status: 'success', data, coverLetterData, coverLetterStatus, report, jobMeta }`.
5. Popup parses `data`, always calls `saveApplicationToTracker(...)`, then renders the PDF (`generatePDF` / `resume-renderers.js`) unless `output === 'cover-letter'`, and the letter when requested. Both save through `chrome.downloads`.
6. Errors/statuses (`signin_required`, `plan_required`, `review_required`, `needs_resume`, `needs_json`) re-render the gate cards; everything else goes through `setError` → `#errorModal`.

### Onboarding flow (v10.0)

1. Signed-out users see `#signinCard` (Create account / Sign in). Both buttons write `openAuth` and open Settings — the popup bundle has no Clerk UI, so calling `signIn()`/`signUp()` there only throws. Editing stays available in Settings, generation is blocked.
2. Signed-in users without a built resume see `#setupCard`: account → build resume → cover letter → save, plus the "free until Dec 31" plan note.
3. The options spotlight tour (`TOUR_STEPS`) walks: account → paste → parse → cover letter → save.
4. "Setup complete" card still appears once (`onboardingCompleted`) with the feature-tour offer.

### Animations toggle (v10.3)

`animationsEnabled` (Settings → Interface, default true) controls motion everywhere. Page realms toggle `html.no-motion`, which zeroes CSS animations/transitions and hover lifts. `popup.js` also gates its JS: `motionOn()` makes `startScramble` static and turns `playResumeLoop` / `playCoverLetterLoop` into immediate `done()` calls, so generation saves instantly with no artificial delay. The Resume health check loader is a webp background image and never routes through the gate, so it keeps animating on purpose (it waits on a remote model).

### Feature tour video (hidden in v10.0)

Frames were captured against the old BYOK UI and the entry points (`#featureVideoBtn`, setup-card offer) are removed until `npm run build:tour` is re-run against the new popup/options UI. `feature-video.js`, `assets/tour/`, and the capture script remain in the repo.

### Resume Health Check (Beta)

Opt-in rule-based checker in the Settings sidebar (`#resumeHealthDetails` → `#healthPanel`). Sends redacted `jsonContent` to a hardcoded provider chain — **Pollinations** (`https://text.pollinations.ai/openai`, no key, `reasoning_effort: low`) first, then local **Ollama** (`http://localhost:11434/v1/chat/completions`, model `llama3.2`). Endpoints, model, and fallback order are constants in `resume-health.js` — there is no provider UI and nothing user-editable. Enabling the check is the only consent step; it requests the `http://localhost:11434/*` optional origin for the fallback. Failures on the first provider fall through automatically (each provider gets its own 60 s timeout). Results are stored per resume as `healthReport` (`baseScore` + live `score`, `provider`, `providerLabel`, `model`, `issues[]` with `status: 'fixed'` tracking). Marking an issue fixed bumps the score locally (critical +8, warning +5, suggestion +3, capped at 100) and hides it; fixed issues never re-render. A re-check is blocked while any issue is open — the button says "Mark the remaining issues fixed" and no request goes out — and only unlocks when all issues are fixed (or the report went stale because the resume was edited). `resume.healthCooldownUntil` enforces a persisted 60 s cooldown per resume across reloads. No sign-in required.

### Skill directory (v9.1)

- `skill-lexicon.js` parses O*NET CSVs (public, CC BY 4.0): `software_skills.csv` (31k rows → tool names with Hot/In-Demand flags), `essential_skills.csv`, `transferable_skills.csv`, merged with `CURATED_ALIASES`. See `NOTICE`.
- Baseline snapshot: `libs/skills-lexicon.js` (`npm run build:lexicon`, ~8k terms, committed). Runtime updates go to `chrome.storage.local` as compact rows (`skillLexicon`) + `skillLexiconMeta`.
- Updates: `chrome.alarms` (`skillLexiconWeekly`, 7 days) plus `onStartup`/`onInstalled`; runs when `skillLexiconAutoUpdate !== false`, data older than 7 days, and the optional `https://www.onetcenter.org/*` permission is granted. No plan check. Settings → Skill directory has **Update now**, which requests that permission first. Failures keep the last good copy and record `lastError`.

### Cover letter per resume (v10.5, gated in v10.6)

Settings → **Cover letter** edits the **active resume tab's** letter (`resume.coverLetter = { greeting, body, signOff, updatedAt }`). The editor lives in the left panel, so switching resume tabs reloads it; pending edits flush before the switch. Under the hood, the dropdown writes to `resumes[activeTabIndex]`, bumps `updatedAt`, and auto-syncs.

Two write paths:

- **Generate letter** — sends `BUILD_AI_COVER_LETTER` (`{ resumeId }`) to the background, which calls `generateCoverLetterBody(jsonContent)` in `resume-letter.js`. Same provider chain as Resume Health: Pollinations (`https://text.pollinations.ai/openai`, no key, `reasoning_effort: low`) first, local Ollama (`http://localhost:11434/v1/chat/completions`, `llama3.2`) as the fallback. Contact details are redacted with `redactProfile`. Prompt asks for a general body only: 120–160 words, 3 short paragraphs, no greeting/date/sign-off, `{{company}}` and `{{role}}` kept for generation-time fill, no invented facts. The previous letter is kept if every provider fails.
- **Copy prompt** — copies the same body-only authoring prompt for an external assistant. Never gated.

**The gate (v10.6).** The background is the only writer of `resume.coverLetterCooldownUntil` (`COVER_LETTER_COOLDOWN_MS` = 60 s, exported from `resume-letter.js`). It refuses a request while the field is in the future (`{ status: 'rate_limited', retryAfterMs, cooldownUntil }`), sets it before calling a provider, and extends it to the provider's `Retry-After` on 402 or 60 s on 429 (capped at 15 min). Every reply carries `cooldownUntil`, so the options page just mirrors it — it never writes the cooldown before sending, or the worker could not tell a spam click from the in-flight request. The button shows `Wait Ns` with a 1 s countdown and a note; the value persists across reloads because it is stored with the resume. It is **local-only** — the Convex payload is explicit (`label`/`content`/`jsonContent`/`coverLetter`), so it never syncs. `runGenerateCoverLetter` also asks for `confirm()` before replacing a non-empty body.

The popup's **Generate Cover Letter** sends `GENERATE` with `output: 'cover-letter'`; background renders the selected resume's letter through `buildCoverLetterFromTemplate(...)` into the shape `generateCoverLetterPDF` expects. That path is template-only, so it is not gated and makes no network call. A generated resume is never discarded because the letter failed. `openCoverLetterSection: { resumeId }` deep-links Settings to that resume's editor.

### Form filler setup (Application Questions — Soon in v10.0)

Since 10.1.1 the Form Filler Setup section markup is removed from the Options left panel (it stays drifted out of view while the feature is rebuilt); the JS side in `options.js` is intact and fully null-guarded, and `applicationProfile` storage keeps working.

Everything below is dormant: the section markup is gone from the Options page while the feature is rebuilt, and the popup's Fill Form button is disabled. It is kept as the basis for the deterministic rebuild.

One-time onboarding for Form Filler: the user answers common application-form questions once; fills reuse them.

1. **Questionnaire**: Options page → "Form Filler Setup" section (`#appProfileDetails`, left panel). Groups: Basics (first/last name, email, phone), Location (street, apt, city, state, postal code, country), Work eligibility (authorized / sponsorship / 18+ / relocate / remote preference — Yes/No selects), Preferences (salary amount + currency + period, start date, years of experience), Links (LinkedIn, portfolio, GitHub), opt-in **EEO self-identification** (gender, race, hispanic/Latino, veteran, disability — only used when a form asks; local only), and **Custom Q&A** (free-form question/answer rows matched by question text).
2. **"Auto-fill from my resume"**: options sends `PROFILE_AUTOFILL` with the active resume's `jsonContent` (fallback `content`). Background `generateApplicationProfileFromResume(...)` does one strict-JSON extraction call → options fills **empty inputs only** and reports "Filled X of Y fields".
3. **Persistence**: saved as `applicationProfile` via the global Save Settings button. Completion = non-empty `firstName` + `lastName`; the section's status pill shows "Ready" / "Not set up".
4. **Entry points**: the v8.0 What's New modal ("Set up Form Filler") and the popup fill-gating card both set `appProfileOnboarding: { active: true }` and open the options page; options consumes the flag and starts the **profile spotlight tour** (`PROFILE_TOUR_STEPS`, reuses the tour overlay via `tourOpenAt(step, 'profile')`). "Guide me" in the section restarts it. Saved answers keep working if the tour is skipped.
5. **Fill gating**: Form Filler is a **Pro feature**. Popup Fill first asks background `CHECK_PRO_ACCESS`; when access is denied it shows `#fillProCard` ("Create a free account" during the promo, else "See Pro plans"). Only after Pro access passes does it check `applicationProfile` completeness and show `#fillProfileCard` ("Complete setup") if incomplete. Background also re-checks `getFormFillAccess()` and replies `{ status: 'upgrade_required', promoActive }` so the gate can't be bypassed. Generation flow is unaffected.

### Form filler flow

1. User clicks "Fill Form" in the popup (next to the Job Tracker button). Popup first checks Pro access via `CHECK_PRO_ACCESS` (blocks with `#fillProCard` if denied), then checks `applicationProfile` completeness (see Form filler setup above) and blocks with `#fillProfileCard` if incomplete. Background re-checks Pro access on `FILL_APPLICATION_FORM`.
2. Popup sends `FILL_APPLICATION_FORM` to background with `{ tabId, resumeId }`.
3. Background resolves the profile (same resolution as `START_GENERATION`), injects `form-filler.js` into all frames via `chrome.scripting.executeScript`, then runs `__PocketResumeForm.detect(...)` per frame and merges results (field ids are frame-token prefixed). Detection covers text inputs, textareas, selects (only placeholder-unselected ones; matched by option text **and** value), radio groups, checkbox groups, single question-style checkboxes (consent labels excluded), email/url/date inputs, and contenteditables.
4. **Saved-answers-first resolution**: `resolveFormAnswers(fields, applicationProfile)` in `form-profile.js` splits fields. Tier 1: canonical label matchers → `applicationProfile` values (name split, address, salary formatting by field type incl. hourly conversion, yes/no, EEO gated by `eeoOptIn`). Tier 2: `customQA` match (normalized equality, containment, Jaccard ≥ 0.85). Select/radio/checkbox-group answers must fuzzy-match one of the field's options, else the field falls to AI. Single checkboxes get boolean intent (`Yes` → check, `No` → leave unchecked). Zero tokens for resolved fields.
5. `generateFormAnswers(...)` is **removed** in v10.0; the handler now replies `unavailable`. The section is dormant until the deterministic rebuild.
6. Merged answers run through `normalizeFormAnswers` (id validation + maxLength truncation), then `__PocketResumeForm.fill(...)` per frame (native value setters + `input`/`change` events for React/Vue compatibility). Checkbox groups: only matching options are checked, never unchecked; already-ticked groups are skipped entirely.
7. Background toasts on the page's main frame (`"... (N from saved answers)"`), replies `{ status: 'success', filled, total, cached }`, and logs `[FormFill] Filled X of Y fields. (Z saved, W AI)`.
8. Popup shows "Filled X/Y" on the button; errors go through the standard `setError` path. The popup background glows via `body[data-fill-status]`: `filling` (amber pulse) → `fill-success` (green, auto-reverts after 4s) or `fill-failure` (red, persists until the next Fill/Generate click). Kept separate from `body[data-status]` so the two flows never fight over the glow.

Safety rules (enforced in `form-filler.js` + prompt): never submits the form, never overwrites already-filled fields, never unchecks anything the user already ticked, checkbox/consent widgets with consent-style labels (consent/agree/terms/privacy/newsletter/marketing/subscribe/opt-in/gdpr/cookies) are never touched, skips hidden/disabled/readonly/captcha/search fields, caps at 30 fields. Known gap: custom div widgets (`[role="checkbox"]`/`[role="radio"]` without real inputs, legacy Workday) are not detected.

### Quick Download flow (v9.0)

1. User clicks `#quickDownloadBtn` (popup button paired with Settings in the same `.list-row-pair` row). It runs `refreshGate()` first: signed-out, unbuilt, unconfirmed, or plan-locked states show their card instead of downloading.
2. The popup reads `{ resumes, selectedResumeId, userProfile }` from `chrome.storage.local`, resolves the selected resume (legacy `userProfile` fallback), and takes `resume.jsonContent` — the same schema the Settings form writes and `generatePDF` consumes. Markdown fences are stripped before `JSON.parse`.
3. It calls `generatePDF(resumeData, 'professional')` directly in the popup. **No background round-trip, no cover letter** — the style is always the professional PocketResume layout, regardless of the popup's style selector.
4. Error paths go through `setError` (red glow + `?` → error modal with **Open Settings**): no built resume, an unconfirmed parse, or unreadable JSON. `refreshGate()` runs first and shows the matching card instead.
5. The What's New modal's primary button (`#whatsNewPlansBtn`) dismisses the modal and opens the options page (it triggered Quick Download in v9.0, when that modal announced Quick Download); Quick Download's "New" badge (`#quickDownloadNewBadge`) is removed on first hover/focus and persisted via `quickDownloadNewBadgeDismissed`, matching the Tracker/Fill Form badges.
6. Layout note: all four bottom buttons (Settings, Quick Download, Tracker, Fill Form) stay identical at **166×43px** — `.list-row-pair .list-row` carries `flex: 1` + `min-height: 43px` so the badge-bearing rows (43px) and the badge-less rows (41px) line up. "Quick Download" cannot fit next to its NEW badge in a 166px button, so while the badge is on screen the button carries `.has-badge`: label drops to **10px**, icon to 15px, row gap to 4px, and the badge shrinks to 7.5px. `popup.js` adds/removes `.has-badge` alongside the badge itself, so the first hover restores the full **13px** label in the same 200ms `font-size` transition that fades the badge.

## Resume styles & layout mapping

Configured by `getResumeStyleConfig(...)` in `background.js`:

| UI Style     | layout       | PDF Renderer                                     |
| ------------ | ------------ | ------------------------------------------------ |
| professional | pocketresume | `popup.js` → `generatePDF`                       |
| deedy        | deedy        | `resume-renderers.js` → `renderDeedyLayout`      |
| academic-cv  | academic-cv  | `resume-renderers.js` → `renderAcademicCvLayout` |

There are three layouts. The old `faang` id was removed in 10.7.0; a stored `resumeType: "faang"` normalizes to `professional` (same `pocketresume` renderer) and is rewritten on the next popup load.

Double Sided is a **one-page** layout: `renderDeedyLayout` measures every block, tries progressively tighter spacing, shortens per-entry bullets, then trims the least important sections (Open Source → Awards → Publications → Certifications → Links → Projects → oldest roles). Nothing draws past the bottom margin, and the trims are reported in the popup match line. Academic CV paginates with a per-page `Name - N` footer and never separates an entry header from its first bullet.

Bullet selection is deterministic in `alignResumeJson(...)` (`resume-align.js`): per entry it keeps the strongest 2–3 bullets (metric presence + JD keyword hits + strong action-verb opener + length), rewrites banned openers from a fixed table (`fixBulletOpener`), and trims long bullets at clause boundaries without dropping numbers (`trimBullet`). It never authors new text. `professional`/`deedy` keep up to 3 bullets per entry (120 / 130 chars); `academic-cv` keeps up to 5 (170 chars). The limits are keyed on `styleConfig.layout`, not a prompt style.

`alignSkills(...)` merges the JD's skill terms (any zone, including a plain `Skills:` / `Tech Stack:` / `Core Competencies` block) into `resume.skills`, but only terms the master resume already evidences (canonical name or alias, word-boundary matched). The list is deduped on lexical identity (`React`/`React.js`, `javascript`/`JAVASCRIPT`, `Apache Spark`/`Spark`), displays the lexicon canonical name for JD matches, caps at 10 additions / 30 total, and rewrites `skillGroups` (kept verbatim by the Deedy / Academic renderers) so the groups carry the same deduped set plus any JD addition. `verifyAlignedResume(...)` re-checks skills against canonical names and aliases, so an alias spelling (`k8s` → `Kubernetes`) survives verification while an invented skill still drops. `allowUnverifiedSkills` (Settings toggle, **on by default** since 10.1.1) lifts the evidence gate: unevidenced JD keywords are added anyway, exempted from the verifier's skill filter, and reported separately as `skillsAddedUnverified`.

Cover letters are template-driven: `buildCoverLetterFromTemplate(...)` fills `{{company}}`, `{{role}}`, `{{recipient}}` and returns the shape `generateCoverLetterPDF` consumes. There is no tone-guide fork anymore.

The stored `"deedy"` value corresponds to the UI label "Double Sided" — renaming the value would break existing users' saved settings, so keep `"deedy"` as the internal id.

## Settings + persistence

Settings are stored in `chrome.storage.local`, managed in `options.js`.

Important keys:

- `resumes`: array of `{ id, label, icon, content, jsonContent, legacyContent, parseReview, parseConfirmedAt, lastRefineBackup, lastRefineAppliedAt, refineAnswers, updatedAt, coverLetter, coverLetterCooldownUntil }` (up to 3). `icon` is a local-only field (`''` = doc glyph) shown on the resume tabs and the popup resume selector; it is not sent to Convex. `jsonContent` is canonical; `content`/`legacyContent` preserve the pasted text. `coverLetter: { greeting, body, signOff, updatedAt }` is the letter used by Generate Cover Letter for this resume (synced as a JSON string). `coverLetterCooldownUntil` (ms, local-only) is the 60 s gate on AI letter writing — see the cover-letter section. `parseReview: { warnings, parsedAt }` blocks generation until `parseConfirmedAt` is set. `updatedAt` (ms) drives cloud sync last-write-wins.
- `deletedResumeIds`: `[{ id, deletedAt }]` — delete tombstones so automatic cloud restore doesn't resurrect a locally deleted resume
- `selectedResumeId`: which resume is active in the popup
- `cloudSyncStatus`: `"idle" | "syncing" | "synced" | "error"` (cloud sync indicator, written by `src/cloud-sync.js`)
- `resumeType`: `"professional" | "deedy" | "academic-cv"` (legacy `"faang"` is normalized to `"professional"`)
- `applicationProfile`: Form Filler answers — `{ firstName, lastName, email, phone, streetAddress, addressLine2, city, state, postalCode, country, salaryAmount, salaryCurrency, salaryPeriod, startDate, yearsExperience, workAuthorized, needsSponsorship, over18, willingToRelocate, remotePreference, linkedin, website, github, eeoOptIn, eeo: { gender, race, hispanicLatino, veteran, disability }, customQA: [{ id, question, answer }], updatedAt }`
- `appProfileOnboarding`: `{ active: boolean }` — trigger for the Form Filler setup spotlight tour (set by the popup, consumed by the options page)
- `lastSeenAnnouncement`: last version whose What's New modal the user saw (`'10.7.0'` current)
- `parseConfirmedAt`: ms timestamp of the last parsed-resume confirmation
- `accessReminderLastShown`: `YYYY-MM-DD` — daily "free until Dec 31" reminder dismissal
- `featureVideoDeclined`: boolean — legacy flag (tour entry points are hidden in v10.0)
- `quickDownloadNewBadgeDismissed`: boolean — the Quick Download "New" badge is removed after the user's first hover/focus and never returns
- `trackerPlanCache`: `{ proAccess, isPro, promoActive, signedIn, trialDaysLeft, planPeriod, checkedAt }` — last Job Tracker access resolution, used for first paint / offline (ignored when `checkedAt` is older than 60 min)
- per resume: `healthReport` (`baseScore`, live `score`, `summary`, `issues[]` with `status`/`fixedAt`, `provider`, `providerLabel`, `model`, `checkedAt`), `healthEnabledLocal` (opt-in flag), `healthCooldownUntil` (ms; 60 s gate on re-checks)
- `universalCoverLetter`: legacy `{ greeting, body, signOff, updatedAt }`. Migrated into every resume that lacks `coverLetter` on the next Settings load and still read as the fallback by the popup/background. New writes go to `resumes[].coverLetter`.
- `skillLexicon`: compact O*NET-derived vocabulary (`{ schema, source, version, fetchedAt, count, terms: [[name, category, hot, inDemand, aliases]] }`) — overrides the bundled baseline
- `skillLexiconMeta`: `{ source, version, fetchedAt, count, lastError }` — status shown in Settings → Skill directory
- `skillLexiconAutoUpdate`: boolean (default true) — weekly refresh
- `allowUnverifiedSkills`: boolean (default true) — Settings → Skills on generated resumes → "Add unverified JD keywords"; when true, `background.js` passes it to `alignResumeJson` so unevidenced JD keywords are added and exempted from the verifier's skill filter. Read as `!== false` everywhere (unset = on).
- `pendingExtract`: boolean — legacy flag; the options page now focuses the paste box instead of running extraction
- `proAccessCache`: `{ signedIn, isFreeSubscriber, isPro, promoActive, withinWindow, canGenerate, cloudSyncAccess, proAccess, trialEndsAt, trialDaysLeft, planPeriod, hasSubscription, proSubscription, resolved, healthy, source, checkedAt }` — the **page-published access snapshot**. Written by `getAccessState()` in every page realm (options / popup / tracker) for *both* signed-in and signed-out resolutions; the service worker never writes it (it has no session to report) and never deletes it. Background `getGenerationAccess()` allows only `signedIn && (withinWindow || isPro)` from this snapshot while it is younger than 60 min, otherwise denies. A Clerk `addListener` in the pages rewrites it the moment a session starts or ends, so a session expiry cannot leave a stale "Pro" behind.
- `animationsEnabled`: boolean (default true) — Settings → Interface. When false, page realms set `html.no-motion` and the popup skips the scramble and PDF delay, so generation is instant. The Resume health check keeps its loader.
- `openAuth`: `'signIn' | 'signUp'` — set by the popup sign-in card, consumed and cleared by `options.js`, which opens the full Clerk modal. The popup bundle has no Clerk UI, so it must deep-link instead of calling `signIn()`/`signUp()`.
- `trackerLockDismissed`: boolean — user dismissed the Job Tracker lock banner

Legacy migration: `userProfile` → `resumes[0].content` → parsed into `jsonContent` on the next Settings load

## Resume engine (v10.0)

There is **no AI provider, no API key, and no network call** in generation. The pipeline is three pure modules:

- `resume-parse.js` — resume text → structured profile. Section aliases, contact splitting (email/phone/location/links), `Title at Company` / `Title | Company` / `Title — Company` headers, date ranges, multi-line bullets, skill groups, education year/location. Also exports `normalizeResumeProfile`, `splitContactParts`, `buildContactString`, `resumeProfileWarnings`.
- `resume-align.js` — `parseJobPosting` (JSON-LD first, then heading/zone heuristics), `alignResumeJson` (JD fields, skill ranking, bullet selection, opener fixes, trims), `verifyAlignedResume` (any number absent from the profile reverts the field; unevidenced skills drop), `buildCoverLetterFromTemplate`.
- `skill-lexicon.js` — O*NET skill vocabulary (see below).

`npm run test:align` covers determinism, no-invented-numbers, the parser fixtures, and normalization. Keep it green.

## PocketResume Pro (optional feature)

Plans: one **PocketResume Pro** plan billed monthly at **$4/month** (about $1/week) or yearly at **$47/year**, with a 7-day free trial on both periods. There is no lasting free tier: everything is free to try until **Dec 31, 2026**, and after that generation, the Job Tracker, and cloud sync all require Pro. Subscribing before Dec 31 extends the trial to **Jan 7, 2027** (Clerk Backend `extendSubscriptionItemFreeTrial`, called from Convex — never from the extension). Legacy `cloud_sync`/`pro`/`premium` subscriptions and metadata still count as Pro. Sign-in, the embedded pricing table, and sync run through [Clerk](https://clerk.com) + [Convex](https://convex.dev). Plans live in Clerk instance config under `billing.plans`, editable via `clerk config patch` / Dashboard. Clerk Billing only supports monthly and annual periods, so the weekly price is the monthly $4 plan; the `free_user` plan is kept but hidden (`publicly_visible: false`) and grants no generation access.

**Access window (`ACCESS_WINDOW` in `src/cloud-sync.js`)**: Nov 2 → Dec 31, 2026, local time. Any **signed-in** account can generate, use the tracker, and sync during the window. Signing out blocks generation (the popup shows `#signinCard`). After the window, `canGenerate`/`proAccess`/`cloudSyncAccess` require a real Pro plan; existing cloud resumes stay stored (sync pauses, nothing is deleted), and the resume form, JSON export, and account controls stay available. A daily reminder banner appears from Dec 24. `promoActive` is kept as a backwards-compatible alias for `withinWindow` — do not reintroduce `trackerTrialStartedAt`/`trackerUnlocked`.

Access resolution lives in `src/cloud-sync.js`:
- `getAccessState()` → `{ signedIn, isFreeSubscriber, isPro, promoActive, withinWindow, canGenerate, cloudSyncAccess, proAccess, trialEndsAt, trialDaysLeft, planPeriod, hasSubscription, proSubscription, resolved, healthy }`
- `hasCloudSyncAccess()` = `withinWindow || isPro` (sync requires Pro after Dec 31)
- `hasProAccess()` = `withinWindow || isPro` (`proAccess` mirrors it for the tracker)

**Auth lives in page realms only.** clerk-js keeps its client token in an httpOnly cookie on Clerk's Frontend API domain, so only a page (options / popup / tracker) can hold and refresh a session — a service worker never can, and `@clerk/chrome-extension`'s background client does not fix that (it is a second, unrelated token store). The worker therefore holds **no Clerk client at all** (`initClerk()` returns early in the SW) and is told the plan by the pages through `proAccessCache`. Do not reintroduce a worker-side Clerk client or a worker-side `await import()` of Clerk: dynamic `import()` is not supported in extension service workers, and a second token store reads permanently signed-out and fails the Pro gate closed. Consequence to remember: Convex calls also cannot be authenticated from the worker, so resume sync must run in a page.

Architecture:

- `src/cloud-sync.js` — IIFE source, bundled by esbuild → `cloud-sync.js` (options page, with Clerk UI) and `cloud-sync-core.js` (popup / tracker / worker, no UI); both gitignored. Provides auth (`signIn`/`signUp`/`isSignedIn`/`getUserProfile`), plan checks (`hasCloudSyncAccess`/`hasProAccess`/`getAccessState`/`isPromoTrialActive`), the Clerk pricing table mount, and resume sync. It also reads the Clerk subscription (`billing.getSubscription`) for `trialEndsAt` / `trialDaysLeft` / `planPeriod`, and asks the Convex `billing:extendEarlyTrial` action to push a pre-Dec-31 subscriber's trial to Jan 7, 2027. `syncResumes()` is the bidirectional auto-sync: it reads local `resumes` + `deletedResumeIds`, pulls the cloud list, merges by last-write-wins on `updatedAt`, restores cloud-only resumes locally, pushes local-only/newer resumes, applies delete tombstones, and writes back only when the result changed (`label`, `content`, `jsonContent`, or `coverLetter` differ — prevents sync loops). `startAutoSync()` binds the `chrome.storage.onChanged` listener that debounces `syncResumes()` by 2s (page realms only). `getAccessState()` publishes the snapshot to `proAccessCache` (page realms only, both signed-in and signed-out), reloads the Clerk user first when the cached copy is over a minute old so dashboard metadata edits apply, and reports `healthy` (Clerk initialised *and* hydrated) alongside `resolved` — never treat "a client object exists" as resolved. A Clerk `addListener` rewrites the snapshot whenever a session starts or ends. `init()` is **memoized** (one shared in-flight promise, cleared on failure so a retry can happen): `initClerk()` assigns `clerkClient` *before* `load()` resolves, and Clerk only attaches its UI components during `load()`, so a second caller that grabbed the client mid-load used to fail `mountPricingTable` / `openSignIn` with "Clerk was not loaded with Ui components" — reproducible whenever the options page opens `#cloud-pricing` while its own startup is still loading Clerk. No caller may observe `clerkClient` before `await init()` settles. The UI must also be handed over as Clerk's **branded `ui` object** (`(await import('@clerk/ui/no-rhc')).ui`), not the module namespace — with the namespace, `load()` reports success but silently skips attaching UI components, and `mountPricingTable` / `openSignIn` fail with "Clerk was not loaded with Ui components". A page-realm `init()` that ends with Clerk unhealthy **rejects** (so the memo clears and the next call retries); the service worker is exempt, because it never starts Clerk and its `getAccessState()` must keep returning so the snapshot gate can run.
- `background.js` — answers `CHECK_PRO_ACCESS` / `CHECK_GENERATION_ACCESS` and gates `GENERATE` + `BUILD_COVER_LETTER` on `getGenerationAccess()`: `signedIn && (withinWindow || isPro)` from the page-published `proAccessCache` snapshot (younger than 60 min), else deny. It never writes or deletes that snapshot. Unconfigured builds (no Clerk env) are allowed so contributors can run locally.
- `options.js` — always-visible account card at the top of the left panel: signed-out offer (badge + feature bullets + Create account / See Pro plans / Sign in) or signed-in row (avatar + name + plan pill + Start free trial · Manage plan / Sign out) with a sync note. It also consumes `openAuth` from the popup and opens the matching Clerk modal. No manual push/restore controls; `runAutoSync()` fires on load and after sign-in, and `CloudSync.startAutoSync()` is bound on load. Resume edits bump `updatedAt`; deletes record a `deletedResumeIds` tombstone and sync. Pricing table mounts inline (needs the UI build).
- `popup.js` — `refreshGate()` resolves `signin` / `setup` / `review` / `plan` / `ready` from `checkProAccess()` and the stored resume, then `applyGateUi()` shows one card at a time. `#accountBtn` reads Sign in / Start free trial / Trial · Nd / Pro / Free until Dec 31. The sign-in card buttons write `openAuth` and open Settings — they must never call `CloudSync.signIn()`/`signUp()`, because the popup bundle has no Clerk UI. `checkProAccess()` prefers the popup's own in-page `getAccessState()` (2.5 s timeout), falls back to `CHECK_PRO_ACCESS`, and retries once on `chrome.runtime.lastError`.
- `tracker.js` — `checkAccess()` gates the Job Tracker via `window.CloudSync.getAccessState()`; caches the result in `trackerPlanCache`
- `convex/auth.config.ts` — Clerk → Convex auth wiring; requires `CLERK_FRONTEND_API_URL` env var
- `convex/schema.ts` — `resumes` table shape (`jsonContent` + optional `coverLetter` JSON string)
- `convex/resumes.ts` — `list`, `upsert`, `remove` queries/mutations
- `convex/billing.ts` — `extendEarlyTrial` action: authenticated self-serve call that uses `CLERK_SECRET_KEY` (Convex env) to extend a pre-Dec-31 subscriber's trial to Jan 7, 2027

Sign-in behavior: all Clerk redirects (`signInForceRedirectUrl`, `signUpForceRedirectUrl`, `afterSignOutUrl`, `signOut redirectUrl`) point at `options.html` — never `popup.html` (navigating the Settings tab to the popup breaks the React tree with `removeChild` errors). The sign-in modal is themed dark via `appearance.variables` passed to `clerk.load(...)` — explicit input colors are required or typed text inherits the page's light color and becomes invisible inside Clerk's light-styled inputs.

Credentials are **never** hardcoded. The build step injects `CLERK_PUBLISHABLE_KEY` and `CONVEX_URL` from `.env.local` into the bundle. Contributors must set up their own Clerk + Convex accounts.

## File layout

```
PocketResume/
├── manifest.json            # Manifest V3 entrypoint wiring
├── background.js            # Service worker: deterministic pipeline + generation gate
├── content.js               # Content script: page text extraction
├── form-filler.js           # [dormant] Form detect/fill/toast (Form Filler is Soon)
├── form-profile.js          # Saved-answer resolver: canonical matchers + custom Q&A matching
├── popup.html / popup.js    # Popup UI + PocketResume PDF generation
├── feature-video.js / feature-video.css  # Cursor-follow feature tour over real screenshots (popup-only)
├── scripts/capture-tour.mjs # Generates assets/tour/*.webp + frames.js (npm run build:tour)
├── options.html / options.js# Settings: resume form, cover letter, account, toggles
├── resume-renderers.js      # Double Sided / Academic CV PDF layouts
├── resume-parse.js          # Resume text -> structured profile + normalization (pure, no network)
├── resume-align.js          # Deterministic JD alignment + verifier + cover-letter template (pure)
├── resume-health.js         # Opt-in health check: redaction, prompt, JSON salvage, Pollinations→Ollama chain
├── resume-letter.js         # General cover-letter body writer over the same provider chain
├── skill-lexicon.js         # O*NET CSV parsing, alias map, lexicon merge/compact (pure)
├── src/cloud-sync.js        # Pro auth/plan/pricing/sync source (bundled → cloud-sync.js + cloud-sync-core.js)
├── cloud-sync.js            # [generated, gitignored] esbuild bundle, Clerk UI (options.html)
├── cloud-sync-core.js       # [generated, gitignored] esbuild bundle, no UI (popup / tracker / worker)
├── convex/                  # Convex backend
│   ├── auth.config.ts
│   ├── schema.ts
│   ├── resumes.ts
│   └── _generated/          # [generated, gitignored]
├── libs/jspdf.umd.min.js    # Vendored jsPDF
├── libs/ldrs-newtons-cradle.js # Vendored ldrs Newton's Cradle web component
├── scripts/build-clerk.mjs  # Build script for the Pro (Clerk) bundles
├── scripts/build-zip.mjs    # Builds dist/pocketresume-vX.Y.zip from the runtime file list (npm run build:zip)
├── scripts/test-align.mjs   # Engine tests (npm run test:align)
├── scripts/test-render.mjs  # PDF layout tests (npm run test:render)
├── .env.example             # Template for .env.local
├── AGENTS.md                # This file
├── CHANGELOG.md             # Version history — update on every version bump
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── LICENSE
└── package.json             # Build scripts only (no runtime deps)
```

## Where to make common product changes

- **Change the parser or JSON schema**: `resume-parse.js` (`parseResumeText`, `normalizeResumeProfile`) + fixtures in `scripts/test-align.mjs`. Update the style config table above if the layout mapping changes.
- **Change what we extract from a page**: `content.js` (`extractPageText` — prefers the largest `main`/`article` block, then the body; `extractStructuredData` — schema.org `JobPosting`), plus `buildJobText` in `background.js`, which appends the JSON-LD description when the visible page does not contain it.
- **Change form detection / filling / safety rules**: `form-filler.js` (`detect` / `fill` / `toast`) — the handler is currently `unavailable` while Form Filler is Soon.
- **Change access gating**: `src/cloud-sync.js` (`getAccessState`/`hasProAccess`/`ACCESS_WINDOW`), `background.js` (`getGenerationAccess`), `popup.js` (`refreshGate` + gate cards).
- **Change generation / JD alignment**: `resume-align.js` (`parseJobPosting`, `alignResumeJson`, verifier), `background.js` (`GENERATE`, `BUILD_COVER_LETTER`), `popup.js` (`runGeneration`, `refreshGate`) / `popup.html` (`#signinCard`, `#reviewCard`, `#planLockCard`).
- **Change the skill vocabulary or update source**: `skill-lexicon.js` (parsers, `CURATED_ALIASES`, source URLs) + `scripts/build-lexicon.mjs` (bundled baseline) + `background.js` (`updateSkillLexicon`, alarms). Keep the O*NET attribution in `NOTICE` and in Settings.
- **Change Resume Health Check**: `resume-health.js` (`buildProviders`, `checkResumeHealth`, `validateHealthReport`, `SCORE_WEIGHTS`), `background.js` (`CHECK_RESUME_HEALTH`), `options.html`/`options.js` (`#resumeHealthDetails` → `renderHealthPanel` / `runResumeHealthCheck`, cooldown + local fix scoring).
- **Change the cover letter**: `options.html`/`options.js` (Cover letter section: Generate letter + 60 s cooldown gate, prompt, sample, per-resume editor) + `resume-letter.js` (`generateCoverLetterBody`, `buildCoverLetterBodyPrompt`, `sanitizeLetter`, `COVER_LETTER_COOLDOWN_MS`) + `buildCoverLetterFromTemplate` in `resume-align.js` + `background.js` (`BUILD_AI_COVER_LETTER` gate + cooldown write).
- **Change saved-answer resolution / canonical matchers**: `form-profile.js` (`CANONICAL_MATCHERS`, `resolveFormAnswers`) — dormant until Form Filler returns.
- **Change Form Filler onboarding / application profile**: `options.html` + `options.js` (`#appProfileDetails` section, `APP_PROFILE_FIELDS`, `PROFILE_TOUR_STEPS`), `background.js` (`PROFILE_AUTOFILL` handler + `generateApplicationProfileFromResume`), popup gating in `popup.js` (`isFormFillerProfileComplete` / `#fillProfileCard`).
- **Change PocketResume PDF layout**: `popup.js` (`generatePDF` / `generateCoverLetterPDF`).
- **Change Double Sided / Academic CV PDF layouts**: `resume-renderers.js` (`renderDeedyLayout` / `renderAcademicCvLayout`).
- **Change settings UI / resume management / form editor**: `options.js` (`renderTabContent`, `resumeDraft`, `serializeProfile`) / `options.html`.
- **Change popup UI**: `popup.html` / `popup.js`.
- **Change the animations toggle**: `options.html` (`#animationsToggle`) + `options.js` (storage + `applyMotionPreference`), then the `html.no-motion` CSS and the `motionOn()` gates in `popup.js` / `tracker.js`.
- **Change popup error messages / mapping**: `popup.js` (`setError` / `mapErrorMessage`). Maps the gate/network/parse cases to short strings; un-matched messages truncate to ~200 chars.
- **Change permissions or extension wiring**: `manifest.json`.
- **Change Pro auth / plan gating / pricing / resume sync**: `src/cloud-sync.js` (then `npm run build:clerk`), `options.js` (account card + auto-sync), `background.js` (`CHECK_PRO_ACCESS`), `tracker.js` (`checkAccess`), `popup.js` (`checkProAccess`).
- **Change Convex schema or functions**: `convex/schema.ts`, `convex/resumes.ts`, `convex/billing.ts`, `convex/auth.config.ts` (then `npx convex dev`).

## Coding conventions

- 4-space indentation across all JS / TS files (matches `background.js`).
- Vanilla ES2022 JS, no TypeScript outside the `convex/` backend.
- **No new comments in source files** unless behavior is non-obvious. The codebase intentionally ships minimal comments.
- Match the style of the file you're editing — read surrounding context first.
- Use `chrome.storage.local` for persistence; do not introduce new global state.

### Button color roles

Buttons use semantic accent tokens so paired actions both read as intentional (never "one orange, one disabled-looking"). Tokens live in `:root` of `popup.html` / `options.html` / `tracker.html` (`--accent-blue*`, `--accent-green*`, `--accent-red*`, plus the existing `--orange*`).

- **Orange** (`--orange*`) = primary/most important action. Classes: `.secondary-action-btn` (options), `.setup-goto` (popup), `.btn-primary` / `#generateBtn` / `.cloud-primary-btn`.
- **Blue** (`--accent-blue*`) = secondary, parallel-but-valid action. Classes: `.accent-btn` (options), `.setup-goto.accent` (popup), `.btn-accent` (tracker). Used for: Check ATS, See Pro plans, Guide me.
- **Green** (`--accent-green*`) = confirm/apply. Classes: `.success-btn` (options), `.setup-goto.success` (popup), `.btn-success` (tracker). Used for: Apply Refined Resume, Replace Local with Cloud.
- **Red** (`--accent-red*`) = destructive. Classes: `.danger-btn` (options), `.btn-danger` (tracker).
- **Glass/ghost** = dismiss/cancel/back/skip/tertiary. Classes: `.ghost-btn` (options), `.setup-goto.ghost` (popup), `.btn-ghost` / `.btn` (tracker).

## Common pitfalls

- **Never call Clerk UI methods from the popup.** The popup loads `cloud-sync-core.js` (`__CLERK_UI__ = false`), so `CloudSync.signIn()` / `signUp()` throw and the popup lands in `setError()` (a red glow that looks like a broken button). The popup writes `openAuth` and opens `options.html`, where the full UI bundle can show the modal.
- **Trials are Clerk plan config, not code.** Set the 7-day trial on both Pro plans in the Dashboard. The pre-Dec-31 extension to Jan 7 is `convex/billing.ts` → Clerk `extendSubscriptionItemFreeTrial`; it needs `CLERK_SECRET_KEY` in the Convex env. If Convex is not configured the extension silently does nothing and the normal 7-day trial still applies.
- **The hidden `free_user` plan is also an active subscription item.** Never treat `subscription.status === 'active'` as Pro, and never pass a subscription item to `extend_free_trial` without checking its plan slug — Clerk answers 403 `plan_free_trials_disabled`. `parseSubscriptionState()` and `convex/billing.ts` both filter for `PRO_PLAN_SLUGS` (`proSubscription` / `proSubscriptionItem`).
- **PDFs save through `chrome.downloads`, not `doc.save()`.** jsPDF's `doc.save()` is a synthetic anchor click: only the first download in a popup session inherits the user gesture, and later ones (cover letter, second file) get treated as automatic downloads and silently dropped. Use `savePdfDocument(doc, filename)` in `popup.js` (`window.PocketResumeSavePdf`, used by `resume-renderers.js` too). Keep the anchor fallback for contexts without the `downloads` permission.
- **The engine never rewrites wording.** `resume-align.js` only selects, reorders, trims, and fixes banned openers; if you add a transformation that authors new text you lose the "no invented facts" guarantee and the verifier's number check. `npm run test:align` must stay green.
- **`GENERATE` needs `jsonContent` and a confirmed parse.** Do not bypass `parseReview`; a wrong parse silently ships a wrong PDF.
- **Weekly lexicon updates need the optional `https://www.onetcenter.org/*` permission.** A service worker cannot prompt; the options page must request it first. Without it the alarm update exits quietly and keeps the bundled/cached copy.
- **Access is gated by a page-published snapshot.** The worker cannot read a Clerk session; any new gated message must call `getGenerationAccess()` and let pages publish `proAccessCache`.
- **Skill lexicon storage is ~1 MB.** `chrome.storage.local` defaults to 10 MB; keep the compact row format (`compactLexicon`) rather than storing expanded objects per term.
- **`jsonContent` is the only input the engine accepts.** There is no raw-text generation fallback anymore; if a resume has only `content`, it must be parsed and saved in Settings first.
- **Generation requires a signed-in session.** Hard block, no offline grace: if the snapshot is stale or missing, the worker denies and the popup shows `#signinCard`.
- **Manifest `key` field is intentionally absent.** Chrome assigns a fresh extension ID on first load. Do not re-add it (it would lock all contributors to one ID).
- **`host_permissions`** in `manifest.json` covers Clerk + Convex + `https://text.pollinations.ai/*` (Resume Health Check) only. Update both the manifest and this file if you add a new backend.
- **Chrome extension service workers can be killed** between messages. Do not store in-memory state across calls — read from `chrome.storage.local` each time.
- **Content script CSP**: avoid inline scripts / eval in `content.js`. The page's CSP applies.
- **Client-rendered job boards need the JSON-LD path.** Sites like `careers.atb.com` serve a 650-character shell at `domcontentloaded` ("We didn't find any …") and hydrate the posting a moment later; the only lexicon word in that shell is a footer link (`LinkedIn`). `content.js` waits up to 4 s for the body to fill in, and `background.js` merges `JobPosting.description` from the schema.org block, which is present in the initial HTML. Never rely on `document.body.innerText` alone for a JD.
- **Do not commit** `cloud-sync.js` / `cloud-sync-core.js` (build artifacts), `convex/_generated/`, or anything from `.env.local`. See `.gitignore`.

## Privacy posture

PocketResume is privacy-first by default. See `privacy-policy.md` for the full policy. The Chrome extension:

- Stores resumes locally in `chrome.storage.local`; cloud sync is opt-in via a free PocketResume account and only talks to the user's own Convex backend
- Makes no AI requests except opt-in features the user starts: the Resume Health Check (redacted `jsonContent` to Pollinations, or local Ollama on fallback) and Generate letter (redacted resume profile to the same chain). Resume generation and filling stay local.
- Sends nothing to Clerk/Convex unless you sign in, and then only resumes you sync
