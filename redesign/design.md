# PocketResume — Landing Page Design System

## 0. Brief

**Product:** PocketResume — an AI Chrome extension that turns a saved master resume into a tailored resume + cover letter for any job posting, in 4 layouts, using the AI provider you choose (Gemini, GPT-4o, Claude, OpenRouter). Local-first; cloud sync optional.

**Audience:** People actively job-hunting who apply to many roles and are tired of hand-editing a resume per posting. Technical enough to install a Chrome extension and paste in an API key; skeptical enough to want a privacy answer before they hand over their resume.

**Page's one job:** get them to click "Add to Chrome" — https://chromewebstore.google.com/detail/pocketresume/mdplmgfkpgalajmchilemiamifoaneip

**Repo:** github.com/Isaac-1555/pocket-resume

## 1. Concept

Every screen in the product is the same move: a generic document goes in one side, a specific one comes out the other, shaped by whatever's in between. That's what glass does to light — bends it, doesn't stop it. The whole page treats **glass-and-light as a working metaphor for "rewritten," not just a texture.** Job description in one pane, resume out the other, AI in the middle as the medium the light passes through.

That's also why the accent isn't one glow, it's three — amber, cyan, violet — one per family of AI provider the extension supports. Three colors of light hitting the same glass, always resolving to the same warm result (your resume). Multi-provider-by-design is a real feature, not a footnote, so it gets to be the color story instead of a bullet point.

## 2. Tokens

### Color

| Name | Hex | Use |
|---|---|---|
| Ink | `#0A0D12` | Base background |
| Ink Raised | `#11151D` | Card/panel base tone under the glass |
| Paper | `#F4F1E8` | Primary text, warm off-white (paper, not screen-white) |
| Slate | `#8890A0` | Secondary text, captions, borders on glass |
| Amber Signal | `#FF8A3D` | Primary accent + CTA glow (the "match found" color) |
| Cyan Circuit | `#4FD7E0` | Secondary glow, technical/precision moments |
| Violet Drift | `#9B7BFF` | Tertiary glow, the "other provider" color |

Glass surfaces: `rgba(244,241,232,0.06)` fill, `rgba(244,241,232,0.14)` 1px border, inner highlight `rgba(255,255,255,0.10)` top edge only, `backdrop-filter: blur(20px) saturate(140%)`. Glows never sit flat behind glass — they sit *behind and slightly offset*, so the blur pulls a soft chromatic fringe at the glass edge (cheap fake refraction: a saturated, slightly hue-rotated duplicate of the glow blurred more and offset 2–4px).

### Type

| Role | Face | Notes |
|---|---|---|
| Display | **Fraunces** (variable, optical size high, some italic) | Hero headline, section titles. Set large, tight leading. This is the "paper" reference — a serif built for print showing up on a screen full of glass. |
| Body | **Inter** | All running copy, feature text. Stays out of the way. |
| Utility/Mono | **JetBrains Mono** | Eyebrows, AI provider names, small labels, the "manifest.json" texture — uppercase, wide tracking, small size. This is the "extension/code" reference. |

Scale: 15px body / 1.6 line-height. Headline ~clamp(2.75rem, 6vw, 5.5rem), Fraunces at optical size 144, weight 380 (not bold — bold serif reads heavy against glass).

### Motion

anime.js v4 (`import { animate, onScroll, stagger, createTimeline } from 'animejs'`), used for exactly two things:

1. **Entrances** — feature cards and layout thumbnails fade + rise (12px) with `stagger()`, triggered once via `onScroll({ enter: 'bottom-=10% top', sync: false })` per card row. No repeat, no bounce.
2. **The signature scroll piece** (Section 4 below) — a `createTimeline` scrubbed with `onScroll({ sync: 0.15 })` so it tracks scroll position directly rather than firing once. This is the one place motion is the content, not decoration.

Respect `prefers-reduced-motion`: signature piece becomes a static end-state image; entrances become opacity-only, no transform.

## 3. Layout

