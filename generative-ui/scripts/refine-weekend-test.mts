/**
 * Offline: chip refine compose, human dates in summaries, Fri/Sat→Sun/Mon weekends.
 * Run: npx tsx scripts/refine-weekend-test.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { filterAndSortFlights } from '../src/hooks/useFlightFilter';
import type { Flight, IntentJSON } from '../src/hooks/useFlightFilter';
import { buildItinerary } from '../src/lib/layoutData';
import { formatFlightDate } from '../src/lib/utils';

const csvText = fs.readFileSync(
  path.join(import.meta.dirname, '../../data/ux_research_flights_h2_2026_final.csv'),
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
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  cond ? pass++ : fail++;
};

// The refineView merge, isolated from React so we can exercise it directly.
const merge = (
  base: IntentJSON & { layout?: string },
  patch: Partial<IntentJSON & { layout?: string }>,
  baseLayout: string
): IntentJSON & { layout?: string } => ({
  ...base,
  ...patch,
  layout: patch.layout ?? baseLayout ?? base.layout,
});

const dow = (d: string) => new Date(`${d}T00:00:00`).getDay();

console.log('— Issue 1: refinement chips compose onto the prior intent —');
{
  // Repro: "flights under £100" scoped to Barcelona → then each refine chip.
  const base: IntentJSON & { layout?: string } = {
    dest_city: 'Barcelona', max_price: 100, direction: 'outbound', sort_by: 'cheapest', layout: 'grid',
  };
  const baseResults = filterAndSortFlights(flights, base, medianCo2);
  const destCodes = new Set(baseResults.map((f) => f.dest_code));
  ok(baseResults.length > 0, `base search returns results (${baseResults.length})`);
  ok([...destCodes].every((c) => c === 'BCN'), `base search is Barcelona-only (dests: ${[...destCodes].join(',')})`);
  ok(baseResults.every((f) => f.price_gbp <= 100), 'base search all under £100');

  const chips: { label: string; patch: Partial<IntentJSON & { layout?: string }> }[] = [
    { label: 'Sort them by fastest', patch: { sort_by: 'fastest' } },
    { label: 'Only show direct flights', patch: { stops: 0 } },
    { label: 'Only flights under £100', patch: { max_price: 100 } },
    { label: 'Prefer lower CO₂ options', patch: { low_co2: true } },
  ];
  for (const chip of chips) {
    const merged = merge(base, chip.patch, 'grid');
    const r = filterAndSortFlights(flights, merged, medianCo2);
    const dests = new Set(r.map((f) => f.dest_code));
    const barcaOnly = [...dests].every((c) => c === 'BCN');
    const capKept = r.every((f) => f.price_gbp <= 100);
    ok(
      r.length > 0 && barcaOnly && capKept,
      `"${chip.label}" keeps Barcelona + £100 cap (${r.length} results, dests: ${[...dests].join(',') || 'none'})`
    );
  }
  // The specific regression: fastest must NOT explode to the whole network.
  const fastest = filterAndSortFlights(flights, merge(base, { sort_by: 'fastest' }, 'grid'), medianCo2);
  ok(fastest.length === baseResults.length, `fastest refine count == base count (${fastest.length} vs ${baseResults.length}), not 45k`);
  ok(
    fastest.every((f, i) => i === 0 || fastest[i - 1].duration_mins <= f.duration_mins),
    'fastest refine is duration-sorted'
  );
}

console.log('\n— Issue 2: summaries use human dates, never ISO —');
{
  ok(formatFlightDate('2026-07-14') === 'Tue 14 Jul', `formatFlightDate('2026-07-14') = "${formatFlightDate('2026-07-14')}"`);
  ok(!/\d{4}-\d{2}-\d{2}/.test(formatFlightDate('2026-09-30')), 'formatted date contains no ISO substring');
}

console.log('\n— Issue 3: weekend itineraries depart Fri/Sat, return Sun/Mon —');
{
  const romeSept: IntentJSON = {
    dest_city: 'Rome', date_from: '2026-09-01', date_to: '2026-09-30',
    weekend: true, direction: 'outbound', sort_by: 'cheapest',
  };
  const pair = buildItinerary(flights, romeSept, medianCo2);
  ok(!!pair, 'buildItinerary returns a weekend pair for Rome in September');
  if (pair) {
    ok(dow(pair.out.date) === 5 || dow(pair.out.date) === 6, `outbound is Fri/Sat (${pair.out.date}, day=${dow(pair.out.date)})`);
    ok(dow(pair.ret.date) === 0 || dow(pair.ret.date) === 1, `return is Sun/Mon (${pair.ret.date}, day=${dow(pair.ret.date)})`);
    ok(pair.nights >= 1 && pair.nights <= 4, `nights within weekend range (${pair.nights})`);
  }
  // Without the weekend flag the old behaviour is unchanged (any pair allowed).
  const noFlag = buildItinerary(flights, { ...romeSept, weekend: false }, medianCo2);
  ok(!!noFlag, 'non-weekend itinerary still builds (regression guard)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
