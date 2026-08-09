# Model migration audit: llama-3.1-8b-instant → openai/gpt-oss-20b

**Why**: Groq deprecates `llama-3.1-8b-instant` on **2026-08-16**. Both research apps (`conversational-ui`, `generative-ui`) use it exclusively for intent extraction. Recommended replacement per Groq's deprecation notice: `openai/gpt-oss-20b` — which also supports Groq prompt caching (the old model does not).

This is a Phase 1 audit only. No code changed. Written before Phase 2 (branch + model-string swap).

---

## 1. Every occurrence of `"llama-3.1-8b-instant"`

13 occurrences, 8 files. Two are the actual runtime call sites; the rest are dev/test scripts and docs.

### Production code (2) — these are what actually matter for the swap

| File | Line | Context |
|---|---|---|
| `conversational-ui/src/hooks/useChat.ts` | 171 | `groq.chat.completions.create({ model: 'llama-3.1-8b-instant', ... })` — the only live call site in conversational-ui |
| `generative-ui/src/hooks/useGenChat.ts` | 192 | same, generative-ui's only live call site |

Both are hardcoded string literals inline in the API call — no shared constant, no env var, no config file. Phase 2 touches exactly these two lines for behavior; everything else below is peripheral.

### Dev/test scripts (7) — offline replay/probe tools, not part of the built app

| File | Line |
|---|---|
| `conversational-ui/scripts/anywhere-compare-test.mts` | 43 |
| `conversational-ui/scripts/live-session-replay.mts` | 65 |
| `conversational-ui/scripts/pipeline-test.mts` | 281 |
| `conversational-ui/scripts/probe-slot.mts` | 13 |
| `generative-ui/scripts/layout-test.mts` | 79 |
| `generative-ui/scripts/pipeline-test.mts` | 190, 219 |

Each makes its own direct `groq.chat.completions.create` call (verified — these are not just importing the app's hooks), so each needs its own string swap in Phase 2 or it'll keep hitting the old model until Aug 16 shutdown. Other scripts in both `scripts/` folders (`refine-test.mts`, `prose-check.mts`, `session-bugs-repro.mts`, `fix-verify.mts`, `baggage-check.mts`, `followup-parse-check.mts`, `ui-rules-test.mts`, `refine-weekend-test.mts`) are explicitly commented "no Groq calls" / "OFFLINE checks" — confirmed by grep, no model string, out of scope.

### Docs (4 lines, 3 files) — update for accuracy, zero functional impact

- `README.md:23-24` (root comparison table)
- `conversational-ui/README.md:3`
- `generative-ui/README.md:3`

---

## 2. Current system prompts (verbatim, as of this audit)

Both are rebuilt fresh per call via `buildSystemPrompt()` — no caching today because `llama-3.1-8b-instant` doesn't support it (only `gpt-oss-20b`/`120b`/`safeguard-20b` do, per Groq's docs). Measured size: conversational-ui's template is ~13.4K chars / **~3,300–3,400 tokens**; generative-ui's is comparable.

### conversational-ui (`src/constants/prompts.ts`)

Role: strict slot-filling JSON extractor. Schema has 7 always-present keys (destination, date_from, date_to, cabin, direct_only, sort, missing) plus ~13 optional constraint keys (origin, max_price, departure_after/before, airline, flexibility, low_co2, anywhere, detail_field, detail_target, off_topic). 12 numbered rules covering: raw-JSON-only output, don't invent fields, single-date-sets-both, relative-date resolution (including the FLEXIBLE WINDOWS and NO DATE MENTIONED sub-rules), direct_only tri-state, London-is-origin-only, `missing` semantics, sort default, max_price bare-number parsing, off-topic classification, anywhere semantics, detail-question handling. **17 few-shot examples** (see §3).

### generative-ui (`src/constants/prompts.ts`)

Role: intent extraction **plus** layout selection (11 possible layouts: highlight, grid, comparison, calendar, trend, destinations, map, itinerary, budget, ranked, multileg). 14 numbered rules — same date/comparison/off-topic logic as conversational-ui, plus rule 13 (layout-selection criteria, one paragraph per layout) and rule 14 (weekend-trip handling). **17 few-shot examples** (see §3).

Both prompts interpolate `${anchor}` (today, clamped to dataset window) and `${anchorPlus3}` (anchor + 3 months) computed fresh each call from `new Date()` — but since both only depend on the calendar day (not time-of-day), the resolved string is byte-identical across every call within the same day. The date substitution sits early in the prompt (right after the intro, in the CONTEXT block), which — relevant for Phase 2's caching goal — means on a caching-capable model, everything from that point on still forms one stable prefix for the rest of the day; it doesn't reset per-call.

