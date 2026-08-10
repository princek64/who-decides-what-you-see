/**
 * Offline check of the screen-history behaviour (no Groq calls).
 *
 * Walks the scripted test sequence through the SAME functions the hook and the
 * canvas use — placeScreen decides append-vs-replace, visibleHistory decides
 * what sits above the current screen — so the assertions cover the real rule
 * rather than a restatement of it.
 *
 *   1. search Barcelona 16 Oct
 *   2. "show me only direct flights"      -> updates in place, no history entry
 *   3. "what about Rome November 15th"    -> Barcelona collapses into history
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Papa from 'papaparse';
import type { ChatMessage } from '../src/hooks/useGenChat';
import type { Flight, IntentJSON } from '../src/hooks/useFlightFilter';
import { filterAndSortFlights } from '../src/hooks/useFlightFilter';
import {
  MAX_HISTORY_SCREENS,
  isInPlaceRefinement,
  placeScreen,
  visibleHistory,
} from '../src/lib/screenHistory';
import { ScreenHistoryRow } from '../src/components/ScreenHistoryRow';
import { GenScreen } from '../src/components/GenScreen';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

let seq = 0;
const screen = (query: string, intent: IntentJSON): ChatMessage =>
  ({
    id: `ai-${++seq}`,
    role: 'assistant',
    text: '',
    query,
    intent,
    flights: [],
    layout: 'grid',
    isExpanded: false,
    timestamp: seq,
  }) as ChatMessage;

const user = (text: string): ChatMessage =>
  ({ id: `user-${++seq}`, role: 'user', text, timestamp: seq }) as ChatMessage;

const BARCELONA: IntentJSON = { dest_city: 'Barcelona', date: '2026-10-16', sort_by: 'cheapest' };
const BARCELONA_DIRECT: IntentJSON = { ...BARCELONA, stops: 0 };
const BARCELONA_BY_CODE: IntentJSON = { dest_code: 'BCN', date: '2026-10-16', sort_by: 'cheapest' };
const ROME: IntentJSON = { dest_city: 'Rome', date: '2026-11-15', sort_by: 'cheapest' };

console.log('### the scripted sequence');
let messages: ChatMessage[] = [];

// (1) Barcelona 16 Oct
messages = [...messages, user('cheapest flight to Barcelona on 16 October')];
messages = placeScreen(messages, screen('cheapest flight to Barcelona on 16 October', BARCELONA));
const afterFirst = messages.filter((m) => m.role === 'assistant');
check('(1) one screen on canvas', afterFirst.length === 1);
check('(1) nothing in history yet', visibleHistory(messages, afterFirst[0].id).length === 0);
const firstScreenId = afterFirst[0].id;

// (2) "show me only direct flights" — same destination and date, narrowed
messages = [...messages, user('show me only direct flights')];
messages = placeScreen(messages, screen('show me only direct flights', BARCELONA_DIRECT));
const afterRefine = messages.filter((m) => m.role === 'assistant');
check('(2) still one screen — updated in place', afterRefine.length === 1);
check('(2) no history entry created', visibleHistory(messages, afterRefine[0].id).length === 0);
check('(2) screen id preserved (no remount, no scroll jump)', afterRefine[0].id === firstScreenId);
check('(2) the narrowing was applied', afterRefine[0].intent?.stops === 0);
check('(2) label updated to the new query', afterRefine[0].query === 'show me only direct flights');

// (3) "what about Rome November 15th instead" — new destination AND date
messages = [...messages, user('what about Rome November 15th instead')];
messages = placeScreen(messages, screen('what about Rome November 15th instead', ROME));
const afterRome = messages.filter((m) => m.role === 'assistant');
const current = afterRome[afterRome.length - 1];
const history = visibleHistory(messages, current.id);
check('(3) a second screen was pushed', afterRome.length === 2);
check('(3) current screen is Rome', current.intent?.dest_city === 'Rome');
check('(3) exactly one screen in history', history.length === 1);
check('(3) history holds the Barcelona screen', history[0].id === firstScreenId);
check(
  '(3) history row labels itself with the query that produced it',
  history[0].query === 'show me only direct flights',
  history[0].query
);

console.log('\n### the in-place rule');
check('same city + date, narrowed -> in place', isInPlaceRefinement(BARCELONA, BARCELONA_DIRECT));
check(
  'same city + date, reordered -> in place',
  isInPlaceRefinement(BARCELONA, { ...BARCELONA, sort_by: 'fastest' })
);
check(
  'city named by code instead of name -> still in place',
  isInPlaceRefinement(BARCELONA, BARCELONA_BY_CODE)
);
check(
  'no destination and no date named -> in place (refines what is on screen)',
  isInPlaceRefinement(BARCELONA, { stops: 0, sort_by: 'cheapest' })
);
check('new destination -> pushes history', !isInPlaceRefinement(BARCELONA, ROME));
check(
  'same destination, new date -> pushes history',
  !isInPlaceRefinement(BARCELONA, { ...BARCELONA, date: '2026-10-20' })
);
check(
  'same destination, date range replaced by a single date -> pushes history',
  !isInPlaceRefinement(
    { dest_city: 'Barcelona', date_from: '2026-10-01', date_to: '2026-10-31' },
    BARCELONA
  )
);
check('no previous screen -> cannot be in place', !isInPlaceRefinement(undefined, BARCELONA));

console.log('\n### the history window');
let many: ChatMessage[] = [];
const cities: [string, string][] = [
  ['Barcelona', '2026-10-16'],
  ['Rome', '2026-11-15'],
  ['Paris', '2026-11-20'],
  ['Lisbon', '2026-11-25'],
];
for (const [city, date] of cities) {
  many = placeScreen(many, screen(`flights to ${city}`, { dest_city: city, date }));
}
const latest = many.filter((m) => m.role === 'assistant').slice(-1)[0];
const window = visibleHistory(many, latest.id);
check(`at most ${MAX_HISTORY_SCREENS} collapsed screens`, window.length === MAX_HISTORY_SCREENS);
check('the current screen is never in its own history', !window.some((m) => m.id === latest.id));
check(
  'the oldest screens are dropped, newest kept',
  window.map((m) => m.intent?.dest_city).join(',') === 'Rome,Paris',
  window.map((m) => m.intent?.dest_city).join(',')
);

console.log('\n### the collapsed row, rendered');
const here = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.resolve(here, '../../data/ux_research_flights_h2_2026_final.csv');
const parsed = Papa.parse(fs.readFileSync(csvPath, 'utf8'), { header: true, skipEmptyLines: true });
const allFlights: Flight[] = (parsed.data as any[])
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

const barcelonaResults = filterAndSortFlights(allFlights, BARCELONA, 80);
const top = barcelonaResults[0];
const pastScreen: ChatMessage = {
  ...screen('cheapest flight to Barcelona on 16 October', BARCELONA),
  flights: barcelonaResults,
};

const textOf = (html: string): string =>
  html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const collapsedHtml = renderToStaticMarkup(
  React.createElement(ScreenHistoryRow, { message: pastScreen, isExpanded: false, onToggle: () => {} })
);
const collapsed = textOf(collapsedHtml);
console.log(`  row: ${collapsed}`);
check('row shows the query as its label', collapsed.includes('cheapest flight to Barcelona on 16 October'));
check('row subtitle names the top result airline', collapsed.includes(top.airline_name));
check(
  'row subtitle shows the route',
  collapsed.includes('London') && collapsed.includes('Barcelona') && collapsed.includes('→')
);
check('row subtitle shows the price', collapsed.includes(`£${top.price_gbp.toFixed(2)}`));
check('collapsed row offers an expand toggle', collapsed.includes('Expand'));
check('collapsed row reports its state to assistive tech', /aria-expanded="false"/.test(collapsedHtml));

const expandedHtml = renderToStaticMarkup(
  React.createElement(ScreenHistoryRow, { message: pastScreen, isExpanded: true, onToggle: () => {} })
);
check('expanded row offers a collapse toggle', textOf(expandedHtml).includes('Collapse'));
check('expanded row reports its state', /aria-expanded="true"/.test(expandedHtml));

// A re-opened history screen is there to be read back, not worked on: it must
// not offer refine chips or a regenerate control that would act on the CURRENT
// search rather than the one being read.
const reopened = textOf(
  renderToStaticMarkup(
    React.createElement(GenScreen, {
      query: pastScreen.query ?? '',
      message: pastScreen,
      onToggleExpand: () => {},
      onSelectFlight: () => {},
    })
  )
);
check('re-opened screen renders its results', reopened.includes(top.airline_name));
check('re-opened screen offers no refine chips', !reopened.includes('Refine this view'));
check('re-opened screen offers no regenerate control', !reopened.includes('regenerate'));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
