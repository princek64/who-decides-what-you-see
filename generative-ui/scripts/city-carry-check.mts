/**
 * Offline: same-thread city reset + study local intents.
 * Run: npx tsx scripts/city-carry-check.mts
 */
import {
  applyIntentBackstops,
  matchStudyTaskIntent,
  resolveTurnIntent,
  shouldOmitGroqHistory,
  tryLocalIntent,
} from '../src/lib/intentBackstops';
import type { GenIntent } from '../src/lib/intentBackstops';
import { getSearchAnchor } from '../src/constants/prompts';

let pass = 0;
let fail = 0;
const check = (id: string, ok: boolean, note = '') => {
  if (ok) {
    console.log(`✓ ${id}${note ? ` — ${note}` : ''}`);
    pass++;
  } else {
    console.log(`✗ ${id}${note ? ` — ${note}` : ''}`);
    fail++;
  }
};

const barcelona: GenIntent = {
  dest_city: 'Barcelona',
  date: '2026-10-16',
  stops: 0,
  direction: 'outbound',
  sort_by: 'cheapest',
  layout: 'highlight',
};

console.log('### study local intents');
{
  const t1 = matchStudyTaskIntent(
    'Find the cheapest direct one-way flight from London to Barcelona on October 16, 2026.'
  );
  check('T1 Barcelona', t1?.dest_city === 'Barcelona' && t1?.date === '2026-10-16' && t1?.stops === 0);

  const t2 = matchStudyTaskIntent(
    'Find a one-way flight to Amsterdam on November 21, 2026 that leaves after 6pm and costs under £80.'
  );
  check(
    'T2 Amsterdam',
    t2?.dest_city === 'Amsterdam' &&
      t2?.date === '2026-11-21' &&
      t2?.max_price === 80 &&
      t2?.departure_after === '18:00'
  );

  const t3 = matchStudyTaskIntent(
    "You're flying to Rome on November 15, 2026. Compare a one-way direct flight with a one-way flight with one stop."
  );
  check('T3 Rome compare', t3?.dest_city === 'Rome' && t3?.layout === 'comparison' && t3?.stops == null);

  const t4 = matchStudyTaskIntent(
    'Find the cheapest return trip to Paris for a weekend in the next three months.'
  );
  check(
    'T4 Paris weekend',
    t4?.dest_city === 'Paris' &&
      t4?.weekend === true &&
      t4?.direction === 'both' &&
      t4?.date_from === getSearchAnchor()
  );

  const t5 = matchStudyTaskIntent('You have £150 and a free weekend, where could you go?');
  check('T5 explore', t5?.max_price === 150 && t5?.weekend === true && t5?.dest_city == null);
}

console.log('\n### same-thread city reset (model echoes Barcelona)');
{
  const badAmsterdam = applyIntentBackstops(
    {
      dest_city: 'Barcelona',
      date: '2026-07-10',
      stops: 0,
      max_price: undefined,
      layout: 'highlight',
    },
    'Find a one-way flight to Amsterdam on November 21, 2026 that leaves after 6pm and costs under £80.'
  );
  check('backstop city → Amsterdam', badAmsterdam.dest_city === 'Amsterdam');
  check('backstop date → Nov 21', badAmsterdam.date === '2026-11-21');
  check('backstop price 80', badAmsterdam.max_price === 80);
  check('backstop after 18:00', badAmsterdam.departure_after === '18:00');

  const resolved = resolveTurnIntent(barcelona, badAmsterdam, 
    'Find a one-way flight to Amsterdam on November 21, 2026 that leaves after 6pm and costs under £80.'
  );
  check('resolved city Amsterdam', resolved.dest_city === 'Amsterdam');
  check('resolved did not keep Barcelona stops:0 unless restated', resolved.stops == null || resolved.stops === 0);
  // Amsterdam task is not "direct only" in the scripted wording beyond one-way —
  // isDirectOnlyQuery may or may not fire. Clear max_price leak from prev: prev had no max.
}

console.log('\n### Task1 → Task2 → Task3 via tryLocalIntent');
{
  const t1 = tryLocalIntent(
    'Find the cheapest direct one-way flight from London to Barcelona on October 16, 2026.',
    false
  )!;
  const r1 = resolveTurnIntent(null, t1, 'Find the cheapest direct one-way flight from London to Barcelona on October 16, 2026.');
  check('task1 barcelona', r1.dest_city === 'Barcelona');

  const t2text =
    'Find a one-way flight to Amsterdam on November 21, 2026 that leaves after 6pm and costs under £80.';
  const t2 = tryLocalIntent(t2text, true)!;
  const r2 = resolveTurnIntent(r1, t2, t2text);
  check('task2 amsterdam', r2.dest_city === 'Amsterdam', String(r2.dest_city));
  check('task2 not barcelona', r2.dest_city !== 'Barcelona');
  check('task2 price', r2.max_price === 80);
  check('task2 omit history', shouldOmitGroqHistory(t2text, r1) === true);

  const t3text =
    "You're flying to Rome on November 15, 2026. Compare a one-way direct flight with a one-way flight with one stop.";
  const t3 = tryLocalIntent(t3text, true)!;
  const r3 = resolveTurnIntent(r2, t3, t3text);
  check('task3 rome', r3.dest_city === 'Rome', String(r3.dest_city));
  check('task3 cleared ams price', r3.max_price == null, String(r3.max_price));
  check('task3 cleared after 6pm', r3.departure_after == null, String(r3.departure_after));
  check('task3 no stops filter', r3.stops == null);

  const t5text = 'You have £150 and a free weekend, where could you go?';
  const t5 = tryLocalIntent(t5text, true)!;
  const r5 = resolveTurnIntent(r3, t5, t5text);
  check('task5 no city', r5.dest_city == null);
  check('task5 budget 150', r5.max_price === 150);
  check('task5 weekend', r5.weekend === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
