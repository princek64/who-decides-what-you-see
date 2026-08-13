/**
 * Offline check of the "show me all options" list intent (no Groq calls).
 *
 * The reported failure: after a search, asking to see everything produced
 * another prose summary — one participant asked twice and got the same answer
 * both times. Nothing in the pipeline treated "all" as a display request, so the
 * answer stayed capped at TABLE_PREVIEW_ROWS.
 *
 * These assertions cover the two halves of the fix: which wordings are
 * recognised, and what the answer looks like once one is.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { filterAndSortFlights } from '../src/hooks/useFlightFilter';
import type { Flight, IntentJSON } from '../src/hooks/useFlightFilter';
import { buildProseAnswer, SHOW_ALL_MAX_ROWS, TABLE_PREVIEW_ROWS } from '../src/lib/prose';
import { isShowAllQuery } from '../src/lib/slots';

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

console.log('### recognised wordings');
for (const t of [
  'show me all options',
  'show me all flights',
  'list all options',
  'list all flights',
  'show all options',
  'show all flights',
  'see all results',
  'give me all options',
  'display all results',
  'show me the full list',
  'show me everything you have',
  'what are my options',
  'can you list all the flights please',
]) {
  check(`"${t}"`, isShowAllQuery(t));
}

console.log('\n### wordings that must stay ordinary searches');
for (const t of [
  'find me a direct flight to Barcelona on October 16th',
  'show me flights to Rome',
  'show me the cheapest',
  'show me the other option',
  'what about the one with a stop',
  'is that one refundable?',
  'cheapest weekend to Paris in the next 3 months',
]) {
  check(`"${t}"`, !isShowAllQuery(t));
}

console.log('\n### the scripted task: direct flights to Barcelona, 16 Oct');
const intent: IntentJSON = {
  dest_city: 'Barcelona',
  date: '2026-10-16',
  stops: 0,
  sort_by: 'cheapest',
};
const results = filterAndSortFlights(flights, intent, 80);
console.log(`  ${results.length} matching flights`);

const summary = buildProseAnswer(results, intent);
const listed = buildProseAnswer(results, intent, { showAll: true });

check(
  'show-all lists every matching flight',
  listed.displayed === results.length && listed.table?.length === results.length,
  `${listed.displayed} of ${results.length}`
);
// This particular task returns fewer flights than the preview cap, so the
// default answer was never truncating it — the contrast is asserted below on a
// set that IS bigger than the cap, which is where the complaint came from.
check('default answer is unchanged for a small set', summary.displayed === results.length);
check('show-all renders a table, not bullets', listed.table !== null);
check(
  'every flight number is in the table',
  results.every((f) => listed.table!.some((row) => row.flight_id === f.flight_id))
);
check('the count is stated in the lead', listed.text.includes(`Found all ${results.length} flights`));
check('the cheapest is still named', /cheapest/i.test(listed.text) && /£/.test(listed.text));
console.log(`  lead: ${listed.text.split('\n')[0]}`);

console.log('\n### a set past the preview cap — the case that was reported');
const wide: IntentJSON = {
  dest_city: 'Barcelona',
  date_from: '2026-10-16',
  date_to: '2026-10-18',
  sort_by: 'cheapest',
};
const wideResults = filterAndSortFlights(flights, wide, 80);
const widePreview = buildProseAnswer(wideResults, wide);
const wideListed = buildProseAnswer(wideResults, wide, { showAll: true });
console.log(`  ${wideResults.length} matching flights`);
check('the fixture exceeds the preview cap', wideResults.length > TABLE_PREVIEW_ROWS);
check(
  'default answer shows only a preview',
  widePreview.displayed <= TABLE_PREVIEW_ROWS && widePreview.displayed < wideResults.length,
  `${widePreview.displayed} of ${wideResults.length}`
);
check(
  'show-all lifts the cap',
  wideListed.displayed === wideResults.length,
  `${wideListed.displayed} of ${wideResults.length}`
);
check(
  'show-all keeps connecting flights the preview had hidden',
  wideListed.table!.length >= widePreview.displayed
);

console.log('\n### show-all does not flatten a round trip');
const roundTrip: IntentJSON = {
  dest_city: 'Paris',
  date_from: '2026-09-04',
  date_to: '2026-09-06',
  direction: 'both',
  sort_by: 'cheapest',
};
const rtResults = filterAndSortFlights(flights, roundTrip, 80);
const rtListed = buildProseAnswer(rtResults, roundTrip, { showAll: true });
check('round trip keeps its labelled leg groups', rtListed.tableGroups?.length === 2);
check('round trip is not poured into one flat table', rtListed.table === null);
check(
  'each leg still labelled by direction',
  /^Outbound — London → /.test(rtListed.tableGroups?.[0].label ?? '') &&
    /^Return — .+ → London$/.test(rtListed.tableGroups?.[1].label ?? '')
);

console.log('\n### a very large set is capped rather than rendered whole');
const broad: IntentJSON = { dest_city: 'Paris', sort_by: 'cheapest' };
const broadResults = filterAndSortFlights(flights, broad, 80);
const broadListed = buildProseAnswer(broadResults, broad, { showAll: true });
if (broadResults.length > SHOW_ALL_MAX_ROWS) {
  check(
    `capped at ${SHOW_ALL_MAX_ROWS} rows`,
    broadListed.displayed === SHOW_ALL_MAX_ROWS,
    `${broadResults.length} matched`
  );
  check('the real total is still stated', broadListed.available === broadResults.length);
  check('the lead says it is showing the first N', broadListed.text.includes('showing the first'));
} else {
  console.log('  (fixture did not exceed the cap)');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
