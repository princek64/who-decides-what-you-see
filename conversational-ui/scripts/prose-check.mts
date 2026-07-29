/**
 * Offline check of the chat's prose answers (no Groq calls).
 *
 * Builds hand-written intents against the real dataset and prints the sentence
 * the thread would say, so the wording can be read before a participant does.
 * Asserts the two things the prose must never get wrong: the quoted "cheapest"
 * is the minimum BY PRICE of the result set, and a table only appears past
 * TABLE_MIN_RESULTS results, and only when they are all the same kind.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { filterAndSortFlights } from '../src/hooks/useFlightFilter';
import type { Flight, IntentJSON } from '../src/hooks/useFlightFilter';
import { buildProseAnswer, TABLE_MIN_RESULTS } from '../src/lib/prose';

const here = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.resolve(here, '../../data/ux_research_flights_h2_2026_final.csv');

const parsed = Papa.parse(fs.readFileSync(csvPath, 'utf8'), {
  header: true,
  skipEmptyLines: true,
});

const flights: Flight[] = (parsed.data as any[])
  .filter((r) => r.flight_id && r.flight_status !== 'Cancelled')
  .map((r) => ({
    ...r,
    duration_mins: parseInt(r.duration_mins, 10) || 0,
    price_gbp: parseFloat(r.price_gbp) || 0,
    seats_remaining: parseInt(r.seats_remaining, 10) || 0,
    stops: parseInt(r.stops, 10) || 0,
    co2_kg: parseFloat(r.co2_kg) || 0,
    departure_mins_from_midnight: (() => {
      const [h, m] = String(r.departure_time || '0:0').split(':');
      return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
    })(),
  })) as Flight[];

const cases: { name: string; intent: IntentJSON }[] = [
  {
    name: 'few results — direct to Barcelona on one date',
    intent: { dest_city: 'Barcelona', date: '2026-08-03', stops: 0, sort_by: 'cheapest' },
  },
  {
    name: 'many results — Amsterdam under £100 over a week',
    intent: {
      dest_city: 'Amsterdam',
      date_from: '2026-08-01',
      date_to: '2026-08-07',
      max_price: 100,
      sort_by: 'cheapest',
    },
  },
  {
    name: 'many results, fastest sort — Rome on one date',
    intent: { dest_city: 'Rome', date: '2026-08-10', sort_by: 'fastest' },
  },
];

let failures = 0;
for (const c of cases) {
  const results = filterAndSortFlights(flights, c.intent, 80);
  if (results.length === 0) {
    console.log(`\n### ${c.name}\n(no results — widen the case)`);
    failures++;
    continue;
  }
  const answer = buildProseAnswer(results, c.intent);
  console.log(`\n### ${c.name}  [${results.length} results]`);
  console.log(answer.text);
  console.log(answer.table ? `table rows available: ${answer.table.length}` : 'table: none');

  // A mixed set is shown as direct flights only, so the quoted "cheapest" is
  // the cheapest of what is ON SCREEN — quoting a hidden connecting flight
  // would name a price the participant cannot find anywhere in the answer.
  const directOnly = results.filter((f) => f.stops === 0);
  const mixed = directOnly.length > 0 && directOnly.length < results.length;
  const shownSet = mixed && c.intent.stops == null ? directOnly : results;
  const minPrice = shownSet.reduce((m, f) => Math.min(m, f.price_gbp), Infinity);
  if (!answer.text.includes(`£${minPrice.toFixed(2)}`)) {
    console.error(`FAIL: prose does not quote the displayed minimum price £${minPrice.toFixed(2)}`);
    failures++;
  }
  // A table is only allowed for a uniform set of more than TABLE_MIN_RESULTS.
  const displayCount = shownSet.length;
  const wantsTable = displayCount > TABLE_MIN_RESULTS;
  if (wantsTable !== Boolean(answer.table)) {
    console.error(`FAIL: table presence wrong (${displayCount} shown, table=${Boolean(answer.table)})`);
    failures++;
  }
  if (answer.table && !(answer.table.every((f) => f.stops === 0) || answer.table.every((f) => f.stops > 0))) {
    console.error('FAIL: table mixes direct and connecting flights');
    failures++;
  }
  if (mixed && c.intent.stops == null && /with 1 stop/.test(answer.text)) {
    console.error('FAIL: connecting flight shown in a mixed set without being asked for');
    failures++;
  }

  // The answer closes with a follow-up question, and never offers a refinement
  // the search has already applied.
  if (!answer.text.trimEnd().endsWith('?')) {
    console.error('FAIL: answer does not end with a follow-up question');
    failures++;
  }
  if (c.intent.max_price && /filter to under/.test(answer.text)) {
    console.error('FAIL: offers a price cap when one is already applied');
    failures++;
  }
  if (c.intent.sort_by === 'fastest' && /sort them by fastest/.test(answer.text)) {
    console.error('FAIL: offers the sort that is already active');
    failures++;
  }
  if (c.intent.stops === 0 && /narrow it to direct/.test(answer.text)) {
    console.error('FAIL: offers direct-only on an already-direct search');
    failures++;
  }
}

console.log(failures === 0 ? '\nAll prose checks passed.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
