# Migration: Groq `llama-3.1-8b-instant` → `openai/gpt-oss-20b`

Technical record for the two LLM-backed research apps (`conversational-ui`,
`generative-ui`). Dashboard is unaffected — it has no LLM call.

Detail lives in two companion docs at the repo root:
[`model-migration-llama-to-gptoss-audit.md`](../model-migration-llama-to-gptoss-audit.md)
(call sites, prompts, few-shot examples, regex backstops) and
[`groq-prompt-caching-and-rate-limits.md`](../groq-prompt-caching-and-rate-limits.md)
(measurement method and raw numbers).

## Why

Groq deprecated `llama-3.1-8b-instant`, shutdown **2026-08-16**, recommending
`openai/gpt-oss-20b`. (`llama-3.3-70b-versatile` was deprecated in the same
notice but was never used here.) Without migrating, both apps would have
stopped working mid-study.

## What changed

- **Model string** — swapped at both runtime call sites (`useChat.ts`,
  `useGenChat.ts`) plus 7 dev-script call sites and 3 READMEs.
- **`reasoning_effort: 'low'`** — gpt-oss-20b is a reasoning model and spends
  reasoning tokens *out of* `max_tokens` before emitting anything. At default
  effort, 3 of 4 benchmark queries returned empty (`finish_reason: length`).
  Low effort holds reasoning to ~10–60 tokens.
- **`max_tokens` raised** — conversational-ui 400 → 1000, generative-ui
  300 → 800. Headroom only: unused ceiling is not billed.
- **Message order** — system prompt already sat first in both apps, so no
  reordering was needed. The retry path was changed to stop appending the
  strict-retry instruction *onto* the system message, which mutated the
  cacheable prefix.

## Key finding: prompt caching is best-effort

Groq's cache is real but **not guaranteed**. Both states were measured on an
identical prefix:

| | `cached_tokens` | charged |
|---|---|---|
| hit | 3,584 of 3,609 (99.3%) | ~190 |
| miss | 0 | ~3,774 |

Cached tokens are **excluded** from the daily token quota, not discounted — but
**admission control uses the pre-discount figure**, so requests are refused on
an estimate ~20× larger than the eventual charge. In one QA run, 13 of 14 calls
missed. **Plan capacity on the all-miss figure** (~60 calls/day against the
200,000/day cap), not the cached one.

## Bugs found and fixed during testing

All surfaced by migration QA; none were introduced by the model swap except the
first two, which are gpt-oss-20b behaviour differences.

- **Off-topic misclassification on return-leg queries** — gpt-oss-20b returned
  `{"off_topic": true}` for valid searches like "I need a flight back from
  Barcelona on 20 September". `off_topic` short-circuits ahead of every wording
  backstop, so the reply was discarded. Cleared in `applyWordingBackstops`, the
  one point running before both short-circuits.
- **Destination/date lost on return-leg queries (both apps)** — on those turns
  the model returns `off_topic` and nothing else, so a stated destination and
  date were dropped and the app re-asked for details already given. Both are now
  read from the message text, gated behind the return-leg regex so unrelated
  messages can never have a place name or date mined out of them.
- **Already-departed flights in undated searches (both apps)** — with no date
  given, no date constraint was applied at all, so searches matched all 150,331
  rows including **3,287 already departed**. Because results sort by price, a
  dead flight could be named as the cheapest option. Undated searches are now
  bounded at today; explicit dates and ranges are honoured exactly as before,
  including into the past. generative-ui's "Assumed dates" badge previously
  advertised the static dataset span and now derives from the same function the
  filter bounds on.
- **"Book on [airline]" clipped on generative-ui cards** — responsive, not
  text-wrapping. The card hard-pinned `w-[280px]`, correct in the carousel but
  wider than the expanded grid's columns at narrow viewports; that grid's
  `overflow-y-auto` promotes `overflow-x` to `auto`, clipping the excess. Width
  is now a ceiling, with the carousel wrapper pinning the fixed size.

## Known limitation — documented, not fixed

**generative-ui, bare date with no other context.** A first message of just
"20 September" parses to `{}` and the app responds *"That search is a little too
broad for me…"*. It returns a clarifying message, never wrong results.

Cause: generative-ui is single-shot — no slot-filling, no `missing` field — and
its 17 few-shot examples are all complete queries. conversational-ui handles
fragments because it has an explicit `"under 25"` example.

Low real-world likelihood: no benchmark task wording requires a bare date, and
unlike conversational-ui, generative-ui never asks "Which dates?", so nothing
prompts one. The realistic path already works — sent mid-session it resolves
against history (`"20 September"` after a Barcelona query returned
`{dest_city: Barcelona, date: 2026-09-20, layout: highlight}`). Only a bare date
as the very first message hits the fallback.

## Verification note

Filtering fixes were verified offline against the full local dataset with the
bug reproduced first (fix stashed out), plus controls confirming explicit-date
queries were unchanged. Model-behaviour fixes were verified with live calls.
Latency was not measured comparably — the deprecated model was heavily queued
near shutdown, so any before/after timing would reflect serving conditions
rather than the models.
