# PocketResume

AI-powered Chrome extension that generates tailored resumes and cover letters from any job description. Paste your master profile once — PocketResume rewrites it for every application.

## Features

- **6 Resume Layouts** — Professional, FAANG, Basic, Jake (double-sided), Deedy (double-column), and Academic CV
- **4 AI Providers** — Google Gemini (`gemini-2.5-flash`), OpenAI (`gpt-4o-mini`), Anthropic (`claude-3-5-haiku`), OpenRouter
- **Cover Letters** — Optional, single-page cover letter generated alongside your resume
- **PDF Export** — Clean, print-ready PDFs via jsPDF for every layout
- **Refine Resume** — AI polishes your master resume with change summary + warnings, side-by-side review before applying
- **Extract JSON** — Converts freeform resume text into structured JSON profile
- **Multi-Profile** — Save up to 3 master profiles and switch between them
- **Cloud Sync** — Optional Clerk + Convex cloud sync across devices
- **Privacy First** — API keys and profile data stored locally (cloud sync optional)

## Installation

Not on the Chrome Web Store — load unpacked:

```bash
git clone https://github.com/Isaac-1555/pocket-resume.git
cd pocket-resume
npm install    # only needed for jsPDF dependency
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `PocketResume` directory

## Setup

1. Click the extension icon → gear icon (Settings)
2. Select AI provider → paste API key → "Set as Active Provider"
3. Paste your master resume into the profile text area → **Save**
4. (Optional) Enable Cover Letter toggle, configure cloud sync

## Usage

1. Navigate to any job posting (LinkedIn, Indeed, company pages)
2. Click PocketResume icon → choose resume style
3. Click **Generate Resume**
4. PDF downloads automatically

## Tech Stack

- **Runtime:** Vanilla HTML/CSS/JS, Manifest V3
- **PDF:** jsPDF
- **AI:** Gemini, GPT-4o-mini, Claude 3.5 Haiku, OpenRouter
- **Cloud:** Clerk auth, Convex realtime DB
- **No bundler, no build step**

## Development

```bash
# Install jsPDF dependency
npm ci

# Update vendored jsPDF
npm install jspdf@latest
cp node_modules/jspdf/dist/jspdf.umd.min.js libs/jspdf.umd.min.js
```

Edit source files directly, reload the extension in `chrome://extensions`.

Debug targets:
- **Service Worker:** extension card → "Service Worker" (Inspect)
- **Popup:** right-click popup → Inspect
- **Content Script:** target page's DevTools

## License

Open source.
