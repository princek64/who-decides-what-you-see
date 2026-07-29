/**
 * Reproduce the "every destination shows the same price" bug.
 * Run from generative-ui/:  npx tsx scripts/dest-price-test.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { filterAndSortFlights } from '../src/hooks/useFlightFilter';
import type { Flight, IntentJSON } from '../src/hooks/useFlightFilter';
import { summarizeDestinations } from '../src/lib/layoutData';

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

// "You have £150 and a free weekend, where could you go?"
const intent: IntentJSON = { direction: 'outbound', max_price: 150, sort_by: 'cheapest' };
const results = filterAndSortFlights(flights, intent, medianCo2);
console.log('filtered result count:', results.length);
const dests = summarizeDestinations(results);
console.log('distinct destinations:', dests.length);
console.log('first 15 destinations (ranked by typical fare):');
for (const d of dests.slice(0, 15)) {
  console.log(`  ${d.code} ${d.city.padEnd(14)} ~£${Math.round(d.typicalPrice)}  (min £${Math.round(d.minPrice)}, ${d.count} flights)`);
}
const prices = new Set(dests.slice(0, 15).map((d) => Math.round(d.typicalPrice)));
console.log('distinct typical prices among first 15:', prices.size);
console.log('distinct typical prices across all', dests.length, ':', new Set(dests.map(d=>Math.round(d.typicalPrice))).size);
console.log('\nraw minPrice first 8:');
for (const d of dests.slice(0, 8)) console.log(`  ${d.city.padEnd(14)} £${d.minPrice.toFixed(2)}`);

// Same but constrained to a single weekend window (Fri-Sun)
const weekendIntent: IntentJSON = { direction: 'outbound', max_price: 150, sort_by: 'cheapest', date_from: '2026-08-14', date_to: '2026-08-16' };
const wRes = filterAndSortFlights(flights, weekendIntent, medianCo2);
const wDests = summarizeDestinations(wRes);
console.log('\nWith a single-weekend window (14-16 Aug), first 10:');
for (const d of wDests.slice(0, 10)) console.log(`  ${d.city.padEnd(14)} from £${Math.round(d.minPrice)} (${d.count} flights)`);
console.log('distinct rounded prices among first 10 (weekend):', new Set(wDests.slice(0, 10).map((d) => Math.round(d.minPrice))).size);
