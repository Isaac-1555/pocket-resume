# Contributing to PocketResume

Thanks for your interest in contributing! PocketResume is an open-source Chrome extension and welcomes issues, bug fixes, features, docs improvements, and resume-engine tuning.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to its terms.

## Reporting Issues

- **Bugs:** use the [Bug Report](../../issues/new?template=bug_report.md) template. Include Chrome version, extension version, reproduction steps, and console output.
- **Features:** use the [Feature Request](../../issues/new?template=feature_request.md) template. Describe the user problem first, then the proposed solution.
- **Security vulnerabilities:** see [SECURITY.md](SECURITY.md). **Do not** file a public issue.

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- Chrome / Chromium / Edge / Brave
- (Optional) Clerk + Convex accounts if you want to work on sign-in, the Supporter plan or resume sync

### Install

```sh
git clone https://github.com/Isaac-1555/pocket-resume.git
cd pocket-resume
npm ci
```

### Load unpacked

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the repo root
4. After edits, click **Reload** on the extension card

See [AGENTS.md](AGENTS.md) for the full architecture map, runtime entrypoints, and debug recipes. Project home: [pocket-resume.xyz](https://pocket-resume.xyz).

## Project Structure

```
PocketResume/
├── manifest.json            # Manifest V3 entrypoint wiring
├── background.js            # Service worker: deterministic pipeline + generation gate
├── content.js               # Content script: page text extraction
├── sidebar.html / sidebar.js    # Side panel UI + PDF generation
├── pdf-store.js            # Generated-PDF shelf: local storage, URL keys, eviction rules
├── options.html / options.js# Settings: resume form, cover letter, form filler, account, toggles
├── form-filler.js           # Injected form detect/fill/flag/toast (deterministic Form Filler)
├── form-profile.js          # Saved-answer resolver: canonical matchers, custom Q&A, resume -> profile
├── resume-parse.js          # Resume text -> structured profile (pure, no network)
├── resume-align.js          # Deterministic JD alignment + verifier + cover-letter template
├── resume-renderers.js      # Double Sided / Academic CV PDF layouts
├── resume-health.js         # Opt-in Resume health check (Pollinations -> Ollama)
├── resume-letter.js         # Opt-in cover-letter body writer (same provider chain)
├── skill-lexicon.js         # O*NET skill vocabulary (pure)
├── company-directory.js     # Company sanitization, matching, resolution, learning (pure)
├── company-directory-store.js # Personal company directory + official list refresh
├── directory-core.js        # Shared directory primitives (keys, fuzzy/token matching, alias upsert)
├── directory-store.js       # Generic directory storage, cache and daily refresh
├── job-title-directory.js   # Job title cleaning, candidate arbitration, matching, learning (pure)
├── job-title-directory-store.js # Personal title directory + official O*NET list refresh
├── job-location-directory.js # Location parsing, matching, multi-location selection, learning (pure)
├── job-location-directory-store.js # Personal location directory + official GeoNames list refresh
├── libs/company-directory-global.js # Bundled official company directory (read-only)
├── libs/title-directory-global.js # Bundled O*NET job title directory (read-only)
├── libs/location-directory-global.js # Bundled GeoNames location directory (read-only)
├── src/cloud-sync.js        # Auth, access state, Supporter plan, sync (bundled → cloud-sync.js)
├── cloud-sync.js            # [generated] esbuild bundle of src/cloud-sync.js
├── convex/                  # Convex backend (resumes schema)
├── libs/jspdf.umd.min.js    # Vendored jsPDF build
├── scripts/                 # Build + test scripts
├── AGENTS.md                # AI agent + contributor guide
└── package.json             # Build scripts only (no runtime deps)
```

## Tests and Builds

```sh
npm run test:align      # determinism, no-invented-numbers, parser fixtures, normalization
npm run test:formfill   # saved-answer resolution, option matching, EEO gate, maxLength, resume -> profile
npm run test:render     # Double Sided one-page fit, page margins, Academic CV pagination, no duplicated projects
npm run test:pdfstore   # file shelf URL keys + eviction rules (one posting at a time)
npm run test:companydir # company sanitization, matching, learning, persistence, directory failure fallbacks
npm run test:directories # job title + location sanitization, matching, multi-location selection, learning
npm run test:titles # job title extraction: ATS wrappers, candidate arbitration, embedded frames, fallback
npm run test:feedback   # feedback validation, payload, error mapping, mailto fallback
npm run build:clerk   # bundle src/cloud-sync.js → cloud-sync.js + cloud-sync-core.js
npm run build:lexicon # refresh libs/skills-lexicon.js from O*NET
npm run build:titles  # refresh libs/title-directory-global.js from O*NET
npm run build:locations # refresh libs/location-directory-global.js from GeoNames
npm run build:zip     # dist/pocketresume-vX.Y.zip from the runtime file list
```

Keep `test:align`, `test:formfill`, `test:render`, `test:pdfstore`, `test:companydir`, `test:directories`, `test:titles` and `test:feedback` green. There is no linter; otherwise load unpacked and check the PDF plus the service worker console.

## Pull Requests

1. Fork the repo and create a branch: `git checkout -b fix/short-description`
2. Make focused commits. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
3. Run through the [PR template](../../pulls) checklist.
4. Push and open a pull request against `main`.
5. Address review feedback with follow-up commits (do not force-push during review).

## Coding Style

- Vanilla ES2022 JS, no TypeScript, no bundler for app code.
- 4-space indentation (matches existing `background.js`).
- Match the style of the file you're editing. Read surrounding context first.
- **No new comments in source files** unless behavior is non-obvious. The codebase intentionally ships minimal comments.
- Use `chrome.storage.local` for persistence; do not introduce new global state.

## Resume Engine Changes

Generation is deterministic and runs on-device. If you change the parser, the JD aligner, or the verifier:

- Keep it pure: `resume-parse.js`, `resume-align.js`, and `skill-lexicon.js` make no network calls.
- Never author new resume wording. The engine selects, reorders, trims, and fixes banned openers only.
- Run `npm run test:align` — it asserts determinism, no invented numbers, parser fixtures, and normalization. A schema or layout-mapping change also needs the style config table in `AGENTS.md` updated.

## PDF Layout Changes

`resume-renderers.js` owns the Double Sided and Academic CV layouts. Run `npm run test:render` after any change; it checks one-page Double Sided fit, no text below the page margin, Academic CV pagination and footer, and that projects render once.

## Directory Changes

`company-directory.js`, `job-title-directory.js` and `job-location-directory.js` are pure (no `chrome.*`, no network). Their `-store.js` modules own storage and the once-a-day refresh of the bundled lists in `libs/`. `directory-core.js` holds the shared matching primitives; `directory-store.js` holds the generic cache/refresh layer.

- Matching stays deterministic. A fuzzy hit is a **suggestion only** and must never rewrite the extracted value or merge two entries without the user confirming.
- Official lists are read-only. A correction that belongs to an official entry is stored as a personal record with `directoryId` set — never by editing the bundled entry.
- **Official job titles never rewrite an extracted title.** Only a personal correction may. O*NET titles are suggestions; forcing them would turn a real headline into an occupation category.
- **Locations are chosen, not invented.** `pickPreferredLocation` only picks among the DOM candidates; if none matches the resume location, the posting's primary location wins. The master location is never injected.
- **City-only location matches must stay ambiguous.** Two Portlands must not resolve to one city; a city-only key is accepted only when exactly one entry has it.
- Run `npm run test:companydir` and `npm run test:directories`. They cover sanitization, matching, learning, persistence, multi-location selection and the failure fallbacks (missing directory, malformed payload, corrupted storage).
- Adding a company/title/location to `libs/*-global.js` needs a unique `id`, a `canonicalName` and `source: 'official'`; aliases are deduped on load. Regenerate the bundled lists with `build:titles` / `build:locations` rather than editing the generated files by hand.

## Sign-in, Supporter plan and Cloud Sync

Everything in the extension works signed out. Sign-in (Clerk) is only for optional resume sync, and the **Supporter** plan is an optional tip that unlocks no features — see the free model rules in `AGENTS.md` before touching any of it. Synced resumes are stored in Convex. Credentials are **not** checked into the repo.

1. Copy `.env.example` to `.env.local` and fill in your own values
2. Run `npm run build:clerk` to bundle `src/cloud-sync.js` → `cloud-sync.js` with your env vars injected
3. For Convex backend work: `npx convex dev` from the repo root

**Never** commit:
- Real `pk_live_*` or `sk_*` keys
- Convex deployment URLs from your production account
- `cloud-sync.js` (it's a build artifact — see `.gitignore`)
- `convex/_generated/` (regenerated by Convex CLI)

## Vendored jsPDF

`libs/jspdf.umd.min.js` is committed. To update:

```sh
npm install jspdf@latest
cp node_modules/jspdf/dist/jspdf.umd.min.js libs/jspdf.umd.min.js
```

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
