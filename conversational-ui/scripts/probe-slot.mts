/** One-off probe: what the current system prompt returns for a given message. */
import fs from 'node:fs';
import path from 'node:path';
import Groq from 'groq-sdk';
import { GROQ_MODEL } from '../../shared/groq';
import { buildSystemPrompt } from '../src/constants/prompts';

const envText = fs.readFileSync(path.join(import.meta.dirname, '../.env'), 'utf8');
const apiKey = envText.match(/VITE_GROQ_API_KEY=(.+)/)?.[1]?.trim();
const groq = new Groq({ apiKey });

for (const msg of process.argv.slice(2)) {
  const c = await groq.chat.completions.create({
    model: GROQ_MODEL,
    reasoning_effort: 'low',
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: msg },
    ],
    temperature: 0,
    max_tokens: 400,
  });
  console.log(`${msg}\n  -> ${c.choices[0]?.message?.content?.replace(/\s+/g, ' ').slice(0, 400)}\n`);
  await new Promise((r) => setTimeout(r, 12000));
}
