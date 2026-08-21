# Generative UI

Chat-based flight search for the MA study. Same intent extraction idea as the conversational app, but the model also chooses the results layout (grid, map, calendar, etc.). Stack: React, Vite, TypeScript, Tailwind, Groq (model id in `../shared/groq.ts`).

## Setup

1. Get a Groq key from [console.groq.com](https://console.groq.com).
2. Copy env and add the key:
   ```bash
   cp .env.example .env
   ```
3. From this folder:
   ```bash
   npm install
   npm run prebuild   # copies ../data CSV into public/
   npm run dev
   ```
4. Open the URL Vite prints (usually `http://localhost:5175`).

If you need to regenerate the dataset, see the root `README.md`.

## Shortcut

- **Shift + E** — export session log (`ux_chat_session_[timestamp].json`)
