# Accessibility audit — designs, colours, fonts

**Scope:** `dashboard-ui`, `conversational-ui`, `generative-ui` (all screens / layouts at `main` @ `6c32e80`)  
**Method:** Static review of design tokens, typography classes, focus/ARIA patterns, and WCAG 2.1 contrast math (relative luminance). Not a live axe/browser audit or user testing.  
**Standard referenced:** WCAG 2.1 Level AA (normal text ≥4.5:1; large text / non-text UI ≥3:1).

---

## Verdict

Core body copy and primary surfaces are strong on contrast. The main gaps are **micro-typography (8–11px muted labels)**, **token parity** (chat apps lack dashboard `--link` / semantic status tokens), **weak borders on interactive chips**, **small touch targets**, and **incomplete `prefers-reduced-motion`** coverage outside a few animations.

---

## What already works

| Area | Finding |
|------|---------|
| Body / card text | `#ededed` on `#0a0a0a` / `#111111` ≈ **16–17:1** (AAA) |
| Muted body | `#a1a1a1` on bg/card ≈ **7.3–7.7:1** (AA+) when used at full opacity and ≥12px |
| Form control edges | `--input: #646464` ≈ **3.2:1** on card — meets non-text UI AA |
| Dashboard link text | `--link: #4c9dff` ≈ **6.8:1** on card (explicitly lifted because brand blue fails AA as text) |
| Fonts | Geist Variable + Geist Mono via `@fontsource-variable` in all three apps |
| Focus | shadcn buttons/inputs use `focus-visible` + `--ring` (`#0072f5`) |
| Live regions | Chat typing / status use `role="status"` / `aria-live` in places |
| Reduced motion (partial) | Dashboard search progress; conversational searching fade; generative typewriter placeholder |

---

## Contrast matrix (key pairs)

| Pair | Ratio | Normal text AA | Notes |
|------|------:|:--------------:|-------|
| Foreground on background | 16.91 | Pass | Body copy |
| Muted-foreground on card | 7.31 | Pass | Full opacity only |
| Accent blue `#0072f5` on card | 4.25 | **Fail** | OK as large text / focus ring UI (≥3:1) |
| Accent blue on background | 4.45 | **Fail** | Same |
| Chart-3 `#737373` on card (chat apps) | 3.98 | **Fail** | Do not use for readable labels |
| Muted at 40% opacity on card | ~2.2 | **Fail** | Calendar disabled / faint meta |
| Muted at 60% on card | ~3.3 | Fail normal | Borderline large-text only |
| Decorative `--border` rgba white 8% | ~1.2 | **Fail as control edge** | Decorative only; not for affordance |
| Hover `border-white/20` | ~1.8 | Fail as sole edge | Chips/pills |
| Accent green / amber / red on card | 5.8–9.3 | Pass | Colour alone still fails 1.4.1 |

---

## Cross-cutting improvements (priority order)

### P1 — Colour & tokens

1. **Align chat apps with dashboard semantic link tokens**  
   Conversational and generative `tokens.css` still document accent-blue as “links” but have no `--link` / `--link-deep`. Any blue body/link text at `#0072f5` fails AA. Mirror dashboard’s text-only lift (`#4c9dff`) while keeping `--ring` as brand blue.

2. **Stop relying on opacity-muted text for meaning**  
   Patterns like `text-muted-foreground/40`, `/60`, `/70`, and `text-[8px]`–`text-[11px]` appear widely (calendars, flight rows, legends, footnotes). Either:
   - raise size to ≥12px (14px preferred) and full muted opacity, or  
   - treat as decorative only (`aria-hidden`) with a readable alternative.

3. **Interactive borders**  
   Book / chip / pill controls often use `border-border` + `hover:border-white/20`. Affordance edges should use `border-input` (or equivalent ≥3:1) so controls are visible without hover.

4. **Colour-only meaning (WCAG 1.4.1)**  
   Price calendars (green cheapest / red expensive), CO₂ greens, alert reds, status ambers: keep colour but always pair with text, icon, or pattern (dashboard calendar legends are a good start — verify every heatmap cell has a non-colour cue for selected/cheapest).

### P2 — Typography & fonts

5. **Ban 8–9px for anything users must read**  
   Examples: round-trip “Outbound/Return” labels (`text-[8px]`), calendar day prices (`text-[8px]`/`text-[9px]`), weekday headers (`text-[9px]`/`text-[10px]`). Prefer ≥12px; mono uppercase section titles at 11px are OK only if they are secondary and high-contrast.

6. **Mono + heavy tracking as sole carrier**  
   Uppercase `font-mono tracking-wider` section labels are fine as chrome; do not put primary flight facts only in that style at micro size.

7. **Font loading**  
   `@fontsource-variable` is local (good). Ensure body uses `font-sans` / `var(--font-sans)` everywhere (already the pattern). Optional: `font-display: swap` is typically handled by the package; watch for FOIT on slow networks.

### P3 — Interaction, motion, structure

8. **Touch / click targets**  
   Button sizes `h-6` / `h-7` / `size-6` / `size-7` and compact Book pills (`py-1`) fall under the preferred 24×24 CSS px minimum (and well under mobile 44×44). Enlarge primary actions (Search, Send, Book, calendar day cells).

