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
- **Resume renderers**: `resume-renderers.js` — Jake, Deedy, Academic CV PDF layouts
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

### Rebuild the skill lexicon / run the aligner tests

```sh
npm run build:lexicon   # downloads O*NET 31.0 CSVs -> libs/skills-lexicon.js
npm run test:align      # determinism + no-invented-numbers checks (no network)
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

`npm run test:align` is the only automated check (determinism, no-invented-numbers, parser fixtures, normalization). No linter. Otherwise: load unpacked, generate with a real account, inspect the PDF + the service worker console.

### Versioning & changelog

**On every `manifest.json` version bump, you MUST also update `CHANGELOG.md`** and the popup "What's New" announcement:

1. Bump `manifest.json` → `version`.
2. Add a new top entry to `CHANGELOG.md` (`## [X.Y] — YYYY-MM-DD`) summarizing the change under Added / Changed / Fixed / Removed. Newest first.
3. Update the popup "What's New" modal: `ANNOUNCEMENT_VERSION` + `ANNOUNCEMENT_SEEN_VALUE` in `popup.js` and the modal copy in `popup.html` (`#whatsNewModal`). The modal shows once per version.
4. Build the store zip: `npm run build:clerk` first (if `src/cloud-sync.js` changed), then `npm run build:zip` to write `dist/pocketresume-vX.Y.zip` from the runtime file list — see "Store build" below.

### Store build (zip)

Chrome Web Store upload = a zip with `manifest.json` at the root and **only runtime files**. Include:

`manifest.json`, `background.js`, `content.js`, `form-filler.js`, `form-profile.js`, `popup.html`, `popup.js`, `options.html`, `options.js`, `tracker.html`, `tracker.js`, `resume-renderers.js`, `resume-align.js`, `skill-lexicon.js`, `feature-video.js`, `feature-video.css`, `cloud-sync.js`, `cloud-sync-core.js`, `icon.png`, `libs/` (jsPDF, ldrs loader, animations, skills lexicon), `assets/tour/`.

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
   - When `output !== 'resume'`, builds the letter via `buildCoverLetterFromTemplate(universalCoverLetter, ...)`.
   - Replies `{ status: 'success', data, coverLetterData, coverLetterStatus, report, jobMeta }`.
5. Popup parses `data`, always calls `saveApplicationToTracker(...)`, then renders the PDF (`generatePDF` / `resume-renderers.js`) unless `output === 'cover-letter'`, and the letter when requested. Both save through `chrome.downloads`.
6. Errors/statuses (`signin_required`, `plan_required`, `review_required`, `needs_resume`, `needs_json`) re-render the gate cards; everything else goes through `setError` → `#errorModal`.

### Onboarding flow (v10.0)

1. Signed-out users see `#signinCard` (Create free account / Sign in). Editing stays available in Settings, generation is blocked.
2. Signed-in users without a built resume see `#setupCard`: account → build resume → cover letter → save.
3. The options spotlight tour (`TOUR_STEPS`) walks: account → paste → parse → cover letter → save.
4. "Setup complete" card still appears once (`onboardingCompleted`) with the feature-tour offer.

### Feature tour video (hidden in v10.0)

Frames were captured against the old BYOK UI and the entry points (`#featureVideoBtn`, setup-card offer) are removed until `npm run build:tour` is re-run against the new popup/options UI. `feature-video.js`, `assets/tour/`, and the capture script remain in the repo.

### Refine / ATS / Form Filler (Soon)

These AI-backed flows are disabled. Their buttons render disabled with a `.soon-badge`, and background replies `{ status: 'unavailable', feature }` for `CHECK_ATS`, `GET_REFINE_QUESTIONS`, `REFINE_RESUME`, `PROFILE_AUTOFILL`, and `FILL_APPLICATION_FORM`. The UI/analysis code remains for a deterministic rebuild (an on-device ATS linter is the intended replacement).

### Skill directory (v9.1)

- `skill-lexicon.js` parses O*NET CSVs (public, CC BY 4.0): `software_skills.csv` (31k rows → tool names with Hot/In-Demand flags), `essential_skills.csv`, `transferable_skills.csv`, merged with `CURATED_ALIASES`. See `NOTICE`.
- Baseline snapshot: `libs/skills-lexicon.js` (`npm run build:lexicon`, ~8k terms, committed). Runtime updates go to `chrome.storage.local` as compact rows (`skillLexicon`) + `skillLexiconMeta`.
- Updates: `chrome.alarms` (`skillLexiconWeekly`, 7 days) plus `onStartup`/`onInstalled`; runs when `skillLexiconAutoUpdate !== false`, data older than 7 days, and the optional `https://www.onetcenter.org/*` permission is granted. No plan check. Settings → Skill directory has **Update now**, which requests that permission first. Failures keep the last good copy and record `lastError`.

