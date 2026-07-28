# Who Decides What You See?

Three flight-search interfaces built for an MA dissertation comparing an
opinionated dashboard, a conversational interface, and a generative UI in a
within-subjects usability study. All three run over the same synthetic dataset
(London → Europe, 2026-07-01 to 2026-12-31) and log participant sessions to JSON
for analysis.

## Structure

- `data/` — the shared synthetic flight dataset used by all three apps
- `dashboard-ui/` — faceted filter-and-sort dashboard (control)
- `conversational-ui/` — chat interface, fixed result layout (Groq / Llama)
- `generative-ui/` — chat interface, LLM-chosen result layout (Groq / Llama)

Each app is an independent Vite project. On build it copies the canonical CSV
from `data/` into its own `public/` (a `prebuild` step), then runs standalone.
See each app's `README.md` and `DESIGN.md` for details.

| App | Paradigm | LLM |
|---|---|---|
| [`dashboard-ui/`](dashboard-ui) | Conventional filter-and-sort dashboard (control) | none |
| [`conversational-ui/`](conversational-ui) | Natural-language chat, fixed result layout | Groq `llama-3.1-8b-instant` |
| [`generative-ui/`](generative-ui) | Natural-language chat, LLM-chosen result layout | Groq `llama-3.1-8b-instant` |

All three share one design system (Geist dark).

## Dataset

`data/ux_research_flights_h2_2026_final.csv` (~163k rows, ~36 MB) is the single
source of truth, committed once. Each app's `prebuild` script copies it into that
app's `public/` at build time, so the three `public/` copies are gitignored and
never drift.

To regenerate it deterministically (seed 42):

```bash
python -m venv venv && source venv/bin/activate
python generate_flights_2026.py                 # writes the CSV
mv ux_research_flights_h2_2026_final.csv data/   # replace the canonical copy
```

Local dev reads whatever is already in each `public/`. After a fresh clone, run
`npm run prebuild` once in an app (or just `npm run build`) to populate it.

Notes for anyone analysing the CSV: `layover_details` contains commas
(`"FRA, Frankfurt, Germany, 2h 32m"`), so parse with a real CSV reader, never
`split(',')`. Return-direction rows fly EU → London, so the searched city matches
the row's **origin** and London its **destination**.

## Running an app

```bash
cd dashboard-ui        # or conversational-ui / generative-ui
npm install
npm run dev
```

The two chat apps need a Groq API key. Copy `.env.example` to `.env` and add yours:

```bash
cp .env.example .env
```

> The key is read through `VITE_GROQ_API_KEY`, which Vite **inlines into the client
> bundle** at build time. That is acceptable for this research prototype but is not a
> production pattern — use a throwaway, rate-limited key, and rotate it after the study.

## Deployment (Vercel)

The repo is a monorepo. Each app is imported as its own Vercel project pointing at
this same repo, with **Root Directory** set to the app folder
(`dashboard-ui` / `conversational-ui` / `generative-ui`). Vercel clones the whole
repo, so each app's `prebuild` reaches `../data` and copies the CSV. Set
`VITE_GROQ_API_KEY` in each project's environment variables.

## Session logs

Press **Shift + E** in any app to export the current participant session as JSON.
The event schemas are fixed (`filter_change` / `card_click` / `detail_view` in the
dashboard; `user_message` / `ai_response` / `card_click` / `show_all_results` in the
chat apps) because they are the dissertation's raw data.

## Testing the chat pipelines

Both chat apps carry intent-extraction test scripts that hit the live Groq API:

```bash
cd conversational-ui   # or generative-ui
npx tsx scripts/pipeline-test.mts
```

Groq's free tier allows roughly two calls per minute at these prompt sizes, so the
scripts back off on HTTP 429.
