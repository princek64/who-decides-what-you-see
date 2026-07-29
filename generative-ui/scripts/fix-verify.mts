/**
 * Verifies the generative-ui QA fixes against the CSV using the app's REAL
 * filter code:
 *   - weekend is now an actual OUTBOUND filter (task 5), while return legs are
 *     left alone so the itinerary builder's Fri/Sat -> Sun/Mon pairing survives
 *   - task 3 (Rome comparison) candidate set is intact
 *   - task 4 cheapest weekend DAY unchanged
 *
 * Run from generative-ui/:  npx tsx scripts/fix-verify.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { filterAndSortFlights, isWeekendDeparture } from '../src/hooks/useFlightFilter';
import type { Flight, IntentJSON } from '../src/hooks/useFlightFilter';

const csvText = fs.readFileSync(
  path.join(import.meta.dirname, '../../data/ux_research_flights_h2_2026_final.csv'),
  'utf8',
);
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

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const run = (intent: IntentJSON) => filterAndSortFlights(flights, intent, medianCo2);

// ---------------------------------------------------------------- Task 5
console.log('\n=== Task 5: £150 + free weekend ===');
const t5 = run({ max_price: 150, weekend: true, direction: 'outbound', sort_by: 'cheapest' });
const off = t5.filter((f) => !isWeekendDeparture(f.date));
check('every result departs Fri/Sat/Sun', off.length === 0, `${off.length} off-weekend`);
check('every result <= £150', t5.every((f) => f.price_gbp <= 150));
const expected = flights.filter(
  (f) => f.direction === 'outbound' && f.price_gbp <= 150 && isWeekendDeparture(f.date),
).length;
console.log(`  app ${t5.length}; CSV recount ${expected}`);
check('matches independent CSV recount', t5.length === expected);
check('smaller than the old unconstrained 53,957', t5.length < 53957);
const destsUnder150 = new Set(t5.map((f) => f.dest_code)).size;
console.log(`  distinct destinations still reachable: ${destsUnder150}`);
check('still a broad destination set', destsUnder150 > 50);

// Return legs must NOT be weekend-filtered, or itinerary pairing breaks.
console.log('\n=== Weekend filter must not touch RETURN legs ===');
const ret = run({ weekend: true, direction: 'return', sort_by: 'cheapest' });
const monReturns = ret.filter((f) => new Date(`${f.date}T00:00:00`).getDay() === 1);
check('Monday return legs survive (itinerary pairing intact)', monReturns.length > 0, `${monReturns.length} Mon returns`);

// ---------------------------------------------------------------- Task 3
console.log('\n=== Task 3: Rome comparison candidate set ===');
const rome = run({ dest_city: 'Rome', date_from: '2026-07-31', date_to: '2026-07-31', direction: 'outbound', sort_by: 'cheapest' });
console.log('  ', rome.map((f) => `£${f.price_gbp.toFixed(2)}/stops=${f.stops}`).join('  '));
check('all 3 flights present', rome.length === 3, `got ${rome.length}`);
check('cheapest direct = £56.35', rome.find((f) => f.stops === 0)?.price_gbp === 56.35);
check('cheapest connecting = £35.81', rome.find((f) => f.stops >= 1)?.price_gbp === 35.81);

// ---------------------------------------------------------------- Task 4
console.log('\n=== Task 4: cheapest weekend DAY unchanged ===');
const t4 = run({ dest_city: 'Paris', date_from: '2026-07-20', date_to: '2026-10-19', direction: 'outbound', sort_by: 'cheapest', weekend: true });
const isWeekendDay = (d: string) => [0, 6].includes(new Date(`${d}T00:00:00`).getDay());
const cwd = t4.filter((f) => isWeekendDay(f.date))[0];
console.log(`  cheapest weekend day: ${cwd?.date} £${cwd?.price_gbp.toFixed(2)}`);
check('still Sat 2026-08-15', cwd?.date === '2026-08-15');
check('still £24.36', cwd?.price_gbp === 24.36, `got £${cwd?.price_gbp}`);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