### Universal cover letter (v9.1)

Settings → **Cover letter** stores `universalCoverLetter: { greeting, body, signOff, updatedAt }` with `{{company}}`, `{{role}}`, `{{recipient}}` placeholders, plus writing steps, a sample, and a copyable external-assistant prompt. The popup's **Generate Cover Letter** button sends `GENERATE` with `output: 'cover-letter'`; background renders the template through `buildCoverLetterFromTemplate(...)` into the shape `generateCoverLetterPDF` expects. A generated resume is never discarded because the letter failed.

### Form filler setup (Application Questions — Soon in v10.0)

Since 10.1.1 the Form Filler Setup section markup is removed from the Options left panel (it stays drifted out of view while the feature is rebuilt); the JS side in `options.js` is intact and fully null-guarded, and `applicationProfile` storage keeps working.

Everything below is dormant: the section is visible with a `Soon` badge and its buttons are disabled. It is kept as the basis for the deterministic rebuild.

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

| UI Style     | promptStyle  | layout       | PDF Renderer                                                       |
| ------------ | ------------ | ------------ | ------------------------------------------------------------------ |
| professional | professional | pocketresume | `popup.js` → `generatePDF`                                         |
| faang        | faang        | pocketresume | `popup.js` → `generatePDF`                                         |
| deedy        | faang        | deedy        | `resume-renderers.js` → `renderDeedyLayout`                        |
| academic-cv  | academic-cv  | academic-cv  | `resume-renderers.js` → `renderAcademicCvLayout`                   |

Bullet selection is deterministic in `alignResumeJson(...)` (`resume-align.js`): per entry it keeps the strongest 2–3 bullets (metric presence + JD keyword hits + strong action-verb opener + length), rewrites banned openers from a fixed table (`fixBulletOpener`), and trims long bullets at clause boundaries without dropping numbers (`trimBullet`). It never authors new text. `professional`/`deedy`/`academic-cv` share the same selector; `faang` gets the same selection with tighter limits.

`alignSkills(...)` merges the JD's skill terms (any zone, including a plain `Skills:` / `Tech Stack:` / `Core Competencies` block) into `resume.skills`, but only terms the master resume already evidences (canonical name or alias, word-boundary matched). The list is deduped on lexical identity (`React`/`React.js`, `javascript`/`JAVASCRIPT`, `Apache Spark`/`Spark`), displays the lexicon canonical name for JD matches, caps at 10 additions / 30 total, and rewrites `skillGroups` (kept verbatim by the Deedy / Academic renderers) so the groups carry the same deduped set plus any JD addition. `verifyAlignedResume(...)` re-checks skills against canonical names and aliases, so an alias spelling (`k8s` → `Kubernetes`) survives verification while an invented skill still drops. `allowUnverifiedSkills` (Settings toggle, **on by default** since 10.1.1) lifts the evidence gate: unevidenced JD keywords are added anyway, exempted from the verifier's skill filter, and reported separately as `skillsAddedUnverified`.

Cover letters are template-driven: `buildCoverLetterFromTemplate(...)` fills `{{company}}`, `{{role}}`, `{{recipient}}` and returns the shape `generateCoverLetterPDF` consumes. There is no tone-guide fork anymore.

The stored `"deedy"` value corresponds to the UI label "Double Sided" — renaming the value would break existing users' saved settings, so keep `"deedy"` as the internal id.

## Settings + persistence

Settings are stored in `chrome.storage.local`, managed in `options.js`.

Important keys:

