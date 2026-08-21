/**
 * Layout hit-rate: 3 phrasings each, scored HIT / ALT / MISS.
 * Run: npx tsx scripts/layout-test.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import Groq from 'groq-sdk';
import { buildSystemPrompt, MODEL_LAYOUTS } from '../src/constants/prompts';

const envText = fs.readFileSync(path.join(import.meta.dirname, '../.env'), 'utf8');
const apiKey = envText.match(/VITE_GROQ_API_KEY=(.+)/)?.[1]?.trim();
if (!apiKey) throw new Error('VITE_GROQ_API_KEY not found in .env');
const groq = new Groq({ apiKey });

interface Case {
  expect: string;
  alt?: string[]; // genuinely defensible alternates
  query: string;
}

const cases: Case[] = [
  // highlight
  { expect: 'highlight', query: 'cheapest direct flight to Barcelona on 14 July' },
  { expect: 'highlight', query: "what's the cheapest flight to Lisbon tomorrow?" },
  { expect: 'highlight', query: 'find me the best price for a direct flight to Amsterdam on 20 August' },
  // grid
  { expect: 'grid', query: 'flights to Amsterdam after 6pm under £80' },
  { expect: 'grid', query: 'show me business class flights to Madrid in September' },
  { expect: 'grid', query: 'direct flights to Berlin next week under £120' },
  // comparison
  { expect: 'comparison', query: 'compare a direct flight to Rome with one that has a stop, on 10 July' },
  { expect: 'comparison', query: 'direct vs connecting to Vienna, which is better?' },
  { expect: 'comparison', query: 'should I take a direct flight or one with a layover to Athens?' },
  // calendar
  { expect: 'calendar', alt: ['trend'], query: 'what is the cheapest weekend to fly to Paris in the next 3 months?' },
  { expect: 'calendar', alt: ['trend'], query: 'which day in August is cheapest to fly to Barcelona?' },
  { expect: 'calendar', alt: ['trend'], query: 'cheapest dates for Rome this autumn' },
  // trend
  { expect: 'trend', alt: ['calendar'], query: 'when is it cheapest to fly to Madrid over the next few weeks?' },
  { expect: 'trend', alt: ['calendar'], query: 'how do prices to Amsterdam change between now and October?' },
  { expect: 'trend', alt: ['calendar'], query: 'are Barcelona flights getting cheaper or more expensive over the coming month?' },
  // destinations
  { expect: 'destinations', alt: ['budget'], query: 'where can I go for £150?' },
  { expect: 'destinations', alt: ['budget'], query: 'I have £100, what destinations can I fly to in August?' },
  { expect: 'destinations', alt: ['budget'], query: "what's the cheapest place I can fly to this weekend?" },
  // map
  { expect: 'map', query: 'where can I fly from London? show me on a map' },
  { expect: 'map', query: 'show me a map of places I can reach from London under £60' },
  { expect: 'map', alt: ['destinations'], query: 'which European cities can I get to from London?' },
  // itinerary
  { expect: 'itinerary', query: 'plan a weekend trip to Rome in September' },
  { expect: 'itinerary', query: 'round trip to Barcelona, out on a Friday back on the Sunday' },
  { expect: 'itinerary', query: 'I want to go to Prague on 10 July and come back on 14 July' },
  // budget
  { expect: 'budget', alt: ['destinations'], query: 'what can I get for £150 and how much would I have left over?' },
  { expect: 'budget', query: 'if I spend at most £80 on a flight to Nice, how much of my money is left?' },
  { expect: 'budget', alt: ['destinations'], query: 'how far does a £120 flight budget go?' },
  // ranked
  { expect: 'ranked', query: 'find me something good to Lisbon' },
  { expect: 'ranked', query: 'just show me the best options for Milan in August' },
  { expect: 'ranked', query: 'top 5 flights to Copenhagen next month' },
  // multileg
  { expect: 'multileg', query: 'how do the layovers work on flights to Athens?' },
  { expect: 'multileg', query: 'show me connecting flights to Istanbul with the layover details' },
  { expect: 'multileg', query: "I don't mind a stopover to Helsinki — what are the connections like?" },
];

const systemPrompt = buildSystemPrompt();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const tally: Record<string, { hit: number; alt: number; miss: number; misses: string[] }> = {};
let parseFails = 0;

for (const c of cases) {
  let raw = '';
  try {
    const res = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      reasoning_effort: 'low',
      temperature: 0.1,
      max_tokens: 300,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: c.query },
      ],
    });
    raw = res.choices[0]?.message?.content ?? '';
  } catch (err: any) {
    console.log(`✗ API error on "${c.query}": ${err.message}`);
    continue;
  }

  let layout = '(parse-fail)';
  try {
    const intent = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
    layout = intent.layout ?? '(missing)';
  } catch {
    parseFails++;
  }

  const t = (tally[c.expect] ||= { hit: 0, alt: 0, miss: 0, misses: [] });
  const validChoice = (MODEL_LAYOUTS as readonly string[]).includes(layout);
  if (layout === c.expect) {
    t.hit++;
    console.log(`✓ ${c.expect.padEnd(12)} "${c.query.slice(0, 55)}"`);
  } else if (c.alt?.includes(layout)) {
    t.alt++;
    console.log(`~ ${c.expect.padEnd(12)} got ${layout} (acceptable) "${c.query.slice(0, 45)}"`);
  } else {
    t.miss++;
    t.misses.push(`got ${layout}${validChoice ? '' : ' [INVALID→grid fallback]'}: "${c.query}"`);
    console.log(`✗ ${c.expect.padEnd(12)} got ${layout} "${c.query.slice(0, 45)}"`);
  }
  await sleep(700);
}

console.log('\n=== Per-layout summary (3 phrasings each) ===');
for (const [layout, t] of Object.entries(tally)) {
  const n = t.hit + t.alt + t.miss;
  console.log(`${layout.padEnd(12)} ${t.hit}/${n} hit, ${t.alt} acceptable, ${t.miss} miss`);
  t.misses.forEach((m) => console.log(`    MISS ${m}`));
}
const totals = Object.values(tally).reduce((a, t) => ({ hit: a.hit + t.hit, alt: a.alt + t.alt, miss: a.miss + t.miss }), { hit: 0, alt: 0, miss: 0 });
console.log(`\nTOTAL: ${totals.hit} hit / ${totals.alt} acceptable / ${totals.miss} miss of ${totals.hit + totals.alt + totals.miss} (parse fails: ${parseFails})`);
