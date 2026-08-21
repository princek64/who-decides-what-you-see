/**
 * Offline: study-task golden slots + TPD vs TPM rate-limit policy.
 * Run: npx tsx scripts/quota-guard-check.mts
 */
import {
  friendlyApiError,
  isDailyTokenQuotaError,
  isRetryableError,
  isRetryableStatus,
  MAX_API_RETRIES,
  retryAfterSeconds,
  retryDelayMs,
} from '../src/lib/apiRetry';
import { matchStudyTaskSlot, tryLocalSlot } from '../src/lib/studyTasks';
import { resolveTurnSlot } from '../src/lib/slots';
import type { SlotJSON } from '../src/lib/slots';
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

const apiError = (status: number, message = '', headers?: Record<string, string>) =>
  Object.assign(new Error(message || `${status} error`), { status, headers });

const TPD_MSG =
  'Rate limit reached for model openai/gpt-oss-20b in organization org_test on tokens per day (TPD): Limit 200000, Used 199429, Requested 3981. Please try again in 24m12.54s. Need more tokens? Upgrade to Dev Tier';

// ── TPD vs TPM ────────────────────────────────────────────────────────────
{
  const tpd = apiError(429, TPD_MSG);
  const tpm = apiError(429, 'Rate limit reached. Please try again in 6.7s.');
  check('detects TPD 429', isDailyTokenQuotaError(tpd));
  check('TPM is not TPD', !isDailyTokenQuotaError(tpm));
  check('TPD is not retryable', !isRetryableError(tpd));
  check('TPM still retryable', isRetryableError(tpm));
  check('status alone still flags 429', isRetryableStatus(429));
  check(
    'TPD message names daily limit',
    /today'?s AI usage limit/i.test(friendlyApiError(tpd))
  );
  check(
    'TPD message includes minute wait',
    /about 25 minutes|about 24 minutes/i.test(friendlyApiError(tpd)),
    friendlyApiError(tpd)
  );
  check(
    'TPM message still says per minute',
    /requests a minute/i.test(friendlyApiError(tpm))
  );
  check('parses 24m12.54s', Math.abs((retryAfterSeconds(tpd) ?? 0) - (24 * 60 + 12.54)) < 0.01);
  check('parses 900ms', retryAfterSeconds(apiError(429, 'try again in 900ms')) === 0.9);
  check('parses 6.7s', retryAfterSeconds(apiError(429, 'try again in 6.7s.')) === 6.7);
}

// TPD must fail on first attempt (no sleeps).
{
  let calls = 0;
  const waits: number[] = [];
  let thrown: any = null;
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        calls++;
        throw apiError(429, TPD_MSG);
      } catch (err: any) {
        const retryable = isRetryableError(err);
        if (!retryable || attempt >= MAX_API_RETRIES) throw err;
        waits.push(retryDelayMs(err, attempt));
      }
    }
  };
  try {
    await run();
  } catch (err) {
    thrown = err;
  }
  check('TPD fails immediately', calls === 1 && waits.length === 0 && thrown?.status === 429);
}

