/**
 * Offline comparison layout: all flights grouped by stops; verdict after options.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Papa from 'papaparse';
import { filterAndSortFlights } from '../src/hooks/useFlightFilter';
import type { Flight, IntentJSON } from '../src/hooks/useFlightFilter';
import { COMPARISON_PREVIEW_ROWS, groupByStops } from '../src/lib/layoutData';
import { ComparisonView } from '../src/components/layouts/ComparisonView';

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

const textOf = (html: string): string =>
  html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const render = (results: Flight[]) =>
  renderToStaticMarkup(
    React.createElement(ComparisonView, { flights: results, onSelectFlight: () => {} })
  );

// A comparison intent deliberately omits `stops`, so both kinds come back.
const romeCompare: IntentJSON = {
  dest_city: 'Rome',
  date: '2026-11-15',
  sort_by: 'cheapest',
  layout: 'comparison',
} as IntentJSON;

console.log('### Rome, 15 November — direct vs one-stop');
const results = filterAndSortFlights(flights, romeCompare, 80);
const groups = groupByStops(results);
console.log(
  `  ${results.length} flights — ${groups.map((g) => `${g.label}: ${g.flights.length}`).join(', ')}`
);

const html = render(results);
const text = textOf(html);

check('the search returned more than the old two-card screen showed', results.length > 2);
check('every group is headed', groups.every((g) => text.includes(g.label)));
check(
  'the total is stated up front',
  text.includes(`Comparison · ${results.length} flight`),
  `${results.length}`
);

// Fewest stops first.
const headingPositions = groups.map((g) => text.indexOf(g.label));
check(
  'groups run direct first, then by stop count',
  headingPositions.every((pos, i) => pos !== -1 && (i === 0 || pos > headingPositions[i - 1])),
  groups.map((g) => g.label).join(' → ')
);

// Every flight is either rendered or explicitly behind a "show all" toggle —
// nothing is silently dropped, which was the whole complaint.
for (const group of groups) {
  const shown = Math.min(group.flights.length, COMPARISON_PREVIEW_ROWS);
  const rendered = group.flights.filter((f) => text.includes(f.flight_number));
  if (group.flights.length > COMPARISON_PREVIEW_ROWS) {
    check(
      `[${group.label}] collapsed to ${COMPARISON_PREVIEW_ROWS} with a toggle`,
      rendered.length === shown && text.includes(`Show all ${group.flights.length} flights`)
    );
  } else {
    check(
      `[${group.label}] all ${group.flights.length} shown`,
      rendered.length === group.flights.length,
      `${rendered.length}/${group.flights.length}`
    );
  }

  // Cheapest first inside the group.
  const visible = group.flights.slice(0, shown);
  const positions = visible.map((f) => text.indexOf(f.flight_number));
  check(
    `[${group.label}] cheapest first`,
    positions.every((pos, i) => pos !== -1 && (i === 0 || pos > positions[i - 1])),
    visible.map((f) => `£${f.price_gbp.toFixed(2)}`).join(' ≤ ')
  );
}

// The verdict reads after the options.
const recommendationAt = text.indexOf('Recommendation');
const lastRowAt = Math.max(
  ...groups.flatMap((g) =>
    g.flights.slice(0, COMPARISON_PREVIEW_ROWS).map((f) => text.indexOf(f.flight_number))
  )
);
check('a recommendation is present', recommendationAt !== -1);
check('the recommendation sits BELOW the grouped list', recommendationAt > lastRowAt);
check(
  'the recommendation sits below every heading too',
  headingPositions.every((pos) => recommendationAt > pos)
);
console.log(`  verdict: ${text.slice(recommendationAt, recommendationAt + 120)}`);

// The verdict must weigh the CHEAPEST of each kind, not whatever sorted first.
const cheapestDirect = groups.find((g) => g.stops === 0)?.flights[0];
const cheapestOneStop = groups.find((g) => g.stops === 1)?.flights[0];
if (cheapestDirect && cheapestOneStop) {
  const diff = Math.abs(cheapestDirect.price_gbp - cheapestOneStop.price_gbp);
  check(
    'the verdict prices the cheapest direct against the cheapest connecting',
    text.includes(`£${diff.toFixed(2)}`) || text.includes('Same price'),
    `£${diff.toFixed(2)}`
  );
}

console.log('\n### a group past the preview limit');
// Widen to the whole month so at least one group certainly overflows.
const wide = filterAndSortFlights(
  flights,
  { dest_city: 'Rome', date_from: '2026-11-01', date_to: '2026-11-30', sort_by: 'cheapest' } as IntentJSON,
  80
);
const wideGroups = groupByStops(wide);
const wideText = textOf(render(wide));
const overflowing = wideGroups.filter((g) => g.flights.length > COMPARISON_PREVIEW_ROWS);
check('the fixture actually overflows a group', overflowing.length > 0, `${wide.length} flights`);
for (const group of overflowing) {
  check(
    `[${group.label}] offers "Show all ${group.flights.length} flights"`,
    wideText.includes(`Show all ${group.flights.length} flights`)
  );
  check(
    `[${group.label}] renders only ${COMPARISON_PREVIEW_ROWS} until expanded`,
    group.flights.filter((f) => wideText.includes(f.flight_number)).length === COMPARISON_PREVIEW_ROWS
  );
}

console.log('\n### single-kind routes still say something useful');
const directOnly = groupByStops(results).find((g) => g.stops === 0)?.flights ?? [];
if (directOnly.length > 0) {
  const soloText = textOf(render(directOnly));
  check(
    'an all-direct result explains there is nothing to compare against',
    soloText.includes('no connecting option')
  );
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
