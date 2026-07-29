/**
 * End-to-end test of the generative pipeline against the 5 research tasks:
 * real system prompt, real filter code, real layout adapters, live Groq.
 * Run from generative-ui/:  npx tsx scripts/pipeline-test.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import Groq from 'groq-sdk';
import Papa from 'papaparse';
import { buildSystemPrompt, MODEL_LAYOUTS } from '../src/constants/prompts';
import { filterAndSortFlights, resolveDestCodes } from '../src/hooks/useFlightFilter';
import type { Flight, IntentJSON } from '../src/hooks/useFlightFilter';
import { buildItinerary, nearbyAlternatives, splitComparison, rankFlights, summarizeDestinations, weeklyTrend, parseLayover } from '../src/lib/layoutData';

const envText = fs.readFileSync(path.join(import.meta.dirname, '../.env'), 'utf8');
const apiKey = envText.match(/VITE_GROQ_API_KEY=(.+)/)?.[1]?.trim();
if (!apiKey) throw new Error('VITE_GROQ_API_KEY not found in .env');
const groq = new Groq({ apiKey });

// --- Load the CSV exactly as useGenChat does (cancelled excluded) ---
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

// --- Mirrors of useGenChat's guard + layout resolution (keep in sync!) ---
const hasSearchConstraints = (i: IntentJSON) => Boolean(
  i.origin_code?.trim() || i.dest_code?.trim() || i.dest_city?.trim() ||
  i.date?.trim() || i.date_from?.trim() || i.date_to?.trim() ||
  i.max_price != null || i.stops != null || i.cabin_class?.trim() ||
  i.departure_after?.trim() || i.departure_before?.trim() ||
  i.flexibility?.trim() || i.low_co2 || i.airline?.trim()
);

const resolveLayout = (intent: any, results: Flight[]): string => {
  let layout = (MODEL_LAYOUTS as readonly string[]).includes(intent.layout ?? '') ? intent.layout : 'grid';
  if (layout === 'itinerary') {
    const pair = buildItinerary(flights, intent, medianCo2);
    if (!pair) layout = 'grid';
  }
  if (layout !== 'itinerary' && results.length === 0) layout = 'alert';
  return layout;
};

interface Case {
  id: string;
  query: string;
  expectLayout?: string;
  altLayouts?: string[];
  check?: (intent: any, results: Flight[], branch: string) => string[];
}

const sortedByPrice = (r: Flight[]) => r.every((f, i) => i === 0 || r[i - 1].price_gbp <= f.price_gbp);

const cases: Case[] = [
  // The 5 study tasks, with layout expectations
  { id: 'T1-highlight', query: 'Find me the cheapest direct flight to Barcelona on 14 July', expectLayout: 'highlight', check: (i, r) => {
    const p: string[] = [];
    if (i.stops !== 0) p.push(`stops=${i.stops}`);
    if (!r.length) p.push('no results');
    if (r.length && Math.abs(r[0].price_gbp - 35.04) > 50) p.push(`top=£${r[0].price_gbp}`);
    return p;
  }},
  { id: 'T2-grid', query: 'Find a flight to Amsterdam that departs after 6pm and costs under £80', expectLayout: 'grid', check: (i, r) => {
    const p: string[] = [];
    if (i.departure_after !== '18:00') p.push(`departure_after=${i.departure_after}`);
    if (i.max_price !== 80) p.push(`max_price=${i.max_price}`);
    if (!r.length) p.push('no results');
    if (r.some(f => f.departure_mins_from_midnight < 1080 || f.price_gbp > 80)) p.push('constraint violated');
    return p;
  }},
  { id: 'T3-comparison', query: 'Compare a direct flight to Rome with one that has a stop, on 10 July', expectLayout: 'comparison', check: (_i, r) => {
    const p: string[] = [];
    const pair = splitComparison(r);
    if (!pair.direct) p.push('no direct side');
    if (!pair.oneStop) p.push('no 1-stop side');
    return p;
  }},
  { id: 'T4-calendar', query: 'What is the cheapest weekend to fly to Paris in the next 3 months?', expectLayout: 'calendar', altLayouts: ['trend'], check: (i, r) => {
    const p: string[] = [];
    if (i.date_from && i.date_to) {
      const span = (new Date(i.date_to).getTime() - new Date(i.date_from).getTime()) / 86400000;
      if (span < 60) p.push(`window only ${span}d`);
    } else p.push('no range');
    if (!r.length) p.push('no results');
    return p;
  }},
  { id: 'T5-destinations', query: 'I have £150 and a free weekend, where can I go?', expectLayout: 'destinations', altLayouts: ['budget', 'map'], check: (i, r) => {
    const p: string[] = [];
    if (i.max_price !== 150) p.push(`max_price=${i.max_price}`);
    if (!r.length) p.push('no results');
    if (r.length && summarizeDestinations(r).length < 3) p.push('too few destinations');
    return p;
  }},

  // Additional layout coverage through the full pipeline
  { id: 'L-map', query: 'where can I fly from London? show me on a map', expectLayout: 'map', altLayouts: ['destinations'] },
  { id: 'L-itinerary', query: 'plan a weekend trip to Rome in September', expectLayout: 'itinerary', check: (i) => {
    const pair = buildItinerary(flights, i, medianCo2);
    if (!pair) return ['no itinerary pair buildable'];
    if (pair.ret.date <= pair.out.date) return ['return not after outbound'];
    // "weekend trip" must depart Fri/Sat and return Sun/Mon (issue 3)
    const outDay = new Date(`${pair.out.date}T00:00:00`).getDay();
    const retDay = new Date(`${pair.ret.date}T00:00:00`).getDay();
    const p: string[] = [];
    if (outDay !== 5 && outDay !== 6) p.push(`outbound not Fri/Sat (day=${outDay}, ${pair.out.date})`);
    if (retDay !== 0 && retDay !== 1) p.push(`return not Sun/Mon (day=${retDay}, ${pair.ret.date})`);
    if (pair.nights < 1 || pair.nights > 4) p.push(`nights out of weekend range (${pair.nights})`);
    return p;
  }},
  { id: 'L-budget', query: 'what can I get for £150 and how much would I have left over?', expectLayout: 'budget', altLayouts: ['destinations'] },
  { id: 'L-ranked', query: 'find me something good to Lisbon', expectLayout: 'ranked', check: (_i, r) => {
    const ranked = rankFlights(r);
    return ranked.length >= 3 ? [] : ['fewer than 3 ranked entries'];
  }},
  { id: 'L-multileg', query: 'how do the layovers work on flights to Athens?', expectLayout: 'multileg', check: (_i, r) => {
    const connecting = r.filter(f => f.stops > 0);
    if (!connecting.length) return ['no connecting flights'];
    const parsed = parseLayover(connecting[0].layover_details);
    return parsed ? [] : ['layover string unparseable'];
  }},
  { id: 'L-trend', query: 'when is it cheapest to fly to Madrid over the next few weeks?', expectLayout: 'trend', altLayouts: ['calendar'], check: (_i, r) => {
    return weeklyTrend(r).length >= 2 ? [] : ['fewer than 2 trend buckets'];
  }},
  { id: 'L-alert', query: 'direct flights to Barcelona on 14 July under £5', expectLayout: 'alert', check: (i, r, branch) => {
    const p: string[] = [];
    if (branch !== 'results') p.push(`branch=${branch}`);
    if (r.length !== 0) p.push(`expected 0 results, got ${r.length}`);
    const alts = nearbyAlternatives(flights, i, medianCo2);
    if (alts.overBudget.length === 0 && alts.nearbyDates.length === 0) p.push('no alternatives offered');
    return p;
  }},

  // Guardrail edge cases (unchanged behavior from the conversational app)
  { id: 'E-unknown-city', query: 'flights to Tokyo next week', check: (_i, _r, branch) =>
    branch === 'unknown-destination' ? [] : [`branch=${branch}`] },
  { id: 'E-too-broad', query: 'show me flights', check: (_i, _r, branch) =>
    branch === 'too-broad' ? [] : [`branch=${branch}`] },
  { id: 'E-off-topic', query: 'what is the weather like in Paris today?', check: (_i, _r, branch) =>
    branch === 'off-topic' ? [] : [`branch=${branch}`] },
];

// ── Offline checks of the app-side fallback logic (no API needed) ──
console.log('— Offline fallback checks —');
{
  const garbage = resolveLayout({ layout: 'hologram', dest_city: 'Rome', date: '2026-07-10' },
    filterAndSortFlights(flights, { dest_city: 'Rome', date: '2026-07-10' }, medianCo2));
  console.log(`${garbage === 'grid' ? '✓' : '✗'} invalid layout token falls back to grid (got ${garbage})`);

  const missing = resolveLayout({ dest_city: 'Rome', date: '2026-07-10' },
    filterAndSortFlights(flights, { dest_city: 'Rome', date: '2026-07-10' }, medianCo2));
  console.log(`${missing === 'grid' ? '✓' : '✗'} missing layout falls back to grid (got ${missing})`);

  const empty = resolveLayout({ layout: 'highlight', dest_city: 'Rome', date: '2026-07-10', max_price: 1 }, []);
  console.log(`${empty === 'alert' ? '✓' : '✗'} zero results switches to alert (got ${empty})`);
}

const systemPrompt = buildSystemPrompt();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Groq call with optional prior USER-message history + 429 retry. `history` is
// passed exactly as useGenChat.callGroq passes it (user turns before current).
const completeWithRetry = async (query: string, history: string[] = []): Promise<string> => {
  for (let attempts = 0; ; attempts++) {
    try {
      const completion = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        max_tokens: 300,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map((h) => ({ role: 'user' as const, content: h })),
          { role: 'user', content: query },
        ],
      });
      return completion.choices[0]?.message?.content ?? '';
    } catch (err: any) {
      if (err?.status === 429 && attempts < 4) {
        const wait = parseFloat(String(err.message).match(/try again in ([\d.]+)s/)?.[1] ?? '10') + 2;
        await sleep(wait * 1000);
        continue;
      }
      throw err;
    }
  }
};

let pass = 0, fail = 0;
console.log('\n— Live pipeline cases —');
for (const c of cases) {
  let raw = '';
  let attempts = 0;
  while (true) {
    try {
      const completion = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        max_tokens: 300,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: c.query },
        ],
      });
      raw = completion.choices[0]?.message?.content ?? '';
      break;
    } catch (err: any) {
      // Free-tier TPM limits bite with this prompt size — wait and retry
      if (err?.status === 429 && attempts < 4) {
        attempts++;
        const wait = parseFloat(String(err.message).match(/try again in ([\d.]+)s/)?.[1] ?? '10') + 2;
        await sleep(wait * 1000);
        continue;
      }
      console.log(`✗ ${c.id} — API ERROR: ${err.message}`);
      raw = '';
      break;
    }
  }
  if (!raw) { fail++; continue; }

  let intent: any = null;
  try {
    intent = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch {
    console.log(`✗ ${c.id} — JSON PARSE FAILED (app would retry): ${raw.slice(0, 100)}`);
    fail++;
    await sleep(700);
    continue;
  }

  // Mirror useGenChat's deterministic "weekend" backstop
  if (!intent.weekend && /\bweekend\b/i.test(c.query)) intent.weekend = true;

  let branch = 'results';
  let results: Flight[] = [];
  const exploratory = intent?.layout === 'map' || intent?.layout === 'destinations';
  if (intent.off_topic) branch = 'off-topic';
  else if (!hasSearchConstraints(intent) && !exploratory) branch = 'too-broad';
  else {
    const wantsDest = Boolean(intent.dest_city?.trim() || intent.dest_code?.trim());
    if (wantsDest && resolveDestCodes(intent).length === 0) branch = 'unknown-destination';
    else results = filterAndSortFlights(flights, intent, medianCo2);
  }

  const problems: string[] = [];
  if (c.expectLayout && branch === 'results') {
    const rendered = resolveLayout(intent, results);
    if (rendered !== c.expectLayout && !c.altLayouts?.includes(rendered)) {
      problems.push(`layout=${rendered} (want ${c.expectLayout})`);
    }
  }
  if (c.check) problems.push(...c.check(intent, results, branch));
  if (branch === 'results' && results.length > 1 && (intent.sort_by ?? 'cheapest') === 'cheapest' && !sortedByPrice(results)) {
    problems.push('not price-sorted');
  }

  if (problems.length === 0) {
    const rendered = branch === 'results' ? resolveLayout(intent, results) : branch;
    console.log(`✓ ${c.id.padEnd(16)} → ${rendered}, ${results.length} results`);
    pass++;
  } else {
    console.log(`✗ ${c.id.padEnd(16)} — ${problems.join(' | ')}`);
    console.log(`    intent: ${JSON.stringify(intent)}`);
    fail++;
  }
  await sleep(700);
}
// ── Multi-turn: cross-turn constraint carryover (regression guard) ──────────
// The single-turn cases above cannot catch this — it only surfaces on a later
// turn. Replays the exact sequence that broke the SAME comparison in the
// conversational app (a Rome comparison inheriting "departure_after 18:00" from
// an earlier Amsterdam turn, collapsing 3 flights to 1). generative-ui passes
// the last-3 user messages unconditionally (it never asks a follow-up), so this
// mirrors THAT behaviour — no gating. The gen prompt currently does not leak on
// this sequence (verified), and the comparison must keep both a direct and a
// connecting side. If the model/prompt drifts into leaking here, splitComparison
// loses a side and this fails.
const CARRYOVER_SEQUENCE = [
  "What's the cheapest direct flight from London to Barcelona on 15 August?",
  'I need a flight to Amsterdam departing after 6pm, under £80',
  '31 July',
  'Compare a direct flight with one that has a stop to Rome on 31 July - which would you choose?',
];

const romeTruth = flights
  .filter((f) => f.dest_code === 'FCO' && f.date === '2026-07-31' && f.direction === 'outbound' && f.cabin_class === 'Economy')
  .sort((a, b) => a.price_gbp - b.price_gbp);

const runCarryover = async (): Promise<string[]> => {
  const userTexts: string[] = [];
  let finalResults: Flight[] = [];
  for (const text of CARRYOVER_SEQUENCE) {
    // gen passes the last-3 prior user messages on EVERY turn (no gating).
    const raw = await completeWithRetry(text, userTexts.slice(-3));
    let intent: any;
    try {
      intent = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch {
      return [`turn "${text.slice(0, 30)}…" produced unparseable JSON`];
    }
    if (!intent.weekend && /\bweekend\b/i.test(text)) intent.weekend = true;
    const wantsDest = Boolean(intent.dest_city?.trim() || intent.dest_code?.trim());
    finalResults = wantsDest && resolveDestCodes(intent).length === 0
      ? []
      : filterAndSortFlights(flights, intent, medianCo2);
    userTexts.push(text);
    await sleep(700);
  }

  const p: string[] = [];
  if (finalResults.length !== romeTruth.length) p.push(`${finalResults.length} flights (want ${romeTruth.length} — carryover leak drops earlier departures)`);
  const pair = splitComparison(finalResults);
  if (!pair.direct) p.push('no direct side for the comparison');
  if (!pair.oneStop) p.push('no connecting side for the comparison');
  const cheapest = finalResults[0];
  if (!cheapest || cheapest.price_gbp !== 35.81 || cheapest.stops !== 1) {
    p.push(`cheapest=${cheapest ? `£${cheapest.price_gbp}/stops=${cheapest.stops}` : 'none'} (want £35.81 connecting)`);
  }
  return p;
};

console.log('\n— Multi-turn carryover guard —');
try {
  const problems = await runCarryover();
  if (problems.length === 0) {
    console.log('✓ MT-carryover — Rome comparison keeps both sides after the "after 6pm" turn');
    pass++;
  } else {
    console.log(`✗ MT-carryover — ${problems.join(' | ')}`);
    fail++;
  }
} catch (err: any) {
  console.log(`✗ MT-carryover — API ERROR: ${err.message}`);
  fail++;
}

console.log(`\n${pass} passed, ${fail} failed of ${cases.length + 1} live cases`);