- `resumes`: array of `{ id, label, icon, content, jsonContent, legacyContent, parseReview, parseConfirmedAt, lastRefineBackup, lastRefineAppliedAt, refineAnswers, updatedAt }` (up to 3). `icon` is a local-only field (`''` = doc glyph) shown on the resume tabs and the popup resume selector; it is not sent to Convex. `jsonContent` is canonical; `content`/`legacyContent` preserve the pasted text. `parseReview: { warnings, parsedAt }` blocks generation until `parseConfirmedAt` is set. `updatedAt` (ms) drives cloud sync last-write-wins.
- `deletedResumeIds`: `[{ id, deletedAt }]` — delete tombstones so automatic cloud restore doesn't resurrect a locally deleted resume
- `selectedResumeId`: which resume is active in the popup
- `cloudSyncStatus`: `"idle" | "syncing" | "synced" | "error"` (cloud sync indicator, written by `src/cloud-sync.js`)
- `resumeType`: `"professional" | "faang" | "deedy" | "academic-cv"`
- `applicationProfile`: Form Filler answers — `{ firstName, lastName, email, phone, streetAddress, addressLine2, city, state, postalCode, country, salaryAmount, salaryCurrency, salaryPeriod, startDate, yearsExperience, workAuthorized, needsSponsorship, over18, willingToRelocate, remotePreference, linkedin, website, github, eeoOptIn, eeo: { gender, race, hispanicLatino, veteran, disability }, customQA: [{ id, question, answer }], updatedAt }`
- `appProfileOnboarding`: `{ active: boolean }` — trigger for the Form Filler setup spotlight tour (set by the popup, consumed by the options page)
- `refineNudge`: `{ active: boolean }` — trigger for the v8.2 "Smarter Refine" spotlight on `#refineResumeBtn` (set by the popup's What's New modal via `startRefineNudge()`, consumed by the options page via `NUDGE_TOUR_STEPS` + a `'nudge'` tour mode)
- `atsNudge`: `{ active: boolean }` — trigger for the v8.2 "Check ATS" spotlight on `#checkAtsBtn` (set by the popup's What's New modal via `startAtsNudge()`, consumed by the options page via `ATS_NUDGE_TOUR_STEPS` + an `'atsnudge'` tour mode)
- `lastSeenAnnouncement`: last version whose What's New modal the user saw (`'10.0'` current)
- `parseConfirmedAt`: ms timestamp of the last parsed-resume confirmation
- `accessReminderLastShown`: `YYYY-MM-DD` — daily "free until Dec 31" reminder dismissal
- `featureVideoDeclined`: boolean — legacy flag (tour entry points are hidden in v10.0)
- `quickDownloadNewBadgeDismissed`: boolean — the Quick Download "New" badge is removed after the user's first hover/focus and never returns
- `trackerPlanCache`: `{ proAccess, isPro, promoActive, signedIn, checkedAt }` — last Job Tracker access resolution, used for first paint / offline (ignored when `checkedAt` is older than 60 min)
- `universalCoverLetter`: `{ greeting, body, signOff, updatedAt }` — the letter rendered by Generate Cover Letter
- `skillLexicon`: compact O*NET-derived vocabulary (`{ schema, source, version, fetchedAt, count, terms: [[name, category, hot, inDemand, aliases]] }`) — overrides the bundled baseline
- `skillLexiconMeta`: `{ source, version, fetchedAt, count, lastError }` — status shown in Settings → Skill directory
- `skillLexiconAutoUpdate`: boolean (default true) — weekly refresh
- `allowUnverifiedSkills`: boolean (default true) — Settings → Skills on generated resumes → "Add unverified JD keywords"; when true, `background.js` passes it to `alignResumeJson` so unevidenced JD keywords are added and exempted from the verifier's skill filter. Read as `!== false` everywhere (unset = on).
- `pendingExtract`: boolean — legacy flag; the options page now focuses the paste box instead of running extraction
- `proAccessCache`: `{ signedIn, isFreeSubscriber, isPro, promoActive, withinWindow, canGenerate, cloudSyncAccess, proAccess, resolved, healthy, source, checkedAt }` — the **page-published access snapshot**. Written by `getAccessState()` in every page realm (options / popup / tracker) for *both* signed-in and signed-out resolutions; the service worker never writes it (it has no session to report) and never deletes it. Background `getGenerationAccess()` allows only `signedIn && (withinWindow || isPro)` from this snapshot while it is younger than 60 min, otherwise denies. A Clerk `addListener` in the pages rewrites it the moment a session starts or ends, so a session expiry cannot leave a stale "Pro" behind.
- `trackerLockDismissed`: boolean — user dismissed the Job Tracker lock banner

Legacy migration: `userProfile` → `resumes[0].content` → parsed into `jsonContent` on the next Settings load

## Resume engine (v10.0)

There is **no AI provider, no API key, and no network call** in generation. The pipeline is three pure modules:

- `resume-parse.js` — resume text → structured profile. Section aliases, contact splitting (email/phone/location/links), `Title at Company` / `Title | Company` / `Title — Company` headers, date ranges, multi-line bullets, skill groups, education year/location. Also exports `normalizeResumeProfile`, `splitContactParts`, `buildContactString`, `resumeProfileWarnings`.
- `resume-align.js` — `parseJobPosting` (JSON-LD first, then heading/zone heuristics), `alignResumeJson` (JD fields, skill ranking, bullet selection, opener fixes, trims), `verifyAlignedResume` (any number absent from the profile reverts the field; unevidenced skills drop), `buildCoverLetterFromTemplate`.
- `skill-lexicon.js` — O*NET skill vocabulary (see below).

`npm run test:align` covers determinism, no-invented-numbers, the parser fixtures, and normalization. Keep it green.

## PocketResume Pro (optional feature)

Plans: **Free** (`free_user`, auto-assigned to every signed-in user) includes resume **cloud sync** and, during the access window, everything else. **Pro** (`pocketresume_pro`, paid) keeps generation + the Job Tracker unlocked after **Dec 31, 2026**; legacy `cloud_sync`/`pro`/`premium` subscriptions and metadata still count as Pro. Sign-in, the embedded pricing table, and sync run through [Clerk](https://clerk.com) + [Convex](https://convex.dev). Plans live in Clerk instance config under `billing.plans`, editable via `clerk config patch` / Dashboard.

**Access window (`ACCESS_WINDOW` in `src/cloud-sync.js`)**: Nov 2 → Dec 31, 2026, local time. Any **signed-in** account can generate and use the tracker during the window. Signing out blocks generation (the popup shows `#signinCard`). After the window, `canGenerate`/`proAccess` require a real Pro plan; the resume form, JSON export, and account controls stay available. A daily reminder banner appears from Dec 24. `promoActive` is kept as a backwards-compatible alias for `withinWindow` — do not reintroduce `trackerTrialStartedAt`/`trackerUnlocked`.

Access resolution lives in `src/cloud-sync.js`:
- `getAccessState()` → `{ signedIn, isFreeSubscriber, isPro, promoActive, withinWindow, canGenerate, cloudSyncAccess, proAccess, resolved, healthy }`
- `hasCloudSyncAccess()` = free + Pro + legacy (cloud sync)
- `hasProAccess()` = `withinWindow || isPro` (`proAccess` mirrors it for the tracker)

**Auth lives in page realms only.** clerk-js keeps its client token in an httpOnly cookie on Clerk's Frontend API domain, so only a page (options / popup / tracker) can hold and refresh a session — a service worker never can, and `@clerk/chrome-extension`'s background client does not fix that (it is a second, unrelated token store). The worker therefore holds **no Clerk client at all** (`initClerk()` returns early in the SW) and is told the plan by the pages through `proAccessCache`. Do not reintroduce a worker-side Clerk client or a worker-side `await import()` of Clerk: dynamic `import()` is not supported in extension service workers, and a second token store reads permanently signed-out and fails the Pro gate closed. Consequence to remember: Convex calls also cannot be authenticated from the worker, so resume sync must run in a page.

Architecture:

- `src/cloud-sync.js` — IIFE source, bundled by esbuild → `cloud-sync.js` (options page, with Clerk UI) and `cloud-sync-core.js` (popup / tracker / worker, no UI); both gitignored. Provides auth (`signIn`/`signUp`/`isSignedIn`/`getUserProfile`), plan checks (`hasCloudSyncAccess`/`hasProAccess`/`getAccessState`/`isPromoTrialActive`), the Clerk pricing table mount, and resume sync. `syncResumes()` is the bidirectional auto-sync: it reads local `resumes` + `deletedResumeIds`, pulls the cloud list, merges by last-write-wins on `updatedAt`, restores cloud-only resumes locally, pushes local-only/newer resumes, applies delete tombstones, and writes back only when the result changed (prevents sync loops). `startAutoSync()` binds the `chrome.storage.onChanged` listener that debounces `syncResumes()` by 2s (page realms only). `getAccessState()` publishes the snapshot to `proAccessCache` (page realms only, both signed-in and signed-out), reloads the Clerk user first when the cached copy is over a minute old so dashboard metadata edits apply, and reports `healthy` (Clerk initialised *and* hydrated) alongside `resolved` — never treat "a client object exists" as resolved. A Clerk `addListener` rewrites the snapshot whenever a session starts or ends. `init()` is **memoized** (one shared in-flight promise, cleared on failure so a retry can happen): `initClerk()` assigns `clerkClient` *before* `load()` resolves, and Clerk only attaches its UI components during `load()`, so a second caller that grabbed the client mid-load used to fail `mountPricingTable` / `openSignIn` with "Clerk was not loaded with Ui components" — reproducible whenever the options page opens `#cloud-pricing` while its own startup is still loading Clerk. No caller may observe `clerkClient` before `await init()` settles. The UI must also be handed over as Clerk's **branded `ui` object** (`(await import('@clerk/ui/no-rhc')).ui`), not the module namespace — with the namespace, `load()` reports success but silently skips attaching UI components, and `mountPricingTable` / `openSignIn` fail with "Clerk was not loaded with Ui components". A page-realm `init()` that ends with Clerk unhealthy **rejects** (so the memo clears and the next call retries); the service worker is exempt, because it never starts Clerk and its `getAccessState()` must keep returning so the snapshot gate can run.
- `background.js` — answers `CHECK_PRO_ACCESS` / `CHECK_GENERATION_ACCESS` and gates `GENERATE` + `BUILD_COVER_LETTER` on `getGenerationAccess()`: `signedIn && (withinWindow || isPro)` from the page-published `proAccessCache` snapshot (younger than 60 min), else deny. It never writes or deletes that snapshot. Unconfigured builds (no Clerk env) are allowed so contributors can run locally.
- `options.js` — always-visible account card at the top of the left panel: signed-out offer (badge + feature bullets + Create free account / See Pro plans / Sign in) or signed-in row (avatar + name + plan pill + Upgrade · Manage plan / Sign out) with a "resumes sync automatically" note. No manual push/restore controls; `runAutoSync()` fires on load and after sign-in, and `CloudSync.startAutoSync()` is bound on load. Resume edits bump `updatedAt`; deletes record a `deletedResumeIds` tombstone and sync. Pricing table mounts inline (needs the UI build).
- `popup.js` — `refreshGate()` resolves `signin` / `setup` / `review` / `plan` / `ready` from `checkProAccess()` and the stored resume, then `applyGateUi()` shows one card at a time. `#accountBtn` reads Sign in / Upgrade / Pro / Free until Dec 31. `checkProAccess()` prefers the popup's own in-page `getAccessState()` (2.5 s timeout), falls back to `CHECK_PRO_ACCESS`, and retries once on `chrome.runtime.lastError`.
- `tracker.js` — `checkAccess()` gates the Job Tracker via `window.CloudSync.getAccessState()`; caches the result in `trackerPlanCache`
- `convex/auth.config.ts` — Clerk → Convex auth wiring; requires `CLERK_FRONTEND_API_URL` env var
- `convex/schema.ts` — `resumes` table shape
- `convex/resumes.ts` — `list`, `upsert`, `remove` queries/mutations

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
├── resume-renderers.js      # Jake / Deedy / Academic CV PDF layouts
├── resume-parse.js          # Resume text -> structured profile + normalization (pure, no network)
├── resume-align.js          # Deterministic JD alignment + verifier + cover-letter template (pure)
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
├── libs/ldrs-newtons-cradle.js # [generated, gitignored? no—committed] vendored ldrs Newton's Cradle web component
├── scripts/build-clerk.mjs  # Build script for the Pro (Clerk) bundles
├── scripts/build-zip.mjs    # Builds dist/pocketresume-vX.Y.zip from the runtime file list (npm run build:zip)
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
- **Change the universal cover letter**: `options.html`/`options.js` (Cover letter section: guidance, sample, prompt, editor) + `buildCoverLetterFromTemplate` in `resume-align.js`.
- **Change saved-answer resolution / canonical matchers**: `form-profile.js` (`CANONICAL_MATCHERS`, `resolveFormAnswers`) — dormant until Form Filler returns.
- **Change Form Filler onboarding / application profile**: `options.html` + `options.js` (`#appProfileDetails` section, `APP_PROFILE_FIELDS`, `PROFILE_TOUR_STEPS`), `background.js` (`PROFILE_AUTOFILL` handler + `generateApplicationProfileFromResume`), popup gating in `popup.js` (`isFormFillerProfileComplete` / `#fillProfileCard`).
- **Change PocketResume PDF layout**: `popup.js` (`generatePDF` / `generateCoverLetterPDF`).
- **Change Double Sided / Academic CV PDF layouts**: `resume-renderers.js` (`renderDeedyLayout` / `renderAcademicCvLayout`).
- **Change settings UI / resume management / form editor**: `options.js` (`renderTabContent`, `resumeDraft`, `serializeProfile`) / `options.html`.
- **Change popup UI**: `popup.html` / `popup.js`.
- **Change popup error messages / mapping**: `popup.js` (`setError` / `mapErrorMessage`). Maps the gate/network/parse cases to short strings; un-matched messages truncate to ~200 chars.
- **Change permissions or extension wiring**: `manifest.json`.
- **Change Pro auth / plan gating / pricing / resume sync**: `src/cloud-sync.js` (then `npm run build:clerk`), `options.js` (account card + auto-sync), `background.js` (`CHECK_PRO_ACCESS`), `tracker.js` (`checkAccess`), `popup.js` (`checkProAccess`).
- **Change Convex schema or functions**: `convex/schema.ts`, `convex/resumes.ts`, `convex/auth.config.ts` (then `npx convex dev`).

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

- **PDFs save through `chrome.downloads`, not `doc.save()`.** jsPDF's `doc.save()` is a synthetic anchor click: only the first download in a popup session inherits the user gesture, and later ones (cover letter, second file) get treated as automatic downloads and silently dropped. Use `savePdfDocument(doc, filename)` in `popup.js` (`window.PocketResumeSavePdf`, used by `resume-renderers.js` too). Keep the anchor fallback for contexts without the `downloads` permission.
- **The engine never rewrites wording.** `resume-align.js` only selects, reorders, trims, and fixes banned openers; if you add a transformation that authors new text you lose the "no invented facts" guarantee and the verifier's number check. `npm run test:align` must stay green.
- **`GENERATE` needs `jsonContent` and a confirmed parse.** Do not bypass `parseReview`; a wrong parse silently ships a wrong PDF.
- **Weekly lexicon updates need the optional `https://www.onetcenter.org/*` permission.** A service worker cannot prompt; the options page must request it first. Without it the alarm update exits quietly and keeps the bundled/cached copy.
- **Access is gated by a page-published snapshot.** The worker cannot read a Clerk session; any new gated message must call `getGenerationAccess()` and let pages publish `proAccessCache`.
- **Skill lexicon storage is ~1 MB.** `chrome.storage.local` defaults to 10 MB; keep the compact row format (`compactLexicon`) rather than storing expanded objects per term.
- **`jsonContent` is the only input the engine accepts.** There is no raw-text generation fallback anymore; if a resume has only `content`, it must be parsed and saved in Settings first.
- **Generation requires a signed-in session.** Hard block, no offline grace: if the snapshot is stale or missing, the worker denies and the popup shows `#signinCard`.
- **Manifest `key` field is intentionally absent.** Chrome assigns a fresh extension ID on first load. Do not re-add it (it would lock all contributors to one ID).
- **`host_permissions`** in `manifest.json` covers Clerk + Convex only. Update both the manifest and this file if you add a new backend.
- **Chrome extension service workers can be killed** between messages. Do not store in-memory state across calls — read from `chrome.storage.local` each time.
- **Content script CSP**: avoid inline scripts / eval in `content.js`. The page's CSP applies.
- **Client-rendered job boards need the JSON-LD path.** Sites like `careers.atb.com` serve a 650-character shell at `domcontentloaded` ("We didn't find any …") and hydrate the posting a moment later; the only lexicon word in that shell is a footer link (`LinkedIn`). `content.js` waits up to 4 s for the body to fill in, and `background.js` merges `JobPosting.description` from the schema.org block, which is present in the initial HTML. Never rely on `document.body.innerText` alone for a JD.
- **Do not commit** `cloud-sync.js` / `cloud-sync-core.js` (build artifacts), `convex/_generated/`, or anything from `.env.local`. See `.gitignore`.

## Privacy posture

PocketResume is privacy-first by default. See `privacy-policy.md` for the full policy. The Chrome extension:

- Stores resumes locally in `chrome.storage.local`; cloud sync is opt-in via a free PocketResume account and only talks to the user's own Convex backend
- Makes no third-party AI requests; generation is local
- Sends nothing to Clerk/Convex unless you sign in, and then only resumes you sync
