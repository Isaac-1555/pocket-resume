# Changelog

## [10.7.2] — 2026-11-10
### Fixed
- **Share dialog shows the share icon.** The invite modal's header glyph was an upload arrow (box with an arrow pointing up), which read as "upload a file" instead of "invite a friend". It now uses the same three-node share icon as its Share with friends button.

## [10.7.1] — 2026-11-10
### Fixed
- **Ordinary words no longer become skills.** The skill extractor matched the JD case-insensitively, so plain prose hit homonym entries in the O*NET vocabulary — "reduce the backlog" became the `REDUCE` computer-algebra system, "lean on data" became `Lean Manufacturing`, "excel at demos" became `Microsoft Excel`, and "sketch out" became `Sketch`. Terms in the new `AMBIGUOUS_SKILL_KEYS` set now need case evidence: an all-caps hit, or a capitalized hit that does not start a line or sentence. Real mentions (`REDUCE, Lean Six Sigma, Sketch` in a skills list) still match, and normal skills stay case-insensitive, so lowercase `python` / `docker` still count. The same gate applies to the resume-evidence check and the verifier, so a bullet that happens to contain "reduce" can no longer pull the term in.

## [10.7.0] — 2026-11-08
### Changed
- **Double Sided is now a one-page layout that never clips.** Before rendering, the layout measures every block, then tries progressively tighter spacing, then shortens per-entry bullets, then trims the least important sections (Open Source → Awards → Publications → Certifications → Links → Projects → oldest roles). The match line in the popup reports what was trimmed, so nothing silently disappears off the page edge.
- **Academic CV paginates cleanly.** Paragraphs and entry headers check for space before drawing, an entry header never separates from its first bullet, and long titles reserve room for the right-aligned date instead of overlapping it. Multi-page CVs get a `Name - page` footer on every page.
- **Bullets and separators render again.** The shared PDF sanitizer no longer strips `•`, so Double Sided bullets, skill-group separators, and Research Interests read correctly. Accented Latin characters (`é`, `ñ`, `ü`) are kept instead of being blanked.
- **No duplicated content.** Projects are listed once (Open Source only appears for explicitly saved open-source entries), and LinkedIn/GitHub links no longer repeat the contact line.

### Removed
- **FAANG layout.** Professional already rendered that layout. Saved `faang` selections move to Professional automatically.

### Added
- `npm run test:render` — renders fixture resumes through `resume-renderers.js` and asserts one-page Double Sided fit, no text below the page margin, Academic CV pagination and footer, and no duplicated projects.

### Fixed
- **Headers typed on one line keep their title and company.** A line such as `Senior Data Scientist | Acme | Mar 2021 - Present` used to be swallowed as a date range, leaving the entry with no title or employer. The parser now splits the header from the dates.
- **Education lines parse degree and school correctly.** `MSc, Statistics — University of Toronto — 2015 — Toronto, ON` now yields degree `MSc, Statistics`, school `University of Toronto`, year and location, instead of treating the field of study as the school.

## [10.6.0] — 2026-11-08
### Added
- **Cover letter gate.** Generate letter in Settings now waits 60 seconds per resume between attempts and shows the remaining time on the button, so repeated clicks cannot drain the free Pollinations quota (or keep hammering the local Ollama fallback). The wait survives a reload because it is stored with the resume.
- **Overwrite confirmation.** If the active resume already has a letter body, Generate letter asks before replacing it. Copy prompt and manual paste stay ungated.

### Fixed
- **Provider limits now drive the gate.** A 402 with `Retry-After` or a 429 from either provider extends the cooldown to the wait it asked for (capped at 15 minutes) instead of surfacing a generic failure, and the button counts down that wait.

## [10.5.0] — 2026-11-07
### Added
- **A cover letter per resume.** Every resume tab keeps its own greeting, body, and sign-off, saved with that resume and synced to your account. Generate Cover Letter now uses the selected resume's letter instead of one global template.
- **Generate letter.** Inside Settings → Cover letter, one click writes a short general letter (~150 words) from the active resume using the same provider chain as the Resume health check — Pollinations first, local Ollama as the fallback. Contact details are redacted; the previous letter is kept if writing fails.
- **Sticky Job Tracker columns.** Long columns now scroll inside their own card while the column heading and job count stay visible at the top.
- **Cover letters in cloud sync.** The Convex resume schema now stores each resume's cover letter, so it follows you across devices.

