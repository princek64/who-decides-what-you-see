# Conversational UI

Chat-based flight search for the MA study. Same dataset as the other two apps; results always use the same layout. Stack: React, Vite, TypeScript, Tailwind, Groq for turning messages into search intent (model id in `../shared/groq.ts`).

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
4. Open the URL Vite prints (usually `http://localhost:5174`).

If you need to regenerate the dataset, see the root `README.md`.

## Shortcut

- **Shift + E** — export session log (`ux_chat_session_[timestamp].json`)