// ── Study-task golden slots ───────────────────────────────────────────────
{
  const t1 = matchStudyTaskSlot(
    'Find the cheapest direct one-way flight from London to Barcelona on October 16, 2026.'
  );
  check('T1 matches', Boolean(t1));
  check('T1 Barcelona', t1?.destination === 'Barcelona', String(t1?.destination));
  check('T1 date', t1?.date_from === '2026-10-16' && t1?.date_to === '2026-10-16');
  check('T1 direct', t1?.direct_only === true);

  const t2 = matchStudyTaskSlot(
    'Find a one-way flight to Amsterdam on November 20 that leaves after 6pm and costs under £80'
  );
  check('T2 matches', Boolean(t2));
  check('T2 Amsterdam', t2?.destination === 'Amsterdam');
  check('T2 date', t2?.date_from === '2026-11-20');
  check('T2 after 6pm', t2?.departure_after === '18:00');
  check('T2 under 80', t2?.max_price === 80);

  const t2b = matchStudyTaskSlot('on november 21st?');
  check('bare date follow-up is NOT golden', t2b == null);

  const t2c = matchStudyTaskSlot(
    'Find a one-way flight to Amsterdam on November 21, 2026 that leaves after 6pm and costs under £80.'
  );
  check('T2 Nov 21 variant', t2c?.date_from === '2026-11-21' && t2c?.max_price === 80);

  const t3 = matchStudyTaskSlot(
    "You're flying to Rome on November 15, 2026. Compare a one-way direct flight with a one-way flight with one stop."
  );
  check('T3 matches', Boolean(t3));
  check('T3 Rome compare', t3?.destination === 'Rome' && t3?.compare === true);
  check('T3 direct_only null', t3?.direct_only == null);
  check('T3 date', t3?.date_from === '2026-11-15');

  const t4 = matchStudyTaskSlot(
    'Find the cheapest return trip to Paris for a weekend in the next three months.'
  );
  const anchor = getSearchAnchor();
  check('T4 matches', Boolean(t4));
  check('T4 Paris weekend return', t4?.destination === 'Paris' && t4?.weekend === true && t4?.round_trip === true);
  check('T4 window starts at anchor', t4?.date_from === anchor, String(t4?.date_from));

  const t5 = matchStudyTaskSlot(
    'You have £150 and a free weekend, where could you go?'
  );
  check('T5 matches', Boolean(t5));
  check('T5 anywhere+budget', t5?.anywhere === true && t5?.max_price === 150 && t5?.weekend === true);

  const t5b = matchStudyTaskSlot(
    'show me options to fly on a weekend with a budget of 150 pounds'
  );
  check('T5 budget-options variant', t5b?.anywhere === true && t5b?.max_price === 150);

  check(
    'Paris weekend of Aug 28 is NOT golden restart',
    matchStudyTaskSlot('show me for the weekend of august 28th') == null
  );
  check(
    'after 6pm follow-up is NOT golden',
    matchStudyTaskSlot('one that leaves after 6 pm from london') == null
  );
  check(
    'ordinary Barcelona without date is NOT golden',
    matchStudyTaskSlot('cheapest direct flight to Barcelona') == null
  );
}

// ── Broader local-first (follow-ups that used to burn Groq) ───────────────
{
  const prev: SlotJSON = {
    destination: 'Paris',
    date_from: '2026-08-28',
    date_to: '2026-08-28',
    cabin: 'Economy',
    direct_only: null,
    sort: 'cheapest',
    missing: [],
    weekend: true,
    round_trip: true,
  };

  const weekendOf = tryLocalSlot('show me for the weekend of august 28th', true);
  check('weekend-of follow-up is local', Boolean(weekendOf));
  const weekendResolved = resolveTurnSlot(prev, weekendOf!, 'show me for the weekend of august 28th');
  check('weekend-of keeps Paris', weekendResolved.destination === 'Paris');
  check('weekend-of sets Aug 28', weekendResolved.date_from === '2026-08-28');

  const afterSix = tryLocalSlot('one that leaves after 6 pm from london', true);
  check('after-6pm follow-up is local', Boolean(afterSix));
  const afterResolved = resolveTurnSlot(prev, afterSix!, 'one that leaves after 6 pm from london');
  check('after-6pm keeps Paris', afterResolved.destination === 'Paris');
  check('after-6pm sets 18:00', afterResolved.departure_after === '18:00');

  const bareDate = tryLocalSlot('on november 21st?', true);
  check('bare date follow-up is local with prior', Boolean(bareDate));

  const barcelonaAsk = tryLocalSlot('cheapest direct flight to Barcelona', false);
  check('Barcelona without date is local (asks dates)', barcelonaAsk?.destination === 'Barcelona');
  check('Barcelona without date missing dates', barcelonaAsk?.missing?.includes('dates') === true);

  check('hotel stays off local path', tryLocalSlot('can you book me a hotel in Barcelona') == null);
  check('no prior + bare date is NOT local', tryLocalSlot('on november 21st?', false) == null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