### Changed
- **Copy prompt returns the body only.** The assistant prompt now asks for 120–160 words, no greeting, date, or sign-off, and keeps `{{company}}` / `{{role}}` for PocketResume to fill in.
- Cover letter actions live in one place: Generate letter (writes it for you), Copy prompt (for an assistant), and Show sample.

### Fixed
- **Cover letter no longer rides on one global setting.** Editing one resume's letter never changes another's, and the popup matches the letter to the resume it is generating from.

## [10.4.0] — 2026-11-07
### Changed
- **Premium interface pass across the popup, Settings, and Job Tracker.** The solid black backdrop is gone: the popup is now a translucent frosted card over a soft ambient mesh, and Settings and the Job Tracker use the same warm-orange/cool-blue gradient wash instead of a flat `#050506` page.
- **Every control is icon + label.** Buttons that were text-only (Create account, Sign in, Do it, Let's go, Save Settings, Parse resume, Copy prompt, Mark fixed, Add job, Skip, Next, Reset filters, and the rest) now carry a matching inline SVG icon. Icon-only controls (error details, modal close, remove round) got proper labels and hit targets.
- **Redesigned toggle switches.** The small grey pill is replaced by a 60×32 switch with an orange gradient when on, a larger knob, and an ON/OFF label inside the track. Applies to Animations, unverified JD keywords, weekly skill update, and the Resume health check.
- **Text legibility raised everywhere.** Dimmed copy went from 52% to 86% white, faint copy from 32% to 72%, and nothing renders below 11px. Badges, offline notes, plan pills, and the Quick Download "New" badge all got bigger and higher contrast. The Quick Download label no longer shrinks to fit its badge — the badge floats in the corner instead.

### Fixed
- **Toggle state labels showed the wrong word.** Animations, unverified JD keywords, and weekly auto-update are on by default but their switches read "OFF" until clicked, because the label was hardcoded in the markup. The label now follows the real checkbox state on load, on every change, and when storage changes in another tab.

## [10.3.0] — 2026-11-07
### Added
- **Pro plans with a free trial.** Monthly billing at $4/month (about $1/week) and yearly billing at $47/year, both with a 7-day trial. Everything stays free to try until Dec 31; subscribing before then extends the trial to Jan 7, 2027. Cloud sync now requires Pro after the free period (existing cloud resumes are kept, not deleted) and free sign-ups no longer imply lasting access.
- **Animations toggle** (Settings → Interface). Turns off the scramble text, glows, and hover motion everywhere and makes generation instant. The Resume health check keeps its progress animation.
- **Cover letter progress state.** Generate Cover Letter now has a pencil-on-paper icon and its own blue progress animation, separate from Generate Resume.

### Fixed
- **Popup sign-in and sign-up buttons.** They called Clerk from the popup bundle, which has no Clerk UI, so they only produced a red error glow. They now open Settings and launch the full sign-in/sign-up window.
- **Free plan counted as Pro.** Clerk assigns the hidden `free_user` plan as an active subscription item; the subscription fallback treated it as Pro and then tried to extend its (disabled) trial, producing `plan_free_trials_disabled` 403s. Only items whose plan slug is a Pro/legacy plan now count, and the early-trial action fails soft (`not_pro_plan`, `trials_disabled`) instead of throwing.
- **Pricing table double-mount and close crash.** Opening the Pro panel twice (deep link plus See Pro plans, or a double click) cleared Clerk's live React tree, and closing it unmounted then cleared the same tree — both threw `removeChild` `NotFoundError` and left the table blank on reopen. The table now mounts once per page, close only hides the panel, and `cloud-sync.js` guards mounts with a mounted-node set.
- **Popup gate refresh.** The popup re-resolves sign-in and plan state when the access snapshot or resumes change in another tab.

## [10.2.0] — 2026-11-02
### Added
- **Resume Health Check** (beta) — opt-in rule-based review that sends a redacted copy of your resume to Pollinations and flags action verbs, quantification, tense, contact completeness, skills/education, and more. If Pollinations fails, it falls back to a local Ollama server at `http://localhost:11434` — no provider setup, nothing to configure. Mark issues as fixed locally for a score bump; an open issue blocks a re-check until it is fixed, and checks are rate-limited to one per minute per resume. Re-checks go stale when you edit the resume.

### Removed
- **ATS Score Checker** and **Refine Resume** — removed to focus on JD-aware tailoring in the core flow.

All notable changes to PocketResume, newest first. The version number matches `manifest.json` → `version`.

Notes on history:

- The project began at **1.0** (initial commit 2026-01-21). There was no published **0.x** build.
- A few store builds shipped without a tagged git history (**7.8**, **7.9**, **8.5**) and are reconstructed from the build artifacts in `dist/`.
- Version numbers **7.7** and **8.1** were skipped.
- The git tag `v7.1` was a docs-only tag on manifest version `7`.

---

## [10.1.1] — 2026-11-02

### Changed

- **Generate Cover Letter now matches Generate Resume.** Same footprint and state styling (full width, 56px, glow, hover lift) in the blue accent.
- **Uniform collapsible cards in Settings.** The summary rows (Skills on generated resumes / Skill directory / Cover letter) share one fixed-height style and all expanded bodies get proper padding again — the Form Filler removal had orphaned the only `.app-profile-body` padding rule.
- **The resume PDF download waits for one busy-text loop.** Generation is instant as before; the scramble animation plays one full pass, then the PDF saves. Cover letters still download instantly. `prefers-reduced-motion` skips the wait.
- **Settings sidebar reordered.** Account → Skills on generated resumes → Skill directory → Cover letter. Job Tracker settings removed (capture is always on by default) and the dormant Form Filler setup section is hidden while the feature is rebuilt.
- **"Add unverified JD keywords" is now on by default.** Existing users keep whatever they saved; new accounts and anyone who never touched the toggle get JD keyword matching.

### Added

- **Icons on resumes.** Each resume label gets an icon picker in Settings (10 inline SVG icons) shown on the resume tabs and the popup resume selector. Stored locally as `resumes[].icon` (`doc` default).

### Removed

- The dead "Offline Mode" settings block (drag-over markup from the pre-on-device engine).
- The v10.0 / v10.1 What's New modal — replaced by this 10.1.1 announcement (on-device engine, speed/accuracy, new UI and settings).

---

## [10.1.0] — 2026-11-02

### Fixed

- **Job-description skills now reach the generated resume.** `alignSkills` collects skill terms from every zone (title, requirements, a plain `Skills:` / `Tech Stack:` / `Core Competencies` section, responsibilities, preferred), ranks them by JD weight, and adds the ones your master resume already evidences — up to 10 additions, 30 skills total.
- **New `skills` zone in the JD parser.** Generic skills headings used to fall through to whatever section preceded them (usually "About us", the lowest weight), so JD keywords scored near zero. They are now weighted like requirements and count toward the match score.
- **Alias spellings no longer get dropped.** A master resume that says `k8s` while the JD says `Kubernetes` kept losing the skill during verification; skills are now accepted when the canonical name *or* any alias is evidenced, and display the canonical name (`k8s` → `Kubernetes`, `React.js` → `React`).
- **Duplicate skills removed.** The merged list dedupes on the lexical identity: `React` / `React.js`, `javascript` / `JAVASCRIPT`, and `Apache Spark` / `Spark` collapse into one entry. `skillGroups` is rewritten to match, so the Double Sided and Academic CV layouts — which render the groups, not the flat list — show the same skills.
- **No more phantom skills from substrings.** Skill evidence is matched on word boundaries instead of `String.includes`, so "Google Cloud" no longer counts as the skill `Go`.
- **Bundled skill directory was missing 18 core terms.** The O*NET bundle filter discarded every curated term that had no alias (`SQL`, `Jira`, `Agile`, `Scrum`, `Kanban`, `Salesforce`, `SAP`, `QuickBooks`, `Sketch`, `Confluence`, `Ansible`, `Jenkins`, `Windows Server`, `GAAP`, `IFRS`, `HIPAA`, `GDPR`, `Six Sigma`) and everything starting with punctuation (`.NET`). Curated terms are now always kept, punctuation-leading names are allowed, and the reported count matches the real term count.
- **`Java` was missing from the vocabulary.** O*NET only ships `Oracle Java` / `Enterprise JavaBeans`, so a plain "Java" in a posting matched nothing. Added curated aliases and terms for `Java`, `C/C++`, `Springboot`, `Microservices`, `Symfony`, `Zend`, `Play Framework`, and `JSON`.
- **Page text now falls back to the posting's JSON-LD description.** When the visible page is mostly navigation chrome (or the description is injected late), the schema.org `JobPosting.description` is used instead of the chrome. `content.js` also prefers the largest main/article block over the raw body. The HTML→text conversion now preserves block-level line breaks (it used `innerText` on a detached node and collapsed the whole posting into one line, which killed heading detection), and `mergePageText` keeps those newlines. Social/nav chrome (`LinkedIn`, `Facebook`, `YouTube`…) is excluded from the JD skill set.
- **Alignment diagnostics.** The worker logs `[Align] pageChars / descriptionChars / jdSkills / masterSkills / added / noEvidence / score` for every run, and the popup match line shows keyword count, skills added, how many JD skills were skipped for lack of evidence in your resume, and whether your resume has any skills at all.
- **Single-page career sites get time to render.** `content.js` now holds the response for up to 4 s (polling every 250 ms) when the body is short or still shows an empty state ("We didn't find any …", "Loading"), and the worker retries twice, 1.5 s apart, with the page cache bypassed when a run still finds zero skill keywords.
- **A stale page scrape retries itself.** The 15-minute page cache is bypassed and the page re-read once when a run finds no skill keywords, instead of shipping an unaligned resume.
- **No more phantom location.** The old city/state heuristic could read "…we mostly use React, Node.js…" as location `React, Node`; locations are now only taken from a short line with a real state/province/country.
- **Generic vocabulary no longer counts as a skill.** `Programming`, `Programming languages`, `Google`, `computer science`, `tools` and similar O*NET entries are excluded from the JD skill set and from the match score.

### Notes

- Additions default to requiring evidence in the master resume — the engine never invents a skill or a number. `npm run test:align` covers the new cases.
- **Added `Settings → Skills on generated resumes → Add unverified JD keywords`** (off by default). When on, `alignResumeJson` also lists JD keywords the resume never mentions (cap still applies), the verifier leaves them alone, and they are reported separately as "unverified" — review them before sending.

---

## [10.0.0] — 2026-11-02

### Changed

- **The on-device resume engine is now the only generation path.** BYOK is gone: no provider picker, no API key fields, no model overrides, no custom endpoints, and no third-party AI calls. Paste your resume once, correct the parsed form, and every generation runs locally in milliseconds. `background.js` no longer contains a provider layer.
- **Resume data model is JSON-canonical.** `resumes[].jsonContent` is the source of truth; `content` is kept only as a migration backup (`legacyContent`). Save Settings writes the JSON the form represents.
- **Settings shows an editable resume form instead of raw text/JSON.** Header, summary, skills, experience, projects, education, and certifications are repeatable fields with add/remove controls. JSON export/import lives under Advanced for support and portability.
- **New deterministic parser (`resume-parse.js`).** Rewritten from the old offline fallback: contact splitting (email/phone/location/links), `Title at Company` / `Title | Company` / `Title — Company` headers, multi-line bullets, date ranges, section aliases, skill groups (`Languages: …`), education with year/location. Output is validated and normalized into the renderer schema.
- **Existing users are migrated on first Settings load.** Raw `content` is parsed, stored as `jsonContent`, and flagged `parseReview`. Generation stays blocked until the parsed form is confirmed once; the original text is preserved in `legacyContent`.
- **Separate Generate Resume and Generate Cover Letter buttons.** The cover letter is always built from your saved universal letter with `{{company}}`, `{{role}}`, and `{{recipient}}` substituted from the detected posting. A missing template shows a direct link to Settings instead of failing the resume.
- **Cover letter section is now guidance-first.** Settings includes writing steps, a sample letter, a one-click copyable prompt for any external assistant, and a live preview with sample substitutions.
- **Job Tracker capture is always on and free.** Every successful generation writes a card with the job URL, company, and role (JD metadata first, page-title heuristic second). Dedupe is on URL.
- **Accounts gate the engine.** Everything is free for signed-in accounts until **Dec 31, 2026**. After that, generation and tracker editing require a Pro plan; the resume form, JSON export, and account controls stay available. A daily reminder appears in the popup and tracker from Dec 24.

### Removed

- Provider settings (OpenAI, Anthropic, Gemini, OpenRouter, custom endpoints), API-key storage keys, model overrides, and the optional AI host permissions.
- AI resume generation, AI cover letters, AI JSON extraction, AI refine, AI ATS checks, and Profile Autofill calls.
- The popup AI/Offline mode switch, offline fallback settings, the cover-letter toggle, and the no-JSON/offline-offer cards.
- The capture-and-render feature tour entry points until its screenshots are re-captured for the new UI.

### Fixed

- **Quick Download and Generate share one gate.** Both require a signed-in account, a built resume, and a confirmed parse; neither can produce a PDF the tracker did not capture.
- **Two PDFs in one popup session still download.** Resume and cover letter continue to save through `chrome.downloads` rather than `doc.save()`.

### Notes

- Refine Resume, Check ATS, Profile Autofill, and Form Filler are visible but disabled with a **Soon** badge while they are rebuilt deterministically.
- `npm run test:align` now also covers the new parser (contact splitting, multi-entry parsing, normalization).

---

## [9.1] — 2026-10-26

### Added

- **Offline mode — a JD-aligned resume with zero tokens.** New **AI / Offline** switch under the popup header. Offline runs entirely on-device: the job posting is parsed deterministically (JSON-LD `JobPosting` first, then heading/zone heuristics), required and preferred requirements are weighted, and your saved JSON profile is aligned to them — JD title/company/location filled in, skills ranked by JD relevance, the strongest 2–3 bullets per entry kept and ordered first, banned openers fixed, long bullets trimmed at clause boundaries. Bullet wording is never rewritten, and a verifier reverts any field that would introduce a number not present in your profile. The popup reports the JD match score and the requirements it could not find. Pro feature (launch promo applies).
- **Automatic offline fallback after three failed AI attempts.** When generation, JSON parsing, or PDF rendering fails, the error card offers "Generate offline" with a "Always use offline when AI fails" checkbox. The choice persists as `offlineFallback` (`ask` / `auto` / `off`, editable in Settings). `auto` runs offline immediately on the next failure; `off` never offers it.
- **Universal cover letter fallback.** Settings → Cover letter fallback stores one letter with `{{company}}`, `{{role}}`, and `{{recipient}}` placeholders. If the AI cover letter fails (or offline mode has the cover-letter toggle on), this letter is rendered instead of failing the whole run. Pro feature.
- **Skill directory with weekly updates.** Offline mode reads a skill vocabulary built from the public O*NET 31.0 database (Software Skills + Essential + Transferable Skills, CC BY 4.0, U.S. Department of Labor), plus a curated alias map (`k8s` → Kubernetes, `react.js` → React, `postgres` → PostgreSQL…). A bundled subset (~8k terms) ships with the extension; a `chrome.alarms` job refreshes the full list weekly when Pro and the `onetcenter.org` permission is granted, and Settings → Skill directory has **Update now**. Failures keep the last good copy and report the error.
- **Structured page capture.** `content.js` now returns JSON-LD `JobPosting` fields, `og:title`, and page headings alongside the page text, cached with the posting for 15 minutes. Both the AI prompt path and offline alignment use the same capture.
- **Offline parsing for resumes without extracted JSON.** If the selected resume has no `jsonContent`, offline mode offers one-click **Extract JSON** in Settings, or a clearly-warned "Try offline parse from raw text" fallback that maps headings, contact details, dates, and bullets heuristically (`parseQuality: 'low'` in the report).

### Changed

- **Edge glow replaces the horizon line.** The purple hairline across the popup is now two vertical hairlines at the left and right edges with matching bloom; status colours (generating / success / failure / filling) and the pulse still drive both.
- **Popup generation progress and labels follow the active mode** — the button reads `Generate Resume PDF (offline)` in offline mode and returns to the same label after success or failure.
- **Cover-letter failures no longer fail the run.** A generated resume is kept and the universal letter (or a Settings prompt) takes over.

### Fixed

- **PDF downloads go through the downloads API.** Resume and cover-letter PDFs were written with jsPDF's `doc.save()`, i.e. a synthetic anchor click. Only the first download inherits the click's user gesture; the cover letter fires after a `sendMessage` round-trip, so Chrome treated it as an automatic download and silently blocked it (opening DevTools made it go through). Both PDFs — and the Double Sided / Academic CV renderers — now save through `chrome.downloads.download` with a blob URL, falling back to the anchor click only if that API is unavailable. `downloads` is now a declared permission.
- **Offline cover letter reports its outcome.** Offline runs now return `coverLetterStatus`, the popup staggers the letter download behind the resume, and a skipped letter shows *"Cover letter skipped — add a universal cover letter"* with a link straight to that Settings section instead of failing silently. The popup also passes the cover-letter toggle state with the request, so a just-toggled switch cannot be lost to a storage race.
- **`document.body.innerText` whitespace collapse no longer destroys section boundaries.** Page text keeps line breaks (only horizontal whitespace and blank-line runs are collapsed), which the deterministic zone parser needs and which also gives the AI prompt cleaner structure.
- **Cover letter can no longer lose the resume.** Previously a cover-letter parse error replaced a successfully generated resume with a red error state.

### Notes

- Offline mode is intentionally a selection/reordering pass, not a writer: it cannot rephrase a bullet to insert a keyword, and synonym-free gaps ("payment rails" vs "fintech") show up as missing requirements in the report rather than being guessed.
- O*NET data attribution (CC BY 4.0) appears in Settings → Skill directory and in `NOTICE`.

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
