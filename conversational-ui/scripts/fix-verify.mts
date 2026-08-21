/**
 * QA verify vs CSV (real filter/slots): carryover, weekend filter, cheapest day, prose.
 * Run: npx tsx scripts/fix-verify.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { filterAndSortFlights, isWeekendDeparture } from '../src/hooks/useFlightFilter';
import type { Flight, IntentJSON } from '../src/hooks/useFlightFilter';
import { slotToIntent } from '../src/lib/slots';
import type { SlotJSON } from '../src/lib/slots';
import { getSearchAnchor } from '../src/constants/prompts';
import { buildProseAnswer } from '../src/lib/prose';

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

const run = (slot: SlotJSON, patch: Partial<IntentJSON> = {}) => {
  const intent = { ...slotToIntent(slot), ...patch };
  return { intent, results: filterAndSortFlights(flights, intent, medianCo2) };
};

// ---------------------------------------------------------------- Task 3
console.log('\n=== Task 3: Rome comparison, candidate set ===');
const romeClean: SlotJSON = {
  destination: 'Rome', date_from: '2026-11-15', date_to: '2026-11-15', compare: true,
} as SlotJSON;
const rome = run(romeClean, { stops: undefined });
const truth = flights
  .filter((f) => f.dest_code === 'FCO' && f.date === '2026-11-15' && f.direction === 'outbound')
  .sort((a, b) => a.price_gbp - b.price_gbp);
console.log('  CSV truth:', truth.map((f) => `£${f.price_gbp.toFixed(2)}/stops=${f.stops}`).join('  '));
console.log('  app      :', rome.results.map((f) => `£${f.price_gbp.toFixed(2)}/stops=${f.stops}`).join('  '));
check('candidate set size matches CSV', rome.results.length === truth.length, `got ${rome.results.length}`);
check('cheapest matches CSV', Boolean(rome.results[0] && truth[0] && Math.abs(rome.results[0].price_gbp - truth[0].price_gbp) < 0.01));
check('a direct option exists', rome.results.some((f) => f.stops === 0));
check('a connecting option exists', rome.results.some((f) => f.stops >= 1));
const cheapestDirect = [...rome.results].filter((f) => f.stops === 0).sort((a, b) => a.price_gbp - b.price_gbp)[0];
const cheapestConn = [...rome.results].filter((f) => f.stops >= 1).sort((a, b) => a.price_gbp - b.price_gbp)[0];
const truthDirect = truth.filter((f) => f.stops === 0)[0];
const truthConn = truth.filter((f) => f.stops >= 1)[0];
check(
  'cheapest direct matches CSV',
  Boolean(cheapestDirect && truthDirect && Math.abs(cheapestDirect.price_gbp - truthDirect.price_gbp) < 0.01),
  `got £${cheapestDirect?.price_gbp}`
);
check(
  'cheapest connecting matches CSV',
  Boolean(cheapestConn && truthConn && Math.abs(cheapestConn.price_gbp - truthConn.price_gbp) < 0.01),
  `got £${cheapestConn?.price_gbp}`
);

// ---------------------------------------------------------------- Task 5
console.log('\n=== Task 5: £150 + free weekend, weekend actually filtered ===');
const t5: SlotJSON = { anywhere: true, max_price: 150, weekend: true } as SlotJSON;
const t5r = run(t5);
check('weekend_only reached the intent', t5r.intent.weekend_only === true);
const offWeekend = t5r.results.filter((f) => !isWeekendDeparture(f.date));
check('every result departs Fri/Sat/Sun', offWeekend.length === 0, `${offWeekend.length} off-weekend`);
const overBudget = t5r.results.filter((f) => f.price_gbp > 150);
check('every result is <= £150', overBudget.length === 0, `${overBudget.length} over`);
// Independent recount must apply the same undated search floor the filter uses.
const floor = getSearchAnchor();
const expected = flights.filter(
  (f) =>
    f.direction === 'outbound' &&
    f.price_gbp <= 150 &&
    isWeekendDeparture(f.date) &&
    f.date >= floor
).length;
console.log(`  app returned ${t5r.results.length}; CSV recount (outbound/<=150/Fri-Sun/from ${floor}) = ${expected}`);
check('count matches independent CSV recount', t5r.results.length === expected);
check('materially smaller than the old unconstrained 53,957', t5r.results.length < 53957);

// ---------------------------------------------------------------- Task 4
console.log('\n=== Task 4: cheapest weekend day from filtered set ===');
const t4: SlotJSON = {
  destination: 'Paris', date_from: floor, date_to: '2026-11-11',
  cheapest_when: true, weekend: true,
} as SlotJSON;
const t4r = run(t4);
const cheapestWeekendDay = t4r.results[0];
console.log(`  cheapest weekend day: ${cheapestWeekendDay?.date} £${cheapestWeekendDay?.price_gbp.toFixed(2)}`);
check('has a cheapest weekend result', Boolean(cheapestWeekendDay));
check('cheapest day is a weekend departure', Boolean(cheapestWeekendDay && isWeekendDeparture(cheapestWeekendDay.date)));
check('cards now weekend-only too', t4r.results.every((f) => isWeekendDeparture(f.date)));

// ---------------------------------------------------------------- prose time window
console.log('\n=== Prose restates a departure_after window ===');
const timed: SlotJSON = {
  destination: 'Amsterdam', date_from: '2026-11-21', date_to: '2026-11-21',
  max_price: 80, departure_after: '18:00',
} as SlotJSON;
const timedRun = run(timed);
const prose = buildProseAnswer(timedRun.results, timedRun.intent);
check('prose mentions after 6pm / 18:00', /after 6pm|18:00|evening/i.test(prose.text), prose.text.split('\n')[0]);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