---

## 3. Few-shot examples — provenance and purpose

Correction to an earlier estimate I gave in conversation: each prompt has **17** examples, not 20.

Git history for both `prompts.ts` files is sparse (3 real commits total, mostly the initial commit) and every change from this working session is still uncommitted — so line-level `git blame` can't distinguish "added last month" from "added yesterday" for anything not touched this session. Below, I mark **[this session, confirmed]** only for examples I can verify against the actual diff (§ Appendix); everything else is marked **[pre-existing]** with its apparent purpose inferred from what it demonstrates, not a reconstructed bug story I can't back up.

### conversational-ui (17 examples)

| # | Input | Purpose | Provenance |
|---|---|---|---|
| 1 | "cheapest direct flight to Barcelona on 14 July" | Baseline schema demo: date+destination+direct_only+sort | pre-existing |
| 2 | "I want to fly somewhere in September for under £120" | `anywhere:true` + flexible-month window + max_price | pre-existing — **this is the example the model was found copying dates from** during this session's price-only-correction bug (see backstops, §4) |
| 3 | "You have £150 and a free weekend, where could you go?" | anywhere + budget, exact phrasing of dissertation benchmark Task 5 | pre-existing |
| 4 | "where can I fly from London for under £50?" | disambiguates "London" as origin-mention, not destination, inside an anywhere query | pre-existing |
| 5 | "compare a direct flight to Rome with one that has a stop on 10 July" | compare query WITH a date given → `direct_only:null` | pre-existing |
| 6 | "You're flying to Rome. Compare a direct flight against one with a stop. Which would you pick, and why?" | compare query with **no** date given → `missing:["dates"]` | **[this session, confirmed]** — added to fix a reproduced bug: without it, the model copied the literal `10 July` date from example 5 instead of asking for dates, on the exact dissertation Task 3 phrasing |
| 7 | "What is the cheapest weekend to fly to Paris in the next 3 months?" | FLEXIBLE WINDOWS rule demo, exact phrasing of Task 4 | pre-existing |
| 8 | "best time to go to Lisbon in autumn" | seasonal relative-date resolution | pre-existing |
| 9 | "under 25" | bare price-only message → all other fields null, `missing:["destination","dates"]` | pre-existing — sibling case to the isPriceOnlyQuery backstop added this session |
| 10 | "flights from Manchester to Paris on 10 July" | non-London origin → triggers the "I only fly from London" flow | pre-existing |
| 11–15 | baggage / aircraft / seats / flexibility / co2 detail questions | `detail_field` schema demo, one per field type | pre-existing |
| 16 | "can you book me a hotel in Barcelona?" | off_topic demo (accommodation) | pre-existing |
| 17 | "do I need a visa for Spain?" | off_topic demo (visa/immigration) | pre-existing |

### generative-ui (17 examples)

| # | Input | Purpose | Provenance |
|---|---|---|---|
| 1 | "show me flights" | too-vague → `{}` empty object | pre-existing |
| 2 | "cheapest direct flight to Barcelona on 14 July" | baseline, `layout:"highlight"` | pre-existing |
| 3 | "find the cheapest direct flight from London to Barcelona" | same intent, **no date given** | **[this session, confirmed]** — added because without it, an unqualified "cheapest flight" was defaulting to searching only *today* instead of the whole window, understating the true cheapest fare (£750 shown vs actual £21.21 on the reproduced case) |
| 4 | "flights to Amsterdam after 6pm under £80" | time-window + price filter, `layout:"grid"` | pre-existing |
| 5 | "compare a direct flight to Rome with one that has a stop on 10 July" | compare with date, `layout:"comparison"` | pre-existing |
| 6 | "You're flying to Rome. Compare a direct flight against one with a stop. Which would you pick, and why?" | compare with **no** date | **[this session, confirmed]** — same class of no-date-defaulting bug as conversational-ui's #6 |
| 7 | "what is the cheapest weekend to fly to Paris in the next 3 months?" | flexible window, `layout:"calendar"` | pre-existing |
| 8 | "when is it cheapest to fly to Madrid over the next few weeks?" | flexible window, `layout:"trend"` | pre-existing |
| 9 | "where can I go for £150?" | budget-only, `layout:"destinations"` | pre-existing |
| 10 | "where can I fly from London? show me on a map" | `layout:"map"` | pre-existing |
| 11 | "plan a weekend trip to Rome in September" | `weekend:true` + `layout:"itinerary"` | pre-existing |
| 12 | "what can I get for £150 and how much would I have left?" | `layout:"budget"` | pre-existing |
| 13 | "how do the layovers work on flights to Athens?" | `layout:"multileg"`, `stops:1` | pre-existing |
| 14 | "find me something good to Lisbon" | `layout:"ranked"` | pre-existing |
| 15 | "show me the best options for Milan in August" | `layout:"ranked"` with a date window | pre-existing |
| 16 | "I want to go to Prague on 10 July and come back on 14 July" | explicit two-date round trip, `layout:"itinerary"` | pre-existing |
| 17 | "what's the weather in Rome?" | off_topic demo | pre-existing |

