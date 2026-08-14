/**
 * Offline checks for generative session fixes (DE months, Fri–Sun calendar
 * logic, reset, region, next-month window).
 *
 * Run from generative-ui/:  npx tsx scripts/session-fix-check.mts
 */
import { dateFromText } from '../src/lib/returnLeg';
import {
  RESET_CUE,
  applyIntentBackstops,
  flexibleWindowFromText,
  isAnywhereQuery,
  isEasternEuropeQuery,
  isLiftRegionQuery,
  isOpenExploreQuery,
  needsDatesClarification,
  resolveTurnIntent,
  tryLocalIntent,
} from '../src/lib/intentBackstops';
import { easternEuropeAirportCodes } from '../src/lib/airportMap';
import { getSearchAnchor } from '../src/constants/prompts';
import type { GenIntent } from '../src/hooks/useGenChat';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

console.log('### A3 — DE date parsing');
check('oktober 21 → 2026-10-21', dateFromText('oktober 21') === '2026-10-21');
check('November 21 dated', dateFromText('November 21') === '2026-11-21');
{
  const intent = tryLocalIntent(
    'Destination Porto, November 21. Compare a direct flight with a one stop flight. One-way flights.',
    false
  );
  check('Porto November 21 local intent', intent != null);
  check('Porto does not need dates ask', Boolean(intent && !needsDatesClarification(intent)));
  check('Porto date set', intent?.date === '2026-11-21');
}

console.log('\n### A4 — Fri–Sun weekend highlight logic');
{
  // Mirror CalendarView: Fri(5)/Sat(6)/Sun(0)
  const isWeekendBreak = (iso: string) => {
    const day = new Date(`${iso}T00:00:00`).getDay();
    return day === 5 || day === 6 || day === 0;
  };
  check('Friday counts', isWeekendBreak('2026-09-04'));
  check('Saturday counts', isWeekendBreak('2026-09-05'));
  check('Sunday counts', isWeekendBreak('2026-09-06'));
  check('Monday excluded', !isWeekendBreak('2026-09-07'));
}

console.log('\n### A1 — reset');
check('Forget everything matches', RESET_CUE.test('Forget everything'));
{
  const prev = {
    dest_city: 'Nice',
    date: '2026-08-23',
    max_price: 150,
    sort_by: 'cheapest' as const,
  };
  const next = resolveTurnIntent(
    prev,
    { dest_city: 'Nice', date: '2026-08-23', max_price: 150 },
    'Forget everything. You have £150 and a free weekend, where could you go?'
  );
  check('reset clears Nice', !next.dest_city, String(next.dest_city));
  check('reset keeps budget', next.max_price === 150);
  check('reset destinations layout', next.layout === 'destinations');
}

console.log('\n### C1 — eastern europe');
check('eastern detector', isEasternEuropeQuery('eastern european destination'));
{
  const intent = tryLocalIntent(
    '150 GBP travel budget, eastern european destination, free weekend, where can I go?',
    false
  );
  check('eastern local intent', intent != null);
  check('eastern dest_region', intent?.dest_region === 'eastern_europe');
  check('eastern codes', easternEuropeAirportCodes().size > 10);
}

console.log('\n### C2 — next month window');
{
  const one = flexibleWindowFromText('weekend in the next month');
  const three = flexibleWindowFromText('next three months');
  check('next month present', Boolean(one));
  check('three months present', Boolean(three));
  if (one && three) {
    const span = (w: { date_from: string; date_to: string }) =>
      (new Date(`${w.date_to}T00:00:00`).getTime() - new Date(`${w.date_from}T00:00:00`).getTime()) /
      86400000;
    check('next month ~30d', span(one) >= 28 && span(one) <= 35, `span=${span(one)}`);
    check('three months larger', span(three) > span(one) + 40);
    check('anchor start', one.date_from === getSearchAnchor());
  }
}

console.log('\n### B1 — round trip without cheapest-when → itinerary');
{
  const intent = tryLocalIntent(
    'Find the cheapest round trip from London to Lisbon in the next three months.',
    false
  );
  // "cheapest" + no "weekend/day" after it may still not match isCheapestWhenQuery;
  // round trip + window should prefer itinerary when not a calendar cheapest-when.
  check('Lisbon round trip local', intent != null);
  check('Lisbon direction both', intent?.direction === 'both');
}

console.log('\n### open dest follow-ups after budget ask');
{
  const cold = 'cheapest flights under 150 pounds from any london airports';
  check('cold budget is not open explore', !isOpenExploreQuery(cold));
  check('any london airports is not any destinations', !isAnywhereQuery(cold));

  const budgetAsk = 'show flights under 150 pounds budget';
  check('budget wording is open explore', isOpenExploreQuery(budgetAsk));
  const budgetLocal = tryLocalIntent(budgetAsk, false);
  check('budget local intent', budgetLocal != null);
  check('budget local outbound', budgetLocal?.direction === 'outbound');
  check(
    'budget local explore layout',
    budgetLocal?.layout === 'destinations' || budgetLocal?.layout === 'budget'
  );
  check('budget local £150', budgetLocal?.max_price === 150);

  const prev: GenIntent = { max_price: 150, sort_by: 'cheapest' };
  for (const follow of [
    'any destinations',
    'suggest destinations',
    'within europe',
    'choose any destination in europe',
  ]) {
    check(`detect open: ${follow}`, isOpenExploreQuery(follow) || isLiftRegionQuery(follow));
    const local = tryLocalIntent(follow, true);
    check(`local intent: ${follow}`, local != null);
    const merged = resolveTurnIntent(prev, local ?? {}, follow);
    check(`destinations layout: ${follow}`, merged.layout === 'destinations');
    check(`outbound: ${follow}`, merged.direction === 'outbound');
    check(`keeps £150: ${follow}`, merged.max_price === 150, String(merged.max_price));
    check(`no city forced: ${follow}`, !merged.dest_city);
  }
  check('Barcelona in europe is not a lift', !isLiftRegionQuery('flights to Barcelona in europe'));

  // Groq often invents direction=both for budget explores; cards must still
  // exclude London airports and backstops must force outbound.
  const bothBackstop = applyIntentBackstops(
    { max_price: 150, layout: 'destinations', direction: 'both', sort_by: 'cheapest' },
    'show flights under 150 pounds budget'
  );
  check('backstop forces outbound on destinations', bothBackstop.direction === 'outbound');
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll generative session-fix checks passed.');