```
┌─────────────────────────────────────────┐
│  eyebrow (mono)                          │
│  Fraunces headline, 2 lines              │
│  one-line subhead (Inter, Slate)         │
│  [ Add to Chrome ] [ View on GitHub ]    │  ← glass buttons, hero glass card
│  glow blobs bleed in from top corners    │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  short editorial line, no card,          │  ← quiet beat, let hero breathe
│  sets up "here's how it actually works"  │
└─────────────────────────────────────────┘
┌── pinned / sticky ────────────────────────┐
│ [glass pane: job desc text]  ⇢  [glass pane: resume bullets]
│ light passes through, color = active provider (amber/cyan/violet cycle)
└─────────────────────────────────────────┘   ← SIGNATURE ELEMENT
┌─────────────────────────────────────────┐
│  ⬚ card   ⬚ card   ⬚ card                 │  ← feature grid, glass cards,
│  ⬚ card   ⬚ card   ⬚ card                 │    2–3 col, no numbering (not a sequence)
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  ◧ Professional  ◧ FAANG  ◧ Deedy  ◧ CV  │  ← 4 layout previews, glass frames,
│  (labeled by name, not 01–04)            │    horizontal on mobile
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  JOB TRACKER — mini kanban mockup        │  ← 4 glass columns (Applied /
│  Applied / Screening / Interview / Offer │    Screening / Interview / Offer),
│  one cyan glow, mono column labels       │    job-mini cards inside; note
│                                          │    explains auto-capture + graph view
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  privacy strip — glow OFF, flat Ink,     │  ← deliberate contrast: the one
│  no glass, plain paper-colored text      │    section that drops the effect,
│  "your data stays local" reads as fact   │    because trust shouldn't sparkle
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  closing headline + [ Add to Chrome ]    │  ← final glass CTA, glow returns
└─────────────────────────────────────────┘
```

## 4. Signature element — "The Refraction"

A pinned section (height ~250vh, content sticky inside it). As the user scrolls through it:

- Left glass pane holds a real (shortened) job-posting excerpt in Inter, Slate.
- A vertical beam of light — a blurred, saturated gradient bar — sweeps left → right, timeline-driven by scroll position (`onScroll({ sync: 0.15 })`), not time.
- As the beam crosses the gap between panes, small mono labels flick past behind it: `GEMINI-2.5-FLASH` → `GPT-4O-MINI` → `CLAUDE-3.5-HAIKU` → `OPENROUTER`, each tinting the beam amber/cyan/violet/amber.
- Right glass pane's resume bullets type/reveal in via `stagger()` on character spans, timed to the beam's arrival, in Fraunces at small size (paper-as-output).
- End state (final ~20% of scroll): beam settles to Amber Signal, both panes lock, a small mono caption reads `same resume, right job` — the one line of copy this section needs.

This is the only place all three glow colors and both scroll-linked animation and the refraction visual metaphor meet — it should carry the page.

## 5. Copy direction

- Register: plain, a little dry, written by someone who has personally rewritten a resume for the 40th time — never "revolutionize your job search."
- Hero subhead candidate: "Paste your resume once. PocketResume rewrites it for every posting you open."
- CTA verb stays identical everywhere it appears: **Add to Chrome** (matches the store button people will actually see next).
- Privacy section speaks in flat statements, not reassurance-speak: "Your API key stays in your browser. Cloud sync is off unless you turn it on."
- Feature card titles name what the person gets (**4 resume layouts**, **Cover letters, optional**, **Works with your AI key**), not internal mechanisms.
- Providers named on the page must match the app's five: Gemini, OpenAI, Anthropic, OpenRouter, **plus Custom/Local (Ollama, LM Studio, any OpenAI-compatible endpoint)** — never list only four.
- Pricing posture: "Add to Chrome — it's free" stays; one flat footnote near the final CTA covers paid cloud sync + tracker upgrades. No pricing tables on the landing page.
- The Job Tracker gets its own section (mini kanban mockup, cyan glow) plus a feature-grid card — it auto-captures every generated application and is the newest surface in the product.

## 6. Build notes for next pass

- Fake refraction (cheap, real-time-safe): duplicate the glow blob, blur it more, offset 2–4px, hue-rotate a few degrees, place *behind* the glass with `mix-blend-mode: screen`. Full SVG `feDisplacementMap` distortion only on the signature element, where the cost is worth it.
- Keep glass border-radius consistent (one value, e.g. 20px) across buttons and cards — variety comes from size and glow, not corner shape.
- Only the signature element and the hero get more than one glow color visible at once; everywhere else, one glow per section keeps it from turning into a light show.
