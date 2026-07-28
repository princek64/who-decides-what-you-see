/**
 * Tasks 1 & 2 for conversational-ui: open-ended "where could you go" must NOT
 * ask for a destination, and compare / cheapest-weekend queries must yield an
 * insight sentence. Uses the REAL prompt, slot and filter code + live Groq.
 * Run from conversational-ui/:  npx tsx scripts/anywhere-compare-test.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import Groq from 'groq-sdk';
import Papa from 'papaparse';
import { buildSystemPrompt, STRICT_RETRY_PROMPT } from '../src/constants/prompts';
import { filterAndSortFlights } from '../src/hooks/useFlightFilter';
import type { Flight } from '../src/hooks/useFlightFilter';
import { applyWordingBackstops, firstMissingRequiredSlot, slotToIntent } from '../src/lib/slots';
import type { SlotJSON } from '../src/lib/slots';

const envText = fs.readFileSync(path.join(import.meta.dirname, '../.env'), 'utf8');
const apiKey = envText.match(/VITE_GROQ_API_KEY=(.+)/)?.[1]?.trim();
if (!apiKey) throw new Error('VITE_GROQ_API_KEY not found in .env');
const groq = new Groq({ apiKey });

const csvText = fs.readFileSync(path.join(import.meta.dirname, '../public/ux_research_flights_h2_2026_final.csv'), 'utf8');
const flights: Flight[] = [];
const co2: number[] = [];
Papa.parse(csvText, { header: true, skipEmptyLines: true, complete: (res: any) => {
  res.data.forEach((row: any) => {
    if (row.flight_status === 'Cancelled' || !row.flight_id) return;
    const [h, m] = (row.departure_time || '0:0').split(':');
    flights.push({ ...row, duration_mins: +row.duration_mins||0, stops: +row.stops||0, price_gbp: parseFloat(row.price_gbp)||0, seats_remaining: +row.seats_remaining||0, co2_kg: parseFloat(row.co2_kg)||0, departure_mins_from_midnight: (+h||0)*60+(+m||0) } as Flight);
    const c = parseFloat(row.co2_kg); if (!isNaN(c)) co2.push(c);
  });
}});
co2.sort((a,b)=>a-b);
const medianCo2 = co2[Math.floor(co2.length/2)];

// The deterministic wording backstops are IMPORTED from the app (../src/lib/
// slots), not re-implemented here — a hand-copied mirror is one more place for
// the app and its tests to drift apart.

async function callGroq(userMessage: string, retry = false): Promise<string> {
  const sys = buildSystemPrompt();
  const completion = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant', temperature: 0, max_tokens: 400,
    messages: [{ role: 'system', content: retry ? `${sys}\n${STRICT_RETRY_PROMPT}` : sys }, { role: 'user', content: userMessage }],
  });
  return completion.choices[0]?.message?.content ?? '';
}
const parseSlot = (raw: string): SlotJSON | null => { try { return JSON.parse(raw.replace(/```json/g,'').replace(/```/g,'').trim()); } catch { return null; } };

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e: any) {
      const wait = parseFloat(String(e?.message || '').match(/try again in ([\d.]+)s/)?.[1] || '');
      if (i < 5 && (e?.status === 429 || wait)) { const s = wait || 20; console.log(`  429 — waiting ${s}s`); await new Promise(r=>setTimeout(r,(s+1)*1000)); continue; }
      throw e;
    }
  }
}

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c?'✅':'❌'} ${m}`); c ? pass++ : fail++; };

for (const text of [
  'You have £150 and a free weekend, where could you go?',
  'Where can I fly from London for under £50?',
]) {
  console.log(`\nTASK 1 — "${text}"`);
  const raw = await withRetry(() => callGroq(text));
  let slot = parseSlot(raw); if (!slot) slot = parseSlot(await withRetry(() => callGroq(text, true)));
  if (!slot) { ok(false, 'parsed'); continue; }
  applyWordingBackstops(slot, text);
  ok(Boolean(slot.anywhere), `anywhere flag set (llm+backstop) — raw anywhere=${slot.anywhere}`);
  ok(firstMissingRequiredSlot(slot) === null, `does NOT ask a slot question (got ${firstMissingRequiredSlot(slot)})`);
  const intent = slotToIntent(slot);
  const res = filterAndSortFlights(flights, intent, medianCo2);
  const dests = new Set(res.map(f => f.dest_code));
  ok(res.length > 0 && dests.size > 5, `search runs across many destinations (${res.length} flights, ${dests.size} cities)`);
}

{
  const text = 'Compare direct vs connecting to Rome, which would you choose?';
  console.log(`\nTASK 2a — "${text}"`);
  const raw = await withRetry(() => callGroq(text));
  let slot = parseSlot(raw); if (!slot) slot = parseSlot(await withRetry(() => callGroq(text, true)));
  if (slot) {
    applyWordingBackstops(slot, text);
    ok(Boolean(slot.compare), 'compare flag set');
    const intent = slotToIntent(slot);
    if (slot.compare && slot.direct_only == null) intent.stops = undefined;
    const res = filterAndSortFlights(flights, intent, medianCo2);
    const direct = res.find(f => f.stops === 0), conn = res.find(f => f.stops >= 1);
    ok(!!direct && !!conn, `both a direct (£${direct?.price_gbp}) and a connecting (£${conn?.price_gbp}) are present to compare`);
  } else ok(false, 'parsed');
}

{
  const text = 'What is the cheapest weekend to fly to Paris in the next 3 months?';
  console.log(`\nTASK 2b/4 — "${text}"`);
  const raw = await withRetry(() => callGroq(text));
  let slot = parseSlot(raw); if (!slot) slot = parseSlot(await withRetry(() => callGroq(text, true)));
  if (slot) {
    applyWordingBackstops(slot, text);
    if (/\bweekend\b/i.test(text)) slot.weekend = true;
    ok(Boolean(slot.cheapest_when), 'cheapest_when flag set');
    const intent = slotToIntent(slot);
    const res = filterAndSortFlights(flights, intent, medianCo2);
    const weekendCheapest = res.filter(f => { const d = new Date(`${f.date}T00:00:00`).getDay(); return d===0||d===6; })[0];
    ok(!!weekendCheapest, `a cheapest weekend day exists: ${weekendCheapest?.date} £${weekendCheapest?.price_gbp}`);
    // window must not collapse to one weekend
    ok(!!intent.date_from && !!intent.date_to && (new Date(intent.date_to).getTime()-new Date(intent.date_from).getTime())/86400000 >= 60, `window stays broad (${intent.date_from}..${intent.date_to})`);
  } else ok(false, 'parsed');
}

console.log(`\n${fail===0?'✅ ALL PASS':'❌ FAILURES'}: ${pass} passed, ${fail} failed`);
