# Generative UI — Build Plan

Third study condition alongside the dashboard and conversational UI.
Goal: same chat interaction, but the AI chooses the response layout per query.

## 1. Scaffold: fork, don't rebuild

New sibling directory `generative-ui/`, started as a copy of `conversational-ui/` so
everything battle-tested carries over **unchanged**:

- **Reused verbatim:** Ollama design system (`index.css` tokens, `DESIGN.md`), all
  `ui/*` primitives, `FlightSketchLogo`, `FlightCompactCard`, `FlightDetailModal`,
  `TypingIndicator`, `useFlightFilter.ts` (filtering semantics untouched — same file,
  not a rewrite), `airportMap.ts`, the CSV in `public/`, the same Groq key/model,
  composer + history + disclaimer + follow-up chips from `ChatView`.
- **Forked with small changes:** `useChat.ts` → `useGenChat.ts` (adds layout
  validation + fallback), `prompts.ts` (adds layout selection),
  `useSessionLogger.ts` (new localStorage key `ux_genui_session_logs` so its
  research data never mixes with the chat app's; same event schema — and because
  `logAiResponse(intent)` already logs the whole intent, the chosen `layout` lands
  in the logs for free).
- App identity: header "Flight Explorer", tag "Generative Interface Paradigm · Prototype #3".

## 2. System prompt changes (the exact delta)

The existing extraction rules stay byte-for-byte (they just survived the 15/15 QA
pass). Three additions:

**a) One new field in the allowed JSON structure:**

```
"layout": "highlight" | "grid" | "comparison" | "calendar" | "trend" |
          "destinations" | "map" | "itinerary" | "budget" | "ranked" | "multileg"
```

**b) A new LAYOUT SELECTION rule block:**

```
13. LAYOUT: alongside the search fields, choose the ONE layout that best
    presents the answer. Criteria:
   - "highlight": one specific answer ("cheapest direct flight to Barcelona on 14 July")
   - "comparison": weighing two options ("direct vs 1-stop", "X or Y")
   - "calendar": cheapest day/weekend inside a date window
   - "trend": how prices change over time ("when is it cheapest to fly")
   - "destinations": budget but no destination ("where can I go for £150")
   - "map": explicitly geographic ("where can I fly from London", "show me a map")
   - "itinerary": round trips or trip planning ("plan a weekend in Rome")
   - "budget": what a stated budget buys, emphasis on spend/remaining money
   - "multileg": layover/stopover-focused questions
   - "ranked": vague quality asks ("find me something good")
   - "grid": any other filtered search. WHEN UNSURE, USE "grid".
```

**c) Layout added to every existing EXAMPLE, plus new ones** ("plan a weekend trip
to Rome" → `itinerary`, "how do the layovers work on flights to Athens" →
`multileg`, etc.).

Note: **`alert` is deliberately not in the model's menu** — the model can't know
the result count when it answers. Empty results switch to the alert view
app-side, whatever layout was chosen.

## 3. Rendering pipeline

```
user text → Groq (intent + layout) → validate layout against whitelist
  → invalid/missing → "grid"
  → filterAndSortFlights(...)  [unchanged code]
  → results.length === 0 → layout = "alert"
  → <GenResponse layout={layout} intent={intent} flights={results} />
```

`GenResponse.tsx` is a pure dispatcher: `switch (layout)` over 12 components in
`components/layouts/`. Each layout gets `(intent, flights, onSelectFlight,
onQuickReply)` — clicks still open the shared detail modal and log `card_click`
identically. A small `lib/layoutData.ts` holds pure adapters (price-per-date,
price-per-destination, leg parsing, trend buckets, nearby alternatives) so layout
components stay dumb and testable.

## 4. The 12 templates (Ollama-styled, data honest)

| Layout | Renders | Data adapter |
|---|---|---|
| **highlight** | One big card: route, times, price XL, badges + "2 close alternatives" mini-row | `flights[0]` after existing sort; next 2 as alternates |
| **grid** | Responsive grid of existing `FlightCompactCard`s (capped 12 + "show all") | results as-is |
| **comparison** | Two columns, "Direct" vs "1 stop", best option each, delta row ("£31 cheaper / 1h 25m faster") | split by `stops` from the same results |
| **calendar** | Static month grid(s), min fare per day, tercile tint (port of the dashboard's PriceCalendar rendering), weekends flagged | group by date → min price |
| **trend** | Monochrome SVG bar/line of min fare per week across the intent window, cheapest week annotated | weekly min buckets |
| **destinations** | City cards: name, country, "from £X", CO₂ hint; click sends a follow-up query (logged as a normal message) | group by dest → min price, sorted |
| **map** | Hand-rolled SVG: lat/lon equirectangular projection, London origin, price-labelled pins. No tile services — self-contained. Needs a new static `AIRPORT_COORDS` table (~100 entries) in `airportMap.ts` | group by dest + coords |
| **itinerary** | Vertical flow: outbound leg → stay gap → return leg, connected timeline, trip total | run `filterAndSortFlights` twice (outbound intent + direction-swapped return intent — reusing the existing return-leg swap semantics) |
| **budget** | Top pick + progress bar "£46.81 of £150 · £103 left", then what else fits | `intent.max_price` vs prices |
| **ranked** | Numbered 1–5 list with a "why" tag per row (cheapest / fastest / best value — value = simple price×duration heuristic, client-side, no LLM) | top 5 under blended score |
| **alert** | "Nothing matched" + honest alternatives: cheapest same-route flights just over budget, or same destination on nearby dates | constraint-relaxation helpers |
| **multileg** | Step 1 → layover card (city + duration, front and center) → Step 2. **Dataset caveat:** rows carry one `layover_details` string, not real per-leg times — parse city/duration from that string, present total duration honestly, no invented leg times | 1-stop results + parsed `layover_details` |

## 5. Testing

Extend the pipeline-test pattern to `generative-ui/scripts/`: all 15 existing
cases **plus layout assertions** — the 5 study tasks map cleanly (T1→highlight,
T2→grid, T3→comparison, T4→calendar, T5→destinations), plus phrasings for
map/itinerary/budget/multileg/trend, plus fallback tests (garbage layout value →
grid; zero results → alert). Same live-Groq, real-code approach.

## 6. Known risks

- **12-way choice on an 8B model** is the main risk. Mitigation: crisp one-line
  criteria, examples, grid fallback — worst case a query gets a *reasonable* grid
  instead of a fancy layout, never a broken screen. The test suite reveals the
  real hit rate before participants do.
- **Map/multileg** are constrained by the dataset (no coordinates today, no
  per-leg times) — coords are addable as static UI data; leg times will not be
  fabricated.

## Open confirmations

1. Short lowercase layout tokens OK? Model not allowed to pick `alert` OK?
2. App name "Flight Explorer" OK?
