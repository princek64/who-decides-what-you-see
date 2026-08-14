/**
 * Interview trust fixes for generative-ui.
 *
 * Run from generative-ui/:  npx tsx scripts/interview-trust-check.mts
 */
import {
  applyIntentBackstops,
  isRoundTripQuery,
  resolveTurnIntent,
  tryLocalIntent,
} from '../src/lib/intentBackstops';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

console.log('### round trip → itinerary (not calendar)');
{
  const text =
    'Please provide the cheapest roundtrip from London to Ibiza for a weekend within the next three months.';
  check('isRoundTripQuery', isRoundTripQuery(text));
  const intent = tryLocalIntent(text, false);
  check('local intent exists', intent != null);
  check('direction both', intent?.direction === 'both');
  check('layout itinerary', intent?.layout === 'itinerary', String(intent?.layout));
  check('weekend', intent?.weekend === true);
}

console.log('\n### study T4 still calendar');
{
  const intent = tryLocalIntent(
    'Find the cheapest return trip to Paris for a weekend in the next three months.',
    false
  );
  check('T4 calendar', intent?.layout === 'calendar', String(intent?.layout));
}

console.log('\n### scope refine keeps city');
{
  const prev = {
    dest_city: 'Malaga',
    date: '2026-11-15',
    sort_by: 'cheapest' as const,
    layout: 'grid',
  };
  const next = resolveTurnIntent(prev, { sort_by: 'cheapest' }, 'only show direct flights');
  check('keeps Malaga', next.dest_city === 'Malaga');
  check('sets stops 0', next.stops === 0);
}

console.log('\n### backstop round trip');
{
  const intent = applyIntentBackstops(
    { dest_city: 'Lisbon', date_from: '2026-08-13', date_to: '2026-11-13', sort_by: 'cheapest' },
    'Find the cheapest round trip from London to Lisbon in the next three months.'
  );
  check('Lisbon itinerary', intent.layout === 'itinerary', String(intent.layout));
  check('Lisbon both', intent.direction === 'both');
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll generative interview-trust checks passed.');
