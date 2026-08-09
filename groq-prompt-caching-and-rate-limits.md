# Groq prompt caching and rate limits (openai/gpt-oss-20b)

Measured on the live API against this repo's real system prompts, 2026-08-08.
Free/`on_demand` service tier, org `org_01kqm…`. Numbers below are observations,
not vendor claims.

## Summary

- Prompt caching **works and needs no code change**: the system prompt is byte-identical
  for every call within a day, sits first in the message array, and is far above the
  minimum cacheable length. On a hit, **3,584 of 3,609 prompt tokens (99.3%) came back cached**.
- Cached tokens are **excluded from the daily token quota**, not merely discounted.
- **Admission control uses the pre-discount figure**, so near the ceiling you are refused
  on an estimate ~20x larger than what the call would actually be charged.
- Cache hits are **opportunistic, not guaranteed** — a hit and a miss were observed on the
  same prefix roughly 20 minutes apart, so capacity planning must not assume a warm cache.

## What was measured

Two successful calls with an identical 3,609-token system prefix, each bracketed by
"blocked" probes that report the daily counter (a 429 costs nothing, so it reads the
counter for free).

| | cached_tokens | prompt | completion | total | daily counter delta |
|---|---|---|---|---|---|
| cache **hit** | 3,584 | 3,609 | 165 | 3,774 | **+63** |
| cache **miss** | absent | 3,609 | 165 | 3,774 | **+3,588** |

The daily counter drains continuously (rolling window, roughly 25 tokens/minute), which
accounts for the gap between the deltas and the raw totals:

- hit: uncached portion = 3,774 − 3,584 = **190** charged; 196,398 + 190 = 196,588 vs 196,461 observed (127 decay).
- miss: full **3,774** charged; 196,347 + 3,774 = 200,121 vs 199,935 observed (186 decay).

Both reconcile. Conclusion: **the daily quota is charged the uncached tokens only.**

## Rate limits observed

| Limit | Value | Notes |
|---|---|---|
| Tokens per day (TPD) | 200,000 | only surfaced in the 429 body, never in headers |
| Tokens per minute (TPM) | 8,000 | `x-ratelimit-limit-tokens`; refills in ~600ms |
| Requests | 1,000 | `x-ratelimit-limit-requests`, reset window observed ~1h30m |

TPM of 8,000 against a ~3,600-token prompt means roughly **two cold calls per minute**;
this is what produced the 429s during earlier migration testing, before the daily limit
was reached.

## Effective calls per day

Per-call charge depends entirely on whether the prefix is warm. Completion tokens are
never cached, so they are always charged (~165 at `reasoning_effort: 'low'`).

| Scenario | Charge per call | Calls/day |
|---|---|---|
| Every call a cache miss | ~3,774 | **~53** |
| Every call a cache hit | ~190 | ~1,050 → capped at **~1,000** by the request limit |
| Realistic burst (1 cold + 9 warm per session) | ~5,484 per 10-query session | **~36 sessions/day** (~360 calls) |

The realistic row is the one to plan against: a participant working through tasks issues
queries in quick succession, so the first is cold and the rest are likely warm. It is a
projection from the two measured per-call costs, not a measured session.

Two caveats that stop this being a hard number:
1. Hit rate is opportunistic. A miss was observed ~20 minutes after a hit on the same
   prefix, despite the documented 2-hour TTL — most likely because 429-blocked requests
   never reach the model and so never refresh the cache, and because caches are per-node.
2. The two apps have **different system prompts**, therefore different cache prefixes.
   Each warms independently, and both draw on the same org-wide quota.

## Why the prompt itself was not restructured

Restructuring was considered and rejected on evidence. The prompt is already an ideal
cacheable prefix within a day:

- Two builds in the same process compare byte-identical; only `${anchor}`, `${weekday}`
  and `${anchorPlus3}` vary, all day-granular.
- 3,349 tokens, well past the 128–1024 minimum.
- Already first in both apps' message arrays.

The first day-varying token appears 1.6% into the string, so across a day boundary only
~54 tokens would stay cached — below the minimum, i.e. worthless. But the cache TTL is
2 hours, so it expires long before the date rolls over regardless. Splitting the static
schema/rules/examples into their own message would therefore gain nothing, while forcing
either stale hardcoded dates in the few-shot examples or splitting the EXAMPLES block
across two messages — both risks to answer quality for no measurable benefit.

## The one change that was load-bearing

Both apps previously appended the strict-retry instruction onto the system message:

```ts
content: isRetry ? `${systemPrompt}\n${STRICT_RETRY_PROMPT}` : systemPrompt
```

That mutates the prefix, so a retry was a **guaranteed** cache miss: ~3,774 tokens charged
instead of ~190, on precisely the calls that had already burned one failed round trip.
The instruction now travels in its own message after the prefix. Content is unchanged;
only which message carries it.

This is narrow — it only affects the retry path, which fires on JSON parse failure — but
it is free, carries no behavioural risk, and removes a guaranteed worst-case charge.

## Practical implications

- The earlier "~50 calls/day" ceiling was measured during A/B testing that constantly
  alternated models and prompts, thrashing the cache. That figure is the **all-miss**
  case and is pessimistic for real use.
- Keeping the system prompt byte-stable is the single highest-value lever; anything that
  perturbs the prefix costs ~20x on that call.
- Because admission uses the pre-discount estimate, the last ~4,000 tokens of the daily
  quota are effectively unusable for a full-prompt call even when the real charge would
  be trivial.
