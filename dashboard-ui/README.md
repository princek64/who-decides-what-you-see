# Flight Search - Dashboard UI Research Prototype

This is the conventional dashboard flight search interface developed for the MA dissertation research project comparing user search paradigms. It is the control condition against the conversational and generative prototypes: a filter-and-sort results dashboard over the same synthetic dataset. Built with React, Vite, TypeScript and Tailwind CSS. No LLM and no API key are required.

## Setup

1. **Generate the dataset**: The flight CSV (~36 MB) is not committed. From the repository root:
   ```bash
   python generate_flights_2026.py            # seed 42 — deterministic
   cp ux_research_flights_h2_2026_final.csv dashboard-ui/public/
   ```
2. **Install and run the web app**:
   ```bash
   npm install
   npm run dev
   ```
3. **Open URL**: Navigate to the port displayed (usually `http://localhost:5173`).

---

## Key Interface Shortcuts

- **Shift + E**: Exports the current research session logs (filter changes, card selections, detail views) as a JSON file.
