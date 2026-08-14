/**
 * Offline checks for session fixes (DE months, reset, region, next-month window,
 * Fri–Sun calendar parity helpers).
 *
 * Run from conversational-ui/:  npx tsx scripts/session-fix-check.mts
 */
import {
  RESET_CUE,
  dateFromText,
  firstMissingRequiredSlot,
  flexibleWindowFromText,
  isEasternEuropeQuery,
  isLiftRegionQuery,
  resolveTurnSlot,
  slotToIntent,
} from '../src/lib/slots';
import type { SlotJSON } from '../src/lib/slots';
import { tryLocalSlot } from '../src/lib/studyTasks';
import { getSearchAnchor } from '../src/constants/prompts';
import { easternEuropeAirportCodes } from '../src/lib/airportMap';

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

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

console.log('### A3 — DE / EN date parsing');
check('oktober 21 → 2026-10-21', dateFromText('oktober 21') === '2026-10-21');
check('November 21 → 2026-11-21', dateFromText('November 21') === '2026-11-21');
check(
  'Porto November 21 local slot is dated',
  (() => {
    const s = tryLocalSlot(
      'Destination Porto, November 21. Compare a direct flight with a one stop flight. One-way flights.',
      false
    );
    return Boolean(s && s.date_from === '2026-11-21' && firstMissingRequiredSlot(s) == null);
  })()
);

console.log('\n### A1 — reset cues');
check('Forget everything matches RESET', RESET_CUE.test('Forget everything. I have a 150GBP travel budget.'));
check('forget that still matches', RESET_CUE.test('forget that'));
{
  const prev = blank({
    destination: 'Nice',
    date_from: '2026-08-23',
    date_to: '2026-08-23',
    max_price: 150,
  });
  const next = resolveTurnSlot(
    prev,
    blank({ destination: 'Nice', date_from: '2026-08-23', date_to: '2026-08-23', max_price: 150 }),
    'Forget everything. You have £150 and a free weekend, where could you go?'
  );
  check('Forget everything clears Nice', next.destination == null, String(next.destination));
  check('Forget everything is anywhere', next.anywhere === true);
  check('Forget everything keeps £150', next.max_price === 150);
}

console.log('\n### B2/C1 — eastern europe refine');
{
  const prev = blank({
    anywhere: true,
    max_price: 150,
    weekend: true,
    date_from: getSearchAnchor(),
    date_to: flexibleWindowFromText('next month')?.date_to ?? null,
  });
  const next = resolveTurnSlot(
    prev,
    blank({ anywhere: true }),
    'Restrict it to countries eastern of Germany'
  );
  check('eastern refine stays anywhere', next.anywhere === true);
  check('eastern refine sets dest_region', next.dest_region === 'eastern_europe');
  check('eastern refine does not ask destination', firstMissingRequiredSlot(next) == null);
  check('eastern refine keeps dates', Boolean(next.date_from || next.date_to));
  const intent = slotToIntent(next);
  check('intent dest_region set', intent.dest_region === 'eastern_europe');
  check('eastern airport codes non-empty', easternEuropeAirportCodes().size > 10);
  check('isEasternEuropeQuery', isEasternEuropeQuery('Restrict it to countries eastern of Germany'));
  check('isLiftRegionQuery', isLiftRegionQuery('okay lift the restriction. All Europe is a potential destination.'));
  const lifted = resolveTurnSlot(next, blank({ anywhere: true }), 'All Europe is a potential destination.');
  check('lift clears dest_region', lifted.dest_region == null);
}

console.log('\n### C2 — next month vs three months');
{
  const one = flexibleWindowFromText('weekend in the next month Friday-Sunday');
  const three = flexibleWindowFromText('cheapest weekend in the next three months');
  check('next month window present', Boolean(one));
  check('three months window present', Boolean(three));
  if (one && three) {
    const span1 =
      (new Date(`${one.date_to}T00:00:00`).getTime() - new Date(`${one.date_from}T00:00:00`).getTime()) /
      86400000;
    const span3 =
      (new Date(`${three.date_to}T00:00:00`).getTime() -
        new Date(`${three.date_from}T00:00:00`).getTime()) /
      86400000;
    check('next month ~30 days', span1 >= 28 && span1 <= 35, `span=${span1}`);
    check('three months >> next month', span3 > span1 + 40, `span3=${span3} span1=${span1}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll conversational session-fix checks passed.');
