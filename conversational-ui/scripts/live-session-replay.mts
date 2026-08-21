/**
 * Live eight-turn session replay (Groq + CSV); prints per-turn output.
 * Run: npx tsx scripts/live-session-replay.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import Groq from 'groq-sdk';
import Papa from 'papaparse';
import { buildSystemPrompt } from '../src/constants/prompts';
import { filterAndSortFlights, resolveDestCodes } from '../src/hooks/useFlightFilter';
import type { Flight, IntentJSON } from '../src/hooks/useFlightFilter';
import {
  applyWordingBackstops,
  classifyOrigin,
  firstMissingRequiredSlot,
  resolveTurnSlot,
  slotToIntent,
  SLOT_QUESTIONS,
} from '../src/lib/slots';
import type { SlotJSON } from '../src/lib/slots';
import { buildComparisonSentence } from '../src/lib/insights';
import { getCityName } from '../src/lib/airportMap';

const envText = fs.readFileSync(path.join(import.meta.dirname, '../.env'), 'utf8');
const groq = new Groq({ apiKey: envText.match(/VITE_GROQ_API_KEY=(.+)/)?.[1]?.trim() });

const csvText = fs.readFileSync(
  path.join(import.meta.dirname, '../../data/ux_research_flights_h2_2026_final.csv'), 'utf8');
const flights: Flight[] = [];
const co2: number[] = [];
Papa.parse(csvText, {
  header: true, skipEmptyLines: true,
  complete: (res: any) => {
    res.data.forEach((row: any) => {
      if (row.flight_status === 'Cancelled' || !row.flight_id) return;
      const [h, m] = (row.departure_time || '0:0').split(':');
      flights.push({
        ...row,
        duration_mins: parseInt(row.duration_mins, 10) || 0,
        stops: parseInt(row.stops, 10) || 0,
        price_gbp: parseFloat(row.price_gbp) || 0,
        seats_remaining: parseInt(row.seats_remaining, 10) || 0,
        co2_kg: parseFloat(row.co2_kg) || 0,
        departure_mins_from_midnight: (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0),
      } as Flight);
      const c = parseFloat(row.co2_kg);
      if (!isNaN(c)) co2.push(c);
    });
  },
});
co2.sort((a, b) => a - b);
const midIdx = Math.floor(co2.length / 2);
const medianCo2 = co2.length % 2 ? co2[midIdx] : (co2[midIdx - 1] + co2[midIdx]) / 2;

const systemPrompt = buildSystemPrompt();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const askModel = async (q: string): Promise<SlotJSON> => {
  for (let attempt = 0; ; attempt++) {
    try {
      const c = await groq.chat.completions.create({
        model: 'openai/gpt-oss-20b',
        reasoning_effort: 'low',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: q }],
        temperature: 0, max_tokens: 400,
      });
      const raw = c.choices[0]?.message?.content ?? '';
      return JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (err: any) {
      const wait = parseFloat(String(err?.message || '').match(/try again in ([\d.]+)s/)?.[1] || '');
      if (attempt < 6 && (err?.status === 429 || wait)) {
        console.log(`  (429 — waiting ${wait || 20}s)`);
        await sleep(((wait || 20) + 1) * 1000);
        continue;
      }
      throw err;
    }
  }
};

// useChat.handleParsedSlot, faithfully
const handleParsedSlot = (slot: SlotJSON) => {
  if (slot.off_topic) return { reply: 'off-topic', results: [] as Flight[], intent: null as IntentJSON | null };
  if (classifyOrigin(slot.origin).kind === 'foreign')
    return { reply: 'I only have flights departing London right now.', results: [], intent: null };
  const missing = firstMissingRequiredSlot(slot);
  if (missing) return { reply: SLOT_QUESTIONS[missing], results: [], intent: null };

  const intent = slotToIntent(slot);
  if (slot.compare && slot.direct_only == null) intent.stops = undefined;
  const resolved = resolveDestCodes(intent);
  if (String(slot.destination ?? '').trim() && resolved.length === 0)
    return { reply: `I couldn't find "${slot.destination}" in this flight network.`, results: [], intent };
  if (!intent.dest_city && resolved.length === 1) intent.dest_city = getCityName(resolved[0]);

  const results = filterAndSortFlights(flights, intent, medianCo2);
  const destLabel = intent.dest_city || (resolved.length === 1 ? getCityName(resolved[0]) : '');
  const insight = results.length && slot.compare ? buildComparisonSentence(results, destLabel) : null;
  return { reply: insight ?? '', results, intent };
};

const statsMin = (r: Flight[]) => (r.length ? r.reduce((m, f) => Math.min(m, f.price_gbp), Infinity) : NaN);

type Turn = { kind: 'typed'; text: string } | { kind: 'chip'; label: string; patch: Partial<SlotJSON> };
const SESSION: Turn[] = [
  { kind: 'typed', text: 'Compare direct vs connecting to Rome on 3 August' },
  { kind: 'chip', label: 'Only show direct flights', patch: { direct_only: true } },
  { kind: 'chip', label: 'Sort them by fastest', patch: { sort: 'fastest' } },
  { kind: 'typed', text: 'find a flight for 4th august instead' },
  { kind: 'typed', text: 'rome' },
  { kind: 'typed', text: 'under 25' },
  { kind: 'typed', text: 'for sevilla for same date?' },
  { kind: 'typed', text: 'Seville?' },
];

let lastSlot: SlotJSON | null = null;
for (const turn of SESSION) {
  let slot: SlotJSON;
  let label: string;
  if (turn.kind === 'chip') {
    label = `[chip] ${turn.label}`;
    slot = { ...lastSlot!, ...turn.patch };
    if (turn.patch.direct_only != null) slot.compare = false;
  } else {
    label = turn.text;
    const parsed = applyWordingBackstops(await askModel(turn.text), turn.text);
    slot = resolveTurnSlot(lastSlot, parsed, turn.text);
  }

  const { reply, results, intent } = handleParsedSlot(slot);
  lastSlot = slot;

  const cities = [...new Set(results.map((f) => f.dest_code))];
  console.log(`\n> ${label}`);
  console.log(`  slot: dest=${slot.destination} dates=${slot.date_from}..${slot.date_to} direct_only=${slot.direct_only} sort=${slot.sort} max_price=${slot.max_price ?? null}`);
  console.log(`  ${results.length} flights${cities.length ? ` [${cities.slice(0, 4).join(',')}${cities.length > 4 ? `,+${cities.length - 4}` : ''}]` : ''}` +
    `${results.length ? ` | stats Min Price £${statsMin(results).toFixed(2)}` : ''}${intent?.stops != null ? ` | stops=${intent.stops}` : ''}`);
  if (reply) console.log(`  "${reply}"`);
  if (turn.kind === 'typed') await sleep(800);
}
