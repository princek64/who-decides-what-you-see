/**
 * OFFLINE check (no Groq) for the follow-up-chip composition fix: a chip patch
 * merged onto the prior answer's slot must preserve every earlier constraint.
 * Run from conversational-ui/:  npx tsx scripts/refine-test.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { filterAndSortFlights } from '../src/hooks/useFlightFilter';
import type { Flight } from '../src/hooks/useFlightFilter';
import { slotToIntent } from '../src/lib/slots';
import type { SlotJSON } from '../src/lib/slots';

const csvText = fs.readFileSync(
  path.join(import.meta.dirname, '../public/ux_research_flights_h2_2026_final.csv'),
  'utf8'
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

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); cond ? pass++ : fail++; };

// The refineView merge, isolated: mergedSlot = {...base, ...patch}
const merge = (base: SlotJSON, patch: Partial<SlotJSON>): SlotJSON => ({ ...base, ...patch });

console.log('— conversational-ui: follow-up chips compose onto the prior slot —');
{
  // Base answer: "flights to Barcelona under £100" (a results message).
  const base: SlotJSON = {
    destination: 'Barcelona', date_from: '2026-08-01', date_to: '2026-08-31',
    cabin: null, direct_only: null, sort: 'cheapest', missing: [], max_price: 100,
  };
  const baseResults = filterAndSortFlights(flights, slotToIntent(base), medianCo2);
  const baseDests = new Set(baseResults.map((f) => f.dest_code));
  ok(baseResults.length > 0, `base returns results (${baseResults.length})`);
  ok([...baseDests].every((c) => c === 'BCN'), `base is Barcelona-only (${[...baseDests].join(',')})`);
  ok(baseResults.every((f) => f.price_gbp <= 100), 'base all under £100');

  const chips: { label: string; patch: Partial<SlotJSON> }[] = [
    { label: 'Sort them by fastest', patch: { sort: 'fastest' } },
    { label: 'Only show direct flights', patch: { direct_only: true } },
    { label: 'Only flights under £100', patch: { max_price: 100 } },
    { label: 'Prefer lower CO₂ options', patch: { low_co2: true } },
  ];
  for (const chip of chips) {
    const r = filterAndSortFlights(flights, slotToIntent(merge(base, chip.patch)), medianCo2);
    const dests = new Set(r.map((f) => f.dest_code));
    const barcaOnly = [...dests].every((c) => c === 'BCN');
    const capKept = r.every((f) => f.price_gbp <= 100);
    const dateKept = r.every((f) => f.date >= '2026-08-01' && f.date <= '2026-08-31');
    ok(
      r.length > 0 && barcaOnly && capKept && dateKept,
      `"${chip.label}" keeps Barcelona + £100 + August (${r.length} results, dests: ${[...dests].join(',') || 'none'})`
    );
  }

  const fastest = filterAndSortFlights(flights, slotToIntent(merge(base, { sort: 'fastest' })), medianCo2);
  ok(fastest.length === baseResults.length, `fastest count == base count (${fastest.length} vs ${baseResults.length}), not the whole network`);
  ok(fastest.every((f, i) => i === 0 || fastest[i - 1].duration_mins <= f.duration_mins), 'fastest is duration-sorted');
  const direct = filterAndSortFlights(flights, slotToIntent(merge(base, { direct_only: true })), medianCo2);
  ok(direct.every((f) => f.stops === 0), 'direct refine yields only nonstop flights');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
