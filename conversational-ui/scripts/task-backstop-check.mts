/**
 * Offline study-task wording backstops (dates/price/compare/direct/windows/city).
 */
import {
  applyWordingBackstops,
  departureAfterFromText,
  flexibleWindowFromText,
  isDirectOnlyQuery,
  isPickBestQuery,
  maxPriceFromText,
  resolveTurnSlot,
  slotToIntent,
} from '../src/lib/slots';
import type { SlotJSON } from '../src/lib/slots';
import { getSearchAnchor } from '../src/constants/prompts';

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

console.log('### detectors');
check('"direct flight" is direct-only', isDirectOnlyQuery('cheapest direct flight to Barcelona'));
check('"nonstop" is direct-only', isDirectOnlyQuery('cheapest nonstop to Barcelona'));
check('max_price under £80', maxPriceFromText('costs under £80') === 80);
check('max_price under 80', maxPriceFromText('under 80 pounds') === 80);
check('max_price £150', maxPriceFromText('You have £150 and a free weekend') === 150);
check('after 6pm → 18:00', departureAfterFromText('leaves after 6pm') === '18:00');
check('evening → 18:00', departureAfterFromText('evening flight to amsterdam') === '18:00');
check('from 10 September is NOT a time', departureAfterFromText('flights from 10 September') === null);

const window = flexibleWindowFromText(
  'Find the cheapest return trip to Paris for a weekend in the next three months.'
);
check('flexible window present', Boolean(window));
if (window) {
  check('window starts at anchor', window.date_from === getSearchAnchor());
  const span =
    (new Date(`${window.date_to}T00:00:00`).getTime() -
      new Date(`${window.date_from}T00:00:00`).getTime()) /
    86400000;
  check('window spans ~3 months', span >= 60, `span=${span}`);
}

console.log('\n### user text wins over bad model slots');
{
  const t1 =
    'Find the cheapest direct one-way flight from London to Barcelona on October 16, 2026.';
  const bad = applyWordingBackstops(
    blank({
      destination: 'Rome',
      date_from: '2026-07-14',
      date_to: '2026-07-14',
      direct_only: null,
    }),
    t1
  );
  check('T1 destination → Barcelona', bad.destination === 'Barcelona', String(bad.destination));
  check('T1 date → 2026-10-16', bad.date_from === '2026-10-16' && bad.date_to === '2026-10-16');
  check('T1 direct_only set', bad.direct_only === true);

  const t2 =
    'Find a one-way flight to Amsterdam on November 21, 2026 that leaves after 6pm and costs under £80.';
  const t2slot = applyWordingBackstops(
    blank({ destination: null, date_from: null, date_to: null }),
    t2
  );
  check('T2 dest Amsterdam', t2slot.destination === 'Amsterdam');
  check('T2 date', t2slot.date_from === '2026-11-21');
  check('T2 max_price 80', t2slot.max_price === 80);
  check('T2 after 18:00', t2slot.departure_after === '18:00');

  const t3 =
    "You're flying to Rome on November 15, 2026. Compare a one-way direct flight with a one-way flight with one stop.";
  const t3slot = applyWordingBackstops(
    blank({ destination: 'Rome', date_from: '2026-11-15', date_to: '2026-11-15', direct_only: true }),
    t3
  );
  check('T3 compare set', t3slot.compare === true);
  check('T3 direct_only forced null', t3slot.direct_only == null);
  check('T3 intent has no stops filter', slotToIntent(t3slot).stops == null);

  const t4 =
    'Find the cheapest return trip to Paris for a weekend in the next three months.';
  const t4slot = applyWordingBackstops(
    blank({
      destination: 'Paris',
      date_from: '2026-08-15',
      date_to: '2026-08-16',
      sort: 'cheapest',
    }),
    t4
  );
  check('T4 round_trip', t4slot.round_trip === true);
  check('T4 weekend', t4slot.weekend === true);
  check('T4 collapsed window reopened', Boolean(t4slot.date_from && t4slot.date_to && t4slot.date_from !== t4slot.date_to));
  if (t4slot.date_from && t4slot.date_to) {
    const span =
      (new Date(`${t4slot.date_to}T00:00:00`).getTime() -
        new Date(`${t4slot.date_from}T00:00:00`).getTime()) /
      86400000;
    check('T4 window >= 60 days', span >= 60, `span=${span}`);
  }
}

