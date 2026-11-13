# AGENTS.md

This file provides guidance to AI coding agents and human contributors when working on this repository. It is intentionally public so contributors and AI tools can share a common operating manual.

## What this repo is

PocketResume is a **Chrome Extension (Manifest V3)** built with **vanilla HTML/CSS/JS**. No bundler / build pipeline for app code; the only build step is `esbuild` for the Pro (Clerk) bundle. Edit source files, reload the unpacked extension in Chrome.

Key runtime entrypoints (declared in `manifest.json`):

- **Background service worker**: `background.js` — deterministic pipeline + generation gate
- **Content script**: `content.js` — extracts page text from the active tab
- **Side panel UI**: `sidebar.html` + `sidebar.js` — user actions + PDF generation for PocketResume layouts
- **Feature tour video**: `feature-video.js` / `feature-video.css` (player) + `scripts/capture-tour.mjs` / `assets/tour/` (frames) — scripted cursor-follow walkthrough, panel-only
- **Options page**: `options.html` + `options.js` — resume form + cover letter + account + toggles
- **Resume renderers**: `resume-renderers.js` — Double Sided and Academic CV PDF layouts
- **Generated PDF store**: `pdf-store.js` — the side panel's file shelf (local storage, eviction rules)
- **Pro (optional)**: `src/cloud-sync.js` (source) → `cloud-sync.js` (options page, with Clerk UI) + `cloud-sync-core.js` (panel / tracker / worker, no UI) — both bundles gitignored — auth, plan gating, pricing, resume sync
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
| `cloud-sync-core.js`   | `false`        | `sidebar.html`, `tracker.html`, `background.js` | ~0.9 MB |

The UI build is the only place `@clerk/ui` is imported. **Keep that import inside `if (__CLERK_UI__)`** — a `HAS_CLERK_UI`-style const does not help, because esbuild resolves dynamic imports before its minifier folds the constant, so the whole UI ends up in both bundles. See `.env.example` and `package.json` → `scripts/build-clerk.mjs`.

```sh
cp .env.example .env.local
# fill in your own Clerk + Convex values
npm run build:clerk
```

### Update vendored jsPDF

`sidebar.html` loads jsPDF from `libs/jspdf.umd.min.js` (vendored). If you bump `jspdf`, copy the built artifact into `libs/`.

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
- **Side panel**: right-click inside the panel → Inspect (the panel keeps running while you edit)
- **Content Script**: target page's DevTools console

### Convex backend (optional)

```sh
npx convex dev
```

Requires `CONVEX_DEPLOYMENT` in `.env.local`. Generated code goes to `convex/_generated/` (gitignored).

### Tests / lint

`npm run test:align` (determinism, no-invented-numbers, parser fixtures, normalization), `npm run test:render` (Double Sided one-page fit, no text below the page margin, Academic CV pagination + footer, no duplicated projects), `npm run test:formfill` (form filler matchers and the resume → profile map), `npm run test:pdfstore` (file shelf URL keys and eviction rules) and `npm run test:feedback` (feedback validation, payload, error mapping) are the automated checks. No linter. Otherwise: load unpacked, generate with a real account, inspect the PDF + the service worker console.

### Versioning & changelog

**On every `manifest.json` version bump, you MUST also update `CHANGELOG.md`** and the side panel "What's New" announcement:

1. Bump `manifest.json` → `version`.
2. Add a new top entry to `CHANGELOG.md` (`## [X.Y] — YYYY-MM-DD`) summarizing the change under Added / Changed / Fixed / Removed. Newest first.
3. Update the side panel "What's New" modal: `ANNOUNCEMENT_VERSION` + `ANNOUNCEMENT_SEEN_VALUE` in `sidebar.js` and the modal copy in `sidebar.html` (`#whatsNewModal`). The modal shows once per version.
4. Build the store zip: `npm run build:clerk` first (if `src/cloud-sync.js` changed), then `npm run build:zip` to write `dist/pocketresume-vX.Y.zip` from the runtime file list — see "Store build" below.

### Store build (zip)

Chrome Web Store upload = a zip with `manifest.json` at the root and **only runtime files**. Include:

`manifest.json`, `background.js`, `content.js`, `form-filler.js`, `form-profile.js`, `feedback.js`, `sidebar.html`, `sidebar.js`, `pdf-store.js`, `options.html`, `options.js`, `tracker.html`, `tracker.js`, `resume-renderers.js`, `resume-align.js`, `resume-parse.js`, `resume-health.js`, `resume-letter.js`, `skill-lexicon.js`, `feature-video.js`, `feature-video.css`, `cloud-sync.js`, `cloud-sync-core.js`, `icon.png`, `libs/` (jsPDF, ldrs loader, animations, skills lexicon), `assets/tour/`.

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
7. **The parser card is conditional** (v10.9). `renderTabContent` only emits the paste card (`#rfPasteInput` / `#rfParseBtn`) when the draft is empty — `draftHasContent(profile)` in `options.js` treats name, subtitle, email, phone, location, summary, links, skills, experience, projects, education or certifications as content. With content present, the card is replaced by a `#rfShowPaste` link ("Paste / import an existing resume") that sets the module-level `pasteRevealed` flag and re-renders. Parsing resets the flag, so the card hides again once the form is filled. Switching or adding a resume tab resets it too. The setup tour targets `#rfPasteInput` / `#rfParseBtn`, so `renderTourStep` force-reveals the card when those steps are reached (`PASTE_TOUR_TARGETS`) — otherwise the step is silently skipped.

### Generation pipeline (main user flow, v10.0 — deterministic)

1. **User clicks Generate** in the side panel (`sidebar.js` → `runGeneration('resume' | 'cover-letter')`).
2. `refreshGate()` resolves `{ state: 'signin' | 'setup' | 'review' | 'plan' | 'ready' }` from `checkProAccess()` + stored resumes; non-ready states show `#signinCard` / `#setupCard` / `#reviewCard` / `#planLockCard` and stop the run.
3. Panel sends `chrome.runtime.sendMessage({ type: 'GENERATE', payload: { tabId, resumeStyle, resumeId, output } })`.
4. **Background** (`background.js`, no provider layer):
   - `getGenerationAccess()` reads the page-published `proAccessCache` snapshot and allows only `signedIn && (withinWindow || isPro)`.
   - Requires `resumes[].jsonContent`; blocks with `review_required` while `parseReview && !parseConfirmedAt`.
   - Requests page content from the content script (`GET_PAGE_CONTENT`), injecting `content.js` if needed.
   - `parseJobPosting(...)` → `alignResumeJson(profile, jd, { lexicon, styleConfig })`.
   - When `output !== 'resume'`, builds the letter from the selected resume's `coverLetter` (legacy fallback: `universalCoverLetter`) via `buildCoverLetterFromTemplate(...)`.
   - Replies `{ status: 'success', data, coverLetterData, coverLetterStatus, report, jobMeta, pageUrl }`. `pageUrl` comes from the content script (`GET_PAGE_CONTENT` / `GET_PAGE_URL`), not from `tab.url` — the panel does not hold the `tabs` permission, so the URL is read from the page itself.
5. Panel parses `data`, then opens the **job details review** (below), then calls `saveApplicationToTracker(...)`, then renders the PDF (`generatePDF` / `resume-renderers.js`) unless `output === 'cover-letter'`, and the letter when requested. Both are stored in the **file shelf** (see below); they are only written to disk when the *Download too* toggle is on.
6. Errors/statuses (`signin_required`, `plan_required`, `review_required`, `needs_resume`, `needs_json`) re-render the gate cards; everything else goes through `setError` → `#errorModal`.

### Job details review (v10.10)

After the align finishes and **before** anything is written to disk, the side panel opens `#jdReviewModal` with the JD fields it extracted: job title, company, location, recipient (`sidebar.js` → `showJdReview(jobMeta, report)`). The dialog is editable, so a wrong company can be fixed on the fly.

