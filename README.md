# Who Decides What You See?

MA dissertation project: three flight-search UIs over the same dataset, used in a within-subjects study.

1. **Dashboard** — normal filter / sort UI (control)
2. **Conversational** — chat with a fixed results layout
3. **Generative** — chat where the model also picks how results are shown

All three search London → Europe on synthetic flights (1 Jul – 31 Dec 2026) and can export session logs as JSON.

## Repo layout

| Folder | What it is | LLM |
|---|---|---|
| `data/` | Shared flight CSV | — |
| [`dashboard-ui/`](dashboard-ui) | Filter-and-sort dashboard | none |
| [`conversational-ui/`](conversational-ui) | Chat, fixed layout | Groq `openai/gpt-oss-20b` |
| [`generative-ui/`](generative-ui) | Chat, layout chosen per query | Groq `openai/gpt-oss-20b` |

Each app is its own Vite project. On build, `prebuild` copies the CSV from `data/` into that app’s `public/`. More detail lives in each app’s `README.md` / `DESIGN.md`.

UI look is shared (Geist, dark).

## Dataset

Canonical file: `data/ux_research_flights_h2_2026_final.csv` (~163k rows, ~36 MB). The copies under each `public/` are gitignored so they don’t drift.

Regenerate (seed 42):

```bash
python -m venv venv && source venv/bin/activate
python generate_flights_2026.py
mv ux_research_flights_h2_2026_final.csv data/
```

After a fresh clone, run `npm run prebuild` (or `npm run build`) once in an app so `public/` gets the CSV.

If you’re analysing the CSV yourself: `layover_details` has commas inside quotes, so use a proper CSV parser. Return rows are EU → London (city is on **origin**, London on **destination**).

## Run an app

```bash
cd dashboard-ui   # or conversational-ui / generative-ui
npm install
npm run dev
```

Chat apps need a Groq key:

```bash
cp .env.example .env
# set VITE_GROQ_API_KEY=...
```

Vite inlines `VITE_GROQ_API_KEY` into the client bundle. Fine for this study prototype — use a throwaway key and rotate it afterwards.

## Deploy (Vercel)

One Vercel project per app, same Git repo, **Root Directory** set to `dashboard-ui`, `conversational-ui`, or `generative-ui`. `prebuild` still reaches `../data`. Put `VITE_GROQ_API_KEY` in the project env for the chat apps.

## Session logs

**Shift + E** exports the current session as JSON.

Event names are fixed on purpose (dissertation data):

- Dashboard: `filter_change`, `card_click`, `detail_view`
- Chat apps: `user_message`, `ai_response`, `card_click`, `show_all_results`

## Pipeline smoke tests

```bash
cd conversational-ui   # or generative-ui
npx tsx scripts/pipeline-test.mts
```

These hit live Groq. Free tier is slow at these prompt sizes; the scripts back off on 429s.
