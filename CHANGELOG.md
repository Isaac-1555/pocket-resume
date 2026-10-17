# Changelog

All notable changes to PocketResume, newest first. The version number matches `manifest.json` → `version`.

Notes on history:

- The project began at **1.0** (initial commit 2026-01-21). There was no published **0.x** build.
- A few store builds shipped without a tagged git history (**7.8**, **7.9**, **8.5**) and are reconstructed from the build artifacts in `dist/`.
- Version numbers **7.7** and **8.1** were skipped.
- The git tag `v7.1` was a docs-only tag on manifest version `7`.

---

## [9.0.1] — 2026-10-17

### Fixed

- **Pro plans are recognised again — Form Filler and the Job Tracker unlock for paying accounts.** The plan was only ever resolved inside the service worker, and the worker cannot hold a Clerk session: clerk-js keeps its client token in an httpOnly cookie on Clerk's Frontend API domain, which a service worker can neither read nor refresh. Every plan check therefore came back "signed out", which failed the Pro gate closed — the popup showed "Start free", Form Filler answered "upgrade required", and the signed-in state the options page had published was being deleted on every check. Sign-in is now performed in the page realms (options, popup, tracker), which do hold the session, and the worker trusts the access snapshot those pages publish. Anyone on a paid plan who was locked out should reload the extension once.
- **The popup no longer hides its own account button.** A failed message to the worker used to resolve as "allowed" with no signed-in state, which rendered nothing at all; it now retries once and shows Sign in / Start free / Upgrade instead of vanishing.
- **The Pro pricing table loads reliably.** Opening Settings → "See Pro plans" could fail with "Clerk was not loaded with Ui components" even with everything configured correctly in Clerk. Two causes: Clerk's UI was handed over as a module namespace instead of the branded UI object Clerk expects, so `load()` finished successfully while quietly skipping its UI components; and a second caller could pick up the Clerk client before that load finished. Clerk is now given the branded UI object, initialisation is a single shared promise every caller waits on, and a Clerk start-up failure now reports itself instead of surfacing later as a pricing error.
- **Plan changes in the Clerk dashboard apply without signing out again.** The user record is refreshed (throttled to once a minute) before the plan is read, so metadata edits land on the next check.

### Changed

- **The account bundle is built twice from one source.** `cloud-sync.js` (options page only) keeps the Clerk UI needed for the sign-in modal and pricing table; `cloud-sync-core.js` (popup, tracker, service worker) ships without it. Both are minified: the popup/tracker/worker copy drops from 6.5 MB to 0.9 MB, and the options copy from 6.5 MB to 2.8 MB.
- **Resume auto-sync moved out of the service worker** into the pages that own the session (`CloudSync.startAutoSync()`), since the worker could never authenticate a Convex request. Sync now runs while the options page is open rather than always.

---

## [9.0] — 2026-10-17

### Added

- **Quick Download** — a new popup button (paired with Settings) that instantly exports the selected saved resume as a professional PocketResume PDF. No job page, no AI call, and no API key required: it renders straight from the resume's extracted JSON (`resumes[].jsonContent`). If the resume JSON hasn't been extracted yet, it prompts the user to run **Extract JSON** in Settings. The button stays enabled even before setup.
- **"Bullet quality" card in Check ATS and Refine.** Both flows now return a second, advisory `bulletIssues` list beside the ATS issues, flagging exactly two things: bullets that do not open with a strong action verb, and bullets that state no result or scale. It renders as its own card under the ATS score and never moves the score itself — that stays parser-readiness only, so a resume with beautiful bullets and a messy date format still scores where it should. Each row keeps the existing "Fix" reveal and "You'll need to:" lines.

### Changed