- **Four editable inputs**: `#jdTitleInput`, `#jdCompanyInput`, `#jdLocationInput`, `#jdRecipientInput`. `#jdKeywordChips` shows the keywords matched from the posting read-only (`report.matched`), with the skills added to the resume marked `+` (`report.skillsAdded`, `report.skillsAddedUnverified`).
- **30-second auto-save**: the countdown starts when the dialog opens. The first keystroke in any field **stops the timer completely** (`stopTimerOnEdit`), so an edit is never overwritten. On timeout the dialog saves with whatever is in the fields. Cancel / Esc / backdrop resolves `null` → the run aborts: no PDF, no tracker entry.
- **Edits flow downstream**: `applyJdOverrides(resumeData, values, previousMeta)` patches `position` + `subtitle` (title), `company`, `location` (+ the contact line, via `swapContactLocation`), and `recruiterName` on the aligned resume, so the PDF header, the contact line and the tracker entry all use the corrected values. An emptied field only clears the resume when it still holds the previously extracted value, so the user's own headline is never wiped.
- **Cover letter re-render**: the letter is rebuilt through the existing `BUILD_COVER_LETTER` background message with `{ company, role, recipientName, applicantName, applicantContact }` — the template logic stays in `resume-align.js` (`buildCoverLetterFromTemplate`), never duplicated in the side panel. If the rebuild fails, the original letter is kept.
- **Order inside the loops**: the review runs inside the `playResumeLoop` / `playCoverLetterLoop` callback, before `renderResumePdf` / `generateCoverLetterPDF`. The status channel stays `generating` while the dialog is open and flips to `success` only after the file is saved.
- **Opt out**: `jdReviewDisabled` (boolean, default false). The dialog's *Don't ask again* checkbox sets it; Settings → Interface → *Review extracted job details* writes `jdReviewDisabled: !checked` and brings it back.
- **Remembered corrections (v10.10.1)**: `jdCorrections` maps a **posting URL key** to the fields the user edited there: `{ "<urlKey>": { title?, company?, location?, recruiterName?, updatedAt } }`. The key is `origin + path + query` with tracking params stripped (`utm_*`, `gh_src`, `ref`, `source`, `fbclid`, `gclid`) and the hash dropped (`jdUrlKey` in `sidebar.js`). Only edited fields are stored, so untouched fields keep coming from the live extraction. `saveJdCorrections(url, extracted, values)` measures the delta against the **fresh extraction** (not against the pre-filled values), so a carried-over correction is never dropped as "unchanged"; an empty delta deletes the entry. Capped at the 10 most recent postings. `maybeShowJdReview(jobMeta, report, url)` merges the corrections over the extraction (`mergeJdCorrections`) and pre-fills the dialog with the result; the `changed` flag still compares against the fresh extraction, so a carried-over fix re-renders the letter and patches the resume. With the dialog disabled the merged values are still returned and applied, so the correction reaches the PDF even when no dialog opens.

### Side panel + file shelf (v10.12)

The popup became a **Chrome side panel** (`chrome.sidePanel`). `manifest.json` declares `"sidePanel"` + `"side_panel": { "default_path": "sidebar.html" }` and **no** `action.default_popup`; `background.js` calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` on install/startup so the toolbar button opens the panel. `popup.html` / `popup.js` were renamed to `sidebar.html` / `sidebar.js` (git history keeps the rename). `minimum_chrome_version` is **114**.

Layout: `.shell` is a flex column — sticky header, `.main-scroll` (the only scrolling region), pinned `.app-footer` with the delete zone. The panel width is user-controlled (roughly 320–600 px), so no fixed pixel width may come back; the `@media (max-width: 370px)` block floats the NEW badges and shrinks the row labels so nothing truncates at the narrowest width.

Panel order (top → bottom): style picker → Generate Resume → Generate Cover Letter → JD match line → **Settings / Quick Download** → **Tracker / Fill Form** → Form Filler cards → **Files** (the shelf, under the four buttons) → pinned delete zone. Keep the shelf under the nav rows: it sits directly above its drop target, so a card is dragged a short distance.

**Generated PDFs live in the panel, not in Downloads.**

- `pdf-store.js` (ESM module, also exposes `window.PocketResumePdfStore`) owns the shelf. Storage key `generatedPdfs` = `{ version, urlKey, url, title, company, items: [{ id, kind: 'resume' | 'cover-letter', filename, mime, size, dataUrl, createdAt }] }` in `chrome.storage.local` (base64 data URL; the manifest carries `unlimitedStorage`).
- `savePdfDocument(doc, filename, meta)` in `sidebar.js` is the single write path (also `window.PocketResumeSavePdf`, used by `resume-renderers.js`). It stores the blob, optionally downloads it (see below) and re-renders the shelf. `downloadPdfDocument(doc, filename)` is the old `chrome.downloads` path, used by *Quick Download* and by the *Download too* toggle.
- **Eviction rule** (`planStore` in `pdf-store.js`): the shelf holds **one posting at a time**. Same posting URL → only the same kind is replaced (a new resume replaces the old resume, the letter stays). Different posting URL → the whole previous set is dropped and the new file is stored. The URL key is `origin + path + query` with tracking params stripped (`normalizeUrlKey`), the same rule as `jdUrlKey`.
- **A new posting never inherits the old label** (`savePdf` in `pdf-store.js`): when the posting changes, `url` / `title` / `company` come from the new file only. An empty title or company means *unknown*, never *the company from the last posting* — otherwise the shelf keeps naming the previous job.
- **The shelf title** (`#filesTitle` in `sidebar.html`) shows `company · title` for the posting the files belong to. `setFilesTitle()` in `sidebar.js` **typewrites** it whenever it changes, with a blinking caret (`#filesCaret`); `filesTitleValue` guards against re-animating on every render. `#filesHint` carries the status line under it ("Drag a file onto the page to attach it." / "Not this page — these files belong to the posting above.").
- **Swap feedback**: when the posting changes, `renderFiles()` sets `.replaced` on `#filesList` (the cards animate in with `fileCardIn`, staggered), the title flashes (`filesTitleSwap`), and the hint shows "Replaced the files from the previous posting." for 4 s. `filesSeen` keeps the first paint of a panel session from counting as a swap.
- **Drag out**: each card is `draggable`; `dragstart` puts a real `File` on the data transfer (`dataTransfer.items.add(file)`) so it drops into a page's file input, plus a private `application/x-pocketresume-file` id for the panel's own drop target.
- **Delete zone**: `#dropZone` in the pinned footer. Dragging a card onto it removes the file from storage. Every card also has a `×` button, and the section has a *Clear* button.
- **Download too**: `downloadOnGenerate` (boolean, default false). The toggle sits next to the file list and in Settings → Interface → *Also download the PDF*. When true, generation writes the PDF to disk **and** keeps it in the panel.
- `GET_ACTIVE_PAGE` (background) returns the active tab's URL from the content script, so the panel can flag files that belong to another posting without the `tabs` permission.

Tests: `npm run test:pdfstore` (`scripts/test-pdfstore.mjs`) covers the URL key, the eviction rules, and the no-inherited-label rule.

### Side panel status channels (v10.9)

The side panel runs **three independent** status channels, each a body attribute that drives the glow layer in `sidebar.html`:

| attribute | writer | states |
| --- | --- | --- |
| `body[data-status]` | `setStatus()` (resume path) | `idle` / `generating` / `success` / `failure` |
| `body[data-fill-status]` | `setFillStatus()` (form filler) | `filling` / `fill-success` / `fill-failure` |
| `body[data-letter-status]` | `setLetterStatus()` (cover letter) | `generating` / `success` / `failure` |

**Every channel needs its own CSS rules.** `sidebar.html` maps each attribute to `--glow-c` / `--line-c` / `--wash-o` and to the `glowPulse` / `glowSettle` / `linePulse` animations plus the `.glow-bloom` / `.glow-line` opacity. A new channel that writes only the attribute gets no glow at all — that is how the cover letter path used to lose its green glow. Keep the three channels separate so a resume run and a letter run never fight over the same colors.

The options page has its own, simpler channel: `showStatus(text, type, autoHideMs, { blocking })` sets `body[data-status]` to `loading` / `success` / `error` and drives `body::before`. `blocking: true` (the default) dims and freezes the page behind the overlay; pass `{ blocking: false }` for long provider calls that should not lock the page.

### Onboarding flow (v10.0)

