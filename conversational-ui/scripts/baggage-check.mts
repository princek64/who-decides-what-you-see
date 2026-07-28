/**
 * Offline check of the flight-detail lookups (no Groq calls).
 *
 * A question about a flight already on screen must be answered from the CSV,
 * never sent down the off-topic path — while a genuinely unrelated question
 * (hotels, visas) must NOT be captured by the same detector.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { filterAndSortFlights } from '../src/hooks/useFlightFilter';
import type { Flight } from '../src/hooks/useFlightFilter';
import { buildDetailAnswer, buildBaggageAnswer, detectDetailField, isBaggageQuestion } from '../src/lib/detailAnswers';
import type { DetailField } from '../src/lib/detailAnswers';

const here = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.resolve(here, '../public/ux_research_flights_h2_2026_final.csv');

const parsed = Papa.parse(fs.readFileSync(csvPath, 'utf8'), { header: true, skipEmptyLines: true });
const flights: Flight[] = (parsed.data as any[])
  .filter((r) => r.flight_id && r.flight_status !== 'Cancelled')
  .map((r) => ({
    ...r,
    duration_mins: parseInt(r.duration_mins, 10) || 0,
    price_gbp: parseFloat(r.price_gbp) || 0,
    stops: parseInt(r.stops, 10) || 0,
    co2_kg: parseFloat(r.co2_kg) || 0,
    seats_remaining: parseInt(r.seats_remaining, 10) || 0,
    departure_mins_from_midnight: 0,
  })) as Flight[];

// The result set a participant would have on screen after the first task.
const pool = filterAndSortFlights(
  flights,
  { dest_city: 'Barcelona', date: '2026-08-03', sort_by: 'cheapest' },
  80
);

let failures = 0;
const fail = (msg: string) => {
  console.error(`FAIL: ${msg}`);
  failures++;
};

console.log(`pool: ${pool.length} flights — ${pool.map((f) => `${f.airline_name} ${f.flight_number} (${f.baggage_policy})`).join(', ')}\n`);

// 1. Detector fires on the ways people actually ask.
for (const q of [
  'what is the baggage allowance on that easyJet flight?',
  'does it include a checked bag?',
  'how much luggage can I take?',
  'can I bring a suitcase on the Vueling one',
  "what's the hand luggage policy",
]) {
  if (!isBaggageQuestion(q)) fail(`not detected as a baggage question: "${q}"`);
}

// 2. Detector stays OFF for genuinely unrelated questions.
for (const q of [
  'can you book me a hotel in Barcelona?',
  'do I need a visa for Spain?',
  'what is the weather like in August?',
  'cheapest direct flight to Barcelona on 3 August',
]) {
  if (isBaggageQuestion(q)) fail(`wrongly detected as a baggage question: "${q}"`);
}

// 3. A named airline is answered from that flight's own row.
const named = buildBaggageAnswer('what is the baggage allowance on the easyJet flight?', pool);
console.log(`named airline -> ${named}`);
const easy = pool.find((f) => /easyjet/i.test(f.airline_name));
if (!named || !easy) fail('no answer for a named airline');
else if (!named.includes(easy.flight_number)) fail('answer does not name the flight asked about');

// 4. A flight number works too.
if (easy) {
  const byNumber = buildBaggageAnswer(`does ${easy.flight_number} include a checked bag?`, pool);
  console.log(`flight number  -> ${byNumber}`);
  if (!byNumber?.includes(easy.flight_number)) fail('flight-number lookup failed');
}

// 5. No flight named: answer covers the set on screen.
const whole = buildBaggageAnswer('what about baggage?', pool);
console.log(`whole set      -> ${whole}`);
if (!whole) fail('no answer for the set on screen');

// 6. Nothing on screen yet -> null, so the caller can ask which flight.
if (buildBaggageAnswer('what is the baggage allowance?', []) !== null) {
  fail('answered with an empty pool');
}

// 7. Every policy in the dataset renders as a sentence, not a raw label.
for (const policy of new Set(flights.slice(0, 40000).map((f) => f.baggage_policy))) {
  const one = buildBaggageAnswer('baggage?', [{ ...pool[0], baggage_policy: policy }]);
  if (!one || /\d+x \d+kg/.test(one)) fail(`policy not phrased naturally: ${policy} -> ${one}`);
  else console.log(`policy         -> ${one}`);
}

// 8. Every dataset field the prompt promises is answerable, for a named flight.
const fieldQuestions: [DetailField, string][] = [
  ['baggage', 'what is the baggage allowance on the easyJet flight?'],
  ['aircraft', 'what plane is the easyJet flight?'],
  ['cabin', 'what cabin class is the easyJet flight?'],
  ['seats', 'how many seats are left on the easyJet flight?'],
  ['demand', 'how busy is the easyJet flight?'],
  ['co2', 'what are the CO₂ emissions of the easyJet flight?'],
  ['flexibility', 'is the easyJet flight refundable?'],
  ['times', 'what time does the easyJet flight depart?'],
  ['duration', 'how long is the easyJet flight?'],
  ['stops', 'does the easyJet flight have any stops?'],
  ['price', 'how much is the easyJet flight?'],
  ['airport', 'which airport does the easyJet flight leave from?'],
];
console.log('');
for (const [expected, q] of fieldQuestions) {
  const detected = detectDetailField(q);
  if (detected !== expected) fail(`"${q}" detected as ${detected}, expected ${expected}`);
  const answer = buildDetailAnswer(q, pool);
  console.log(`${expected.padEnd(12)} -> ${answer}`);
  if (!answer) fail(`no answer for ${expected}`);
  else if (/undefined|NaN|\[object/.test(answer)) fail(`bad rendering for ${expected}: ${answer}`);
}

// 9. Superlative targets resolve BY VALUE, not by list position.
const cheapest = pool.reduce((a, b) => (a.price_gbp <= b.price_gbp ? a : b));
const cheapestAnswer = buildDetailAnswer('what is the baggage allowance for the cheapest flight?', pool);
console.log(`\ncheapest target -> ${cheapestAnswer}`);
if (!cheapestAnswer?.includes(cheapest.flight_number)) fail('cheapest target did not resolve by price');

console.log(failures === 0 ? '\nAll detail checks passed.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
