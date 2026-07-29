/**
 * Deterministic UI-rule checks (no Groq): Task 6 refine-chip exclusion on the
 * comparison template, and the comparison delta / cheapest-weekend-day helpers.
 * Run from generative-ui/:  npx tsx scripts/ui-rules-test.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { filterAndSortFlights } from '../src/hooks/useFlightFilter';
import type { Flight, IntentJSON } from '../src/hooks/useFlightFilter';
import { splitComparison, cheapestByDate } from '../src/lib/layoutData';

// Mirror of GenScreen.buildFollowUps (keep in sync!) — the piece Task 6 changed.
const buildFollowUps = (msg: { flights: Flight[]; intent: IntentJSON & { layout?: string }; layout?: string }) => {
  if (!msg.flights?.length) return [] as { label: string }[];
  const intent = msg.intent || {};
  const chips: { label: string }[] = [];
  const isComparison = (msg.layout ?? intent.layout) === 'comparison';
  if (intent.stops == null && !isComparison) chips.push({ label: 'Only show direct flights' });
  if (intent.max_price == null) chips.push({ label: 'Only flights under £100' });
  if ((intent.sort_by || 'cheapest') !== 'fastest') chips.push({ label: 'Sort them by fastest' });
  if (!intent.low_co2) chips.push({ label: 'Prefer lower CO₂ options' });
  return chips.slice(0, 3);
};

const csvText = fs.readFileSync(path.join(import.meta.dirname, '../../data/ux_research_flights_h2_2026_final.csv'), 'utf8');
const flights: Flight[] = [];
Papa.parse(csvText, { header: true, skipEmptyLines: true, complete: (res: any) => {
  res.data.forEach((row: any) => {
    if (row.flight_status === 'Cancelled' || !row.flight_id) return;
    flights.push({ ...row, duration_mins: +row.duration_mins||0, stops: +row.stops||0, price_gbp: parseFloat(row.price_gbp)||0, co2_kg: parseFloat(row.co2_kg)||0, departure_mins_from_midnight: 0 } as Flight);
  });
}});

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c?'✅':'❌'} ${m}`); c ? pass++ : fail++; };

// Task 6: on the comparison template the "direct only" chip must be absent.
console.log('TASK 6 — refine chips on comparison template');
const cmp = buildFollowUps({ flights: flights.slice(0, 10), intent: { sort_by: 'cheapest' }, layout: 'comparison' });
ok(!cmp.some(c => c.label === 'Only show direct flights'), `comparison view hides "Only show direct flights" (chips: ${cmp.map(c=>c.label).join(', ')})`);
const grid = buildFollowUps({ flights: flights.slice(0, 10), intent: { sort_by: 'cheapest' }, layout: 'grid' });
ok(grid.some(c => c.label === 'Only show direct flights'), `grid view still offers it (chips: ${grid.map(c=>c.label).join(', ')})`);

// Comparison template still finds both sides for the task query (Rome, 10 Jul).
console.log('\nComparison template data (Rome, 10 Jul)');
const cmpIntent: IntentJSON = { direction: 'outbound', dest_city: 'Rome', date_from: '2026-07-10', date_to: '2026-07-10', sort_by: 'cheapest' };
const { direct, oneStop } = splitComparison(filterAndSortFlights(flights, cmpIntent, 80));
ok(!!direct && !!oneStop, `both a direct (£${direct?.price_gbp}) and 1-stop (£${oneStop?.price_gbp}) present`);

// Task 4: calendar cheapest weekend day = a single Sat/Sun.
console.log('\nTASK 4 — cheapest single weekend day (Paris, 3-month window)');
const calIntent: IntentJSON = { direction: 'outbound', dest_city: 'Paris', date_from: '2026-07-17', date_to: '2026-10-16', sort_by: 'cheapest' };
const prices = cheapestByDate(filterAndSortFlights(flights, calIntent, 80));
let best: Flight | null = null;
for (const d of Object.keys(prices)) { const day = new Date(`${d}T00:00:00`).getDay(); if (day!==0&&day!==6) continue; if (!best || prices[d].price_gbp < best.price_gbp) best = prices[d]; }
const bestDay = best ? new Date(`${best.date}T00:00:00`).getDay() : -1;
ok(!!best && (bestDay === 0 || bestDay === 6), `cheapest weekend day is a Sat/Sun: ${best?.date} (£${best?.price_gbp})`);

console.log(`\n${fail===0?'✅ ALL PASS':'❌ FAILURES'}: ${pass} passed, ${fail} failed`);