1. Signed-out users see `#signinCard` (Create account / Sign in). Both buttons write `openAuth` and open Settings — the side panel bundle has no Clerk UI, so calling `signIn()`/`signUp()` there only throws. Editing stays available in Settings, generation is blocked.
2. Signed-in users without a built resume see `#setupCard`: account → build resume → cover letter → save, plus the "free until Dec 31" plan note.
3. The options spotlight tour (`TOUR_STEPS`) walks: account → paste → parse → cover letter → save.
4. "Setup complete" card still appears once (`onboardingCompleted`) with the feature-tour offer.

### Animations toggle (v10.3)

`animationsEnabled` (Settings → Interface, default true) controls motion everywhere. Page realms toggle `html.no-motion`, which zeroes CSS animations/transitions and hover lifts. `sidebar.js` also gates its JS: `motionOn()` makes `startScramble` static and turns `playResumeLoop` / `playCoverLetterLoop` into immediate `done()` calls, so generation saves instantly with no artificial delay. The Resume health check loader is a webp background image and never routes through the gate, so it keeps animating on purpose (it waits on a remote model).

### Feature tour video (hidden in v10.0)

Frames were captured against the old BYOK UI and the entry points (`#featureVideoBtn`, setup-card offer) are removed until `npm run build:tour` is re-run against the new side panel/options UI. `feature-video.js`, `assets/tour/`, and the capture script remain in the repo.

### Resume Health Check (Beta)

Opt-in rule-based checker in the Settings sidebar (`#resumeHealthDetails` → `#healthPanel`). Sends redacted `jsonContent` to a hardcoded provider chain — **Pollinations** (`https://text.pollinations.ai/openai`, no key, `reasoning_effort: low`) first, then local **Ollama** (`http://localhost:11434/v1/chat/completions`, model `llama3.2`). Endpoints, model, and fallback order are constants in `resume-health.js` — there is no provider UI and nothing user-editable. Enabling the check is the only consent step; it requests the `http://localhost:11434/*` optional origin for the fallback. Failures on the first provider fall through automatically (each provider gets its own 60 s timeout). Results are stored per resume as `healthReport` (`baseScore` + live `score`, `provider`, `providerLabel`, `model`, `issues[]` with `status: 'fixed'` tracking). Marking an issue fixed bumps the score locally (critical +8, warning +5, suggestion +3, capped at 100) and hides it; fixed issues never re-render. A re-check is blocked while any issue is open — the button says "Mark the remaining issues fixed" and no request goes out — and only unlocks when all issues are fixed (or the report went stale because the resume was edited). `resume.healthCooldownUntil` enforces a persisted 60 s cooldown per resume across reloads. No sign-in required.

### Feedback box (v10.13.0)

Settings → **Feedback** (`#feedbackDetails` in `options.html`) takes an email address and a message and sends them to the developer. No sign-in required, no plan check, and **nothing is written to `chrome.storage.local`** — the message is not persisted locally.

Path:

1. `feedback.js` (runtime ESM module) — `validateFeedback` → `buildFeedbackPayload` → `sendFeedback`. `mountFeedbackForm()` wires the Settings form: prefill from `applicationProfile.email`, else from the Clerk account when signed in, submit handler, status line, honeypot field, mailto fallback.
2. `CloudSync.sendFeedback(payload)` in `src/cloud-sync.js` → a **separate `ConvexHttpClient` with no auth** (feedback must work signed out, and must never wait on Clerk) → `client.action('feedback:submit', …)`.
3. `convex/feedback.ts` — the public `submit` action: honeypot check, email/message validation, rate limits, stores the row, then emails it through **Resend**.

Rules that matter:

