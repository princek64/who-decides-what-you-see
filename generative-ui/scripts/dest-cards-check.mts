/**
 * Destination cards must never list London airports (return-leg dest_codes).
 * Run: npx tsx scripts/dest-cards-check.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { filterAndSortFlights } from '../src/hooks/useFlightFilter';
import type { Flight } from '../src/hooks/useFlightFilter';
import { LONDON_AIRPORT_CODES } from '../src/lib/airportMap';
import { summarizeDestinations } from '../src/lib/layoutData';
import { applyIntentBackstops, tryLocalIntent } from '../src/lib/intentBackstops';

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

console.log('### summarizeDestinations never lists London airports');
{
  const both = filterAndSortFlights(flights, { max_price: 150, direction: 'both', sort_by: 'cheapest' }, 500);
  const londonRows = both.filter((f) => LONDON_AIRPORT_CODES.has(f.dest_code));
  check('both-direction has London dest rows in raw filter', londonRows.length > 0, String(londonRows.length));
  const cards = summarizeDestinations(both);
  const londonCards = cards.filter((c) => LONDON_AIRPORT_CODES.has(c.code));
  check('cards exclude London airports', londonCards.length === 0, londonCards.map((c) => c.code).join(','));
  check('cards still show EU destinations', cards.length > 20, String(cards.length));
}

console.log('\n### budget ask + choose any destination in europe');
{
  const ask = tryLocalIntent('show flights under 150 pounds budget', false);
  check('budget ask local', ask != null);
  check('budget ask outbound', ask?.direction === 'outbound');
  check('budget ask max_price', ask?.max_price === 150);

  const follow = tryLocalIntent('choose any destination in europe', true);
  check('follow local', follow != null);
  const fixed = applyIntentBackstops(
    { ...(follow ?? {}), direction: 'both', layout: 'destinations', max_price: 150 },
    'choose any destination in europe'
  );
  check('follow forced outbound', fixed.direction === 'outbound');
  const results = filterAndSortFlights(flights, fixed, 500);
  const cards = summarizeDestinations(results);
  check('follow cards have no London', cards.every((c) => !LONDON_AIRPORT_CODES.has(c.code)));
  check('follow cards are EU cities', cards.length > 20, String(cards.length));
  check(
    'top card is not London',
    cards.length === 0 || !/^London\b/i.test(cards[0].city),
    cards[0]?.city
  );
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll dest-cards checks passed.');
