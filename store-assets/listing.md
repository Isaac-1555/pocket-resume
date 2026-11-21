# Chrome Web Store listing

Copy for the dashboard. Keep it in sync with `MARKETING.md` (claims) and the shipped
build (free model). Answers live in the store dashboard, not in the repo.

## Short description (108 / 132 chars)

```
Tailor your resume to any job posting — free forever, no account, no upload. The engine runs on your device.
```

`manifest.json` carries its own, shorter description — it is not the listing field.

## Detailed description

```
Your resume, matched to the job — on your device.

PocketResume reads the posting you're on and tailors your saved resume to it: the job title, company and location filled in from the page, the skills it asks for ranked first, your strongest bullets kept. You get a clean PDF, and a cover letter if you want one.

FREE FOREVER. NO ACCOUNT NEEDED.
Not a trial, not a free tier, not a countdown. Generate resumes, write cover letters, fill application forms and track every application without signing up. There is no paywall anywhere in the extension.

NOTHING LEAVES YOUR BROWSER.
The resume engine is deterministic and runs inside the extension. No API key, no upload, no server round-trip — your resume and the posting stay on your machine. Sign in only if you want your resumes synced across devices, and that is free too.

WHAT YOU GET
- Tailored PDFs in 3 layouts: Professional, Double Sided (always one page), Academic CV
- A cover letter per resume, with the company and role filled in
- Job details review: correct the title, company, location or recipient once — the fix goes into the PDF, the resume header and the tracker, and is remembered for that posting
- Form Filler: answers the application questions you saved once. It never submits, never overwrites a field you filled, and never touches consent boxes
- Job Tracker: every generation becomes a card, with a pipeline board and a graph view
- Quick Download: re-export your saved resume without reading a page
- Directories that learn: employer, job title and location variants are recognised locally, and your corrections stay on your device

HONEST ABOUT THE LIMITS
- It selects, reorders and trims what your resume already says. It does not invent experience, and a verifier rejects any number that isn't in your profile
- Up to 3 master resumes
- No ATS score. It keeps the layout clean and the wording truthful — nothing more

HOW IT WORKS
1. Paste your resume once. The local parser turns it into an editable profile
2. Open any job posting and click Generate Resume
3. Drag the finished PDF from the side panel onto the application form

OPTIONAL SUPPORT
There is a Supporter plan at $4/month or $47/year. It unlocks nothing — every feature is already free. It exists for people who want to chip in.

Ideas, bugs, anything else: Settings → Feedback.
Source: github.com/Isaac-1555/pocket-resume
Website: pocket-resume.xyz
```

## "What's new" (11.0.0 listing update)

```
Free forever, no account needed. Generation, cover letters, the Form Filler and the Job Tracker all work signed out — no trial, no deadline, no paywall. Signing in is now only for optional cloud sync, and the old Pro plan became an optional Supporter tip that unlocks nothing.
```

## Assets

Regenerate everything from the repo (Playwright + the real extension pages):

```sh
npm run build:store-assets
```

| Asset | Size | File |
| --- | --- | --- |
| Screenshot 1 — free model + panel | 1280×800 | `screenshots/1-hero.png` |
| Screenshot 2 — resume + cover letter | 1280×800 | `screenshots/2-resume-cover-letter.png` |
| Screenshot 3 — three layouts | 1280×800 | `screenshots/3-layouts.png` |
| Screenshot 4 — Job Tracker funnel | 1280×800 | `screenshots/4-job-tracker.png` |
| Screenshot 5 — paste once / parser | 1280×800 | `screenshots/5-master-resume.png` |
| Small promo tile | 440×280 | `promo/tile-small-440x280.png` |
| Marquee promo tile | 1400×560 | `promo/tile-marquee-1400x560.png` |

The frames are paper and ink on purpose: the marketing shots and the app UI must look like
the same product. Colours come from `libs/theme.css`, so a palette change reaches the store
assets without editing the templates.

## Claims to avoid

See `MARKETING.md` → *Claims to avoid*. Short version: no "AI rewrites your resume", no ATS
guarantee, no "unlimited resumes", no "no data ever leaves the device" (sign-in, feedback and
the two opt-in AI features do send data).
