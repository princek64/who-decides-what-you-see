# Flight Assistant - Generative UI Research Prototype

This is the generative UI flight search interface developed for the MA dissertation research project comparing user search paradigms. It forks the conversational prototype: the same natural-language intent extraction feeds an LLM-chosen layout, so the results canvas changes shape with the query. It utilizes React, Vite, TypeScript, Tailwind CSS, and integrates with the Groq API (using the `llama-3.1-8b-instant` model).

## Setup

1. **Get a free Groq API key**: Sign up at [https://console.groq.com](https://console.groq.com)
2. **Create a `.env` file**: Copy the template and fill in your key:
   ```bash
   cp .env.example .env
   ```
   ```env
   VITE_GROQ_API_KEY=your_groq_api_key_here
   ```
3. **Generate the dataset**: The flight CSV (~36 MB) is not committed. From the repository root:
   ```bash
   python generate_flights_2026.py            # seed 42 — deterministic
   cp ux_research_flights_h2_2026_final.csv generative-ui/public/
   ```
4. **Install and run the web app**:
   ```bash
   npm install
   npm run dev
   ```
5. **Open URL**: Navigate to the port displayed (usually `http://localhost:5175`).

---

## Key Interface Shortcuts

- **Shift + E**: Exports the current research session logs containing all dialogue messages, LLM intents, card selections, and list expansions as a JSON file (`ux_chat_session_[timestamp].json`).
