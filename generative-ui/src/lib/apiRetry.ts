/**
 * Rate-limit / transient-failure handling for the Groq calls.
 *
 * Both research apps run against the SAME org-level Groq quota, and the free
 * tier is 6,000 tokens/min against a ~2.7k-token prompt — so during a
 * participant session a 429 is an ordinary event, not an exception. Left
 * unhandled it surfaced as a raw "Could not reach the AI service. Please check
 * your internet connection" alert, which is both wrong (the connection is fine)
 * and unrecoverable-looking mid-task.
 */

/** How many times a retryable call is re-attempted after the first failure. */
export const MAX_API_RETRIES = 2;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 429 (rate limit), 408 (timeout) and 5xx are worth another attempt; 4xx is not. */
export const isRetryableStatus = (status?: number): boolean =>
  status === 429 || status === 408 || (typeof status === 'number' && status >= 500);

/**
 * Seconds the API asked us to wait, from either the Retry-After header or the
 * "Please try again in 6.7s" text Groq puts in the error message. Returns null
 * when the API said nothing.
 */
export const retryAfterSeconds = (err: any): number | null => {
  const header =
    err?.headers?.['retry-after'] ??
    err?.headers?.get?.('retry-after') ??
    err?.response?.headers?.get?.('retry-after');
  const fromHeader = parseFloat(String(header ?? ''));
  if (!isNaN(fromHeader) && fromHeader > 0) return fromHeader;

  const match = String(err?.message ?? '').match(/try again in ([\d.]+)\s*(ms|s)?/i);
  if (match) {
    const value = parseFloat(match[1]);
    if (!isNaN(value)) return match[2]?.toLowerCase() === 'ms' ? value / 1000 : value;
  }
  return null;
};

/**
 * Wait before attempt N: honour the API's own retry-after when it gave one
 * (capped so a participant is never left staring at a spinner), otherwise
 * exponential backoff from 1s.
 */
export const retryDelayMs = (err: any, attempt: number): number => {
  const MAX_WAIT_MS = 12_000;
  const advised = retryAfterSeconds(err);
  if (advised != null) return Math.min(advised * 1000 + 250, MAX_WAIT_MS);
  return Math.min(1000 * 2 ** attempt, MAX_WAIT_MS);
};

/**
 * What the participant reads. Distinguishes "we are rate limited" from "the
 * service is down" from "your network dropped" — the previous single message
 * blamed the user's connection for all three.
 */
export const friendlyApiError = (err: any): string => {
  const status: number | undefined = err?.status;
  if (status === 429) {
    return "I'm being rate-limited by the AI service right now — it only allows so many requests a minute. Your results are still on screen; give it a few seconds and send that again.";
  }
  if (typeof status === 'number' && status >= 500) {
    return 'The AI service is having trouble at its end. Nothing is lost — try that message again in a moment.';
  }
  if (typeof status === 'number' && status === 401) {
    return "I can't sign in to the AI service. Let the researcher know — this one needs fixing at the setup end.";
  }
  return 'I could not reach the AI service just now. Your results are still on screen — check the connection and try that message again.';
};
