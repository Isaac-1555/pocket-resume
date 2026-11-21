# PocketResume

> Chrome extension that turns one saved resume into a tailored PDF for every job posting. **Free forever, no account needed** — no API key, no upload, no paywall. The resume engine runs on your device, and signing in is only for optional cloud sync.

[![Website](https://img.shields.io/badge/Website-pocket--resume.xyz-blue.svg)](https://pocket-resume.xyz)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green.svg)](manifest.json)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-lightgrey.svg)](https://developer.chrome.com/docs/extensions/)

Launch copy — one-liners, store listing, posts and the claims this release can safely make — lives in [MARKETING.md](MARKETING.md).

## Features

- **Free forever, no account** — generate resumes, write cover letters, fill application forms and run the Job Tracker without signing up. No trial, no deadline, no feature behind a plan. Cloud sync is the one thing that needs a free account
- **Supporter, not a subscription** — if PocketResume saves you time you can chip in $4/month or $47/year. It adds a Supporter badge and changes nothing else: every feature stays free
- **Paper and ink** — warm off-white paper, ink type, hairline rules and Fraunces titles, matching the landing page. An **Ink theme** in Settings → Interface flips the same hues to a dark ground for night work. The generated PDFs are untouched in both
- **The build simulation** — after a generation the result is rendered as a paper sheet and a swarm of agent cursors rebuilds it block by block, with selection boxes, rulers and a progress HUD. About eight seconds, skippable, and it never runs under reduced motion. Turn it off in Settings → Interface
- **On-device resume engine** — deterministic job-description alignment: JD title/company/location filled in, skills ranked by relevance, strongest bullets selected, banned openers fixed. Wording is never rewritten, and a verifier reverts any number that is not in your profile
- **Job details review** — before a PDF is saved, a dialog shows the title, company, location and recipient read from the posting, with the keywords it matched. Edit anything wrong; the fix lands in the PDF, the resume header and the Job Tracker card, and is remembered for that posting — so the cover letter does not need the same typing
- **Paste once, edit a form** — the local parser turns resume text into a structured, editable profile. No API key, no cloud round-trip
- **3 Resume Layouts** — Professional, Double Sided (dense two-column, always one page), Academic CV (multi-page)
- **A cover letter per resume** — each saved resume keeps its own letter with `{{company}}`, `{{role}}`, and `{{recipient}}` filled from the posting. Write it yourself, click **Generate letter** for a short general draft, or copy the prompt into any assistant
- **Job Tracker** — every generation drops a card with the job URL, company, and role. Pipeline board + analytics, no extra calls, free without an account
- **Form Filler** — fills the empty fields on an application form from answers you save once. Fully local: no AI, no upload. Questions with no saved answer stay empty and are highlighted for you. Never submits, never overwrites a field you filled
- **Quick Download** — re-download your saved resume as a professional PDF without reading the page
- **Directories that learn** — correct the employer, job title or location once in the review dialog and the next posting is recognized on its own. Bundled official lists resolve variants (`Google LLC` → `Google`, `Sr. Software Engineer` → `Senior Software Engineer`, `SF` → `San Francisco, CA`); everything is matched locally, and your corrections stay on your device
- **Smart location choice** — when a posting lists several locations and one matches your resume's location, that one is used; otherwise the posting's primary location wins
- **Feedback box** — send a bug report or an idea from Settings, with your email so the answer can come back to you. No account needed
- **PDF Export** — clean, print-ready PDFs via jsPDF for every layout
- **Multi-Profile** — save up to 3 master profiles, switch between them, and duplicate one into a free slot when you want a variant without touching the master
- **Privacy First** — resumes stay in `chrome.storage.local`; generation and form filling are local, and nothing leaves the browser unless you sign in. The only network calls are the opt-in Resume health/letter providers, the optional sync, and the daily refresh of the public company/title/location lists

### What's New in v11.0.0

- **Free forever, no account needed.** Generate resumes, cover letters, fill forms and use the Job Tracker without signing in. There is no trial, no deadline and no paywall — the app is the whole app from the first launch.
- **Sign in only for cloud sync.** A free account stores your resumes in the cloud and restores them on another device. Signing out stops sync and deletes nothing.
- **The paid plan is now a tip jar.** It is called **Supporter** ($4/month or $47/year) and it unlocks nothing — it puts a Supporter badge in the panel and the account card. Every feature stays free.
- **No more "Free until Dec 31".** The countdown, the access reminders and the trial copy are gone, along with the early-trial extension.

### What's New in v10.20.0

- **The app is paper and ink.** The dark glass theme is gone — the side panel, Settings and the Job Tracker share the landing page's warm paper, ink type, hairline rules and 2–4px corners. Fraunces, IBM Plex Sans and IBM Plex Mono ship with the extension, so it reads the same offline.
- **The swarm builds your resume.** Generate a resume or a cover letter and a swarm of agent cursors rebuilds it block by block as a paper sheet — selection boxes, rulers, a percentage HUD. About eight seconds, a Skip button, and Settings → Interface turns it off.
- **Ink theme.** Settings → Interface → *Ink theme*, or the toggle in any header, flips the paper to a dark ground. Paper stays the default, and your PDFs are identical either way.
- **Ink is the main action.** Primary buttons are ink fill; green confirms, red destroys, orange is the plan, blue is information. The noise is gone: no scramble text, no colour glow — status prints as a small stamp in the header.
- **The header is a mark and a wordmark.** The tagline is gone; the document mark still opens pocket-resume.xyz.

### What's New in v10.19.0

- **Duplicate a resume.** Settings → the resume editor has a *Duplicate* button next to *Delete*. It copies the resume you are editing — content, icon, label and cover letter — into a free slot and opens the copy, so a variant is one click away instead of a second paste.
- **The master stays the master.** The copy is a separate resume with its own id; editing it never touches the original, and the side panel keeps generating from your master until you pick the copy yourself.
- **Still three slots.** The button turns off when all three are taken, and says so on hover.

### What's New in v10.18.0

- **Your corrections stick.** Fix the company, job title or location in the review dialog once and the next generation for that posting starts from your values — matched by URL, by path and by the raw title + company, so a changed query string or a move to `/apply` still finds them.
- **Corrections teach the directories.** A typed value becomes the name, the raw page text becomes its alias, and nothing is saved twice. The manual management lists are gone from Settings.
- **The cover letter gets the fix too.** Generating the letter right after the resume no longer re-reads the page's uncorrected title and company.
- **The update card scrolls.** Long announcements fit inside the panel with the buttons always reachable; Esc or the backdrop closes it.

### What's New in v10.17.0

- **Attach puts the resume on the page.** Every file card has an Attach button that finds the upload field (including a form inside a frame) and hands over the PDF as a real file.
- **Dropping a card works on every Chrome.** The page takes the drop over, reads the stored bytes and puts them on the file picker itself.
- **A page that asks for consent is pointed out.** Application forms that hold every upload behind a privacy dialog get scrolled to and outlined, and the toast says to answer it.
- **The Form Filler reloads instead of giving up.** A tab that never answered is reloaded once and retried, so a tab opened before the extension loaded no longer ends in *"Could not reach the page."*

### What's New in v10.16.0

- **The job title is read properly.** Wrappers like *Job Application for … at …*, *Acme hiring … in Toronto | LinkedIn*, *Careers at Acme* and trailing city, remote or req-ID noise are stripped before the title reaches the PDF.
- **Embedded postings are read.** When a career site shows the posting inside a Greenhouse-style iframe, the title, company and description come from that frame instead of the surrounding marketing page.
- **Titles with real dashes survive.** *Product Manager - Open Models* stays whole, and text inside parentheses is no longer cut in half.
- **A blank title instead of a wrong one.** If nothing on the page looks like a job title, the review dialog asks instead of shipping *Careers* or *Jobs at Acme* to the PDF — your resume's own subtitle is kept.
- **Pick the right candidate.** When a page offers several title sources, the review dialog shows them as chips: the structured title, the heading and the page title.
- **Still local.** No AI reads the page; the same deterministic rules run every time.

### What's New in v10.15.0

- **A job title directory that learns.** Correct a title in the review dialog and PocketResume remembers it. Official O*NET titles are suggestions only — your own correction is the only thing that rewrites the extracted title.
- **A location directory with multi-city support.** When a posting lists several locations and one matches your resume's location, that one is used. If none matches, the posting's primary location wins.
- **Official title and location lists.** A bundled O*NET title list and a GeoNames city list resolve spelling and region variants — *Sr. Software Engineer* is recognised as *Senior Software Engineer*, *SF* as *San Francisco, CA*. Both refresh once a day; a failed refresh keeps the last good copy.
- **Full review-dialog parity.** Job title and Location get the same match hint and *Save as alias* / *Add as new* actions as Company. Multiple locations appear as clickable chips.
- **Two new Settings sections.** Settings → **Job title directory** and **Location directory** list what you saved, search the official lists, add aliases and delete entries.
- **Your directories stay on your device.** Titles and locations are stored in the browser, never uploaded, never synced.

### What's New in v10.14.0

- **A company directory that learns.** Correct the company name in the side-panel review dialog and PocketResume remembers it. The next posting from the same employer is recognized on its own.
- **An official list to match against.** A bundled directory of well-known employers resolves the legal variants job boards use — *Google LLC* becomes *Google*, *Microsft* is offered as *Microsoft*. Matching is local and deterministic; no AI reads the page.
- **Your directory stays on your device.** Settings → **Company directory** lists what you saved, searches the official list, adds aliases and deletes entries. Local only — never uploaded, never synced.
- **It asks before it merges.** When a correction looks like a company you already have, the panel offers to save it as an alias instead of quietly creating a duplicate.
- **The list refreshes once a day.** The official directory is checked daily against the extension's own server; a failed refresh keeps the last good copy and the bundled list always works offline.

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

1. Click the extension icon → gear icon (Settings). **No account needed** — everything works signed out
2. Paste your resume text into **Paste an existing resume** → **Parse resume** (once the resume has content, the paste box is replaced by a **Paste / import an existing resume** link)
3. Fix anything the parser missed in the form → **Looks right — confirm** → **Save Settings**
4. Optional: add a cover letter under **Cover letter** — it saves with the resume you are editing
5. Optional: set up the **Form filler** answers (name, contact, work eligibility, salary, and the questions forms keep asking) so **Fill Form** can fill application forms later
6. Optional: sign in if you want your resumes saved to the cloud and restored on another device. Sync is free

## Usage

1. Navigate to any job posting (LinkedIn, Indeed, company pages)
2. Click PocketResume icon → the side panel opens → choose resume style
3. Click **Generate Resume** — the job details dialog opens, the PDF is kept in the panel's **Files** section and a Job Tracker card is created. The finished resume is then built in front of you as a paper sheet by the swarm (Skip ends it early)
4. Click **Generate Cover Letter** for the matching letter (uses the selected resume's saved letter)
5. Optional: click **Fill Form** on an application page — it fills the empty fields from the answers you saved in Settings

Drag a file card from **Files** (under the four panel buttons) onto a page to attach it — a file picker, an upload box, anywhere that takes a document. Drag it onto the delete zone at the bottom of the panel to remove it, or press the × on the card. Generating on a new posting replaces the previous files — the shelf title typewrites the new posting's name and the cards slide in, so the swap is obvious. Turn on **Download too** if you also want each PDF saved to your computer.

The job details dialog shows what was read from the posting — job title, company, location, recipient — and the keywords it matched. Correct anything that is wrong; the fix goes into the PDF, the resume header and the Job Tracker card, and is remembered for that posting so the cover letter picks it up. If nobody answers it, it saves after 30 seconds; typing in a field stops the countdown. Cancel saves nothing. Turn it off with **Don't ask again**, or **Review extracted job details** in Settings → Interface.

If generation fails, the panel stays red — click the **?** button (top right) for a readable message plus copyable raw details. The error clears when you retry or start a new run.

## Form Filler

**Fill Form** (next to the Job Tracker button) fills the empty fields on an application form from answers you save once in Settings → **Form filler**: name, contact details, location, work eligibility, salary expectation, start date, links, and your own answers for the questions forms keep asking. *Auto-fill from my resume* pulls the name, email, phone, city, links and years of experience straight out of the resume you already built.

It runs entirely in your browser — no AI, no upload, no provider call. A question with no saved answer is **left empty and highlighted** with a dashed amber outline, and the panel tells you how many fields still need you. It never overwrites a field you already filled, never touches consent boxes, terms or captchas, and **never submits the form**. It is free, like everything else here.

Refine Resume and Check ATS are still disabled with a **Soon** badge while they are rebuilt without AI.

## Feedback

Settings → **Feedback** sends a bug report or an idea straight to the developer. Add your email so the answer can come back to you, write the message, and press **Send feedback** — no account needed.

The message goes to the developer's own server, which stores it and emails it on. Only what you typed is sent, plus the extension version and browser so a bug can be reproduced. Tick **Include the page I'm on** and the address of the page goes along too — never what is written on it. Your resume, cover letters and job postings are never included, and the extension keeps no copy.

If the feedback service cannot be reached, the box hands the message to your own mail app instead.

## Configuration

Resume generation works out of the box and is fully local. One optional integration requires your own credentials.

### Optional cloud sync + Supporter plan (Clerk + Convex)

PocketResume is free and complete without a backend. Sign in only if you want resumes synced across devices — **sync is free for any account**, and signing out stops it without deleting anything. The optional **Supporter** plan (`pocketresume_pro`, $4/month or $47/year) is a tip jar: it adds a badge in the panel, the account card and the Job Tracker, and unlocks no features.

Sign-in, the plan lookup and the embedded pricing table run through [Clerk](https://clerk.com); synced resumes are stored in your own [Convex](https://convex.dev) deployment (`convex/resumes.ts`):

1. Fill in `CLERK_PUBLISHABLE_KEY`, `CLERK_FRONTEND_API_URL`, and `CONVEX_URL` in `.env.local`
2. Run `npm run build:clerk` to bundle `src/cloud-sync.js` → `cloud-sync.js` with your env vars injected
3. Sign in from Settings → Account & Cloud Sync; resumes sync both ways automatically while signed in
4. For backend work: `npx convex dev` from the repo root
5. In Clerk, name the plan **Supporter** and disable the free trial on it — nothing is gated, so a trial would only hand out the badge for free

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
- **Design system:** `libs/theme.css` — Warm Press tokens (paper/ink `oklch`, hairline rules, 2–4px radii), the bundled Fraunces + IBM Plex fonts (`libs/fonts/`), the paper sheet, and the build overlay. Paper and ink share one palette; `html[data-theme="ink"]` flips it
- **Build simulation:** [@magnoscg/agent-build](libs/agent-build.min.js) (vendored, MIT) running inside `swarm.html`, an iframe whose body holds nothing but the rendered sheet (`resume-html.js`)
- **PDF:** [jsPDF](libs/jspdf.umd.min.js) (vendored)
- **Resume engine:** deterministic in-extension parser + JD aligner (`resume-parse.js`, `resume-align.js`, `skill-lexicon.js`)
- **Company directory:** deterministic local matcher + learner (`company-directory.js`, `company-directory-store.js`, `libs/company-directory-global.js`)
- **Job title / location directories:** deterministic local matchers + learners (`job-title-directory.js`, `job-location-directory.js`, `directory-core.js`) with bundled O*NET and GeoNames lists. Job titles are cleaned and arbitrated from every candidate on the page (`extractJobTitle`) before they reach the resume.
- **Cloud (optional):** [Clerk](https://clerk.com) auth + the Supporter tip jar, [Convex](https://convex.dev) resume sync and the feedback endpoint
- **Feedback mail:** [Resend](https://resend.com) (server-side only, optional)
- **Build:** esbuild (only for `cloud-sync.js` bundle); no bundler for app code

## Development

```bash
# Install deps
npm ci

# Rebuild cloud-sync.js / cloud-sync-core.js after editing src/cloud-sync.js
npm run build:clerk

# Free-access guard + deterministic engine + PDF layout checks (no network)
npm run test:access
npm run test:align
npm run test:render
npm run test:resumehtml
npm run test:formfill
npm run test:pdfstore
npm run test:jdcorrections
npm run test:companydir
npm run test:directories
npm run test:titles
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
- [Clerk](https://clerk.com) — sign-in and the optional Supporter plan
- [Convex](https://convex.dev) — resume sync and the feedback endpoint
- [Resend](https://resend.com) — delivery of feedback email (optional)
- [Pollinations](https://pollinations.ai) and [Ollama](https://ollama.com) — opt-in AI for the Resume health check and Generate letter
- [O*NET](https://www.onetcenter.org/) — skill vocabulary (CC BY 4.0)

## License

[MIT](LICENSE) © 2026 Isaac Daniel · [pocket-resume.xyz](https://pocket-resume.xyz)
