# PocketResume

> AI-powered Chrome extension that generates tailored resumes and cover letters from any job description. Paste your master profile once — PocketResume rewrites it for every application.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green.svg)](manifest.json)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-lightgrey.svg)](https://developer.chrome.com/docs/extensions/)

## Features

- **4 Resume Layouts** — Professional, FAANG, Deedy (double-sided, dense two-column), Academic CV
- **5 AI Providers** — Google Gemini, OpenAI, Anthropic, OpenRouter, plus any custom/local OpenAI-compatible endpoint (Ollama, LM Studio, NVIDIA NIM, Groq, ...)
- **AI Form Filler** — One click fills application form questions ("Why are you a great fit?") in your voice: first person, plain words, no AI tells, resume as the only source of facts. Never submits or overwrites — you review and hit submit
- **Model Selection** — Override the model per provider; fetch the live model list from each provider
- **Cover Letters** — Optional, single-page cover letter generated alongside your resume
- **Clear Error Reporting** — Generation failures keep the popup red until you close it or retry; a "?" button opens a human-readable error message with copyable raw details
- **PDF Export** — Clean, print-ready PDFs via jsPDF for every layout
- **Refine Resume** — AI polishes your master resume with change summary + warnings, side-by-side review before applying
- **Extract JSON** — Converts freeform resume text into structured JSON profile
- **Multi-Profile** — Save up to 3 master profiles and switch between them
- **PocketResume Pro** — Optional one-plan upgrade: resume cloud sync across devices + the full Job Tracker (sign in from Settings → PocketResume Pro)
- **Privacy First** — API keys and profile data stored locally

### What's New in v7.9

- **AI Form Filler** — New "Fill Form" button in the popup. Detects application form questions on the page (including embedded ATS iframes) and answers them using your resume as the only source of facts. Answers are written to sound human: first person, everyday words, no em dashes, no buzzwords. Unanswerable questions are left blank, and the form is never auto-submitted.
- **One Pro plan** — The separate "Cloud Sync" plan was merged into **PocketResume Pro**. One subscription now covers resume cloud sync, the full Job Tracker, and everything Pro going forward. The 7-day free trial moved to PocketResume Pro; existing Cloud Sync subscribers keep access automatically.

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
2. Select AI provider → paste API key → "Set as Active Provider"
   - For **Custom / Local**: pick a preset (Ollama, LM Studio, NVIDIA NIM) or enter any OpenAI-compatible Base URL, optional API key, and model → "Test Connection" → "Save Endpoint" → "Set as Active Provider"
3. Paste your master resume into the profile text area → **Save**
4. (Optional) Enable Cover Letter toggle
5. (Optional) Unlock PocketResume Pro — Settings → PocketResume Pro → Sign In → subscribe. One plan covers resume cloud sync and the full Job Tracker

## Usage

1. Navigate to any job posting (LinkedIn, Indeed, company pages)
2. Click PocketResume icon → choose resume style
3. Click **Generate Resume**
4. PDF downloads automatically
5. Hit an application form with essay questions? Click **Fill Form** — PocketResume answers using your resume, then you review and submit

If generation fails, the popup stays red — click the **?** button (top right) to see a readable error message with the option to copy the full raw details. The error clears when you close the popup or click **Generate Resume** again.

## Configuration

Resume generation works out of the box and is fully local. Two optional integrations require your own credentials:

### Analytics backend (Convex)

Usage analytics go to your own Convex deployment (`convex/analytics.ts`):

1. Copy `.env.example` to `.env.local`
2. Fill in your Convex values from [convex.dev](https://dashboard.convex.dev):
   - `CONVEX_URL` — deployment URL
   - `CONVEX_DEPLOYMENT` — local deployment name
3. For backend work: `npx convex dev` from the repo root

### PocketResume Pro (Clerk + Convex)

One paid plan ("PocketResume Pro") gates resume cloud sync, plan gating, and the full Job Tracker. Sign-in, plan checks, and the embedded pricing table run through [Clerk](https://clerk.com); synced resumes are stored in your own [Convex](https://convex.dev) deployment (`convex/resumes.ts`):

1. Fill in `CLERK_PUBLISHABLE_KEY`, `CLERK_FRONTEND_API_URL`, and `CONVEX_URL` in `.env.local`
2. Run `npm run build:clerk` to bundle `src/cloud-sync.js` → `cloud-sync.js` with your env vars injected
3. Push/restore resumes from Settings → PocketResume Pro; changes auto-push while signed in

`.env.local` is gitignored. **Never** commit `cloud-sync.js` (it's a build artifact) or `convex/_generated/` (regenerated by the Convex CLI).

## Tech Stack

- **Runtime:** Vanilla HTML/CSS/JS, Manifest V3
- **PDF:** [jsPDF](libs/jspdf.umd.min.js) (vendored)
- **AI:** Gemini, GPT-4o-mini, Claude 3.5 Haiku, OpenRouter, plus any custom/local OpenAI-compatible endpoint
- **Cloud (optional):** [Clerk](https://clerk.com) auth + pricing (Pro), [Convex](https://convex.dev) resume sync + analytics backend
- **Build:** esbuild (only for `cloud-sync.js` bundle); no bundler for app code

## Development

```bash
# Install deps
npm ci

# Rebuild cloud-sync.js after editing src/cloud-sync.js
npm run build:clerk

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
- [Convex](https://convex.dev) — resume sync + analytics backend
- AI providers: [Google Gemini](https://ai.google.dev/), [OpenAI](https://openai.com/), [Anthropic](https://anthropic.com/), [OpenRouter](https://openrouter.ai/)

## License

[MIT](LICENSE) © 2026 Isaac Daniel