9. **`prefers-reduced-motion`**  
   Generative UI has CSS animations (`animate-screen-in`, `animate-flight-takeoff`, `animate-caret-blink`, `animate-pulse`, `animate-spin`) without a global reduce media query in `index.css`. Conversational/dashboard only gate a subset. Add a shared rule that disables decorative keyframes when reduced motion is preferred.

10. **Skip link / landmark structure**  
    No “Skip to main content” found. Chat and dashboard are single-app shells — add landmarks (`main`, labelled regions for composer vs results) and a skip link for keyboard users.

11. **Hover-only UI**  
    Timestamps / action clusters that appear only on `group-hover` are unavailable to keyboard and touch. Keep them visible on focus or always visible at reduced prominence.

12. **Opacity dimming of active content**  
    Generative canvas uses `opacity-30` on prior screens while loading — low contrast for anything still readable. Prefer a non-opacity disabled treatment or hide from AT with `inert` / `aria-busy`.

---

## Screen-by-screen notes

### Dashboard UI

| Screen / component | Issues |
|--------------------|--------|
| **SearchBar** | Labels at 11px mono muted — pass contrast at full opacity; bump size. Destination chips use soft borders. |
| **FilterBar / SortBar / StatsBar** | Dense controls; verify checkbox/slider focus rings and label association. |
| **DestinationGrid** | Cards readable; ensure selected state is not colour-only. |
| **FlightCard / RoundTripCard** | 8–10px meta (codes, Outbound/Return). Cancelled state `opacity-60` weakens text. Book/actions: check target size. |
| **PriceCalendar** | Strong colour encoding + legend — good. Cell prices at 9px; weekend headers small. Cheapest ring uses green — keep text price. |
| **FlightDetailModal** | Dialog has `sr-only` Close — good. Check focus trap (Radix) and title. |
| **Empty / skeleton / progress** | Progress animation respects reduced motion — good. Skeleton should not be the only status (pair with `aria-busy` / live text). |

### Conversational UI

| Screen / component | Issues |
|--------------------|--------|
| **Empty / launching** | Pulse + takeoff animation — add reduced-motion fallback. |
| **Thread / ChatBubble** | Hover-only timestamps; 10–11px meta. Feedback controls small. |
| **FlightProse tables** | Header 11px; Book links use weak `border-border`. Inline links use muted + underline (contrast OK at hover to foreground) — default link state is muted (pass) but decoration is low-contrast. |
| **Composer / origin** | Send control ~44px — good. Typewriter placeholder handles reduced motion in hook — good. |
| **TypingIndicator** | `role="status"` — good. |

### Generative UI

| Screen / layout | Issues |
|-----------------|--------|
| **Empty / composer / history row** | Same motion/meta patterns as conversational. History summary 11px muted. |
| **GenScreen query chips** | Soft borders; 11px chip text. Footnote `muted/60` fails normal AA. |
| **FlightCarousel / FlightRow** | 10px row meta; Book chip weak border. |
| **CalendarView** | Worst microcopy: 8–10px prices, disabled days `muted/40` (~2.2:1). |
| **Comparison / Ranked / Budget / MultiLeg / ReturnGrouped** | Section titles 11px mono; secondary facts 10px. Rank badges `w-6 h-6` — small targets if interactive. |
| **DestinationGridView / MapView** | Country/count at 10px; map relies on colour + position — ensure list alternative stays available. |
| **AlertView** | Red price text passes contrast; keep textual “alert” framing (already present). |
| **TrendView / Highlight / Itinerary** | Check chart/series against chat `--chart-3` (#737373) if used as labelled text. |
| **Loading overlay** | `opacity-30` on canvas — see P3.12. |

---

## Token parity checklist

| Token / concern | Dashboard | Conversational | Generative |
|-----------------|:---------:|:--------------:|:----------:|
| `--link` / `--link-deep` for text | Yes | **Missing** | **Missing** |
| `--error` / `--success` / `--warning` soft/deep | Yes | Accents only | Accents only |
| `--input` for controls | Yes | Yes | Yes |
| Decorative `--border` documented | Yes | Yes | Yes |
| Chart ramp suitable for labels | Colourful accents | `#737373` mid grey — **weak for text** | Same as conversational |

---

## Suggested fix order (if implementing later)

1. Port `--link*` (and optionally status soft/deep) into both chat `tokens.css` + `@theme` mappings; switch any blue text utilities to `text-link`.  
2. Global CSS: minimum readable text utility policy (replace 8–9px; forbid `muted-foreground/40` on content).  
3. Replace interactive `border-border` with `border-input` on Book/chips.  
4. Shared `@media (prefers-reduced-motion: reduce)` for decorative animations.  
5. Enlarge primary hit areas; expose hover-only meta on `:focus-within`.  
6. Optional follow-up: automated axe pass in Playwright against each layout fixture.

---

## Limits of this report

- No browser DevTools / axe-core run in this environment.  
- No screen-reader walkthrough (VoiceOver/NVDA).  
- Contrast for translucent overlays (dialogs, white/4% fills) should be spot-checked visually after any token change.  
- Study-only UIs may intentionally stay dense; call out trade-offs in the dissertation methods if micro-typography is kept for ecological validity.
