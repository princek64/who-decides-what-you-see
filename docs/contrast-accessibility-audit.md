# Contrast accessibility audit (WebAIM)

**Branch:** `audit-contrast-accessibility`  
**Method:** Token pairs from each app’s `src/styles/tokens.css`, checked via the [WebAIM Contrast Checker API](https://webaim.org/resources/contrastchecker/) (`?fcolor=&bcolor=&api`). Interfaces were **not** launched or interacted with.

## WCAG thresholds (from WebAIM)

| Role | AA | AAA |
|------|----|-----|
| Normal text | ≥ 4.5:1 | ≥ 7:1 |
| Large text (≥18pt / ≥14pt bold) | ≥ 3:1 | ≥ 4.5:1 |
| Graphics & UI components (WCAG 2.1) | ≥ 3:1 | — |

Large-text / UI judgments below use WebAIM’s `AALarge` field (3:1). Normal text uses `AA` (4.5:1).

## Shared palette

Conversational and generative share the same Geist dark tokens. Dashboard matches the core neutrals and accents, and adds brighter semantic text tokens (`--link`, `--error-deep`, etc.) specifically for contrast.

| Token | Hex |
|-------|-----|
| `--background` | `#0a0a0a` |
| `--card` | `#111111` |
| `--muted` | `#171717` |
| `--foreground` / `--card-foreground` | `#ededed` |
| `--muted-foreground` | `#a1a1a1` |
| `--accent-blue` | `#0072f5` |
| `--accent-green` | `#00c853` |
| `--accent-amber` | `#f5a623` |
| `--accent-red` | `#ff4d4f` |
| `--border` | `rgba(255,255,255,0.08)` |
| `--input` | `rgba(255,255,255,0.12)` |
| Dashboard `--link` | `#4c9dff` |

---

## Results — all three interfaces (core neutrals)

These pairs are identical across conversational, generative, and dashboard.

| Pair | FG / BG | Ratio | AA text | AAA text | Notes |
|------|---------|------:|---------|----------|-------|
| Body on background | `#ededed` / `#0a0a0a` | **16.9** | Pass | Pass | Excellent |
| Body on card | `#ededed` / `#111111` | **16.1** | Pass | Pass | Excellent |
| Muted on background | `#a1a1a1` / `#0a0a0a` | **7.66** | Pass | Pass | Labels, meta |
| Muted on card | `#a1a1a1` / `#111111` | **7.30** | Pass | Pass | |
| Muted on muted surface | `#a1a1a1` / `#171717` | **6.93** | Pass | Fail AAA | Still AA |
| Primary button text | `#0a0a0a` / `#ededed` | **16.9** | Pass | Pass | |
| Secondary text | `#ededed` / `#171717` | **15.3** | Pass | Pass | |

**Verdict (body / muted text):** Pass AA (and mostly AAA) on all three UIs.

---

## Accent colours as text (on card `#111111`)

| Pair | Ratio | AA text | AA large | Used as |
|------|------:|---------|----------|---------|
| Accent blue `#0072f5` | **4.24** | **Fail** | Pass | Focus ring / brand blue; **too dark for normal link text** |
| Accent green `#00c853` | **8.44** | Pass | Pass | Success / low CO₂ icons+text |
| Accent amber `#f5a623` | **9.31** | Pass | Pass | Warnings |
| Accent red `#ff4d4f` | **5.77** | Pass | Pass | Errors (fails AAA only) |

Blue on background `#0a0a0a` is **4.45:1** — still fails AA normal text (needs 4.5:1).

### Dashboard-only semantic text (fixes blue)

| Pair | Ratio | AA text |
|------|------:|---------|
| `--link` `#4c9dff` on card | **6.81** | Pass |
| `--link-deep` `#7cb7ff` on card | **9.05** | Pass |
| `--error-deep` `#ff7875` on card | **7.36** | Pass |
| `--warning-deep` `#ffbf47` on card | **11.5** | Pass |
| `--success-deep` `#33d375` on card | **9.63** | Pass |

Dashboard already documents this in `tokens.css`: raw `--accent-blue` fails AA on card, so link text uses `--link`.

Conversational / generative do **not** define `--link`; they rarely use blue for body copy (links tend to be `text-foreground` / underline). Blue remains on `--ring` (focus).

---

## UI components & borders (need ≥ 3:1)

| Pair | Effective FG | Ratio | UI AA (≥3:1) |
|------|--------------|------:|--------------|
| Focus ring blue on background | `#0072f5` | **4.45** | **Pass** |
| Focus ring blue on card | `#0072f5` | **4.24** | **Pass** |
| Border 8% white on background | ~`#1e1e1e` | **1.18** | **Fail** |
| Border 8% white on card | ~`#242424` | **1.21** | **Fail** |
| Input border 12% on card | ~`#2e2e2e` | **1.39** | **Fail** |

Hairline `border-border` / `border-input` separators are well below the 3:1 UI-component contrast required when borders identify controls. Form fields rely partly on layout/labels, but **input outlines alone do not meet WCAG 2.1 UI contrast**.

---

## Per-interface summary

### Conversational UI
| Area | Status |
|------|--------|
| Primary / muted text | Pass AA / strong AAA |
| Green / amber / red accents as text | Pass AA |
| Focus ring (`--accent-blue`) | Pass UI 3:1 |
| Card / input borders | Fail UI 3:1 |
| Blue as normal text | Would fail if used; mostly avoided |

### Generative UI
| Area | Status |
|------|--------|
| Same as conversational (shared tokens) | Same |
| Map/chart mid greys (`#737373`, `#404040`) | `#737373` fails AA as normal text (4.17); `#404040` fails UI (1.90) — decorative chart use |

### Dashboard UI
| Area | Status |
|------|--------|
| Primary / muted text | Pass AA |
| Link / status text via `*-deep` / `--link` | Pass AA |
| Focus ring | Pass UI 3:1 |
| Card / input borders | Fail UI 3:1 (same tokens) |
| Blue brand for text | Mitigated by `--link` |

---

## Highest-priority findings

1. **Form / card borders (~1.2–1.4:1)** — fail WCAG 2.1 UI contrast on all three apps. Strongest shared accessibility gap.
2. **Raw accent blue as text (4.24–4.45:1)** — fails AA normal text. Dashboard already lifts links; keep conversational/generative from using `#0072f5` for small text.
3. **Core reading text is strong** — `#ededed` and `#a1a1a1` on near-black pass AA comfortably across all three interfaces.

## Example WebAIM API checks used

```
https://webaim.org/resources/contrastchecker/?fcolor=EDEDED&bcolor=0A0A0A&api
https://webaim.org/resources/contrastchecker/?fcolor=A1A1A1&bcolor=111111&api
https://webaim.org/resources/contrastchecker/?fcolor=0072F5&bcolor=111111&api
https://webaim.org/resources/contrastchecker/?fcolor=4C9DFF&bcolor=111111&api
```

Source tokens: `conversational-ui/src/styles/tokens.css`, `generative-ui/src/styles/tokens.css`, `dashboard-ui/src/styles/tokens.css`.
