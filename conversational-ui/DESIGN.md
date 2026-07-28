---
version: 1.0
name: Geist-dark
description: |
  A near-black, monochrome Geist design system shared by all three dissertation
  flight apps. Depth comes from 1px hairline borders and layered background
  greys — never shadows or gradients. Colour is reserved for meaning only:
  green = low CO2 / success, amber = warning / filling-fast, blue = link /
  action, red = error / delay. Geist Sans carries everything narrative; Geist
  Mono (with tabular figures) carries every number and every eyebrow label.
  Reference: https://vercel.com/design.md (dark variant /design.dark.md).
---

## Overview

The system is deliberately quiet: a `#0a0a0a` canvas, `#111` cards held by a
`rgba(255,255,255,0.08)` hairline, and text in `#ededed` / `#a1a1a1`. There is
no shadow anywhere and no decorative colour. A page reads as one calm dark
sheet; the only things that carry colour are the four semantic accents, and
they appear only where they mean something.

Typography is the second voice. Geist Sans (via `@fontsource-variable/geist`)
carries display, body, and buttons; Geist Mono (`@fontsource-variable/geist-mono`)
carries every figure — prices, times, durations, kg CO2, IDs, counts, dates —
always with `tabular-nums` so digits align in columns. Section eyebrows
(`QUERY`, `OUTBOUND`, `DIRECT FLIGHTS`…) are mono, uppercase, 11px, muted, with
wide tracking. Body uses `font-feature-settings: "cv11", "ss01"` and antialiased
smoothing.

**Key characteristics:**
- Monochrome by default; colour only carries meaning.
- Depth from borders + layered greys, never `box-shadow` (all shadow utilities are no-ops).
- Cards: `--card` background, 1px `--border`, 6px radius, 20–24px padding.
- Buttons: primary = white bg / dark text; ghost = transparent, muted → foreground on hover; 6px radius.
- Inputs: transparent bg, 1px border, muted-foreground placeholder.
- Chips (sort / filter / assumption / suggestion): pills — active = filled `--foreground`, inactive = ghost 1px border.
- Every number is `font-mono` + `tabular-nums`.

## Design tokens

Token values live in `src/styles/tokens.css` (on `:root`, since the apps have no
theme toggle — dark is the base). The Tailwind v4 `@theme` mapping in
`src/index.css` exposes them as utilities (`bg-background`, `text-foreground`,
`bg-card`, `bg-accent-green`, `font-mono`, …).

### Surface & text
- `--background: #0a0a0a` — the canvas.
- `--card: #111111` — raised surfaces (`--card-foreground: #ededed`).
- `--muted: #171717` — inset panels, chips, hover fills (`--muted-foreground: #a1a1a1`).
- `--foreground: #ededed` — primary text; also the "filled" chip / primary-button background.
- `--border: rgba(255,255,255,0.08)` — every hairline. `--input: rgba(255,255,255,0.12)`.

### Accents (meaning only)
- `--accent-green: #00c853` — low CO2, success.
- `--accent-amber: #f5a623` — warnings, filling-fast.
- `--accent-blue: #0072f5` — links, focus ring, primary actions (also `--ring`).
- `--accent-red: #ff4d4f` — errors, delays, over-budget (also `--destructive`).

### Geometry
- `--radius: 6px` — cards, buttons, inputs, panels. Chips and avatars are full pills.

## Typography

- `--font-sans: 'Geist Variable'` — display, body, buttons, headings (`--font-heading` aliases it).
- `--font-mono: 'Geist Mono Variable'` — all numbers + eyebrow labels.
- Numbers: **always** `font-mono tabular-nums` (prices, times, durations, kg CO2, IDs, counts, dates).
- Eyebrows / section labels: `font-mono uppercase text-[11px] tracking-[0.15em] text-muted-foreground`.
- Headlines: Geist Sans, medium/semibold, tight tracking, sentence case (never uppercase outside mono labels).

## Colour usage

Monochrome is the default. Introduce an accent **only** to signal:
- CO2 / emissions figures and success states → `text-accent-green`.
- Warnings, "filling fast", caution → `accent-amber`.
- Links, focus, the one primary action per view → `accent-blue` (focus ring) or the white primary button.
- Errors, delays, over-budget deltas, destructive hover → `accent-red`.

Never use accent colour decoratively. Demand badges, cabin pills, metadata, and
dividers all stay in `foreground` / `muted-foreground` / `border`.

## Surfaces, elevation & shape

- **No shadows.** Every card/panel/modal is defined by `border border-border`. `shadow-card*` / `shadow-modal` tokens resolve to `none`.
- **Layered greys** give depth: `background` (0a0a0a) → `card` (111) → `muted` (171717) → translucent `white/[0.04–0.10]` for hover/fills.
- Radius 6px (`rounded-lg`) for rectangles; `rounded-full` for chips, status dots, avatars, icon buttons.

## Components

- **Card**: `bg-card border border-border rounded-lg` + `p-5`/`p-6`, no shadow. Hover raises the border to `border-white/20`.
- **Primary button**: white bg / dark text (`bg-foreground text-background`, or the Button primitive's `bg-primary`), 6px radius. One per view.
- **Ghost button**: transparent, `text-muted-foreground` → `text-foreground` on hover, optional 1px border.
- **Input / composer / search pill**: `bg-transparent border border-border`, muted placeholder, focus → `border-white/30` (or `accent-blue` ring on form inputs).
- **Chips**: pill (`rounded-full border border-border`). Active/selected = `bg-foreground text-background border-transparent`; inactive = ghost muted. The assumption chip carries a green check + a chevron and is tappable.
- **Section label**: mono uppercase 11px muted eyebrow above the block it names.
- **Numbers**: mono + tabular everywhere.

## This app — conversational-ui (conversational paradigm)

A single chat feed. User messages are a light bubble (`bg-foreground
text-background`, top-right clipped); assistant messages are a muted bubble
(`bg-muted`, top-left clipped) with the flight carousel, a 3-up stats strip, and
follow-up chips beneath. Above each result set sits the **assumption chip** —
"Searching from ✓ [all London airports]" — a tappable ghost pill with a green
check that opens the London-airport picker; the cabin chip beside it is
display-only. The composer is a transparent pill at the bottom with a white
circular send button. The typing indicator uses muted bouncing dots.

## Do / Don't

**Do**
- Reach for a border or a lighter grey before a shadow.
- Put every figure in `font-mono tabular-nums`.
- Keep one filled (white) primary action per view; everything else ghost.
- Let green/amber/blue/red appear only where they carry meaning.

**Don't**
- Add `box-shadow`, gradients, or decorative colour.
- Use `bg-white` / `text-black` / raw `neutral-*` — use the semantic tokens.
- Uppercase anything except mono eyebrow labels.
- Resize/rewrap a form when a control toggles (fixed flex bases; one slot per swap).
