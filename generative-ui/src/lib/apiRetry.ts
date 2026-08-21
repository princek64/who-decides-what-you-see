/**
 * Groq rate-limit / transient-failure helpers (shared policy with conversational-ui).
 * TPM/request 429s: wait and retry. TPD 429s: fail fast — retries never succeed.
 */

/** How many times a retryable call is re-attempted after the first failure. */
export const MAX_API_RETRIES = 2;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const errorMessage = (err: any): string =>
  String(err?.message ?? err?.error?.message ?? err ?? '');

/** Daily token ceiling (TPD) — only visible in the 429 body text. */
export const isDailyTokenQuotaError = (err: any): boolean => {
  if (err?.status !== 429) return false;
  const msg = errorMessage(err);
  return (
    /tokens per day/i.test(msg) ||
    /\bTPD\b/.test(msg) ||
    /daily (?:token )?limit/i.test(msg) ||
    /Limit\s*[\d,]+\s*,\s*Used\s*[\d,]+/i.test(msg)
  );
};

/** 429 / 408 / 5xx are retryable; other 4xx are not. */
export const isRetryableStatus = (status?: number): boolean =>
  status === 429 || status === 408 || (typeof status === 'number' && status >= 500);

/** Prefer over isRetryableStatus: TPD 429s must not be retried. */
export const isRetryableError = (err: any): boolean => {
  if (isDailyTokenQuotaError(err)) return false;
  return isRetryableStatus(err?.status);
};

/** Seconds from Retry-After header or Groq "try again in …" message text. */
export const retryAfterSeconds = (err: any): number | null => {
  const header =
    err?.headers?.['retry-after'] ??
    err?.headers?.get?.('retry-after') ??
    err?.response?.headers?.get?.('retry-after');
  const fromHeader = parseFloat(String(header ?? ''));
  if (!isNaN(fromHeader) && fromHeader > 0) return fromHeader;

  const msg = errorMessage(err);

  // Minutes must not swallow the "m" in "ms" (negative lookahead).
  const compound = msg.match(
    /try again in\s+(?:(\d+)\s*h)?(?:(\d+)\s*m(?!s))?(?:([\d.]+)\s*s)?(?:([\d.]+)\s*ms)?/i
  );
  if (compound && (compound[1] || compound[2] || compound[3] || compound[4])) {
    const hours = compound[1] ? Number(compound[1]) : 0;
    const mins = compound[2] ? Number(compound[2]) : 0;
    const secs = compound[3] ? Number(compound[3]) : 0;
    const ms = compound[4] ? Number(compound[4]) : 0;
    const total = hours * 3600 + mins * 60 + secs + ms / 1000;
    if (!isNaN(total) && total > 0) return total;
  }
  return null;
};

/** Honour API retry-after (capped) or exponential backoff from 1s. */
export const retryDelayMs = (err: any, attempt: number): number => {
  const MAX_WAIT_MS = 12_000;
  const advised = retryAfterSeconds(err);
  if (advised != null) return Math.min(advised * 1000 + 250, MAX_WAIT_MS);
  return Math.min(1000 * 2 ** attempt, MAX_WAIT_MS);
};

const formatWaitHint = (err: any): string => {
  const secs = retryAfterSeconds(err);
  if (secs == null) return 'a little while';
  if (secs >= 3600) {
    const hours = Math.ceil(secs / 3600);
    return hours === 1 ? 'about an hour' : `about ${hours} hours`;
  }
  if (secs >= 60) {
    const mins = Math.ceil(secs / 60);
    return mins === 1 ? 'about a minute' : `about ${mins} minutes`;
  }
  return `about ${Math.ceil(secs)} seconds`;
};

/** Participant-facing copy: distinguish TPD, TPM, 5xx, 401, and network. */
export const friendlyApiError = (err: any): string => {
  const status: number | undefined = err?.status;
  if (status === 429) {
    if (isDailyTokenQuotaError(err)) {
      return `We've hit today's AI usage limit for this research account. Your results are still on screen — try again in ${formatWaitHint(err)}, or let the researcher know.`;
    }
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
