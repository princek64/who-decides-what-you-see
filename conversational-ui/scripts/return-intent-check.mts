/**
 * Offline check of round-trip intent and the "add the return leg" follow-up
 * (no Groq calls).
 *
 * Reported failure: "find the cheapest return trip to Paris for a weekend in the
 * next three months" came back with outbound flights only, and asking for the
 * return afterwards repeated the outbound list.
 *
 * Part 1 is a wording gap — isRoundTripQuery matched "return FLIGHT" but not
 * "return TRIP" — and everything downstream follows from the flag it sets, so
 * these assertions run the flag all the way through slotToIntent and the filter
 * to prove both legs actually come back.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { filterAndSortFlights } from '../src/hooks/useFlightFilter';
import type { Flight } from '../src/hooks/useFlightFilter';
import {
  applyWordingBackstops,
  isAddReturnLegQuery,
  isRoundTripQuery,
  slotToIntent,
  destinationFromText,
  dateFromText,
} from '../src/lib/slots';
import type { SlotJSON } from '../src/lib/slots';
import { buildProseAnswer } from '../src/lib/prose';

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

console.log('### Part 1 — round-trip wordings');
for (const t of [
  'find the cheapest return trip to Paris for a weekend in the next three months',
  'return flight to Paris',
  'return flights to Paris',
  'return tickets to Paris',
  'round trip to Paris',
  'round-trip to Paris',
  'I want to go there and back',
  'flights to Paris both ways',
  'going and coming back from Paris',
  'out and back to Paris',
]) {
  check(`"${t}"`, isRoundTripQuery(t));
}
for (const t of [
  'find me a direct flight to Barcelona on October 16th',
  'cheapest flight to Paris this weekend',
  'what is the baggage allowance?',
]) {
  check(`not round trip: "${t}"`, !isRoundTripQuery(t));
}

console.log('\n### Part 1 — the flag reaches the filter and returns both legs');
const roundTripText = 'find the cheapest return trip to Paris for a weekend in the next three months';
const slot = applyWordingBackstops(
  blank({ destination: 'Paris', date_from: '2026-09-01', date_to: '2026-11-30' }),
  roundTripText
);
check('round_trip set by the backstop', slot.round_trip === true);
const intent = slotToIntent(slot);
check("slotToIntent maps it to direction 'both'", intent.direction === 'both', String(intent.direction));

const results = filterAndSortFlights(flights, intent, 80);
const outbound = results.filter((f) => f.direction === 'outbound');
const inbound = results.filter((f) => f.direction === 'return');
console.log(`  ${results.length} flights — ${outbound.length} outbound, ${inbound.length} return`);
check('outbound leg present', outbound.length > 0);
check('inbound leg present', inbound.length > 0);
check('outbound flies London → Paris', outbound.every((f) => f.dest_code === 'CDG' || f.dest_code === 'ORY'));
check('inbound flies Paris → London', inbound.every((f) => f.origin_code === 'CDG' || f.origin_code === 'ORY'));

const answer = buildProseAnswer(results, intent);
check('the answer separates and labels the legs', answer.tableGroups?.length === 2);
check(
  'labels name the direction each leg flies',
  /^Outbound — London → /.test(answer.tableGroups?.[0].label ?? '') &&
    /^Return — .+ → London$/.test(answer.tableGroups?.[1].label ?? ''),
  answer.tableGroups?.map((g) => g.label).join(' | ')
);

console.log('\n### Part 2 — "add the return leg" follow-ups');
for (const t of [
  'show me the return tickets',
  'show me the return flights',
  'what about coming back',
  'return flights',
  'return tickets',
  'flights back',
  'what about the way back',
  'and the way back',
  'the return leg',
]) {
  check(`"${t}"`, isAddReturnLegQuery(t));
}
for (const t of [
  'find me a direct flight to Barcelona on October 16th',
  'show me the cheapest',
  'what is the baggage allowance?',
]) {
  check(`not a return follow-up: "${t}"`, !isAddReturnLegQuery(t));
}

console.log('\n### Part 2 — the gate that keeps a NEW search a new search');
for (const t of ['return flights to Barcelona in October', 'return tickets to Rome on 15 November']) {
  const intercepted = isAddReturnLegQuery(t) && !destinationFromText(t) && !dateFromText(t);
  check(`"${t}" is NOT intercepted as a follow-up`, !intercepted);
}
const followUp = 'show me the return tickets';
check(
  `"${followUp}" IS intercepted as a follow-up`,
  isAddReturnLegQuery(followUp) && !destinationFromText(followUp) && !dateFromText(followUp)
);

console.log('\n### Part 2 — the follow-up carries the search forward');
// "find cheap flights to Paris this weekend" leaves this slot on screen.
const established = blank({
  destination: 'Paris',
  date_from: '2026-09-04',
  date_to: '2026-09-06',
  max_price: 200,
  direct_only: true,
});
const withReturn: SlotJSON = { ...established, round_trip: true, return_only: false, missing: [] };
check('destination carried forward', withReturn.destination === established.destination);
check(
  'dates carried forward',
  withReturn.date_from === established.date_from && withReturn.date_to === established.date_to
);
check('price cap carried forward', withReturn.max_price === 200);
check('direct-only preference carried forward', withReturn.direct_only === true);

const followUpIntent = slotToIntent(withReturn);
check("follow-up intent is direction 'both'", followUpIntent.direction === 'both');
const followUpResults = filterAndSortFlights(flights, followUpIntent, 80);
const fOut = followUpResults.filter((f) => f.direction === 'outbound');
const fIn = followUpResults.filter((f) => f.direction === 'return');
console.log(`  ${followUpResults.length} flights — ${fOut.length} outbound, ${fIn.length} return`);
check('both legs returned after the follow-up', fOut.length > 0 && fIn.length > 0);
check(
  'the follow-up answer is grouped, not a repeat of the outbound list',
  buildProseAnswer(followUpResults, followUpIntent).tableGroups?.length === 2
);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
