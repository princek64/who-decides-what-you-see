/**
 * Offline check: city + no dates → ask, never silent search-all.
 *
 * Aligns generative-ui with conversational-ui's firstMissingRequiredSlot('dates')
 * so a mid-task refinement that drops the date cannot diverge between UIs.
 *
 * Run from generative-ui/:  npx tsx scripts/undated-ask-check.mts
 */
import {
  datesQuestionFor,
  needsDatesClarification,
  tryLocalIntent,
} from '../src/lib/intentBackstops';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

console.log('### needs dates ask');
{
  const undated = tryLocalIntent(
    'Find a one-way flight to Amsterdam that leaves after 6pm and costs under £80.',
    false
  );
  check('undated Amsterdam local intent exists', undated != null);
  check('undated Amsterdam needs ask', Boolean(undated && needsDatesClarification(undated)));
  check(
    'undated Amsterdam keeps price/time',
    undated?.max_price === 80 && undated?.departure_after === '18:00'
  );
  check('question is Which dates?', datesQuestionFor(undated!) === 'Which dates?');
}

{
  const dated = tryLocalIntent(
    'Find a one-way flight to Amsterdam on November 21, 2026 that leaves after 6pm and costs under £80.',
    false
  );
  check('dated Amsterdam does not ask', Boolean(dated && !needsDatesClarification(dated)));
  check('dated Amsterdam has date', dated?.date === '2026-11-21');
}

{
  const explore = tryLocalIntent('You have £150 and a free weekend, where could you go?', false);
  check('T5 explore does not ask', Boolean(explore && !needsDatesClarification(explore)));
  check('T5 has no dest', !explore?.dest_city);
}

{
  const bare = tryLocalIntent('Flights to Barcelona', false);
  check('bare city needs ask', Boolean(bare && needsDatesClarification(bare)));
}

{
  const round = tryLocalIntent('Weekend trip to Rome', false);
  // May or may not match local intent (no date window); if it does and has dest, ask.
  if (round && (round.dest_city || round.dest_code)) {
    check(
      'city without dates asks (round-trip wording)',
      needsDatesClarification(round),
      datesQuestionFor(round)
    );
  } else {
    check('weekend trip to Rome without window stays non-local or asks', true);
  }
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll undated-ask checks passed.');
