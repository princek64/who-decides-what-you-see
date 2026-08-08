# Flight Assistant - Conversational UI Research Prototype

This is the conversational UI flight search interface developed for the MA dissertation research project comparing user search paradigms. It utilizes React, Vite, TypeScript, Tailwind CSS, and integrates with the Groq API (using the `openai/gpt-oss-20b` model) to extract structured search intents from natural language input.

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
   cp ux_research_flights_h2_2026_final.csv conversational-ui/public/
   ```
4. **Install and run the web app**:
   ```bash
   npm install
   npm run dev
   ```
5. **Open URL**: Navigate to the port displayed (usually `http://localhost:5174`).

---

## Key Interface Shortcuts

- **Shift + E**: Exports the current research session logs containing all dialogue messages, LLM intents, card selections, and list expansions as a JSON file (`ux_chat_session_[timestamp].json`).