---

## 4. Regex backstops tuned to this model's failure patterns

All live in `conversational-ui/src/lib/slots.ts` (exported, reused by `useChat.ts`) and inline in `generative-ui/src/hooks/useGenChat.ts` (not exported — duplicated logic, not shared). These exist because the 8B model does not reliably follow its own schema/rules; each one is a deterministic correction applied **after** the model responds, overriding or filling in a field from the user's literal wording.

| Function / pattern | What it catches | Why it exists (from code comments + session history) |
|---|---|---|
| `isLowCo2Query` | "lower emissions", "greener", "eco" etc. | Comment states explicitly: *"the 8B model sets low_co2 only about half the time when CO₂ is written as a symbol"* |
| `isAnywhereQuery` | "where can I go", "surprise me", "anywhere" | Backstops `anywhere:true` detection |
| `isCompareQuery` | "compare X vs Y", "direct or with a stop" | Backstops `direct_only:null` for comparisons |
| `isCheapestWhenQuery` | "cheapest day/weekend", "best time to go" | Backstops the cheapest-when insight trigger |
| `isDirectOnlyQuery` / `isDropDirectQuery` | "only direct" / "include a stop" | Backstop `direct_only` true/null toggling |
| `isRoundTripQuery` **[this session, new]** | bare "return flight(s)", "round trip", "there and back" | Model doesn't reliably compose `direction:"both"`; also corrects an earlier bug where bare "return flight" was wrongly treated as inbound-leg-only instead of round-trip (UK-English meaning) |
| `isReturnOnlyQuery` **[this session, narrowed]** | "flight(s) back", "the return leg", "coming back flight(s)" | Narrowed this session to NOT match bare "return flight(s)" anymore (that moved to `isRoundTripQuery` above) — deliberately excludes "...and come back on 14 July" (date phrasing, not a leg request) |
| `isPriceOnlyQuery` **[this session, new]** | bare "12 pounds?", "sorry, 120 pounds" | Reproduced bug this session: on a bare price correction, the model sometimes echoed the date range from few-shot example #2 (§3) because it shared the same price figure, silently discarding a previously-pinned date. This backstop forces `date_from`/`date_to` back to null so the app's own carry-forward logic (`resolveTurnSlot`) wins instead of the model's hallucinated range |
| `CARRYABLE_SLOTS` list + `resolveTurnSlot` (structural, not regex) | — | Compensates for the model having **zero conversation history** per call (confirmed: `useChat.ts` sends only `[system, currentMessage]`) — every slot the model doesn't re-state on a follow-up turn is carried forward from the app's own prior state, not re-inferred by the model. `compare`/`cheapest_when` were added to this list this session after a reproduced bug where a follow-up date-only turn silently dropped a compare/cheapest-when insight that had been active |
| generative-ui: weekend backstop (inline, `/\bweekend\b/i`) | "weekend trip" | Comment: *"the 8B model emits it inconsistently"* |
| generative-ui: round-trip / return-only backstops (inline) **[this session, restructured]** | same split as conversational-ui's `isRoundTripQuery`/`isReturnOnlyQuery` | Same UK-English round-trip-vs-inbound-leg correction, mirrored into generative-ui |

**Relevance for Phase 3**: every backstop above compensates for a *specific, reproduced* failure of `llama-3.1-8b-instant`. None of them are guaranteed to still be necessary — or sufficient — on `gpt-oss-20b`, which may follow the prompt's stated rules more reliably (making some backstops redundant but harmless) or fail in different ways (making new backstops necessary). Phase 3 re-runs exactly the cases each one exists for.

---

## Appendix: this-session diff evidence

Confirmed via `git diff` against the last committed state (uncommitted working tree, this session): the two Rome-compare examples, the "find the cheapest direct flight from London to Barcelona" example, the NO DATE MENTIONED / NO DATE MENTIONED AT ALL rule text, `isRoundTripQuery`, `isPriceOnlyQuery`, the narrowed `isReturnOnlyQuery`, the `compare`/`cheapest_when` additions to `CARRYABLE_SLOTS`, and the generative-ui round-trip/return-only backstop restructuring are all real, present in the working tree, and traceable line-by-line in the diff — not reconstructed from memory.
