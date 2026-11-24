# PocketResume launch kit — free forever

The v11.0.0 release removes the account wall. This file holds the copy that release
needs: store listing, announcement, posts, and the claims that are safe to make.

## The position

**The resume tool that never asks you to sign up.**

Every competitor in this category puts an account (and usually a subscription) between
the user and a PDF. PocketResume does not: the engine runs in the browser, the result is a
local PDF, and the only thing an account does is put your resumes on your other devices.
That is the whole ad.

Three claims, in priority order:

1. **Free forever, no account.** Not a trial, not "free until Dec 31", not a free tier.
2. **Your resume stays in your browser.** No upload, no API key, no server round-trip for
   generation or form filling.
3. **A real engine, not a prompt.** Deterministic JD alignment with a verifier that refuses
   to invent numbers or wording.

## One-liners

- Free forever. No account. No trial countdown.
- Tailor your resume on your device — nothing to sign up for.
- The only resume tool where "it's free" is the whole business model.
- Paste once. Generate a tailored PDF on any job page. Don't make an account.
- No account wall, no paywall, no API key. Just a PDF.

## Store listing

**Short description** (already in `manifest.json`):

> Tailor your resume to any job posting — free forever, no account, on your device.

**Long description paragraph to lead with:**

> PocketResume tailors your saved resume to the job posting you are looking at, then hands
> you a clean PDF. Everything runs in your browser: no account, no upload, no API key, no
> subscription. Sign in only if you want your resumes synced across devices — and if you
> want to support the project, there is an optional $4/month tip jar that unlocks nothing.

Close with:

> Free now, free later. The paid plan is a tip, not a gate.

## Release announcement (What's New modal / changelog voice)

> **Free forever, no account needed.** Generate resumes, cover letters, fill forms and use
> the Job Tracker without signing in. There is no trial, no deadline and no paywall.
> Signing in is only for cloud sync, and the old Pro plan is now an optional **Supporter**
> tip that adds a badge and nothing else.

## Social posts

**Short (X / Bluesky):**

> PocketResume is now free forever, no account needed.
>
> Resume tailoring runs in your browser — no upload, no API key, no trial countdown.
>
> Sign in only if you want sync. $4/month if you want to support it. That's the whole pitch.

**Longer (LinkedIn / r/resumes):**

> Every resume tool I looked at wanted an account before it would produce a PDF, and most
> wanted a subscription after a week. So mine doesn't.
>
> PocketResume reads the job posting you're on, aligns your saved resume to it with
> deterministic rules (no AI inventing bullets, a verifier rejects any number that isn't in
> your resume), and gives you a PDF. The engine runs in the extension, so nothing leaves
> your browser unless you ask it to sync.
>
> It is free forever. No account, no trial, no paywall. Sign-in is only for syncing across
> devices, and there is an optional $4/month tip jar for people who want to support the
> work — it adds a badge and unlocks nothing.
>
> Open source, MIT: github.com/Isaac-1555/pocket-resume

## FAQ / objection handling

- **"What's the catch?"** None. The engine is local, so serving a PDF costs nothing. Sync
  is the only server call, and it is free.
- **"Why would anyone pay?"** Because they want the project to keep going. The Supporter
  tier is a tip jar with a badge — say so plainly; hiding it reads as a bait-and-switch.
- **"Do I have to sign in to sync?"** Yes — sync needs an identity to attach the resumes to.
  Everything else works signed out.
- **"Is my resume uploaded?"** No. Generation and form filling are local. The only optional
  AI calls are the Resume health check and Generate letter, and both are opt-in.
- **"Do you sell data?"** No. There is nothing to sell: nothing is collected.

## Claims to avoid

- **Not AI.** Alignment is deterministic, rule-based selection and trimming. Say
  "deterministic" or "rule-based", never "AI rewrites your resume".
- **Not "unlimited resumes".** The app keeps up to **3** master resumes.
- **Not an ATS guarantee.** It never promises a pass rate — say it keeps the layout clean
  and the wording truthful.
- **Not "no data leaves the device, ever."** Sign-in, sync, feedback and the two opt-in AI
  features do send data. Say "nothing leaves your browser unless you sign in or start an
  opt-in feature".
- **Not "double sided here".** The UI calls the dense layout *Double Sided*; the stored id
  stays `deedy`, so do not promise a "Deedy" template in copy.

## Where the story lives in the product

- Panel header account button: Sign in / Account / Supporter.
- Settings → Account card: "No account needed", **Sign in to sync**, **Support PocketResume**.
- Job Tracker badge: Free / Supporter.
- One-time supporter nudge, after the first generated resume, dismissible.
- What's New modal, shown once per version.
