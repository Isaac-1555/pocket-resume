# PocketResume

> Chrome extension that turns one saved resume into a tailored PDF for every job posting. No API key, no upload, no rate limit — the resume engine runs on your device.

[![Website](https://img.shields.io/badge/Website-pocket--resume.xyz-blue.svg)](https://pocket-resume.xyz)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green.svg)](manifest.json)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-lightgrey.svg)](https://developer.chrome.com/docs/extensions/)

## Features

- **On-device resume engine** — deterministic job-description alignment: JD title/company/location filled in, skills ranked by relevance, strongest bullets selected, banned openers fixed. Wording is never rewritten, and a verifier reverts any number that is not in your profile
- **Job details review** — before a PDF is saved, a dialog shows the title, company, location and recipient read from the posting, with the keywords it matched. Edit anything wrong; the fix lands in the PDF, the resume header and the Job Tracker card, and is remembered for that posting — so the cover letter does not need the same typing
- **Paste once, edit a form** — the local parser turns resume text into a structured, editable profile. No API key, no cloud round-trip
- **3 Resume Layouts** — Professional, Double Sided (dense two-column, always one page), Academic CV (multi-page)
- **A cover letter per resume** — each saved resume keeps its own letter with `{{company}}`, `{{role}}`, and `{{recipient}}` filled from the posting. Write it yourself, click **Generate letter** for a short general draft, or copy the prompt into any assistant
- **Job Tracker** — every generation drops a card with the job URL, company, and role. Pipeline board + analytics, no extra calls
- **Quick Download** — re-download your saved resume as a professional PDF without reading the page
- **PDF Export** — clean, print-ready PDFs via jsPDF for every layout
- **Multi-Profile** — save up to 3 master profiles and switch between them
- **Privacy First** — resumes stay in `chrome.storage.local`; the engine makes no network requests

### What's New in v10.10.1

- **Fix it once, use it twice.** Correct the job title, company, location or recipient in the review dialog and it is remembered for that posting — Generate Cover Letter opens with the fix already in place.
- **Only what you changed is kept.** Untouched fields keep coming from the live extraction, and a field you cleared stays cleared.
- **Still applied with the dialog off.** Turn the review dialog off and the remembered correction still lands in the PDF, the resume header and the Job Tracker entry.

### What's New in v10.10

- **See what we read from the posting.** Before a resume or cover letter PDF is saved, a small dialog shows the job title, company, location and recipient extracted from the posting — all editable, and the fix lands in the PDF, the resume header and the Job Tracker entry.
- **Keywords on screen.** The same dialog lists the keywords matched from the posting, with the skills added to your resume marked with a `+`.
- **Nothing gets lost.** A 30-second countdown saves with what was extracted if nobody responds; typing in any field stops the countdown completely. Cancel saves nothing at all.
- **Your call.** *Don't ask again* in the dialog, or **Review extracted job details** in Settings → Interface, turns it off and back on.

See [CHANGELOG.md](CHANGELOG.md) for the full history.

## Installation

Not on the Chrome Web Store — load unpacked:

```bash
git clone https://github.com/Isaac-1555/pocket-resume.git
cd pocket-resume
npm install
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `PocketResume` directory

## Setup

1. Click the extension icon → gear icon (Settings)
2. Create a free account (required to generate; free until Dec 31, 2026)
3. Paste your resume text into **Paste an existing resume** → **Parse resume** (once the resume has content, the paste box is replaced by a **Paste / import an existing resume** link)
4. Fix anything the parser missed in the form → **Looks right — confirm** → **Save Settings**
5. Optional: add a cover letter under **Cover letter** — it saves with the resume you are editing

## Usage

1. Navigate to any job posting (LinkedIn, Indeed, company pages)
2. Click PocketResume icon → choose resume style
3. Click **Generate Resume** — the job details dialog opens, the PDF downloads and a Job Tracker card is created
4. Click **Generate Cover Letter** for the matching letter (uses the selected resume's saved letter)

The job details dialog shows what was read from the posting — job title, company, location, recipient — and the keywords it matched. Correct anything that is wrong; the fix goes into the PDF, the resume header and the Job Tracker card, and is remembered for that posting so the cover letter picks it up. If nobody answers it, it saves after 30 seconds; typing in a field stops the countdown. Cancel saves nothing. Turn it off with **Don't ask again**, or **Review extracted job details** in Settings → Interface.

If generation fails, the popup stays red — click the **?** button (top right) for a readable message plus copyable raw details. The error clears when you close the popup or retry.

Refine Resume, Check ATS, Profile Autofill, and Form Filler are disabled with a **Soon** badge while they are rebuilt without AI. The Form Filler setup section is hidden in Settings until then.

## Configuration

Resume generation works out of the box and is fully local. One optional integration requires your own credentials.

### Plans (Clerk + Convex)

A **free account** is required to generate and includes resume cloud sync. Everything is free until **Dec 31, 2026**; after that a **Pro** plan (`pocketresume_pro`, $4/month or $47/year with a 7-day trial) keeps generation, the Job Tracker, and cloud sync unlocked. Resume editing and JSON export stay available without a plan. Sign-in, plan checks, and the embedded pricing table run through [Clerk](https://clerk.com); synced resumes are stored in your own [Convex](https://convex.dev) deployment (`convex/resumes.ts`):

1. Fill in `CLERK_PUBLISHABLE_KEY`, `CLERK_FRONTEND_API_URL`, and `CONVEX_URL` in `.env.local`
2. Run `npm run build:clerk` to bundle `src/cloud-sync.js` → `cloud-sync.js` with your env vars injected
3. Sign in from Settings → Account & Cloud Sync; resumes sync both ways automatically while signed in
4. For backend work: `npx convex dev` from the repo root

`.env.local` is gitignored. **Never** commit `cloud-sync.js` (it's a build artifact) or `convex/_generated/` (regenerated by the Convex CLI).

## Tech Stack

- **Runtime:** Vanilla HTML/CSS/JS, Manifest V3
- **PDF:** [jsPDF](libs/jspdf.umd.min.js) (vendored)
- **Resume engine:** deterministic in-extension parser + JD aligner (`resume-parse.js`, `resume-align.js`, `skill-lexicon.js`)
- **Cloud (optional):** [Clerk](https://clerk.com) auth + pricing (Pro), [Convex](https://convex.dev) resume sync
- **Build:** esbuild (only for `cloud-sync.js` bundle); no bundler for app code

## Development

```bash
# Install deps
npm ci

# Rebuild cloud-sync.js / cloud-sync-core.js after editing src/cloud-sync.js
npm run build:clerk

# Deterministic engine + PDF layout checks (no network)
npm run test:align
npm run test:render

# Build the Chrome Web Store zip from the runtime file list
npm run build:zip

# Update vendored jsPDF
npm install jspdf@latest
cp node_modules/jspdf/dist/jspdf.umd.min.js libs/jspdf.umd.min.js
```

Edit source files directly, reload the extension in `chrome://extensions`.

Debug targets:

- **Service Worker:** extension card → "Service Worker" (Inspect)
- **Popup:** right-click popup → Inspect
- **Content Script:** target page's DevTools

For the full architecture map, file layout, and prompt/JSON schema reference, see [AGENTS.md](AGENTS.md).

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community rules, and open an [issue](../../issues) for bugs or features.

## Security

Report vulnerabilities privately via [GitHub Security Advisories](../../security/advisories/new). See [SECURITY.md](SECURITY.md).

## Acknowledgments

- [jsPDF](https://github.com/parallax/jsPDF) — PDF generation
- [Clerk](https://clerk.com) — Pro auth + pricing (optional)
- [Convex](https://convex.dev) — resume sync
- [Pollinations](https://pollinations.ai) and [Ollama](https://ollama.com) — opt-in AI for the Resume health check and Generate letter
- [O*NET](https://www.onetcenter.org/) — skill vocabulary (CC BY 4.0)

## License

[MIT](LICENSE) © 2026 Isaac Daniel · [pocket-resume.xyz](https://pocket-resume.xyz)
