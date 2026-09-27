# Changelog

All notable changes to PocketResume, newest first. The version number matches `manifest.json` → `version`.

Notes on history:

- The project began at **1.0** (initial commit 2026-01-21). There was no published **0.x** build.
- A few store builds shipped without a tagged git history (**7.8**, **7.9**, **8.5**) and are reconstructed from the build artifacts in `dist/`.
- Version numbers **7.7** and **8.1** were skipped.
- The git tag `v7.1` was a docs-only tag on manifest version `7`.

---

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