- **Bullets now lead with an action verb and a result, in every style.** Generated bullets were reading as short stories — the prompts *mandated* it: each BULLET FORMAT opened with "the problem the company had before I joined", and the `Action Verb + Context + Result` instruction was being overwritten before the model ever saw it. Now a shared rule applies to all four styles: every bullet starts with a strong action verb (past tense, or present for your current role), uses the shape *verb + what you did + tool/method + result*, puts the strongest number in the first half of the line, bans filler openers ("Responsible for", "Helped with", "Worked on", "Assisted in"), and varies the verbs (at least 10 distinct across the resume). Academic CV lines keep their descriptive style but still lead with a verb.
- **Bullet order changed to strongest-result-first.** The Professional style writes 2-3 accomplishment bullets per entry instead of a fixed problem/solution pair — the problem is now allowed only as a short clause *inside* a verb-led bullet, never as the bullet's subject. FAANG and Double Sided keep their exact 3-bullet format but reorder it to strongest quantified result → second accomplishment with a different verb and named tool → scale/scope, with estimated metrics still permitted where the master resume has none.
- **Refine now rewrites bullets, not just structure.** The refine pass is told to convert passive bullets into verb-led ones and to land a result where the source supports it, while still being forbidden from inventing a metric to satisfy the rule — anything genuinely unknown is reported as a warning and as a "You'll need to" item instead.
- **Settings row resized** — Settings now shares a two-up row with Quick Download (same pattern as Tracker / Fill Form) instead of spanning the full width.
- **Popup tidy-up: one grid, one scale.** Added spacing (`--space-1…5`), radius (`--radius-card` / `--radius-ctl`) and shared row-height (`--row-h`) tokens, then rebuilt the vertical rhythm on them — the style dropdown and the Cover Letter row, the CTA and the four bottom buttons now share a 45px row height with consistent 12/16px gaps, and the 38px dead gap under the header is gone. Card, dropdown and pill radii were unified on the tokens instead of ad-hoc 9/10/16px values.
- **Header rebuilt as a three-column grid.** The account pill, brand and tour button sit on a shared baseline, and the brand stays dead-centre whether or not the pill is present (its width changes with the plan label). This fixes a real collision: the red `?` error button was absolutely positioned at the same `top/left` as the account pill, so every generation error drew the `?` on top of the Sign in / Pro pill. It now lives on the right edge beside the play button.
- **Generate button icon alignment fixed.** The idle sparkle was a *filled* glyph while success/failure were stroke icons, so the icon's weight jumped on every state change; all three are now the same 18px stroke set. The label also gained `line-height: 1` so its line box centres exactly against the icon instead of drifting a pixel.
- **Violet horizon glow.** The idle popup is no longer flat black. A bright violet line runs edge to edge across the vertical centre, with a bloom that fills the background around it. It reuses the existing status tokens, so the bloom expands from the centre outwards and everything turns blue while generating, green on success and red on failure — no new JS. Split into two layers because the dead centre falls behind a full-width glass card whose `backdrop-filter` blurs a hairline away: the bloom sits behind the content to paint the background, and the line sits above it so it stays visible edge to edge.

---

## [8.9] — 2026-10-16

### Fixed

- **Signed-out users no longer show a stale Pro state.** The `proAccessCache` written while signed in was only cleared on an explicit sign-out, so a session that expired server-side left a stale "Pro" badge and an open Form Filler gate behind. The Pro-access cache is now age-bounded (60 min) and is cleared as soon as the Clerk client gives a definitive signed-out answer (a `resolved` flag distinguishes a real sign-out from a still-initializing service worker).

### Changed

- **Sessions stay active longer.** The Clerk instance's maximum session lifetime was raised from 7 days to 10 years (dev; prod is gated on a paid Clerk plan), so users stay signed in until they sign out.
- Added a Clerk `addListener` hook that removes the access cache the moment the session ends, and applied the same staleness guard to the Job Tracker's first-paint plan cache.

---

## [8.8] — 2026-09-28

### Added

