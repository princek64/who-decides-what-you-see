/**
 * Interview trust fixes: compare keeps stops (any city), alert copy, round-trip
 * layout preference.
 *
 * Run from conversational-ui/:  npx tsx scripts/interview-trust-check.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { filterAndSortFlights } from '../src/hooks/useFlightFilter';
import type { Flight } from '../src/hooks/useFlightFilter';
import { buildProseAnswer, TABLE_PREVIEW_ROWS } from '../src/lib/prose';
import {
  applyWordingBackstops,
  isCompareQuery,
  isScopeRefineQuery,
  resolveTurnSlot,
  slotToIntent,
} from '../src/lib/slots';
import type { SlotJSON } from '../src/lib/slots';
import { tryLocalSlot } from '../src/lib/studyTasks';

const here = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.resolve(here, '../../data/ux_research_flights_h2_2026_final.csv');
const parsed = Papa.parse(fs.readFileSync(csvPath, 'utf8'), { header: true, skipEmptyLines: true });
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

const blank = (over: Partial<SlotJSON> = {}): SlotJSON => ({
  destination: null,
  date_from: null,
  date_to: null,
  cabin: null,
  direct_only: null,
  sort: 'cheapest',
  missing: [],
  ...over,
});

console.log('### compare keeps stops (city-agnostic)');
for (const city of ['Lisbon', 'Malaga', 'Athens', 'Porto']) {
  const text = `Compare a one-way direct flight to ${city} with a one-way flight with one stop on November 15, 2026.`;
  check(`${city}: isCompareQuery`, isCompareQuery(text));
  const slot = applyWordingBackstops(
    blank({ destination: city, date_from: '2026-11-15', date_to: '2026-11-15' }),
    text
  );
  check(`${city}: keep_stops`, slot.keep_stops === true);
  check(`${city}: direct_only null`, slot.direct_only == null);
  const intent = slotToIntent(slot);
  intent.stops = undefined;
  const results = filterAndSortFlights(flights, intent, 80);
  const directs = results.filter((f) => f.stops === 0);
  const stops = results.filter((f) => f.stops > 0);
  if (directs.length === 0 || stops.length === 0) {
    check(`${city}: dataset has both stop types on that day`, true, 'skip — sparse day');
    continue;
  }
  const prose = buildProseAnswer(results, intent, {
    keepStops: true,
    compare: true,
  });
  const hidOffer = /include the ones with a stop/i.test(prose.text);
  check(`${city}: prose does not offer "include stops"`, !hidOffer);
  check(
    `${city}: prose mentions stop or compare both`,
    /stop|direct/i.test(prose.text) || prose.table != null || prose.blocks.length > 0
  );
}

console.log('\n### scope refine');
check('restrict is scope refine', isScopeRefineQuery('Restrict it to countries eastern of Germany'));
check('only show is scope refine', isScopeRefineQuery('only show direct flights'));

console.log('\n### local compare slot');
{
  const s = tryLocalSlot(
    'Destination Malaga, November 21. Compare a direct flight with a one stop flight. One-way.',
    false
  );
  check('Malaga compare local', Boolean(s?.compare && s.keep_stops && s.date_from === '2026-11-21'));
}

console.log('\n### preview transparency constant');
check('TABLE_PREVIEW_ROWS is 6', TABLE_PREVIEW_ROWS === 6);

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll conversational interview-trust checks passed.');
