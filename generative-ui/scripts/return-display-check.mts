/**
 * Offline round-trip display via GenResponse: labelled legs, not a flat merge.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Papa from 'papaparse';
import { filterAndSortFlights } from '../src/hooks/useFlightFilter';
import type { Flight, IntentJSON } from '../src/hooks/useFlightFilter';
import { GenResponse } from '../src/components/GenResponse';
import type { ChatMessage } from '../src/hooks/useGenChat';
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

const render = (
  results: Flight[],
  intent: IntentJSON & { layout?: string },
  layout: string,
  itinerary: ChatMessage['itinerary'] = null
): string => {
  const message = {
    id: 'ai-test',
    role: 'assistant',
    text: '',
    intent,
    flights: results,
    layout,
    itinerary,
    isExpanded: false,
    timestamp: 0,
  } as ChatMessage;
  return renderToStaticMarkup(
    React.createElement(GenResponse, {
      message,
      onToggleExpand: () => {},
      onSelectFlight: () => {},
    })
  );
};

// Strip tags so heading text can be matched without fighting the markup.
const textOf = (html: string): string =>
  html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const parisWeekend: IntentJSON = {
  dest_city: 'Paris',
  date_from: '2026-09-04',
  date_to: '2026-09-06',
  direction: 'both',
  sort_by: 'cheapest',
};

const budgetRoundTrip: IntentJSON = {
  dest_city: 'Rome',
  date_from: '2026-09-11',
  date_to: '2026-09-14',
  max_price: 150,
  direction: 'both',
  sort_by: 'cheapest',
};

// Every layout that renders individual flight rows must be intercepted.
const LIST_LAYOUTS = ['grid', 'ranked', 'budget', 'highlight', 'comparison', 'multileg'];

for (const [name, intent, city] of [
  ['Paris cheapest weekend return', parisWeekend, 'Paris'],
  ['£150 budget round trip', budgetRoundTrip, 'Rome'],
] as [string, IntentJSON, string][]) {
  console.log(`\n### ${name}`);
  const results = filterAndSortFlights(flights, intent, 80);
  const legs = splitLegs(results);
  console.log(`  ${results.length} results — ${legs.outbound.length} outbound, ${legs.inbound.length} return`);

  const firstReturnAt = results.findIndex((f) => f.direction === 'return');
  const lastOutboundAt = results.map((f) => f.direction).lastIndexOf('outbound');
  check(
    'merged result list interleaves the legs (the bug being fixed)',
    firstReturnAt !== -1 && lastOutboundAt > firstReturnAt,
    `first return at ${firstReturnAt}, last outbound at ${lastOutboundAt}`
  );

  const outHeading = `Outbound — London → ${city}`;
  const backHeading = `Return — ${city} → London`;
  const pair = cheapestPair(legs)!;

  for (const layout of LIST_LAYOUTS) {
    const html = render(results, { ...intent, layout }, layout);
    const text = textOf(html);
    const outAt = text.indexOf(outHeading);
    const backAt = text.indexOf(backHeading);
    check(`[${layout}] outbound leg labelled`, outAt !== -1);
    check(`[${layout}] return leg labelled`, backAt !== -1);
    check(`[${layout}] outbound shown before return`, outAt !== -1 && backAt > outAt);
    check(`[${layout}] a divider separates the groups`, /border-t/.test(html));
    check(
      `[${layout}] combined total shown`,
      text.includes(`£${pair.total.toFixed(2)}`),
      `£${pair.total.toFixed(2)}`
    );

    // Every column the flat rows carried is still on each row.
    const cheapestOut = legs.outbound.reduce((b, f) => (f.price_gbp < b.price_gbp ? f : b), legs.outbound[0]);
    check(
      `[${layout}] row keeps price, times, duration, airline, stops`,
      text.includes(`£${cheapestOut.price_gbp.toFixed(2)}`) &&
        text.includes(cheapestOut.departure_time) &&
        text.includes(cheapestOut.arrival_time) &&
        text.includes(cheapestOut.duration_formatted) &&
        text.includes(cheapestOut.airline_name) &&
        /Direct|stop/.test(text)
    );

    // Nothing from the return leg may appear above the return heading.
    const aboveReturn = text.slice(0, backAt);
    const strayReturn = legs.inbound
      .slice(0, 5)
      .find((f) => aboveReturn.includes(f.flight_number));
    check(
      `[${layout}] no return flight rendered under the outbound heading`,
      strayReturn === undefined,
      strayReturn ? `found ${strayReturn.flight_number}` : ''
    );
  }

  // The itinerary layout already labels its pair, so it is left alone — but its
  // no-pair fallback is the flat carousel and must be intercepted.
  const withPair = render(results, { ...intent, layout: 'itinerary' }, 'itinerary', {
    out: legs.outbound[0],
    ret: legs.inbound[0],
    nights: 2,
  } as ChatMessage['itinerary']);
  check('[itinerary+pair] left to ItineraryView', textOf(withPair).includes('Suggested itinerary'));
  const noPair = render(results, { ...intent, layout: 'itinerary' }, 'itinerary', null);
  check('[itinerary, no pair] intercepted', textOf(noPair).includes(outHeading));
}

// One-way must be untouched.
console.log('\n### one-way regression');
const oneWay: IntentJSON = { dest_city: 'Paris', date: '2026-09-04', sort_by: 'cheapest' };
const oneWayResults = filterAndSortFlights(flights, oneWay, 80);
for (const layout of LIST_LAYOUTS) {
  const text = textOf(render(oneWayResults, { ...oneWay, layout }, layout));
  check(`[${layout}] one-way shows no leg headings`, !text.includes('Outbound — London'));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
