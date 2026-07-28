/**
 * Unit test for the 429 / transient-failure policy shared by BOTH apps
 * (src/lib/apiRetry.ts, copied verbatim into generative-ui). No network: the
 * Groq client is replaced by a stub that fails on demand, so the retry count,
 * the honoured retry-after, the session-log entries and the participant-facing
 * message are all asserted directly.
 *
 * Run from conversational-ui/:  npx tsx scripts/api-retry-test.mts
 */
import {
  MAX_API_RETRIES,
  friendlyApiError,
  isRetryableStatus,
  retryAfterSeconds,
  retryDelayMs,
} from '../src/lib/apiRetry';

let pass = 0;
let fail = 0;
const check = (id: string, problems: string[], note = '') => {
  if (problems.length === 0) {
    console.log(`✓ ${id}${note ? ` — ${note}` : ''}`);
    pass++;
  } else {
    console.log(`✗ ${id} — ${problems.join(' | ')}`);
    fail++;
  }
};

// A Groq-shaped error.
const apiError = (status: number, message = '', headers?: Record<string, string>) =>
  Object.assign(new Error(message || `${status} error`), { status, headers });

// The exact retry loop both hooks run, with the logger and the clock captured.
const logged: any[] = [];
const waits: number[] = [];
const runWithBackoff = async (call: () => Promise<string>): Promise<string> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err: any) {
      const retryable = isRetryableStatus(err?.status);
      logged.push({
        api_error: true,
        status: err?.status ?? null,
        attempt: attempt + 1,
        retryable,
        at: new Date().toISOString(),
      });
      if (!retryable || attempt >= MAX_API_RETRIES) throw err;
      waits.push(retryDelayMs(err, attempt));
    }
  }
};

// ── retry-after parsing ───────────────────────────────────────────────────
{
  const p: string[] = [];
  const cases: [any, number | null][] = [
    [apiError(429, 'Rate limit reached... Please try again in 6.7s.'), 6.7],
    [apiError(429, 'Please try again in 900ms'), 0.9],
    [apiError(429, 'rate limited', { 'retry-after': '12' }), 12],
    [apiError(500, 'internal error'), null],
  ];
  for (const [err, want] of cases) {
    const got = retryAfterSeconds(err);
    if (got !== want) p.push(`${err.message.slice(0, 28)} -> ${got} (want ${want})`);
  }
  // Header wins over the message text
  if (retryAfterSeconds(apiError(429, 'try again in 3s', { 'retry-after': '9' })) !== 9)
    p.push('header did not take precedence over the message text');
  check('retry-after parsing', p, 'seconds, milliseconds and Retry-After header');
}

// ── which statuses are retried ────────────────────────────────────────────
{
  const p: string[] = [];
  for (const s of [429, 408, 500, 502, 503]) if (!isRetryableStatus(s)) p.push(`${s} not retried`);
  for (const s of [400, 401, 404, 422]) if (isRetryableStatus(s)) p.push(`${s} retried (it should not be)`);
  if (isRetryableStatus(undefined)) p.push('undefined status retried');
  check('retryable statuses', p, '429/408/5xx yes, 4xx no');
}

// ── a 429 that clears on the second attempt ───────────────────────────────
{
  logged.length = 0;
  waits.length = 0;
  let calls = 0;
  const out = await runWithBackoff(async () => {
    calls++;
    if (calls === 1) throw apiError(429, 'Rate limit reached. Please try again in 2s.');
    return '{"destination":"Rome"}';
  });
  const p: string[] = [];
  if (calls !== 2) p.push(`${calls} calls (want 2)`);
  if (out !== '{"destination":"Rome"}') p.push('did not return the successful response');
  if (logged.length !== 1) p.push(`${logged.length} log entries (want 1)`);
  if (logged[0]?.status !== 429) p.push('status code not logged');
  if (!logged[0]?.at || isNaN(Date.parse(logged[0].at))) p.push('no parseable timestamp logged');
  if (waits[0] !== 2250) p.push(`waited ${waits[0]}ms (want 2250 = the 2s the API asked for + margin)`);
  check('429 then success', p, `recovered on attempt 2 after ${waits[0]}ms`);
}

// ── a 429 that never clears: two retries, then a friendly message ─────────
{
  logged.length = 0;
  waits.length = 0;
  let calls = 0;
  let thrown: any = null;
  try {
    await runWithBackoff(async () => {
      calls++;
      throw apiError(429, 'Rate limit reached. Please try again in 4s.');
    });
  } catch (err) {
    thrown = err;
  }
  const p: string[] = [];
  if (calls !== MAX_API_RETRIES + 1) p.push(`${calls} calls (want ${MAX_API_RETRIES + 1})`);
  if (!thrown) p.push('error was swallowed instead of surfacing');
  if (logged.length !== MAX_API_RETRIES + 1) p.push(`${logged.length} log entries (want ${MAX_API_RETRIES + 1})`);
  if (logged.some((l) => l.status !== 429)) p.push('a log entry lost its status code');
  const msg = friendlyApiError(thrown);
  if (/internet connection/i.test(msg)) p.push('still blames the participant\'s internet connection');
  if (!/rate|limit/i.test(msg)) p.push('message does not say it is a rate limit');
  if (!/still on screen/i.test(msg)) p.push('message does not tell the participant their results are intact');
  check('429 exhausted', p, `${calls} attempts, ${logged.length} logged, then: "${msg.slice(0, 52)}…"`);
}

// ── a non-retryable status fails immediately ──────────────────────────────
{
  logged.length = 0;
  let calls = 0;
  try {
    await runWithBackoff(async () => {
      calls++;
      throw apiError(401, 'Invalid API Key');
    });
  } catch {
    /* expected */
  }
  const p: string[] = [];
  if (calls !== 1) p.push(`${calls} calls (want 1 — a bad key will never come good)`);
  if (logged.length !== 1) p.push(`${logged.length} log entries (want 1)`);
  const msg = friendlyApiError(apiError(401));
  if (!/researcher/i.test(msg)) p.push('401 message does not point at the researcher');
  check('401 not retried', p, 'fails fast, points at the researcher');
}

// ── backoff without an advised wait, and the cap ──────────────────────────
{
  const p: string[] = [];
  const plain = apiError(503, 'service unavailable');
  if (retryDelayMs(plain, 0) !== 1000) p.push(`first backoff ${retryDelayMs(plain, 0)}ms (want 1000)`);
  if (retryDelayMs(plain, 1) !== 2000) p.push(`second backoff ${retryDelayMs(plain, 1)}ms (want 2000)`);
  if (retryDelayMs(apiError(429, 'try again in 300s'), 0) !== 12000)
    p.push('an absurd retry-after was not capped');
  check('backoff schedule', p, '1s, 2s, capped at 12s');
}

console.log(`\n${pass} passed, ${fail} failed`);
