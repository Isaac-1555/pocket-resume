# PocketResume — Glass Redesign Spec

Companion doc to `pocketresume-glass-redesign.html`, which is the reference implementation. Give the agent both files — the HTML is the source of truth for exact values; this doc explains intent, structure, and what to leave out of the real build.

## Concept

Premium glass UI on a solid black background. Every component is a frosted glass surface — translucent fill, blurred backdrop, thin light border, and a soft inner highlight along the top edge to sell the "edge catches light" look. Text and icons are white. The one accent color is orange, reserved for the primary action and active/selected states.

The background also acts as a status indicator: a soft ambient glow sits behind the whole popup and changes color with the resume-generation lifecycle — neutral at rest, blue while working, green on success, red on failure.

## Design tokens

```css
--bg: #050506;

--glass-fill: rgba(255,255,255,0.055);
--glass-fill-strong: rgba(255,255,255,0.09);   /* hover state */
--glass-border: rgba(255,255,255,0.14);
--glass-highlight: rgba(255,255,255,0.35);      /* inset top-edge highlight */

--text: #ffffff;
--text-dim: rgba(255,255,255,0.52);             /* secondary text, icons */
--text-faint: rgba(255,255,255,0.32);           /* chevrons, tertiary */

--orange: #f4933b;
--orange-strong: #ff7a1a;
--orange-fill: rgba(244,147,59,0.16);
--orange-fill-strong: rgba(244,147,59,0.30);
--orange-border: rgba(244,147,59,0.55);

--glow-idle: 20,20,22;
--glow-generating: 56,132,255;   /* blue */
--glow-success: 43,214,132;      /* green */
--glow-failure: 255,86,86;       /* red */
```

Typography: system font stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Inter, Helvetica, Arial, sans-serif`). No custom font loading needed. Title 21px/600, body ~14.5px/500, secondary/caption ~12–13px.

Border radius scale: 28px outer popup frame, 16–17px cards/buttons, 13px avatar, 9px small controls.

## The glass recipe

Every glass surface uses the same base recipe (this is the `.glass` class in the HTML):

- `background: var(--glass-fill)`
- `border: 1px solid var(--glass-border)`
- `backdrop-filter: blur(20px) saturate(150%)` (+ `-webkit-` prefix for Safari/older Chromium)
- `box-shadow: inset 0 1px 0 var(--glass-highlight), inset 0 -1px 0 rgba(0,0,0,0.25), 0 10px 24px rgba(0,0,0,0.35)`

`backdrop-filter` needs something behind it to blur — the solid black `--bg` satisfies that, so no extra setup needed. This is supported in Chrome extension popups (Manifest V3) without a polyfill.

On hover, swap `--glass-fill` → `--glass-fill-strong` (dropdown, list rows).

## Components

**Popup frame** — 380px wide, 28px radius, `--bg` with a very faint top radial highlight, 1px hairline border, heavy drop shadow to lift it off the page. This is the outermost container everything else sits inside.

**Header** — Logo mark (58px, 17px radius, dark gradient tile, not glass — it's the brand mark) centered, title + tagline below it, centered text.

**Avatar (profile pic)** — 42px, 13px radius glass square, positioned absolute top-right of the header, showing initials. Moved here per spec (was previously top-left, stacked above the content).

**Section label** ("Resume style") — small icon + dim text, not a glass surface itself, just a label above the dropdown.

**Dropdown** ("Professional (Corporate Standard)") — full-width glass row, label left, chevron-down right, hover state brightens fill.

**Style toggle (SWE / PM)** — two glass buttons side by side, icon over label, equal width. Selected state (`.active`): fill switches to `--orange-fill`, border to `--orange-border`, icon color to `--orange`, plus a soft orange outer glow (`box-shadow: 0 0 22px rgba(244,147,59,0.22)` added on top of the base glass shadow).

**Cover Letter toggle row** — glass row, icon + title + subtitle on the left, switch control on the right.

**Switch control** — track is orange glass when on (`--orange-fill-strong` fill, `--orange-border` border), neutral glass when off (`--glass-fill`/`--glass-border`). White circular thumb slides between the two ends. This is the one place the switch itself doesn't follow the "orange only for primary action" framing as strictly — treat it as orange-when-active, neutral-when-inactive.

**Generate PDF Resume button** — the orange-tinted glass surface, per spec:
- `background: linear-gradient(160deg, rgba(255,150,60,0.32), rgba(244,110,30,0.18))`
- `border: 1px solid var(--orange-border)`
- `backdrop-filter: blur(20px) saturate(160%)`
- `box-shadow: inset 0 1px 0 rgba(255,210,160,0.45), inset 0 -12px 20px rgba(180,70,10,0.18), 0 0 30px rgba(244,147,59,0.28), 0 10px 26px rgba(0,0,0,0.4)`

This is the single most saturated surface in the UI — everything else is quieter so this stays the visual anchor.

**Settings / Job Tracker rows** — plain glass list rows, icon + label left, optional chevron right (Settings has one, Job Tracker doesn't in the current screenshot — carried that over as-is).

## State-driven background glow

This is the main new interaction. Two layers work together:

1. **Outer ambient glow** (`.glow-layer` in the HTML) — a large blurred radial gradient sitting behind the popup frame, extending well past its edges. Colored by `--glow-idle` / `--glow-generating` / `--glow-success` / `--glow-failure` via `rgba(var(--glow-*), alpha)`. Pulses (scale + opacity animation) while generating; settles in with a quick scale/fade on success or failure.
2. **Inner wash** (`.frame::before`) — a much subtler radial tint inside the glass frame itself, same color, low opacity, so the tint reads through the UI and not just as a halo around it.

State lifecycle, driven by a single state attribute (`data-state="idle" | "generating" | "success" | "failure"` on the frame's wrapper element in the reference — implement as whatever your state-management pattern is, e.g. a class on the popup root):

- **idle** — neutral/near-black glow, low opacity, static.
- **generating** — blue, high opacity, gentle pulse animation (~1.6s loop). Button also gets a spinner + "Generating…" label and its own glow shifts from orange to blue-tinted.
- **success** — green, high opacity, one settle-in animation (no loop). Button shows a checkmark + "Done — PDF ready".
- **failure** — red, high opacity, one settle-in animation. Button shows an X + "Failed — try again".

Transition back to idle after a few seconds, or on next user action — whatever fits the extension's actual generation flow (the reference mockup auto-resets after ~2.4s post-result as a demo convenience only).

Exact color triads (already in the token list above): blue `56,132,255`, green `43,214,132`, red `255,86,86`.

## Not part of the real build

The reference HTML includes a row of demo buttons (Idle / Generating / Success / Failure) below the popup mockup, plus the JS that wires them up and auto-triggers a fake generation cycle on button click. That's scaffolding to preview the states — it should be replaced with the extension's real generation logic (the actual API call to generate the resume), which should set the state to `generating` on request start, then `success` or `failure` based on the real result.

## Assets note

Icons in the reference are inline SVG (stroke-based, matching the existing outline icon style from the current extension — grid, envelope, gear, arrows, etc.) so there's no icon font/library dependency to add. The logo mark is a simple inline SVG placeholder standing in for the existing app icon — swap back in the real PocketResume icon asset.
