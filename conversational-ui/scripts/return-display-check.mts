/**
 * Offline check of the round-trip display (no Groq calls).
 *
 * The bug: filterAndSortFlights merges the outbound and inbound results into
 * one price-sorted array, so a flat render interleaves London → Paris and
 * Paris → London rows with nothing saying which is which. These assertions pin
 * the fix — two labelled groups, correct direction in each, a combined trip
 * total — and pin that a one-way search is left exactly as it was.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { filterAndSortFlights } from '../src/hooks/useFlightFilter';
import type { Flight, IntentJSON } from '../src/hooks/useFlightFilter';
import { buildProseAnswer } from '../src/lib/prose';
import { cheapestPair, splitLegs } from '../src/lib/returnGroups';

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

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

// Task 1: the Paris cheapest-weekend return task.
const parisWeekend: IntentJSON = {
  dest_city: 'Paris',
  date_from: '2026-09-04',
  date_to: '2026-09-06',
  direction: 'both',
  sort_by: 'cheapest',
};

// Task 2: the open £150 budget task, asked as a round trip.
const budgetRoundTrip: IntentJSON = {
  dest_city: 'Rome',
  date_from: '2026-09-11',
  date_to: '2026-09-14',
  max_price: 150,
  direction: 'both',
  sort_by: 'cheapest',
};

for (const [name, intent] of [
  ['Paris cheapest weekend return', parisWeekend],
  ['£150 budget round trip', budgetRoundTrip],
] as [string, IntentJSON][]) {
  console.log(`\n### ${name}`);
  const results = filterAndSortFlights(flights, intent, 80);
  const legs = splitLegs(results);
  console.log(
    `  ${results.length} results — ${legs.outbound.length} outbound, ${legs.inbound.length} return`
  );

  // The precondition for the bug: the merged list really does interleave.
  const firstReturnAt = results.findIndex((f) => f.direction === 'return');
  const lastOutboundAt = results.map((f) => f.direction).lastIndexOf('outbound');
  check(
    'merged result list interleaves the legs (the bug being fixed)',
    firstReturnAt !== -1 && lastOutboundAt > firstReturnAt,
    `first return at ${firstReturnAt}, last outbound at ${lastOutboundAt}`
  );

  const answer = buildProseAnswer(results, intent);
  check('flat table suppressed', answer.table === null);
  check('two labelled groups produced', answer.tableGroups?.length === 2);

  const [out, back] = answer.tableGroups ?? [];
  check('outbound group first', /^Outbound — London → /.test(out?.label ?? ''), out?.label);
  check('return group second', /^Return — .+ → London$/.test(back?.label ?? ''), back?.label);
  check(
    'outbound group holds only outbound legs',
    (out?.flights.length ?? 0) > 0 && out.flights.every((f) => f.direction === 'outbound')
  );
  check(
    'return group holds only return legs',
    (back?.flights.length ?? 0) > 0 && back.flights.every((f) => f.direction === 'return')
  );
  check(
    'no flight appears in both groups',
    new Set([...out.flights, ...back.flights].map((f) => f.flight_id)).size ===
      out.flights.length + back.flights.length
  );

  const pair = cheapestPair(legs);
  const expected = Math.min(...legs.outbound.map((f) => f.price_gbp)) +
    Math.min(...legs.inbound.map((f) => f.price_gbp));
  check(
    'combined total is cheapest outbound + cheapest return',
    Math.abs((pair?.total ?? -1) - expected) < 0.005,
    `£${pair?.total.toFixed(2)} vs £${expected.toFixed(2)}`
  );
  check('total appears in the answer text', answer.text.includes(`£${pair!.total.toFixed(2)}`));
  console.log(`  text: ${answer.text.replace(/\s+/g, ' ').slice(0, 220)}`);
}

// One-way display must be untouched.
console.log('\n### one-way regression');
const oneWay: IntentJSON = { dest_city: 'Paris', date: '2026-09-04', sort_by: 'cheapest' };
const oneWayResults = filterAndSortFlights(flights, oneWay, 80);
const oneWayAnswer = buildProseAnswer(oneWayResults, oneWay);
check('one-way produces no groups', oneWayAnswer.tableGroups === null);
check(
  'one-way rows are all outbound',
  oneWayResults.length > 0 && oneWayResults.every((f) => f.direction === 'outbound')
);

// A leg with nothing in it must not produce a misleading trip total.
console.log('\n### one empty leg');
const impossible: IntentJSON = {
  dest_city: 'Paris',
  date_from: '2026-09-04',
  date_to: '2026-09-06',
  direction: 'both',
  departure_after: '23:50',
  sort_by: 'cheapest',
};
const impossibleResults = filterAndSortFlights(flights, impossible, 80);
const impossibleLegs = splitLegs(impossibleResults);
if (impossibleLegs.outbound.length === 0 || impossibleLegs.inbound.length === 0) {
  check('no trip total when a leg is empty', cheapestPair(impossibleLegs) === null);
} else {
  console.log('  (both legs populated — case does not exercise the guard)');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
