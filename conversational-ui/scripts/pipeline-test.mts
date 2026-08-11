/**
 * End-to-end test of the chat pipeline against the 5 research tasks.
 * Uses the app's REAL system prompt and REAL filter/slot code (imported below),
 * calling the same Groq model the app uses. Run from conversational-ui/:
 *   npx tsx scripts/pipeline-test.mts
 *
 * NOTE: the app now uses explicit slot-filling. A search only runs when a
 * destination AND at least one date are present; otherwise the app asks a
 * single follow-up ("Where are you flying to?" / "Which dates?"). Task-2 and
 * Task-5 wordings that omit those slots therefore land on an "ask-*" branch —
 * the test asserts the slots are still extracted so the follow-up answer will
 * search correctly.
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
} from '../src/lib/slots';
import type { SlotJSON } from '../src/lib/slots';

// --- Load API key from .env (same var Vite injects in the app) ---
const envText = fs.readFileSync(path.join(import.meta.dirname, '../.env'), 'utf8');
const apiKey = envText.match(/VITE_GROQ_API_KEY=(.+)/)?.[1]?.trim();
if (!apiKey) throw new Error('VITE_GROQ_API_KEY not found in .env');
const groq = new Groq({ apiKey });

// --- Load the CSV exactly as useChat does (cancelled excluded) ---
const csvText = fs.readFileSync(path.join(import.meta.dirname, '../../data/ux_research_flights_h2_2026_final.csv'), 'utf8');
const flights: Flight[] = [];
const co2: number[] = [];
Papa.parse(csvText, {
  header: true,
  skipEmptyLines: true,
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
const mid = Math.floor(co2.length / 2);
const medianCo2 = co2.length % 2 ? co2[mid] : (co2[mid - 1] + co2[mid]) / 2;

type Branch =
  | 'off-topic'
  | 'foreign-origin'
  | 'ask-destination'
  | 'ask-dates'
  | 'unknown-destination'
  | 'results';

// Replicate useChat.handleParsedSlot's gates exactly (single source of truth
// for the slot helpers is ../src/lib/slots).
const runSlot = (slot: SlotJSON): { branch: Branch; intent: IntentJSON | null; results: Flight[] } => {
  if (slot.off_topic) return { branch: 'off-topic', intent: null, results: [] };

  const origin = classifyOrigin(slot.origin);
  if (origin.kind === 'foreign') return { branch: 'foreign-origin', intent: null, results: [] };

  const missing = firstMissingRequiredSlot(slot);
  if (missing === 'destination') return { branch: 'ask-destination', intent: null, results: [] };
  if (missing === 'dates') return { branch: 'ask-dates', intent: null, results: [] };

  const intent = slotToIntent(slot);
  if (origin.kind === 'london-code') intent.origin_code = origin.code;
  // A comparison widens the stops filter ONLY when the user has not asked for
  // one side explicitly (otherwise "only show direct flights" is a no-op).
  if (slot.compare && slot.direct_only == null) intent.stops = undefined;

  const namedDestination = Boolean(String(slot.destination ?? '').trim());
  if (namedDestination && resolveDestCodes(intent).length === 0) {
    return { branch: 'unknown-destination', intent, results: [] };
  }
  return { branch: 'results', intent, results: filterAndSortFlights(flights, intent, medianCo2) };
};

// The deterministic wording backstops now live in ../src/lib/slots and are
// IMPORTED, not re-implemented: this file used to hold a hand-copied mirror of
// them, which is one more place for the app and its test to drift apart.
const applyBackstops = applyWordingBackstops;

interface Case {
  id: string;
  query: string;
  // returns list of problems (empty = pass)
  check: (slot: SlotJSON, intent: IntentJSON | null, results: Flight[], branch: Branch) => string[];
}

const sortedByPrice = (r: Flight[]) =>
  r.every((f, i) => i === 0 || r[i - 1].price_gbp <= f.price_gbp);

const cases: Case[] = [
  // ---- Task 1: simple lookup (has destination + date -> searches) ----
  { id: 'T1a', query: 'Find me the cheapest direct flight to Barcelona on 16 October', check: (_s, i, r, b) => {
    const p: string[] = [];
    if (b !== 'results') { p.push(`branch=${b} (want results)`); return p; }
    if (i!.stops !== 0) p.push(`stops=${i!.stops} (want 0)`);
    if (i!.date_from !== '2026-10-16' || i!.date_to !== '2026-10-16') p.push(`dates=${i!.date_from}..${i!.date_to}`);
    if (!r.length) p.push('no results');
    if (r.length && r.some(f => f.stops !== 0)) p.push('non-direct in results');
    if (r.length && !sortedByPrice(r)) p.push('not price-sorted');
    if (r.length && Math.abs(r[0].price_gbp - 22.49) > 50) p.push(`cheapest=£${r[0].price_gbp} (expected ~£22)`);
    return p;
  }},
  { id: 'T1b', query: 'cheapest nonstop to Barcelona on 2026-10-16', check: (_s, i, r, b) => {
    const p: string[] = [];
    if (b !== 'results') { p.push(`branch=${b} (want results)`); return p; }
    if (i!.stops !== 0) p.push(`stops=${i!.stops}`);
    if (!r.length) p.push('no results');
    return p;
  }},
  { id: 'T1c', query: 'I want to fly direct to Barcelona on October 16th, what is the cheapest option?', check: (s, _i, r, b) => {
    const p: string[] = [];
    if (b !== 'results') { p.push(`branch=${b} (want results)`); return p; }
    if (s.max_price != null) p.push(`invented max_price=${s.max_price}`);
    if (!r.length) p.push('no results');
    return p;
  }},

  // ---- Task 2: filtered search. No date in the wording -> ask-dates, but the
  // price/time slots must still be extracted so the follow-up will search. ----
  { id: 'T2a', query: 'Find a flight to Amsterdam that departs after 6pm and costs under £80', check: (s, _i, _r, b) => {
    const p: string[] = [];
    if (b !== 'ask-dates') p.push(`branch=${b} (want ask-dates — no date given)`);
    if (s.departure_after !== '18:00') p.push(`departure_after=${s.departure_after}`);
    if (s.max_price !== 80) p.push(`max_price=${s.max_price}`);
    if (String(s.destination || '').toLowerCase() !== 'amsterdam') p.push(`destination=${s.destination}`);
    return p;
  }},
  { id: 'T2b', query: 'evening flight to amsterdam on 21 November, max 80 pounds', check: (_s, i, r, b) => {
    const p: string[] = [];
    if (b !== 'results') { p.push(`branch=${b} (want results)`); return p; }
    if (i!.max_price !== 80) p.push(`max_price=${i!.max_price}`);
    if (i!.departure_after !== '18:00') p.push(`departure_after=${i!.departure_after}`);
    if (r.some(f => f.price_gbp > 80)) p.push('result over £80');
    if (!r.length) p.push('no results');
    return p;
  }},

  // ---- Task 3: comparison (has date -> searches, both stop types) ----
  { id: 'T3a', query: 'Compare a direct flight to Rome with one that has a stop, on 15 November', check: (_s, i, r, b) => {
    const p: string[] = [];
    if (b !== 'results') { p.push(`branch=${b} (want results)`); return p; }
    if (i!.stops != null) p.push(`stops=${i!.stops} (should be omitted for comparison)`);
    if (!r.some(f => f.stops === 0)) p.push('no direct options returned');
    if (!r.some(f => f.stops === 1)) p.push('no 1-stop options returned');
    return p;
  }},
  { id: 'T3b', query: 'direct vs connecting flights to Rome on 2026-11-15', check: (_s, _i, r, b) => {
    const p: string[] = [];
    if (b !== 'results') { p.push(`branch=${b} (want results)`); return p; }
    if (!r.some(f => f.stops === 0) || !r.some(f => f.stops === 1)) p.push('missing one side of comparison');
    return p;
  }},

  // ---- Task 4: flexible dates (has destination + range -> searches) ----
  { id: 'T4a', query: 'What is the cheapest weekend to fly to Paris in the next 3 months?', check: (_s, i, r, b) => {
    const p: string[] = [];
    if (b !== 'results') { p.push(`branch=${b} (want results)`); return p; }
    if (!i!.date_from || !i!.date_to) p.push(`no date range (${i!.date_from}..${i!.date_to})`);
    // Must cover (most of) the 3-month window, not collapse to one weekend
    if (i!.date_from && i!.date_to) {
      const span = (new Date(i!.date_to).getTime() - new Date(i!.date_from).getTime()) / 86400000;
      if (span < 60) p.push(`window only ${span} days (${i!.date_from}..${i!.date_to})`);
    }
    if ((i!.sort_by || 'cheapest') !== 'cheapest') p.push(`sort=${i!.sort_by}`);
    if (!r.length) p.push('no results');
    if (r.length && !sortedByPrice(r)) p.push('not price-sorted');
    return p;
  }},
  // T4c/T4d: the same flexible-window behaviour in wording that is NOT the
  // prompt's verbatim example — guards against the model memorising the example
  // string rather than learning to keep the window open.
  { id: 'T4c', query: 'which weekend is cheapest to fly to Paris over the next three months?', check: (_s, i, r, b) => {
    const p: string[] = [];
    if (b !== 'results') { p.push(`branch=${b} (want results)`); return p; }
    if (i!.date_from && i!.date_to) {
      const span = (new Date(i!.date_to).getTime() - new Date(i!.date_from).getTime()) / 86400000;
      if (span < 60) p.push(`window only ${span} days (${i!.date_from}..${i!.date_to})`);
    } else p.push(`no date range (${i!.date_from}..${i!.date_to})`);
    if (!r.length) p.push('no results');
    return p;
  }},
  { id: 'T4d', query: 'best time to go to Lisbon in autumn', check: (_s, i, r, b) => {
    const p: string[] = [];
    if (b !== 'results') { p.push(`branch=${b} (want results)`); return p; }
    if (i!.date_from && i!.date_to) {
      const span = (new Date(i!.date_to).getTime() - new Date(i!.date_from).getTime()) / 86400000;
      if (span < 60) p.push(`window only ${span} days (${i!.date_from}..${i!.date_to})`);
    } else p.push(`no date range (${i!.date_from}..${i!.date_to})`);
    if (!r.length) p.push('no results');
    return p;
  }},
  { id: 'T4b', query: 'cheapest Paris flights in August', check: (_s, i, r, b) => {
    const p: string[] = [];
    if (b !== 'results') { p.push(`branch=${b} (want results)`); return p; }
    if (i!.date_from !== '2026-08-01' || i!.date_to !== '2026-08-31') p.push(`range=${i!.date_from}..${i!.date_to}`);
    if (!r.length) p.push('no results');
    return p;
  }},

  // ---- Task 5: open-ended "where can I go" exploration. Destination is NOT
  // asked for — the answer IS a set of destinations, so the search runs across
  // the whole network with the stated budget. (Fixed: previously asked for a
  // destination and dead-ended the task.) ----
  { id: 'T5a', query: 'I have £150 and a free weekend, where can I go?', check: (s, _i, r, b) => {
    const p: string[] = [];
    if (b !== 'results') p.push(`branch=${b} (want results — anywhere search)`);
    if (!s.anywhere) p.push('anywhere flag not set');
    if (s.max_price !== 150) p.push(`max_price=${s.max_price}`);
    if (s.destination) p.push(`invented destination ${s.destination}`);
    if (b === 'results' && new Set(r.map(f => f.dest_code)).size < 5) p.push('search did not span multiple destinations');
    return p;
  }},
  { id: 'T5b', query: 'where can I fly for under 150 pounds?', check: (s, _i, r, b) => {
    const p: string[] = [];
    if (b !== 'results') p.push(`branch=${b} (want results — anywhere search)`);
    if (!s.anywhere) p.push('anywhere flag not set');
    if (s.max_price !== 150) p.push(`max_price=${s.max_price}`);
    if (b === 'results' && new Set(r.map(f => f.dest_code)).size < 5) p.push('search did not span multiple destinations');
    return p;
  }},

  // ---- Edge cases ----
  { id: 'E1-unknown-city', query: 'flights to Tokyo next week', check: (_s, _i, _r, b) =>
    b === 'unknown-destination' ? [] : [`branch=${b} (want unknown-destination)`] },
  { id: 'E2-broad-no-dest', query: 'show me flights', check: (_s, _i, _r, b) =>
    b === 'ask-destination' ? [] : [`branch=${b} (want ask-destination)`] },
  { id: 'E3-off-topic', query: 'what is the weather like in Paris today?', check: (_s, _i, _r, b) =>
    b === 'off-topic' ? [] : [`branch=${b} (want off-topic)`] },
  { id: 'E4-outside-window', query: 'flights to Rome in March 2026', check: (_s, _i, r, b) => {
    // Data starts August 2026 — acceptable: zero results or a clamped range
    if (b === 'results' && r.length === 0) return [];
    if (b === 'results' && r.length > 0 && r.every(f => f.date >= '2026-08-05')) return [];
    return [`branch=${b}, results=${r.length}`];
  }},
  { id: 'E5-foreign-origin', query: 'flights from Manchester to Paris on 10 September', check: (_s, _i, _r, b) =>
    b === 'foreign-origin' ? [] : [`branch=${b} (want foreign-origin)`] },
  { id: 'E6-dest-no-date', query: 'flights to Barcelona', check: (_s, _i, _r, b) =>
    b === 'ask-dates' ? [] : [`branch=${b} (want ask-dates)`] },
  { id: 'E7-london-airport', query: 'flights from Gatwick to Rome on 15 November', check: (_s, i, r, b) => {
    const p: string[] = [];
    if (b !== 'results') { p.push(`branch=${b} (want results)`); return p; }
    if (i!.origin_code !== 'LGW') p.push(`origin_code=${i!.origin_code} (want LGW)`);
    if (r.some(f => f.origin_code !== 'LGW')) p.push('result not from LGW');
    return p;
  }},
];

const systemPrompt = buildSystemPrompt();
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Groq free tier is 6,000 tokens/min and this prompt is ~2.7k tokens, so a
// 429 is expected — wait out the retry window the error names and try again.
// `history` are prior USER-message texts, passed exactly as the app passes them
// (as user turns before the current message). Single-turn cases pass none.
const completeWithRetry = async (query: string, history: string[] = []): Promise<string> => {
  for (let attempt = 0; ; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-20b',
        reasoning_effort: 'low',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map((h) => ({ role: 'user' as const, content: h })),
          { role: 'user', content: query },
        ],
        temperature: 0,
        max_tokens: 400,
      });
      return completion.choices[0]?.message?.content ?? '';
    } catch (err: any) {
      const wait = parseFloat(String(err?.message || '').match(/try again in ([\d.]+)s/)?.[1] || '');
      if (attempt < 6 && (err?.status === 429 || wait)) {
        const s = wait || 20;
        console.log(`  (429 — waiting ${s}s)`);
        await sleep((s + 1) * 1000);
        continue;
      }
      throw err;
    }
  }
};

let pass = 0, fail = 0;
for (const c of cases) {
  let raw = '';
  try {
    raw = await completeWithRetry(c.query);
  } catch (err: any) {
    console.log(`✗ ${c.id} — API ERROR: ${err.message}`);
    fail++;
    continue;
  }

  let slot: SlotJSON | null = null;
  try {
    slot = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch {
    console.log(`✗ ${c.id} — JSON PARSE FAILED (app would retry): ${raw.slice(0, 120)}`);
    fail++;
    await sleep(600);
    continue;
  }

  applyBackstops(slot!, c.query);
  const { branch, intent, results } = runSlot(slot!);
  const problems = c.check(slot!, intent, results, branch);
  if (problems.length === 0) {
    console.log(`✓ ${c.id} — branch=${branch}, results=${results.length}${results.length ? `, top=£${results[0].price_gbp.toFixed(2)} ${results[0].dest_code} ${results[0].date}` : ''}`);
    pass++;
  } else {
    console.log(`✗ ${c.id} — ${problems.join(' | ')}`);
    console.log(`    slot: ${JSON.stringify(slot)}`);
    fail++;
  }
  await sleep(600);
}

// ── Multi-turn: cross-turn slot handling (regression guards) ────────────────
// The single-turn cases above CANNOT catch these: they only surface on a later
// turn. There are two opposite failure modes and BOTH are guarded here.
//
// The app's rule (mirrored below, exactly as runSlot mirrors handleParsedSlot):
// every message is parsed by the model on its own words — no history is ever
// sent — and continuity is then restored deterministically by resolveTurnSlot,
// which is IMPORTED from the app rather than re-implemented.
const replaySequence = async (
  sequence: string[]
): Promise<{ text: string; branch: Branch; intent: IntentJSON | null; slot: SlotJSON; results: Flight[] }[]> => {
  const turns: { text: string; branch: Branch; intent: IntentJSON | null; slot: SlotJSON; results: Flight[] }[] = [];
  let previousSlot: SlotJSON | null = null;
  for (const text of sequence) {
    const raw = await completeWithRetry(text);
    let parsed: SlotJSON;
    try {
      parsed = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch {
      throw new Error(`turn "${text.slice(0, 40)}…" produced unparseable JSON`);
    }
    applyBackstops(parsed, text);
    const slot = resolveTurnSlot(previousSlot, parsed, text);
    const { branch, intent, results } = runSlot(slot);
    turns.push({ text, branch, intent, slot, results });
    // The app remembers the slot of the last assistant turn that carried one —
    // results, slot question and unknown-city replies all do.
    previousSlot = slot;
    await sleep(600);
  }
  return turns;
};

// ── Guard A (OVER-carrying) ────────────────────────────────────────────────
// Reproduces the sequence that made a Rome comparison inherit "departure_after
// 18:00" from an earlier Amsterdam turn, collapsing the 3 matching flights to 1
// and making the summary claim there was "no connecting option to compare". The
// final turn names a destination AND a date and carries no modifier cue, so it
// is a NEW query and must inherit nothing.
const OVERCARRY_SEQUENCE = [
  "What's the cheapest direct flight from London to Barcelona on 16 October?",
  'I need a flight to Amsterdam departing after 6pm, under £80',
  '21 November', // answers the app's "Which dates?"
  'Compare a direct flight with one that has a stop to Rome on 15 November - which would you choose?',
];

// Ground truth for the final turn (Rome/FCO outbound 2026-11-15, Economy).
const romeTruth = flights
  .filter((f) => f.dest_code === 'FCO' && f.date === '2026-11-15' && f.direction === 'outbound' && f.cabin_class === 'Economy')
  .sort((a, b) => a.price_gbp - b.price_gbp);

const runOverCarry = async (): Promise<string[]> => {
  const turns = await replaySequence(OVERCARRY_SEQUENCE);
  const p: string[] = [];
  const { branch, intent, results } = turns[turns.length - 1];
  if (branch !== 'results') { p.push(`final branch=${branch} (want results)`); return p; }
  if (intent!.departure_after) p.push(`leaked departure_after=${intent!.departure_after} from the Amsterdam turn`);
  if (intent!.max_price != null) p.push(`leaked max_price=${intent!.max_price} from the Amsterdam turn`);
  if (results.length !== romeTruth.length) p.push(`${results.length} flights (want ${romeTruth.length} — carryover leak drops the earlier departures)`);
  if (!results.some((f) => f.stops === 0)) p.push('no direct side for the comparison');
  if (!results.some((f) => f.stops >= 1)) p.push('no connecting side for the comparison');
  const cheapest = results[0];
  const want = romeTruth[0];
  if (!cheapest || !want || Math.abs(cheapest.price_gbp - want.price_gbp) > 0.01 || cheapest.stops !== want.stops) {
    p.push(
      `cheapest=${cheapest ? `£${cheapest.price_gbp}/stops=${cheapest.stops}` : 'none'} ` +
        `(want £${want?.price_gbp}/stops=${want?.stops})`
    );
  }
  return p;
};

// ── Guard B (UNDER-carrying) ───────────────────────────────────────────────
// The opposite failure, from the live session: withholding history entirely
// meant a message that MODIFIES the current query lost it. "find a flight for
// 4th august instead" dropped Rome and asked "Where are you flying to?" again;
// "under 25" dropped it too and returned 3,746 flights across every city;
// "for sevilla for same date?" lost the 4 August date (the model fills that
// slot with today, which it wrongly believes is the "same date").
//
// Every one of these turns must stay on Rome — then move to Seville — with the
// date intact, and the numbers are checked against the CSV, not just the slots.
const UNDERCARRY_SEQUENCE = [
  'Compare direct vs connecting to Rome on 3 August',
  'find a flight for 4th august instead',
  'under 25',
  'for sevilla for same date?',
];

const truthCount = (destCode: string, date: string, maxPrice?: number) =>
  flights.filter(
    (f) =>
      f.dest_code === destCode &&
      f.date === date &&
      f.direction === 'outbound' &&
      (maxPrice == null || f.price_gbp <= maxPrice)
  ).length;

const runUnderCarry = async (): Promise<string[]> => {
  const turns = await replaySequence(UNDERCARRY_SEQUENCE);
  const p: string[] = [];
  const [, aug4, under25, seville] = turns;

  // "find a flight for 4th august instead" — keeps Rome, moves the date
  if (aug4.branch !== 'results') p.push(`"instead" turn branch=${aug4.branch} (want results — it dropped Rome and asked again)`);
  if (aug4.intent?.date_from !== '2026-08-04') p.push(`"instead" turn date=${aug4.intent?.date_from} (want 2026-08-04)`);
  if (aug4.branch === 'results' && aug4.results.some((f) => f.dest_code !== 'FCO'))
    p.push('"instead" turn left Rome');
  if (aug4.branch === 'results' && aug4.results.length !== truthCount('FCO', '2026-08-04'))
    p.push(`"instead" turn ${aug4.results.length} flights (CSV says ${truthCount('FCO', '2026-08-04')})`);

  // "under 25" — a bare constraint, still Rome on 4 August
  if (under25.branch !== 'results') p.push(`"under 25" branch=${under25.branch} (want results)`);
  if (under25.intent?.max_price !== 25) p.push(`"under 25" max_price=${under25.intent?.max_price}`);
  if (under25.branch === 'results') {
    if (under25.results.some((f) => f.dest_code !== 'FCO')) p.push('"under 25" searched the whole network again');
    const want = truthCount('FCO', '2026-08-04', 25);
    if (under25.results.length !== want) p.push(`"under 25" ${under25.results.length} flights (CSV says ${want})`);
  }

  // "for sevilla for same date?" — new city, SAME date, and Sevilla must
  // resolve to SVQ rather than "not in this flight network"
  if (seville.branch === 'unknown-destination') p.push('"sevilla" rejected as not in the network (SVQ is in the dataset)');
  if (seville.branch !== 'results') p.push(`"sevilla" branch=${seville.branch} (want results)`);
  if (seville.intent?.date_from !== '2026-08-04') p.push(`"same date" resolved to ${seville.intent?.date_from} (want 2026-08-04)`);
  if (seville.branch === 'results') {
    if (seville.results.some((f) => f.dest_code !== 'SVQ')) p.push('"sevilla" did not resolve to SVQ');
    const want = truthCount('SVQ', '2026-08-04', 25);
    if (seville.results.length !== want) p.push(`"sevilla" ${seville.results.length} flights (CSV says ${want} — the £25 cap carries too)`);
  }
  return p;
};

console.log('\n— Multi-turn carryover guards —');
for (const [id, label, run] of [
  ['MT-overcarry', 'a fresh query inherits nothing from earlier turns', runOverCarry],
  ['MT-undercarry', 'a modifying message keeps the destination/date it is modifying', runUnderCarry],
] as const) {
  try {
    const problems = await run();
    if (problems.length === 0) {
      console.log(`✓ ${id} — ${label}`);
      pass++;
    } else {
      console.log(`✗ ${id} — ${problems.join(' | ')}`);
      fail++;
    }
  } catch (err: any) {
    console.log(`✗ ${id} — API ERROR: ${err.message}`);
    fail++;
  }
}

console.log(`\n${pass} passed, ${fail} failed of ${cases.length + 2}`);