console.log('\n### same-thread city reset (Tasks 1 → 2 → 3)');
{
  const t1text =
    'Find the cheapest direct one-way flight from London to Barcelona on October 16, 2026.';
  const t1 = resolveTurnSlot(
    null,
    applyWordingBackstops(
      blank({ destination: 'Barcelona', date_from: '2026-10-16', date_to: '2026-10-16', direct_only: true }),
      t1text
    ),
    t1text
  );
  check('task1 barcelona', t1.destination === 'Barcelona');

  const t2text =
    'Find a one-way flight to Amsterdam on November 21, 2026 that leaves after 6pm and costs under £80.';
  // Model wrongly echoes Barcelona / drops constraints — backstops + resolve must still land on Amsterdam.
  const t2 = resolveTurnSlot(
    t1,
    applyWordingBackstops(
      blank({
        destination: 'Barcelona',
        date_from: '2026-07-14',
        date_to: '2026-07-14',
        direct_only: true,
        max_price: null,
      }),
      t2text
    ),
    t2text
  );
  check('task2 destination Amsterdam', t2.destination === 'Amsterdam', String(t2.destination));
  check('task2 date Nov 21', t2.date_from === '2026-11-21');
  check('task2 max_price 80', t2.max_price === 80);
  check('task2 after 18:00', t2.departure_after === '18:00');
  check('task2 did not keep direct_only', t2.direct_only == null);

  const t3text =
    "You're flying to Rome on November 15, 2026. Compare a one-way direct flight with a one-way flight with one stop.";
  const t3 = resolveTurnSlot(
    t2,
    applyWordingBackstops(
      blank({
        destination: 'Amsterdam',
        date_from: '2026-11-21',
        date_to: '2026-11-21',
        max_price: 80,
        departure_after: '18:00',
        direct_only: true,
      }),
      t3text
    ),
    t3text
  );
  check('task3 destination Rome', t3.destination === 'Rome', String(t3.destination));
  check('task3 date Nov 15', t3.date_from === '2026-11-15');
  check('task3 no leaked max_price', t3.max_price == null, String(t3.max_price));
  check('task3 no leaked departure_after', t3.departure_after == null, String(t3.departure_after));
  check('task3 compare open', t3.compare === true && t3.direct_only == null);
}

console.log('\n### refinements still carry (must not break mid-test)');
{
  const prev = blank({
    destination: 'Rome',
    date_from: '2026-11-15',
    date_to: '2026-11-15',
    direct_only: true,
    sort: 'cheapest',
  });
  const refined = resolveTurnSlot(
    prev,
    applyWordingBackstops(blank({}), 'yes, include flights with a stop'),
    'yes, include flights with a stop'
  );
  check('refinement keeps Rome', refined.destination === 'Rome');
  check('refinement keeps date', refined.date_from === '2026-11-15');
  check('refinement drops direct_only', refined.direct_only == null);
}

console.log('\n### open explore keeps budget, drops city/time');
{
  const ams = blank({
    destination: 'Amsterdam',
    date_from: '2026-11-21',
    date_to: '2026-11-21',
    max_price: 80,
    departure_after: '18:00',
    sort: 'cheapest',
  });
  const weekendBudget = resolveTurnSlot(
    ams,
    applyWordingBackstops(blank({}), 'find me options to fly on a weekend for 150 pounds'),
    'find me options to fly on a weekend for 150 pounds'
  );
  check('weekend budget is anywhere', weekendBudget.anywhere === true);
  check('weekend budget cleared city', weekendBudget.destination == null);
  check('weekend budget max_price 150', weekendBudget.max_price === 150);
  check('weekend budget weekend flag', weekendBudget.weekend === true);
  check('weekend budget cleared after 6pm', weekendBudget.departure_after == null);

  const anywhere = resolveTurnSlot(
    weekendBudget,
    applyWordingBackstops(blank({ anywhere: true }), 'pick from anywhere in europe'),
    'pick from anywhere in europe'
  );
  check('anywhere kept £150', anywhere.max_price === 150, String(anywhere.max_price));
  check('anywhere kept weekend', anywhere.weekend === true);
  check('anywhere no city', anywhere.destination == null);
}

console.log('\n### one-way after anywhere does not force round trip');
{
  const explore = blank({ anywhere: true, max_price: 150, weekend: true, sort: 'cheapest' });
  const rome = resolveTurnSlot(
    explore,
    applyWordingBackstops(
      blank({ destination: 'Rome', date_from: '2026-11-15', date_to: '2026-11-15' }),
      "You're flying to Rome on November 15, 2026. Compare a one-way direct flight with a one-way flight with one stop."
    ),
    "You're flying to Rome on November 15, 2026. Compare a one-way direct flight with a one-way flight with one stop."
  );
  check('rome one-way not round_trip', rome.round_trip !== true, String(rome.round_trip));
  check('rome compare set', rome.compare === true);
  check('rome intent outbound', slotToIntent(rome).direction === 'outbound');
}

console.log('\n### pick-best detector');
check('pick the best for me', isPickBestQuery('pick the best for me'));
check('recommend one', isPickBestQuery('recommend one'));
check('not ordinary search', !isPickBestQuery('cheapest flight to Paris'));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
