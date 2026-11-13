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
- **Form Filler** — fills the empty fields on an application form from answers you save once. Fully local: no AI, no upload. Questions with no saved answer stay empty and are highlighted for you. Never submits, never overwrites a field you filled
- **Quick Download** — re-download your saved resume as a professional PDF without reading the page
- **Feedback box** — send a bug report or an idea from Settings, with your email so the answer can come back to you. No account needed
- **PDF Export** — clean, print-ready PDFs via jsPDF for every layout
- **Multi-Profile** — save up to 3 master profiles and switch between them
- **Privacy First** — resumes stay in `chrome.storage.local`; the engine makes no network requests

### What's New in v10.13.0

- **Send feedback from Settings.** Settings → **Feedback** takes your email and a message and sends it to the developer. No account needed.
- **It lands in a real inbox.** The message goes to the developer's own server, which stores it and emails it straight to them — with *Reply* pointing back at you.
- **You choose what is attached.** The extension version and browser go along so a bug can be reproduced. The page you are on only goes if you tick *Include the page I'm on*, and then only its address.
- **The shelf names the job you are on.** The Files section now shows the posting it holds — `Helcim · Software Developer` — and typewrites it whenever it changes. A new posting replaces the old label instead of keeping the previous company, and the swap is visible: the cards slide in and the shelf says so.

### What's New in v10.12.0

- **A side panel instead of a popup.** Click the toolbar button and PocketResume stays open next to the page while you work.
- **Your PDFs stay in the panel.** A generated resume and cover letter are kept next to the page instead of piling up in your Downloads folder.
- **Drag a file onto the page.** Pull a file card onto a file picker or an upload box and the PDF lands there.
- **One posting at a time.** Generate on a new job posting and the previous files are replaced.
- **Throw one away.** Drag a card onto the delete zone at the bottom of the panel, or press the × on the card.
- **A download when you want one.** Turn on *Download too* and every generated PDF is also saved to your computer.

### What's New in v10.11.0

- **Form Filler is back.** The tape is off the button: it fills an application form from the answers you saved once in Settings → Form filler.
- **One click from your resume.** *Auto-fill from my resume* reads your name, email, phone, city, links and years of experience out of the resume you already built — locally, with no provider call.
- **Nothing is guessed.** A question with no saved answer is left empty and outlined in amber. The panel tells you how many still need you.
- **It never submits.** Consent boxes, terms and captchas are left alone.

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

Install from the Chrome Web Store:

> https://chromewebstore.google.com/detail/pocketresume/mdplmgfkpgalajmchilemiamifoaneip

It also runs in other Chromium browsers (Edge, Brave, Arc).

### Install from source

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
6. Optional: set up the **Form filler** answers (name, contact, work eligibility, salary, and the questions forms keep asking) so **Fill Form** can fill application forms later

## Usage