- **Automatic two-way resume cloud sync.** Signed-in users no longer push or restore manually: resumes merge automatically on Settings load, after sign-in, and on every local edit. Same-`id` resumes resolve by last-write-wins on `updatedAt`; cloud-only resumes are restored locally and local-only resumes are pushed up. Local-only metadata (`refineAnswers`, `lastRefineBackup`) is preserved when the cloud version wins.

### Changed

- Removed the manual **Push Local to Cloud** / **Restore from Cloud** buttons and the restore preview panel; the signed-in account card now notes that resumes sync automatically.
- Resume deletion now propagates to the cloud via delete tombstones, so auto-restore never resurrects a deleted resume. Orphan deletion on push was removed in favor of explicit tombstones.
- Resumes gained a persisted `updatedAt` timestamp; legacy resumes fall back to `lastRefineAppliedAt`.

### Fixed

- The "Auto-capture jobs" info tooltip on Settings was painted beneath the Form Filler Setup card (the details panel's stacking context covered it); the toggle row now stacks above it.

## [8.7] — 2026-09-27

### Fixed

- Form Filler showed the upgrade card ("Every Pro feature free until Oct 31 / Create free account") to signed-in Pro and launch-trial users. The Pro check runs in the background service worker, whose Clerk client could report signed-out even though the page contexts (Job Tracker, Settings) saw the session. Access now falls back to the last signed-in resolution cached in `proAccessCache`, and the worker rebuilds its Clerk client once when it initialised before sign-in.

## [8.6] — 2026-09-27

### Added

- **Free and Pro plans.** Free (`free_user`) includes resume cloud sync on every device. Pro (`pocketresume_pro`) adds the full Job Tracker and Form Filler.
- **Launch promo trial (Sep 27 – Oct 31).** Any free-plan subscriber gets the Job Tracker, Form Filler, and cloud sync free during the window. Signed-out users are prompted to create a free account.
- Prominent, always-visible **account card** at the top of Settings (offer badge + bulleted features + Create free account / See Pro plans / Sign in), and an **account button** in the popup header.
- Bulleted feature lists in every upgrade card (popup, Settings, Job Tracker lock banner).
- Dedicated Clerk **sign-up** entry point for "Create free account".

### Changed

- Replaced the buried avatar dropdown with clear subscribe buttons.
- Job Tracker gating now uses Pro access + the promo window instead of a 30-day per-user trial.
- "Push Local to Cloud" / "Restore from Cloud" only appear when signed in.
- Added secondary button color roles: blue = parallel action, green = confirm/apply, red = destructive (orange stays primary).

## [8.5] — 2026-09-26

### Removed

- Anonymous usage analytics (`analytics.js`, `track-client.js`).

## [8.4] — 2026-09-19

### Added

- Follow-the-cursor **feature tour video** built on real app screenshots: frame capture pipeline (`scripts/capture-tour.mjs`), timeline player (`feature-video.js` / `.css`), 13 cropped frames in `assets/tour/`.
- "Setup complete" offer + always-available ▶ button in the popup header.

### Changed

- Store assets: added ATS checker + refine screenshot.

## [8.3] — 2026-09-13

### Added

- Generation **auto-retry** with page cache.

### Fixed

- API key wipe bug.
- Refreshed provider default models; added pocket-resume.xyz backlinks; fixed OpenRouter referer.

## [8.2] — 2026-09-12

### Added

- **Check ATS** — on-demand ATS-readiness scan with animated score gauge, critical issues, why an ATS trips on them, and AI-suggested fixes.
- **Smarter Refine** — up to 5 grounded questions first; answers become highest-authority facts and persist per resume; before/after ATS scores in the review.
- Structured bullet formats per resume style (professional 2-bullet problem/solution, FAANG 3-bullet problem/solution/metric).

## [8.0] — 2026-09-10

### Added

- **Form Filler setup** — application-questions questionnaire, auto-fill from resume, saved-answers-first resolution (`form-profile.js`), profile spotlight tour.
- Job Tracker:
  - Newton's Cradle plan loader.
  - Cached plan badge.

### Changed

- Landing page redesign.

### Fixed

- Clerk error hardening.

## [7.9] — store build

### Added

- **Form Filler** — one-click detection + fill of job-application form fields with AI-generated answers (`form-filler.js`). Never submits and never overwrites existing answers.

## [7.8] — store build

### Added

- Job Tracker plan loader.
- Anonymous usage analytics (later removed in 8.5).

## [7.6] — 2026-08-28

### Added

- **Guided onboarding** for new users: setup checklist card in the popup + spotlight tour of the Settings page.
- Logo and tagline link to pocket-resume.xyz.

### Changed

- Dropped the Job Tracker success toast (green glow is enough).

## [7.5] — 2026-08-24

### Changed

- Apple **Liquid Glass** redesign across the popup, options page, and Job Tracker.
- Responsive timeline chart.

## [7.4] — 2026-08-20

### Added

- **Model overrides** per provider + **custom / local OpenAI-compatible endpoints** (Ollama, LM Studio, NVIDIA NIM, Groq, ...).
- v7.4 What's New announcement.

### Changed

- Provider reliability pass and settings UX polish.

## [7.3] — 2026-08-12

### Added

- **Job Tracker workspace**: Kanban board, Sankey funnel, funnel metrics (response / interview / offer rates), submissions-over-time timeline with filters and drill-in.
- Job Tracker spotlight onboarding tour.

## [7.2] — 2026-08-12

### Added

- Rating and share prompts.

## [7.0] — 2026-08-05

### Added

- **Error details modal**: persistent red error state, human-readable messages, copyable raw details.
- Generating spinner.

### Docs

- Documented the error modal and generating state (tag `v7.1`).

## [6.2] — 2026-07-01

### Added

- Open-source release prep.

### Changed

- README rewrite; prompt restyle; 4-space indentation across JS.

### Fixed

- Provider switch overwriting the saved API key.
- Delete cloud orphans on push.
- Options textarea performance (removed `backdrop-filter`).

## [5.8] — 2026-06-18

### Added

- **Resume cloud sync** with Clerk auth + Convex backend.
- Apple Liquid Glass UI redesign (popup + options), two-column options layout with modal refine review.

### Fixed

- Pinned extension ID + clerk CAPTCHA bypass.
- Removed laggy animated gradient on the options page.

## [5.7] — 2026-05-18

### Added

- **Extract JSON** — structured resume profile from freeform text.

### Fixed

- Location, skills, and subtitle extraction.

## [5.4] — 2026-05-07

### Fixed

- Resume selector bug (empty `loadedResumes`).

## [5.3] — 2026-05-06

### Added

- More LLM providers.

### Changed

- README + privacy policy updates.

## [5.2] — 2026-04-29

### Added

- Fallback model.

### Changed

- Screenshot/utility cleanup; documentation.

## [5.0] — 2026-04-11

### Added

- **Refine Resume** button.

### Fixed

- Rendering errors; improved the Deedy (double-sided) layout.

## [4.5] — 2026-03-11

### Added

- Flexible resume formats (Deedy and additional layouts).

### Changed

- Improved resume generation.

## [3.1] — 2026-02-17

### Changed

- Versioning fix (no functional change).

## [3.0] — 2026-02-17

### Added

- Text wrapping for long content.

## [2.0] — 2026-02-11

### Added

- **Cover letter generation** (single-page, generated alongside the resume).
- Cover letter toggle in the popup.

### Changed

- Polished UI with a custom dropdown menu.
- Chrome Web Store compliance fixes; privacy policy updates.

## [1.1] — 2026-01-22

### Added

- Styling and layout pass; basic resume generation working (MVP).

## [1.0] — 2026-01-21

### Added

- Initial commit: Chrome extension scaffold and first resume-generation pipeline.