- **The backend owns the inbox.** `convex/feedback.ts` stores every accepted message in the `feedback` table **and** emails it. The mail is a copy, not the source of truth — if Resend is down, the row is still there.
- **Actions have no `ctx.db`.** Convex actions cannot touch the database directly. `submit` reads the counts through `ctx.runQuery(internal.feedback.recentCount, …)` and writes through `ctx.runMutation(internal.feedback.store, …)` / `internal.feedback.markEmailed`. Those helpers must be **exported** for `internal.feedback.*` to resolve.
- **Internal helpers stay internal.** `recentCount`, `store` and `markEmailed` are `internalQuery` / `internalMutation` so a client cannot insert rows or read the table directly.
- **Abuse controls**: a hidden honeypot input (`#feedbackCompany`, off-screen — never `display: none`), 3 messages per email per hour, 20 messages per hour in total. Exceeding a limit throws `rate_limited`, which the UI maps to a friendly message.
- **What is sent**: the email, the message, the extension version and the browser user agent, plus the **page URL only if the user ticks *Include the page I'm on***. Never resume content, job-posting text, or page content.
- **No new permission.** `https://*.convex.cloud/*` is already a host permission, and the same deployment URL is reused, so `manifest.json` does not change. No `CONVEX_SITE_URL`, no new build-time env var.
- **Owner setup** (server side, never in the bundle): `npx convex env set RESEND_API_KEY re_…`, `npx convex env set FEEDBACK_TO_EMAIL you@example.com`, optional `FEEDBACK_FROM_EMAIL` (defaults to `onboarding@resend.dev`, which Resend only allows to send to the account's own address), then `npx convex deploy`.
- **Fallback**: if the backend is unreachable or not configured, the form offers a prefilled `mailto:` to the owner address (`FEEDBACK_OWNER_EMAIL` in `feedback.js`).

Tests: `npm run test:feedback` (`scripts/test-feedback.mjs`) covers validation, payload build, error mapping and the mailto fallback.

### Skill directory (v9.1, silent daily refresh in v10.8)

- `skill-lexicon.js` parses O*NET CSVs (public, CC BY 4.0): `software_skills.csv` (31k rows → tool names with Hot/In-Demand flags), `essential_skills.csv`, `transferable_skills.csv`, merged with `CURATED_ALIASES`. `AMBIGUOUS_SKILL_KEYS` lists the entries whose spelling is also ordinary English (or a common product noun) so the aligner can demand case evidence. See `NOTICE`.
- Baseline snapshot: `libs/skills-lexicon.js` (`npm run build:lexicon`, ~8k terms, committed). Runtime updates go to `chrome.storage.local` as compact rows (`skillLexicon`) + `skillLexiconMeta`.
- Updates: `chrome.alarms` (`skillLexiconDaily`, 24 h) plus `onStartup`/`onInstalled` and the silent `ENSURE_SKILL_LEXICON` message that `options.js` / `sidebar.js` send on boot; runs when the stored copy is older than 24 h, resolves the current O*NET release, and only re-downloads the CSVs when the release changed. `https://www.onetcenter.org/*` is a required host permission, so there is no toggle, no prompt, and no manual Update button. Failures keep the last good copy and record `lastError` in `skillLexiconMeta` (not surfaced in the UI). No plan check.

### Cover letter per resume (v10.5, gated in v10.6)

Settings → **Cover letter** edits the **active resume tab's** letter (`resume.coverLetter = { greeting, body, signOff, updatedAt }`). The editor lives in the left panel, so switching resume tabs reloads it; pending edits flush before the switch. Under the hood, the dropdown writes to `resumes[activeTabIndex]`, bumps `updatedAt`, and auto-syncs.

Two write paths:

- **Generate letter** — sends `BUILD_AI_COVER_LETTER` (`{ resumeId }`) to the background, which calls `generateCoverLetterBody(jsonContent)` in `resume-letter.js`. Same provider chain as Resume Health: Pollinations (`https://text.pollinations.ai/openai`, no key, `reasoning_effort: low`) first, local Ollama (`http://localhost:11434/v1/chat/completions`, `llama3.2`) as the fallback. Contact details are redacted with `redactProfile`. Prompt asks for a general body only: 120–160 words, 3 short paragraphs, no greeting/date/sign-off, `{{company}}` and `{{role}}` kept for generation-time fill, no invented facts. The previous letter is kept if every provider fails. The write can take up to 60 s per provider, so `runGenerateCoverLetter` opens a non-blocking `loading` status (blue glow + spinner) before the request and replaces it with the green success or red error status afterwards.
- **Copy prompt** — copies the same body-only authoring prompt for an external assistant. Never gated.

**The gate (v10.6).** The background is the only writer of `resume.coverLetterCooldownUntil` (`COVER_LETTER_COOLDOWN_MS` = 60 s, exported from `resume-letter.js`). It refuses a request while the field is in the future (`{ status: 'rate_limited', retryAfterMs, cooldownUntil }`), sets it before calling a provider, and extends it to the provider's `Retry-After` on 402 or 60 s on 429 (capped at 15 min). Every reply carries `cooldownUntil`, so the options page just mirrors it — it never writes the cooldown before sending, or the worker could not tell a spam click from the in-flight request. The button shows `Wait Ns` with a 1 s countdown and a note; the value persists across reloads because it is stored with the resume. It is **local-only** — the Convex payload is explicit (`label`/`content`/`jsonContent`/`coverLetter`), so it never syncs. `runGenerateCoverLetter` also asks for `confirm()` before replacing a non-empty body.

The side panel's **Generate Cover Letter** sends `GENERATE` with `output: 'cover-letter'`; background renders the selected resume's letter through `buildCoverLetterFromTemplate(...)` into the shape `generateCoverLetterPDF` expects. That path is template-only, so it is not gated and makes no network call. A generated resume is never discarded because the letter failed. `openCoverLetterSection: { resumeId }` deep-links Settings to that resume's editor. The side panel reports the run through `setLetterStatus()` (`body[data-letter-status]`), which drives the same blue pulse / green settle / red failure glow as the resume channel — see "Side panel status channels" above.

### Form filler setup (Application Questions, v10.11)

The Form Filler is **live** again as of 10.11.0 and it is **deterministic**: no AI, no network, no provider call anywhere in the fill path. It fills only from answers the user saved once, and it never invents an answer.

1. **Questionnaire**: Options page → "Form filler" section (`#appProfileDetails`, left panel). Groups: Basics (first/last name, email, phone), Location (street, apt, city, state, postal code, country), Work eligibility (authorized / sponsorship / 18+ / relocate / remote preference — Yes/No selects), Preferences (salary amount + currency + period, start date, years of experience), Links (LinkedIn, portfolio, GitHub), opt-in **EEO self-identification** (gender, race, hispanic/Latino, veteran, disability — only used when a form asks; local only), and **Custom Q&A** (free-form question/answer rows matched by question text). The `appProfileStatePill` shows "Ready" / "Not set up".
2. **"Auto-fill from my resume"**: fully local. `handleProfileAutofill` in `options.js` parses the active resume (`jsonContent`, fallback `content`) and calls `profileFromResume(...)` from `form-profile.js` — a deterministic map of the resume onto the profile shape (name split on the last word, contact, `City, ST, Country` → city/state/country, links routed by domain, years of experience from the earliest start). It fills **empty inputs only**. It never derives work authorization, EEO, salary, street address or start date — those stay manual. The old `PROFILE_AUTOFILL` background message and its provider call are **gone**.
3. **Persistence**: saved as `applicationProfile` via the global Save Settings button. Completion = non-empty `firstName` + `lastName`.
4. **Entry points**: the side panel `#fillProfileCard` and the section's "Guide me" button all set `appProfileOnboarding: { active: true }` and open the options page; options consumes the flag and starts the **profile spotlight tour** (`PROFILE_TOUR_STEPS`, `tourOpenAt(step, 'profile')`). Saved answers keep working if the tour is skipped.
5. **Fill gating**: Form Filler is a **Pro feature**. The side panel calls its own `checkProAccess()` first and shows `#fillProCard` when denied ("Create a free account" while the promo runs, else "See Pro plans"), then `#fillProfileCard` when `applicationProfile` is incomplete. The background re-checks with `getGenerationAccess()` on `FILL_APPLICATION_FORM` (same rule as generation: `signedIn && (withinWindow || isPro)`) and replies `{ status: 'signin_required' | 'plan_required' | 'profile_incomplete' }`, so the gate can't be bypassed. Generation flow is unaffected.

### Form filler flow

1. User clicks "Fill Form" in the side panel (next to the Job Tracker button). Panel checks Pro access, then `applicationProfile` completeness, then sends `FILL_APPLICATION_FORM` with `{ tabId }`.
2. Background re-checks `getGenerationAccess()`, reads `applicationProfile` from `chrome.storage.local`, and replies `profile_incomplete` when the name is missing.
3. Background injects `form-filler.js` into all frames via `chrome.scripting.executeScript` (per-frame failures are caught and skipped — sandboxed iframes are simply not filled), then runs `__PocketResumeForm.detect(30)` per frame and merges the results. Field ids are frame-token prefixed (`pf<token>-<n>`), so a frame only ever fills its own fields.
4. **Saved-answers-only resolution**: `resolveFormAnswers(fields, applicationProfile)` in `form-profile.js`. Tier 1: canonical label matchers → `applicationProfile` values (name split, address, salary formatting by field type incl. hourly conversion, yes/no, EEO gated by `eeoOptIn`). Tier 2: `customQA` match (normalized equality, containment, Jaccard ≥ 0.85). Select/radio/checkbox-group answers must match one of the field's options, else the field stays unanswered. **A field with no matching answer is never guessed** — it is left empty and flagged.
5. Answers run through `normalizeFormAnswers` (id shape validation + dedupe) and the per-field `maxLength` trim, then `__PocketResumeForm.fill(...)` per frame (native value setters + `input`/`change` events for React/Vue compatibility). Checkbox groups: only matching options are checked, never unchecked; already-ticked groups are skipped entirely.
6. Unanswered ids go to `__PocketResumeForm.flag(ids)` → a dashed amber outline (`data-pocketresume-flag` + `.pr-flag`) on exactly those fields. Nothing is typed into them. `unflag()` clears the marks.
7. Background toasts on the page's main frame (`"Filled 8 of 11 fields (8 from saved answers). 3 need you."`), replies `{ status: 'success', filled, total, cached, unresolved: [{ id, question, tag }] }`, and logs `[FormFill] Filled 8 of 11 fields. (8 saved, 3 need you)`.
8. The side panel shows **how many** fields still need you (`#fillManualCount`) and puts `Filled X/Y` on the button — the per-question list and the *Copy questions* button are gone; the unanswered fields are still marked on the page. Errors go through `setError(message, 'fill')`, which lights the fill channel only. The side panel background glows via `body[data-fill-status]`: `filling` (amber pulse) → `fill-success` (green, auto-reverts after 4s) or `fill-failure` (red, persists until the next Fill/Generate click). Kept separate from `body[data-status]` so the two flows never fight over the glow.

The page toast is the primary feedback: the in-page toast and the amber outlines are what the user actually sees while the side panel stays open next to the page.

Safety rules (enforced in `form-filler.js`): never submits the form, never overwrites already-filled fields, never unchecks anything the user already ticked, checkbox/consent widgets with consent-style labels (consent/agree/terms/privacy/newsletter/marketing/subscribe/opt-in/gdpr/cookies) are never touched, skips hidden/disabled/readonly/captcha/search fields, caps at 30 fields. Known gap: custom div widgets (`[role="checkbox"]`/`[role="radio"]` without real inputs, legacy Workday) are not detected.

Tests: `npm run test:formfill` (`scripts/test-formfill.mjs`) covers matcher order, option matching, salary conversion, the EEO gate, custom Q&A matching, `maxLength` trimming, answer validation, determinism, and the resume → profile mapping.

### Quick Download flow (v9.0)

1. User clicks `#quickDownloadBtn` (panel button paired with Settings in the same `.list-row-pair` row). It runs `refreshGate()` first: signed-out, unbuilt, unconfirmed, or plan-locked states show their card instead of downloading.
2. The side panel reads `{ resumes, selectedResumeId, userProfile }` from `chrome.storage.local`, resolves the selected resume (legacy `userProfile` fallback), and takes `resume.jsonContent` — the same schema the Settings form writes and `generatePDF` consumes. Markdown fences are stripped before `JSON.parse`.
3. It calls `generatePDF(resumeData, 'professional')` directly in the side panel. **No background round-trip, no cover letter** — the style is always the professional PocketResume layout, regardless of the side panel's style selector.
4. Error paths go through `setError` (red glow + `?` → error modal with **Open Settings**): no built resume, an unconfirmed parse, or unreadable JSON. `refreshGate()` runs first and shows the matching card instead.
5. The What's New modal's primary button (`#whatsNewPlansBtn`) dismisses the modal and opens the options page (it triggered Quick Download in v9.0 and the Form Filler setup in v10.11; since v10.12 it opens Settings for the new panel and shelf); Quick Download's "New" badge (`#quickDownloadNewBadge`) is removed on first hover/focus and persisted via `quickDownloadNewBadgeDismissed`, matching the Tracker/Fill Form badges.
6. Layout note: all four bottom buttons (Settings, Quick Download, Tracker, Fill Form) stay identical at **166×43px** — `.list-row-pair .list-row` carries `flex: 1` + `min-height: 43px` so the badge-bearing rows (43px) and the badge-less rows (41px) line up. "Quick Download" cannot fit next to its NEW badge in a 166px button, so while the badge is on screen the button carries `.has-badge`: label drops to **10px**, icon to 15px, row gap to 4px, and the badge shrinks to 7.5px. `sidebar.js` adds/removes `.has-badge` alongside the badge itself, so the first hover restores the full **13px** label in the same 200ms `font-size` transition that fades the badge.

## Resume styles & layout mapping

Configured by `getResumeStyleConfig(...)` in `background.js`:

| UI Style     | layout       | PDF Renderer                                     |
| ------------ | ------------ | ------------------------------------------------ |
| professional | pocketresume | `sidebar.js` → `generatePDF`                       |
| deedy        | deedy        | `resume-renderers.js` → `renderDeedyLayout`      |
| academic-cv  | academic-cv  | `resume-renderers.js` → `renderAcademicCvLayout` |

There are three layouts. The old `faang` id was removed in 10.7.0; a stored `resumeType: "faang"` normalizes to `professional` (same `pocketresume` renderer) and is rewritten on the next panel load.

Double Sided is a **one-page** layout: `renderDeedyLayout` measures every block, tries progressively tighter spacing, shortens per-entry bullets, then trims the least important sections (Open Source → Awards → Publications → Certifications → Links → Projects → oldest roles). Nothing draws past the bottom margin, and the trims are reported in the side panel match line. Academic CV paginates with a per-page `Name - N` footer and never separates an entry header from its first bullet.

Bullet selection is deterministic in `alignResumeJson(...)` (`resume-align.js`): per entry it keeps the strongest 2–3 bullets (metric presence + JD keyword hits + strong action-verb opener + length), rewrites banned openers from a fixed table (`fixBulletOpener`), and trims long bullets at clause boundaries without dropping numbers (`trimBullet`). It never authors new text. `professional`/`deedy` keep up to 3 bullets per entry (120 / 130 chars); `academic-cv` keeps up to 5 (170 chars). The limits are keyed on `styleConfig.layout`, not a prompt style.

`alignSkills(...)` merges the JD's skill terms (any zone, including a plain `Skills:` / `Tech Stack:` / `Core Competencies` block) into `resume.skills`, but only terms the master resume already evidences (canonical name or alias, word-boundary matched). Homonym entries listed in `AMBIGUOUS_SKILL_KEYS` (`skill-lexicon.js`: `reduce` → `REDUCE`, `lean` → `Lean Manufacturing`, `excel` → `Microsoft Excel`, `sketch`, `spark`, `segment`, …) need case evidence instead of a plain case-insensitive hit: an all-caps occurrence, or a capitalized one that does not start a line or sentence. `caseEvidenced(...)` in `resume-align.js` applies that gate in `matchSkills`, `termPresent`, and `verifyAlignedResume`, so "reduce the backlog" adds nothing while a skills list entry `REDUCE` still matches. The list is deduped on lexical identity (`React`/`React.js`, `javascript`/`JAVASCRIPT`, `Apache Spark`/`Spark`), displays the lexicon canonical name for JD matches, caps at 10 additions / 30 total, and rewrites `skillGroups` (kept verbatim by the Deedy / Academic renderers) so the groups carry the same deduped set plus any JD addition. `verifyAlignedResume(...)` re-checks skills against canonical names and aliases, so an alias spelling (`k8s` → `Kubernetes`) survives verification while an invented skill still drops. The evidence gate is always lifted (the old `allowUnverifiedSkills` setting was removed in 10.8): `background.js` passes `allowUnverifiedSkills: true`, so unevidenced JD keywords are added anyway, exempted from the verifier's skill filter, and reported separately as `skillsAddedUnverified`. The side panel's match line marks them "from the posting (unverified)".

Cover letters are template-driven: `buildCoverLetterFromTemplate(...)` fills `{{company}}`, `{{role}}`, `{{recipient}}` and returns the shape `generateCoverLetterPDF` consumes. There is no tone-guide fork anymore.

The stored `"deedy"` value corresponds to the UI label "Double Sided" — renaming the value would break existing users' saved settings, so keep `"deedy"` as the internal id.

## Settings + persistence

Settings are stored in `chrome.storage.local`, managed in `options.js`.

Important keys:

- `resumes`: array of `{ id, label, icon, content, jsonContent, legacyContent, parseReview, parseConfirmedAt, lastRefineBackup, lastRefineAppliedAt, refineAnswers, updatedAt, coverLetter, coverLetterCooldownUntil }` (up to 3). `icon` is a local-only field (`''` = doc glyph) shown on the resume tabs and the side panel resume selector; it is not sent to Convex. `jsonContent` is canonical; `content`/`legacyContent` preserve the pasted text. `coverLetter: { greeting, body, signOff, updatedAt }` is the letter used by Generate Cover Letter for this resume (synced as a JSON string). `coverLetterCooldownUntil` (ms, local-only) is the 60 s gate on AI letter writing — see the cover-letter section. `parseReview: { warnings, parsedAt }` blocks generation until `parseConfirmedAt` is set. `updatedAt` (ms) drives cloud sync last-write-wins.
- `deletedResumeIds`: `[{ id, deletedAt }]` — delete tombstones so automatic cloud restore doesn't resurrect a locally deleted resume
- `selectedResumeId`: which resume is active in the side panel
- `cloudSyncStatus`: `"idle" | "syncing" | "synced" | "error"` (cloud sync indicator, written by `src/cloud-sync.js`)
- `resumeType`: `"professional" | "deedy" | "academic-cv"` (legacy `"faang"` is normalized to `"professional"`)
- `applicationProfile`: Form Filler answers — `{ firstName, lastName, email, phone, streetAddress, addressLine2, city, state, postalCode, country, salaryAmount, salaryCurrency, salaryPeriod, startDate, yearsExperience, workAuthorized, needsSponsorship, over18, willingToRelocate, remotePreference, linkedin, website, github, eeoOptIn, eeo: { gender, race, hispanicLatino, veteran, disability }, customQA: [{ id, question, answer }], updatedAt }`
- `appProfileOnboarding`: `{ active: boolean }` — trigger for the Form Filler setup spotlight tour (set by the side panel, consumed by the options page)
- `lastSeenAnnouncement`: last version whose What's New modal the user saw (`'10.12.0'` current)
- `parseConfirmedAt`: ms timestamp of the last parsed-resume confirmation
- `accessReminderLastShown`: `YYYY-MM-DD` — daily "free until Dec 31" reminder dismissal
- `featureVideoDeclined`: boolean — legacy flag (tour entry points are hidden in v10.0)
- `quickDownloadNewBadgeDismissed`: boolean — the Quick Download "New" badge is removed after the user's first hover/focus and never returns
- `resumeFitWarningHidden`: boolean — generation/Quick Download skip the "runs to 2 pages" prompt after **Never show this again**
- `trackerPlanCache`: `{ proAccess, isPro, promoActive, signedIn, trialDaysLeft, planPeriod, checkedAt }` — last Job Tracker access resolution, used for first paint / offline (ignored when `checkedAt` is older than 60 min)
- per resume: `healthReport` (`baseScore`, live `score`, `summary`, `issues[]` with `status`/`fixedAt`, `provider`, `providerLabel`, `model`, `checkedAt`), `healthEnabledLocal` (opt-in flag), `healthCooldownUntil` (ms; 60 s gate on re-checks), `fitNoticeDismissedAt` / `fitNoticeDismissedPages` (local-only; the Settings long-resume notice hides until the estimate exceeds the dismissed value)
- `universalCoverLetter`: legacy `{ greeting, body, signOff, updatedAt }`. Migrated into every resume that lacks `coverLetter` on the next Settings load and still read as the fallback by the side panel/background. New writes go to `resumes[].coverLetter`.
- `skillLexicon`: compact O*NET-derived vocabulary (`{ schema, source, version, fetchedAt, count, terms: [[name, category, hot, inDemand, aliases]] }`) — overrides the bundled baseline
- `skillLexiconMeta`: `{ source, version, fetchedAt, count, lastError }` — refresh status (silent; no UI)
- `pendingExtract`: boolean — legacy flag; the options page now focuses the paste box instead of running extraction
- `proAccessCache`: `{ signedIn, isFreeSubscriber, isPro, promoActive, withinWindow, canGenerate, cloudSyncAccess, proAccess, trialEndsAt, trialDaysLeft, planPeriod, hasSubscription, proSubscription, resolved, healthy, source, checkedAt }` — the **page-published access snapshot**. Written by `getAccessState()` in every page realm (options / panel / tracker) for *both* signed-in and signed-out resolutions; the service worker never writes it (it has no session to report) and never deletes it. Background `getGenerationAccess()` allows only `signedIn && (withinWindow || isPro)` from this snapshot while it is younger than 60 min, otherwise denies. A Clerk `addListener` in the pages rewrites it the moment a session starts or ends, so a session expiry cannot leave a stale "Pro" behind.
- `animationsEnabled`: boolean (default true) — Settings → Interface. When false, page realms set `html.no-motion` and the side panel skips the scramble and PDF delay, so generation is instant. The Resume health check keeps its loader.
- `jdReviewDisabled`: boolean (default false) — the job-details review dialog is skipped when true. Written by the dialog's *Don't ask again* checkbox and by Settings → Interface → *Review extracted job details*.
- `jdCorrections`: `{ "<urlKey>": { title?, company?, location?, recruiterName?, updatedAt } }` — the job details the user corrected, keyed by posting URL (tracking params stripped). Pre-fills the next review on the same posting; capped at 10 postings. See "Job details review".
- `generatedPdfs`: `{ version, urlKey, url, title, company, items: [{ id, kind, filename, mime, size, dataUrl, createdAt }] }` — the side panel's file shelf. One posting at a time; see "Side panel + file shelf".
- `downloadOnGenerate`: boolean (default false) — also save every generated PDF to the computer, not only keep it in the panel. Toggle in the panel's Files header and in Settings → Interface.
- `openAuth`: `'signIn' | 'signUp'` — set by the side panel sign-in card, consumed and cleared by `options.js`, which opens the full Clerk modal. The side panel bundle has no Clerk UI, so it must deep-link instead of calling `signIn()`/`signUp()`.
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

**Access window (`ACCESS_WINDOW` in `src/cloud-sync.js`)**: Nov 2 → Dec 31, 2026, local time. Any **signed-in** account can generate, use the tracker, and sync during the window. Signing out blocks generation (the side panel shows `#signinCard`). After the window, `canGenerate`/`proAccess`/`cloudSyncAccess` require a real Pro plan; existing cloud resumes stay stored (sync pauses, nothing is deleted), and the resume form, JSON export, and account controls stay available. A daily reminder banner appears from Dec 24. `promoActive` is kept as a backwards-compatible alias for `withinWindow` — do not reintroduce `trackerTrialStartedAt`/`trackerUnlocked`.

Access resolution lives in `src/cloud-sync.js`:
- `getAccessState()` → `{ signedIn, isFreeSubscriber, isPro, promoActive, withinWindow, canGenerate, cloudSyncAccess, proAccess, trialEndsAt, trialDaysLeft, planPeriod, hasSubscription, proSubscription, resolved, healthy }`
- `hasCloudSyncAccess()` = `withinWindow || isPro` (sync requires Pro after Dec 31)
- `hasProAccess()` = `withinWindow || isPro` (`proAccess` mirrors it for the tracker)

**Auth lives in page realms only.** clerk-js keeps its client token in an httpOnly cookie on Clerk's Frontend API domain, so only a page (options / panel / tracker) can hold and refresh a session — a service worker never can, and `@clerk/chrome-extension`'s background client does not fix that (it is a second, unrelated token store). The worker therefore holds **no Clerk client at all** (`initClerk()` returns early in the SW) and is told the plan by the pages through `proAccessCache`. Do not reintroduce a worker-side Clerk client or a worker-side `await import()` of Clerk: dynamic `import()` is not supported in extension service workers, and a second token store reads permanently signed-out and fails the Pro gate closed. Consequence to remember: Convex calls also cannot be authenticated from the worker, so resume sync must run in a page.

Architecture:

- `src/cloud-sync.js` — IIFE source, bundled by esbuild → `cloud-sync.js` (options page, with Clerk UI) and `cloud-sync-core.js` (panel / tracker / worker, no UI); both gitignored. Provides auth (`signIn`/`signUp`/`isSignedIn`/`getUserProfile`), plan checks (`hasCloudSyncAccess`/`hasProAccess`/`getAccessState`/`isPromoTrialActive`), the Clerk pricing table mount, and resume sync. It also reads the Clerk subscription (`billing.getSubscription`) for `trialEndsAt` / `trialDaysLeft` / `planPeriod`, and asks the Convex `billing:extendEarlyTrial` action to push a pre-Dec-31 subscriber's trial to Jan 7, 2027. `syncResumes()` is the bidirectional auto-sync: it reads local `resumes` + `deletedResumeIds`, pulls the cloud list, merges by last-write-wins on `updatedAt`, restores cloud-only resumes locally, pushes local-only/newer resumes, applies delete tombstones, and writes back only when the result changed (`label`, `content`, `jsonContent`, or `coverLetter` differ — prevents sync loops). `startAutoSync()` binds the `chrome.storage.onChanged` listener that debounces `syncResumes()` by 2s (page realms only). `getAccessState()` publishes the snapshot to `proAccessCache` (page realms only, both signed-in and signed-out), reloads the Clerk user first when the cached copy is over a minute old so dashboard metadata edits apply, and reports `healthy` (Clerk initialised *and* hydrated) alongside `resolved` — never treat "a client object exists" as resolved. A Clerk `addListener` rewrites the snapshot whenever a session starts or ends. `init()` is **memoized** (one shared in-flight promise, cleared on failure so a retry can happen): `initClerk()` assigns `clerkClient` *before* `load()` resolves, and Clerk only attaches its UI components during `load()`, so a second caller that grabbed the client mid-load used to fail `mountPricingTable` / `openSignIn` with "Clerk was not loaded with Ui components" — reproducible whenever the options page opens `#cloud-pricing` while its own startup is still loading Clerk. No caller may observe `clerkClient` before `await init()` settles. The UI must also be handed over as Clerk's **branded `ui` object** (`(await import('@clerk/ui/no-rhc')).ui`), not the module namespace — with the namespace, `load()` reports success but silently skips attaching UI components, and `mountPricingTable` / `openSignIn` fail with "Clerk was not loaded with Ui components". A page-realm `init()` that ends with Clerk unhealthy **rejects** (so the memo clears and the next call retries); the service worker is exempt, because it never starts Clerk and its `getAccessState()` must keep returning so the snapshot gate can run.
- `background.js` — answers `CHECK_PRO_ACCESS` / `CHECK_GENERATION_ACCESS` and gates `GENERATE` + `BUILD_COVER_LETTER` on `getGenerationAccess()`: `signedIn && (withinWindow || isPro)` from the page-published `proAccessCache` snapshot (younger than 60 min), else deny. It never writes or deletes that snapshot. Unconfigured builds (no Clerk env) are allowed so contributors can run locally.
- `options.js` — always-visible account card at the top of the left panel: signed-out offer (badge + feature bullets + Create account / See Pro plans / Sign in) or signed-in row (avatar + name + plan pill + Start free trial · Manage plan / Sign out) with a sync note. It also consumes `openAuth` from the side panel and opens the matching Clerk modal. No manual push/restore controls; `runAutoSync()` fires on load and after sign-in, and `CloudSync.startAutoSync()` is bound on load. Resume edits bump `updatedAt`; deletes record a `deletedResumeIds` tombstone and sync. Pricing table mounts inline (needs the UI build).
- `sidebar.js` — `refreshGate()` resolves `signin` / `setup` / `review` / `plan` / `ready` from `checkProAccess()` and the stored resume, then `applyGateUi()` shows one card at a time. `#accountBtn` reads Sign in / Start free trial / Trial · Nd / Pro / Free until Dec 31. The sign-in card buttons write `openAuth` and open Settings — they must never call `CloudSync.signIn()`/`signUp()`, because the side panel bundle has no Clerk UI. `checkProAccess()` prefers the side panel's own in-page `getAccessState()` (2.5 s timeout), falls back to `CHECK_PRO_ACCESS`, and retries once on `chrome.runtime.lastError`.
- `tracker.js` — `checkAccess()` gates the Job Tracker via `window.CloudSync.getAccessState()`; caches the result in `trackerPlanCache`
- `convex/auth.config.ts` — Clerk → Convex auth wiring; requires `CLERK_FRONTEND_API_URL` env var
- `convex/schema.ts` — `resumes` table shape (`jsonContent` + optional `coverLetter` JSON string) and the `feedback` table
- `convex/resumes.ts` — `list`, `upsert`, `remove` queries/mutations
- `convex/feedback.ts` — public `submit` action: stores the message and emails it via Resend (see "Feedback box")
- `convex/billing.ts` — `extendEarlyTrial` action: authenticated self-serve call that uses `CLERK_SECRET_KEY` (Convex env) to extend a pre-Dec-31 subscriber's trial to Jan 7, 2027

Sign-in behavior: all Clerk redirects (`signInForceRedirectUrl`, `signUpForceRedirectUrl`, `afterSignOutUrl`, `signOut redirectUrl`) point at `options.html` — never `sidebar.html` (navigating the Settings tab to the side panel breaks the React tree with `removeChild` errors). The sign-in modal is themed dark via `appearance.variables` passed to `clerk.load(...)` — explicit input colors are required or typed text inherits the page's light color and becomes invisible inside Clerk's light-styled inputs.

Credentials are **never** hardcoded. The build step injects `CLERK_PUBLISHABLE_KEY` and `CONVEX_URL` from `.env.local` into the bundle. Contributors must set up their own Clerk + Convex accounts.

## File layout

```
PocketResume/
├── manifest.json            # Manifest V3 entrypoint wiring
├── background.js            # Service worker: deterministic pipeline + generation gate
├── content.js               # Content script: page text extraction
├── form-filler.js           # Injected form detect/fill/flag/toast (deterministic Form Filler)
├── form-profile.js          # Saved-answer resolver: canonical matchers + custom Q&A + resume → profile
├── feedback.js              # Feedback form: validation, payload, Convex send + mailto fallback
├── sidebar.html / sidebar.js    # Side panel UI + PocketResume PDF generation
├── pdf-store.js            # Generated-PDF shelf: storage, URL keys, eviction rules
├── feature-video.js / feature-video.css  # Cursor-follow feature tour over real screenshots (panel-only)
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
├── cloud-sync-core.js       # [generated, gitignored] esbuild bundle, no UI (panel / tracker / worker)
├── convex/                  # Convex backend
│   ├── auth.config.ts
│   ├── schema.ts
│   ├── resumes.ts
│   ├── feedback.ts
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
- **Change form detection / filling / safety rules**: `form-filler.js` (`detect` / `fill` / `flag` / `unflag` / `toast`) + `background.js` (`FILL_APPLICATION_FORM` handler).
- **Change access gating**: `src/cloud-sync.js` (`getAccessState`/`hasProAccess`/`ACCESS_WINDOW`), `background.js` (`getGenerationAccess`), `sidebar.js` (`refreshGate` + gate cards).
- **Change generation / JD alignment**: `resume-align.js` (`parseJobPosting`, `alignResumeJson`, verifier), `background.js` (`GENERATE`, `BUILD_COVER_LETTER`), `sidebar.js` (`runGeneration`, `refreshGate`) / `sidebar.html` (`#signinCard`, `#reviewCard`, `#planLockCard`).
- **Change the skill vocabulary or update source**: `skill-lexicon.js` (parsers, `CURATED_ALIASES`, `AMBIGUOUS_SKILL_KEYS`, source URLs) + `scripts/build-lexicon.mjs` (bundled baseline) + `background.js` (`updateSkillLexicon`, daily alarm, `ENSURE_SKILL_LEXICON`). Keep the O*NET attribution in `NOTICE`.
- **Change Resume Health Check**: `resume-health.js` (`buildProviders`, `checkResumeHealth`, `validateHealthReport`, `SCORE_WEIGHTS`), `background.js` (`CHECK_RESUME_HEALTH`), `options.html`/`options.js` (`#resumeHealthDetails` → `renderHealthPanel` / `runResumeHealthCheck`, cooldown + local fix scoring).
- **Change the cover letter**: `options.html`/`options.js` (Cover letter section: Generate letter + 60 s cooldown gate, prompt, sample, per-resume editor) + `resume-letter.js` (`generateCoverLetterBody`, `buildCoverLetterBodyPrompt`, `sanitizeLetter`, `COVER_LETTER_COOLDOWN_MS`) + `buildCoverLetterFromTemplate` in `resume-align.js` + `background.js` (`BUILD_AI_COVER_LETTER` gate + cooldown write).
- **Change saved-answer resolution / canonical matchers**: `form-profile.js` (`CANONICAL_MATCHERS`, `resolveFormAnswers`, `normalizeFormAnswers`, `profileFromResume`) + `scripts/test-formfill.mjs`.
- **Change Form Filler onboarding / application profile**: `options.html` + `options.js` (`#appProfileDetails` section, `APP_PROFILE_FIELDS`, `PROFILE_TOUR_STEPS`, `handleProfileAutofill`), `form-profile.js` (`profileFromResume`), panel gating in `sidebar.js` (`#fillProCard` / `#fillProfileCard`).
- **Change the feedback box**: `feedback.js` (`validateFeedback` / `buildFeedbackPayload` / `sendFeedback` / `mountFeedbackForm`) + `options.html` (`#feedbackDetails` section) + `src/cloud-sync.js` (`sendFeedback` → Convex) + `convex/feedback.ts` (validation, rate limits, Resend mail).
- **Change PocketResume PDF layout**: `sidebar.js` (`generatePDF` / `generateCoverLetterPDF`).
- **Change Double Sided / Academic CV PDF layouts**: `resume-renderers.js` (`renderDeedyLayout` / `renderAcademicCvLayout`).
- **Change settings UI / resume management / form editor**: `options.js` (`renderTabContent`, `resumeDraft`, `serializeProfile`) / `options.html`.
- **Change side panel UI**: `sidebar.html` / `sidebar.js`.
- **Change the file shelf (stored PDFs, drag-out, delete zone)**: `pdf-store.js` (`planStore` / `normalizeUrlKey` / `savePdf` / `removeItem` / `clearStore`) + `sidebar.js` (`savePdfDocument`, `renderFiles`, `buildFileCard`, `setupFiles`) + `sidebar.html` (`.files-section` / `.file-card` / `#dropZone`).
- **Change the animations toggle**: `options.html` (`#animationsToggle`) + `options.js` (storage + `applyMotionPreference`), then the `html.no-motion` CSS and the `motionOn()` gates in `sidebar.js` / `tracker.js`.
- **Change panel error messages / mapping**: `sidebar.js` (`setError` / `mapErrorMessage`). Maps the gate/network/parse cases to short strings; un-matched messages truncate to ~200 chars.
- **Change the long-resume warning**: `resume-parse.js` (`estimateResumePages`), `options.js` (`#rfFitNotice`, per-resume `fitNoticeDismissed*`), `sidebar.js` (`buildProfessionalPdf`, `confirmLongResume`, `resumeFitWarningHidden`), `sidebar.html` (`#fitWarningModal`). Only the Professional layout can spill to two pages; Double Sided self-fits and Academic CV paginates by design.
- **Change permissions or extension wiring**: `manifest.json`.
- **Change Pro auth / plan gating / pricing / resume sync**: `src/cloud-sync.js` (then `npm run build:clerk`), `options.js` (account card + auto-sync), `background.js` (`CHECK_PRO_ACCESS`), `tracker.js` (`checkAccess`), `sidebar.js` (`checkProAccess`).
- **Change Convex schema or functions**: `convex/schema.ts`, `convex/resumes.ts`, `convex/feedback.ts`, `convex/billing.ts`, `convex/auth.config.ts` (then `npx convex dev`).

## Coding conventions

- 4-space indentation across all JS / TS files (matches `background.js`).
- Vanilla ES2022 JS, no TypeScript outside the `convex/` backend.
- **No new comments in source files** unless behavior is non-obvious. The codebase intentionally ships minimal comments.
- Match the style of the file you're editing — read surrounding context first.
- Use `chrome.storage.local` for persistence; do not introduce new global state.

### Button color roles

Buttons use semantic accent tokens so paired actions both read as intentional (never "one orange, one disabled-looking"). Tokens live in `:root` of `sidebar.html` / `options.html` / `tracker.html` (`--accent-blue*`, `--accent-green*`, `--accent-red*`, plus the existing `--orange*`).

- **Orange** (`--orange*`) = primary/most important action. Classes: `.secondary-action-btn` (options), `.setup-goto` (panel), `.btn-primary` / `#generateBtn` / `.cloud-primary-btn`.
- **Blue** (`--accent-blue*`) = secondary, parallel-but-valid action. Classes: `.accent-btn` (options), `.setup-goto.accent` (panel), `.btn-accent` (tracker). Used for: Check ATS, See Pro plans, Guide me.
- **Green** (`--accent-green*`) = confirm/apply. Classes: `.success-btn` (options), `.setup-goto.success` (panel), `.btn-success` (tracker). Used for: Apply Refined Resume, Replace Local with Cloud.
- **Red** (`--accent-red*`) = destructive. Classes: `.danger-btn` (options), `.btn-danger` (tracker).
- **Glass/ghost** = dismiss/cancel/back/skip/tertiary. Classes: `.ghost-btn` (options), `.setup-goto.ghost` (panel), `.btn-ghost` / `.btn` (tracker).

## Common pitfalls

- **Never call Clerk UI methods from the side panel.** The side panel loads `cloud-sync-core.js` (`__CLERK_UI__ = false`), so `CloudSync.signIn()` / `signUp()` throw and the side panel lands in `setError()` (a red glow that looks like a broken button). The side panel writes `openAuth` and opens `options.html`, where the full UI bundle can show the modal.
- **Trials are Clerk plan config, not code.** Set the 7-day trial on both Pro plans in the Dashboard. The pre-Dec-31 extension to Jan 7 is `convex/billing.ts` → Clerk `extendSubscriptionItemFreeTrial`; it needs `CLERK_SECRET_KEY` in the Convex env. If Convex is not configured the extension silently does nothing and the normal 7-day trial still applies.
- **The hidden `free_user` plan is also an active subscription item.** Never treat `subscription.status === 'active'` as Pro, and never pass a subscription item to `extend_free_trial` without checking its plan slug — Clerk answers 403 `plan_free_trials_disabled`. `parseSubscriptionState()` and `convex/billing.ts` both filter for `PRO_PLAN_SLUGS` (`proSubscription` / `proSubscriptionItem`).
- **PDFs are stored in the panel, not downloaded.** `savePdfDocument(doc, filename, meta)` in `sidebar.js` writes the PDF into `chrome.storage.local` through `pdf-store.js` and re-renders the shelf. `chrome.downloads` is only used by *Quick Download*, by the *Download too* toggle (`downloadOnGenerate`) and by the per-card download button — that path is `downloadPdfDocument(doc, filename)`. Keep the anchor fallback for contexts without the `downloads` permission. jsPDF's `doc.save()` stays banned: it is a synthetic anchor click, and later files in a session get silently dropped.
- **The shelf holds one posting at a time.** `planStore` in `pdf-store.js` drops the previous set when the posting URL changes. If you add a second kind of file, extend `planStore` (and `scripts/test-pdfstore.mjs`) instead of adding a second list.
- **Dragging out of the panel needs a real `File`.** `dataTransfer.setData('text/uri-list', blobUrl)` does not work — Chrome blocks blob URLs in drags. `dataTransfer.items.add(file)` (built from the stored bytes) is the only way to drop a PDF into a page's file input.
- **The panel has no `tabs` permission.** Read the page URL from the content script (`GET_PAGE_URL` → `GET_ACTIVE_PAGE`) instead of `tab.url`; `tab.url` is undefined for tabs the user has not activated.
- **The engine never rewrites wording.** `resume-align.js` only selects, reorders, trims, and fixes banned openers; if you add a transformation that authors new text you lose the "no invented facts" guarantee and the verifier's number check. `npm run test:align` must stay green.
- **`GENERATE` needs `jsonContent` and a confirmed parse.** Do not bypass `parseReview`; a wrong parse silently ships a wrong PDF.
- **Daily lexicon updates use the required `https://www.onetcenter.org/*` host permission.** It sits in `host_permissions` so the worker can refresh silently; there is no toggle or Update button and no prompt path. If the fetch fails, the last good copy stays and `skillLexiconMeta.lastError` records it.
- **Access is gated by a page-published snapshot.** The worker cannot read a Clerk session; any new gated message must call `getGenerationAccess()` and let pages publish `proAccessCache`.
- **Skill lexicon storage is ~1 MB.** `chrome.storage.local` defaults to 10 MB; keep the compact row format (`compactLexicon`) rather than storing expanded objects per term.
- **`jsonContent` is the only input the engine accepts.** There is no raw-text generation fallback anymore; if a resume has only `content`, it must be parsed and saved in Settings first.
- **Generation requires a signed-in session.** Hard block, no offline grace: if the snapshot is stale or missing, the worker denies and the side panel shows `#signinCard`.
- **Manifest `key` field is intentionally absent.** Chrome assigns a fresh extension ID on first load. Do not re-add it (it would lock all contributors to one ID).
- **`host_permissions`** in `manifest.json` covers Clerk + Convex + `https://text.pollinations.ai/*` (Resume Health Check) + `https://www.onetcenter.org/*` (daily skill-directory refresh). Update both the manifest and this file if you add a new backend.
- **Chrome extension service workers can be killed** between messages. Do not store in-memory state across calls — read from `chrome.storage.local` each time.
- **Content script CSP**: avoid inline scripts / eval in `content.js`. The page's CSP applies.
- **Client-rendered job boards need the JSON-LD path.** Sites like `careers.atb.com` serve a 650-character shell at `domcontentloaded` ("We didn't find any …") and hydrate the posting a moment later; the only lexicon word in that shell is a footer link (`LinkedIn`). `content.js` waits up to 4 s for the body to fill in, and `background.js` merges `JobPosting.description` from the schema.org block, which is present in the initial HTML. Never rely on `document.body.innerText` alone for a JD.
- **Convex actions have no `ctx.db`.** An action cannot read or write the database directly; use `ctx.runQuery(internal.module.fn, …)` / `ctx.runMutation(internal.module.fn, …)`. The internal helpers must be **exported** from their file, or `internal.<module>.<fn>` does not resolve at runtime (the failure shows up as "Couldn't resolve api.<module>.<fn>", not as a type error).
- **Do not commit** `cloud-sync.js` / `cloud-sync-core.js` (build artifacts), `convex/_generated/`, or anything from `.env.local`. See `.gitignore`.

## Privacy posture

PocketResume is privacy-first by default. See `privacy-policy.md` for the full policy. The Chrome extension:

- Stores resumes locally in `chrome.storage.local`; cloud sync is opt-in via a free PocketResume account and only talks to the user's own Convex backend
- Keeps the PDFs it generates in the side panel, in the browser's local storage only (`generatedPdfs`). They are never uploaded, and the shelf is emptied when a new posting is generated or when a file is dropped on the delete zone
- Makes no AI requests except opt-in features the user starts: the Resume Health Check (redacted `jsonContent` to Pollinations, or local Ollama on fallback) and Generate letter (redacted resume profile to the same chain). Resume generation and filling stay local.
- Sends nothing to Clerk/Convex unless you sign in, and then only resumes you sync
- Sends one thing without a sign-in: the feedback message you type in Settings → Feedback, with your email address, the extension version, the browser string and (only if you tick the box) the page address. It goes to the developer's own Convex deployment and is emailed to the developer. Nothing is kept in local storage