1. Navigate to any job posting (LinkedIn, Indeed, company pages)
2. Click PocketResume icon → the side panel opens → choose resume style
3. Click **Generate Resume** — the job details dialog opens, the PDF is kept in the panel's **Files** section and a Job Tracker card is created
4. Click **Generate Cover Letter** for the matching letter (uses the selected resume's saved letter)
5. Optional: click **Fill Form** on an application page — it fills the empty fields from the answers you saved in Settings

Drag a file card from **Files** (under the four panel buttons) onto a page to attach it — a file picker, an upload box, anywhere that takes a document. Drag it onto the delete zone at the bottom of the panel to remove it, or press the × on the card. Generating on a new posting replaces the previous files — the shelf title typewrites the new posting's name and the cards slide in, so the swap is obvious. Turn on **Download too** if you also want each PDF saved to your computer.

The job details dialog shows what was read from the posting — job title, company, location, recipient — and the keywords it matched. Correct anything that is wrong; the fix goes into the PDF, the resume header and the Job Tracker card, and is remembered for that posting so the cover letter picks it up. If nobody answers it, it saves after 30 seconds; typing in a field stops the countdown. Cancel saves nothing. Turn it off with **Don't ask again**, or **Review extracted job details** in Settings → Interface.

If generation fails, the panel stays red — click the **?** button (top right) for a readable message plus copyable raw details. The error clears when you retry or start a new run.

## Form Filler

**Fill Form** (next to the Job Tracker button) fills the empty fields on an application form from answers you save once in Settings → **Form filler**: name, contact details, location, work eligibility, salary expectation, start date, links, and your own answers for the questions forms keep asking. *Auto-fill from my resume* pulls the name, email, phone, city, links and years of experience straight out of the resume you already built.

It runs entirely in your browser — no AI, no upload, no provider call. A question with no saved answer is **left empty and highlighted** with a dashed amber outline, and the panel tells you how many fields still need you. It never overwrites a field you already filled, never touches consent boxes, terms or captchas, and **never submits the form**. It is a Pro feature, like the Job Tracker.

Refine Resume and Check ATS are still disabled with a **Soon** badge while they are rebuilt without AI.

## Feedback

Settings → **Feedback** sends a bug report or an idea straight to the developer. Add your email so the answer can come back to you, write the message, and press **Send feedback** — no account needed.

The message goes to the developer's own server, which stores it and emails it on. Only what you typed is sent, plus the extension version and browser so a bug can be reproduced. Tick **Include the page I'm on** and the address of the page goes along too — never what is written on it. Your resume, cover letters and job postings are never included, and the extension keeps no copy.

If the feedback service cannot be reached, the box hands the message to your own mail app instead.

## Configuration

Resume generation works out of the box and is fully local. One optional integration requires your own credentials.

### Plans (Clerk + Convex)

A **free account** is required to generate and includes resume cloud sync. Everything is free until **Dec 31, 2026**; after that a **Pro** plan (`pocketresume_pro`, $4/month or $47/year with a 7-day trial) keeps generation, the Job Tracker, and cloud sync unlocked. Resume editing and JSON export stay available without a plan. Sign-in, plan checks, and the embedded pricing table run through [Clerk](https://clerk.com); synced resumes are stored in your own [Convex](https://convex.dev) deployment (`convex/resumes.ts`):

1. Fill in `CLERK_PUBLISHABLE_KEY`, `CLERK_FRONTEND_API_URL`, and `CONVEX_URL` in `.env.local`
2. Run `npm run build:clerk` to bundle `src/cloud-sync.js` → `cloud-sync.js` with your env vars injected
3. Sign in from Settings → Account & Cloud Sync; resumes sync both ways automatically while signed in
4. For backend work: `npx convex dev` from the repo root

The feedback box needs two more server-side values (they live on the Convex deployment, never in the extension bundle):

```sh
npx convex env set RESEND_API_KEY re_xxxxxxxx     # https://resend.com
npx convex env set FEEDBACK_TO_EMAIL you@example.com
npx convex deploy
```

Without `RESEND_API_KEY` the message is still stored in the `feedback` table, but no email is sent.

`.env.local` is gitignored. **Never** commit `cloud-sync.js` (it's a build artifact) or `convex/_generated/` (regenerated by the Convex CLI).

## Tech Stack

- **Runtime:** Vanilla HTML/CSS/JS, Manifest V3
- **PDF:** [jsPDF](libs/jspdf.umd.min.js) (vendored)
- **Resume engine:** deterministic in-extension parser + JD aligner (`resume-parse.js`, `resume-align.js`, `skill-lexicon.js`)
- **Cloud (optional):** [Clerk](https://clerk.com) auth + pricing (Pro), [Convex](https://convex.dev) resume sync and the feedback endpoint
- **Feedback mail:** [Resend](https://resend.com) (server-side only, optional)
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
npm run test:formfill
npm run test:pdfstore
npm run test:feedback

# Build the Chrome Web Store zip from the runtime file list
npm run build:zip

# Update vendored jsPDF
npm install jspdf@latest
cp node_modules/jspdf/dist/jspdf.umd.min.js libs/jspdf.umd.min.js
```

Edit source files directly, reload the extension in `chrome://extensions`.

Debug targets:

- **Service Worker:** extension card → "Service Worker" (Inspect)
- **Side panel:** right-click inside the panel → Inspect
- **Content Script:** target page's DevTools

For the full architecture map, file layout, and prompt/JSON schema reference, see [AGENTS.md](AGENTS.md).

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community rules, and open an [issue](../../issues) for bugs or features.

## Security

Report vulnerabilities privately via [GitHub Security Advisories](../../security/advisories/new). See [SECURITY.md](SECURITY.md).

## Acknowledgments

- [jsPDF](https://github.com/parallax/jsPDF) — PDF generation
- [Clerk](https://clerk.com) — Pro auth + pricing (optional)
- [Convex](https://convex.dev) — resume sync and the feedback endpoint
- [Resend](https://resend.com) — delivery of feedback email (optional)
- [Pollinations](https://pollinations.ai) and [Ollama](https://ollama.com) — opt-in AI for the Resume health check and Generate letter
- [O*NET](https://www.onetcenter.org/) — skill vocabulary (CC BY 4.0)

## License

[MIT](LICENSE) © 2026 Isaac Daniel · [pocket-resume.xyz](https://pocket-resume.xyz)
