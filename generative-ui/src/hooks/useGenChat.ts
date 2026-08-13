import { useState, useEffect } from 'react';
import Groq from 'groq-sdk';
import { buildSystemPrompt, STRICT_RETRY_PROMPT, MODEL_LAYOUTS } from '../constants/prompts';
import type { Layout } from '../constants/prompts';
import { filterAndSortFlights, resolveDestCodes, isRoundTripItinerary } from './useFlightFilter';
import type { Flight, IntentJSON } from './useFlightFilter';
import { getCityName } from '../lib/airportMap';
import { formatFlightDate } from '../lib/utils';
import { useSessionLogger } from './useSessionLogger';
import {
  MAX_API_RETRIES,
  friendlyApiError,
  isRetryableError,
  retryDelayMs,
  sleep,
} from '../lib/apiRetry';
import { loadFlightData } from '../lib/flightData';
import {
  datesQuestionFor,
  needsDatesClarification,
  resolveTurnIntent,
  shouldOmitGroqHistory,
  tryLocalIntent,
} from '../lib/intentBackstops';
import type { GenIntent } from '../lib/intentBackstops';
import { buildItinerary, nearbyAlternatives } from '../lib/layoutData';
import { placeScreen } from '../lib/screenHistory';
import type { ItineraryPair, AlertAlternatives } from '../lib/layoutData';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  /** The user query this screen answers. Recorded on the screen itself so a
   *  superseded screen can still label itself in the history stack — walking
   *  back through `messages` for the nearest preceding user message stops
   *  working once a screen is refined in place, since the refinement's own
   *  query is appended after it. */
  query?: string;
  intent?: IntentJSON & { layout?: string };
  /** Set on a system message the user can simply re-send (rate limit / 5xx),
   *  as opposed to one that needs the researcher (bad API key). */
  retryable?: boolean;
  flights?: Flight[];
  /** Which template actually rendered (post-validation, post-fallback) */
  layout?: Layout;
  itinerary?: ItineraryPair | null;
  alternatives?: AlertAlternatives;
  isExpanded?: boolean;
  timestamp: number;
}

// Initialize Groq client using browser-compatible config
const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  dangerouslyAllowBrowser: true,
});

/** How long the "searching flights" step is shown before the generated screen
 *  appears. The filter itself is instant; the pause makes the search visible
 *  instead of results materialising the moment the user hits enter. Identical
 *  to SEARCH_STEP_MS in the conversational app, so perceived latency is not a
 *  difference between the two conditions. */
const SEARCH_STEP_MS = 900;

export const useGenChat = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [csvLoading, setCsvLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  /** Which step the progress indicator is showing: parsing the request
   *  ('thinking') or running the search over the dataset ('searching'). */
  const [loadingPhase, setLoadingPhase] = useState<'thinking' | 'searching'>('thinking');
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [medianCo2, setMedianCo2] = useState<number>(80);

  const { logUserMessage, logAiResponse, logShowAllResults } = useSessionLogger();

  // The dataset is fetched and parsed ONCE per page load by loadFlightData;
  // this effect only subscribes to the result. StrictMode's second effect run
  // in development therefore re-uses the same request instead of issuing a
  // second 35 MB download.
  useEffect(() => {
    let cancelled = false;
    setCsvLoading(true);

    loadFlightData()
      .then(({ flights: loaded, medianCo2: median }) => {
        if (cancelled) return;
        setFlights(loaded);
        setMedianCo2(median);
        setCsvLoading(false);
      })
      .catch((err: any) => {
        console.error('Error loading dataset:', err);
        if (!cancelled) setCsvLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // "18:00" -> "6pm", "09:30" -> "9:30am", so a time constraint is restated in
  // the same idiom the user asked in.
  const clockLabel = (hhmm: string): string => {
    const [hRaw, mRaw] = hhmm.split(':');
    const h = parseInt(hRaw, 10);
    const m = parseInt(mRaw, 10) || 0;
    if (isNaN(h)) return hhmm;
    const suffix = h < 12 ? 'am' : 'pm';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
  };

  const describeTimeWindow = (after?: string, before?: string): string => {
    const a = after?.trim();
    const b = before?.trim();
    if (a && b) return ` departing between ${clockLabel(a)} and ${clockLabel(b)}`;
    if (a) return ` departing after ${clockLabel(a)}`;
    if (b) return ` departing before ${clockLabel(b)}`;
    return '';
  };

  // Layout-aware search summaries
  const generateNaturalReply = (intent: IntentJSON, count: number, layout: Layout) => {
    if (count === 0 && layout === 'alert') {
      return 'No flights matched that exactly — here are the closest alternatives I could find.';
    }
    const stopInfo = intent.stops === 0 ? 'direct ' : intent.stops === 1 ? '1-stop ' : '';
    const destination = intent.dest_city || intent.dest_code;
    const destInfo = destination ? ` to ${destination}` : '';
    const priceInfo = intent.max_price ? ` under £${intent.max_price}` : '';
    // Every constraint we actually applied must appear in the sentence, so the
    // stated answer matches the filtered set (the departure-time window and the
    // weekend restriction used to be applied but never mentioned).
    const timeInfo = describeTimeWindow(intent.departure_after, intent.departure_before);
    const weekendInfo = intent.weekend ? ' departing at the weekend' : '';
    let dateInfo = '';
    if (intent.date) {
      dateInfo = ` on ${formatFlightDate(intent.date)}`;
    } else if (intent.date_from && intent.date_to) {
      if (intent.date_from === intent.date_to) {
        dateInfo = ` on ${formatFlightDate(intent.date_from)}`;
      } else if (isRoundTripItinerary(intent)) {
        // Two close-together dates on a round trip are an outbound/return
        // pair, not a flexible window — say so plainly rather than "between
        // X and Y".
        dateInfo = ` — outbound ${formatFlightDate(intent.date_from)}, return ${formatFlightDate(intent.date_to)}`;
      } else {
        dateInfo = ` between ${formatFlightDate(intent.date_from)} and ${formatFlightDate(intent.date_to)}`;
      }
    }
    const base = `Found ${count} ${stopInfo}flight${count === 1 ? '' : 's'}${destInfo}${priceInfo}${timeInfo}${weekendInfo}${dateInfo}`;
    switch (layout) {
      case 'highlight': return `${base}. Here's the best one:`;
      case 'comparison': return `${base}. Here's how your options compare:`;
      case 'calendar': return `${base}. Here's how prices fall across the dates:`;
      case 'trend': return `${base}. Here's the price picture over time:`;
      case 'destinations': return `${base} across ${new Set([destination]).size ? '' : ''}multiple destinations. Here's where you could go:`;
      case 'map': return `${base}. Here's where they can take you:`;
      case 'itinerary': return `${base}. Here's a round trip that works:`;
      case 'budget': return `${base}. Here's what your budget gets you:`;
      case 'ranked': return `${base}. Ranked by best overall match:`;
      case 'multileg': return `${base}. Here's how the connection works:`;
      default: return `${base}, sorted by ${intent.sort_by || 'cheapest'} first.`;
    }
  };

  // True when the intent contains at least one real search constraint.
  const hasSearchConstraints = (intent: IntentJSON): boolean => {
    return Boolean(
      intent.origin_code?.trim() ||
      intent.dest_code?.trim() ||
      intent.dest_city?.trim() ||
      intent.date?.trim() ||
      intent.date_from?.trim() ||
      intent.date_to?.trim() ||
      intent.max_price != null ||
      intent.stops != null ||
      intent.cabin_class?.trim() ||
      intent.departure_after?.trim() ||
      intent.departure_before?.trim() ||
      intent.flexibility?.trim() ||
      intent.low_co2 ||
      intent.airline?.trim()
    );
  };

  const callGroq = async (
    userMessage: string,
    history: ChatMessage[],
    isRetry = false
  ): Promise<string> => {
    const userHistory = history
      .filter((msg) => msg.role === 'user')
      .slice(-3)
      .map((msg) => ({
        role: 'user' as const,
        content: msg.text,
      }));

    const systemPrompt = buildSystemPrompt();
    // See the matching note in conversational-ui's useChat. The system prompt
    // is the cacheable prefix and must stay byte-identical across calls,
    // including retries, so the strict-retry instruction gets its own message
    // rather than being appended onto the prefix. userHistory stays after it:
    // it varies per turn, so it can only ever sit outside the cached span.
    const messagesPayload = [
      { role: 'system' as const, content: systemPrompt },
      ...(isRetry ? [{ role: 'system' as const, content: STRICT_RETRY_PROMPT }] : []),
      ...userHistory,
      { role: 'user' as const, content: userMessage },
    ];

    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: messagesPayload,
      temperature: 0.1,
      // Headroom, not a target — see the matching note in conversational-ui's
      // useChat. Unused ceiling is free; a truncated object is a guaranteed
      // parse failure.
      max_tokens: 800,
      // See the matching note in conversational-ui's useChat: gpt-oss-20b
      // spends reasoning tokens out of max_tokens, and at default effort it
      // exhausted this 300-token budget before emitting any JSON. Low effort
      // keeps reasoning small enough that the layout JSON always fits.
      reasoning_effort: 'low',
    });

    return completion.choices[0]?.message?.content ?? '';
  };

  // Both research apps share ONE org-level Groq quota, so a 429 mid-session is
  // routine rather than exceptional — and a participant seeing a raw "could not
  // reach the AI service" alert loses the thread of the task. Wait out the
  // window the API names and try again (twice), then say something useful.
  // Identical policy to the conversational app (../lib/apiRetry), so a rate
  // limit does not become a difference between the two conditions.
  const callGroqWithBackoff = async (
    userMessage: string,
    history: ChatMessage[],
    isRetry = false
  ): Promise<string> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await callGroq(userMessage, history, isRetry);
      } catch (err: any) {
        const status: number | undefined = err?.status;
        const retryable = isRetryableError(err);
        // Every failed attempt is logged through the EXISTING ai_response event
        // (status code + ISO timestamp), so a session log shows exactly where
        // the rate limit interrupted the participant.
        logAiResponse({
          api_error: true,
          status: status ?? null,
          attempt: attempt + 1,
          retryable,
          daily_quota: !retryable && status === 429,
          message: String(err?.message ?? err).slice(0, 300),
          at: new Date().toISOString(),
        });
        if (!retryable || attempt >= MAX_API_RETRIES) throw err;
        await sleep(retryDelayMs(err, attempt));
      }
    }
  };

  /** City set, dates empty → ask (same policy as conversational-ui). Does not
   *  search; keeps the unresolved intent on the assistant turn for logging. */
  const askForDates = (intent: GenIntent) => {
    const text = datesQuestionFor(intent);
    logAiResponse({ ...intent, layout_rendered: 'none', awaiting_dates: true });
    setMessages((prev) => [
      ...prev,
      {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text,
        intent,
        timestamp: Date.now(),
      },
    ]);
  };

  // Filter + generative-layout pipeline for an already-resolved intent, then
  // land the assistant screen. Shared by fresh LLM queries (sendMessage) and
  // deterministic refinements (refineView) so both compose the SAME way.
  //
  // `query` is the wording that produced this screen — the typed message, or a
  // chip's label. It rides on the screen so a superseded one can label itself
  // in the history stack.
  const applyIntent = async (intent: IntentJSON & { layout?: string }, query: string) => {
    // Everything the caller answers without looking anything up (off-topic,
    // too-broad, unknown city, missing dates) has already returned by now.
    // From here it is actually searching the dataset, so show that step before
    // the screen lands.
    setLoadingPhase('searching');
    await sleep(SEARCH_STEP_MS);

    const resolvedDest = resolveDestCodes(intent);
    const filteredResults = filterAndSortFlights(flights, intent, medianCo2);
    if (!intent.dest_city && resolvedDest.length === 1) {
      intent.dest_city = getCityName(resolvedDest[0]);
    }

    // ── Generative step: validate the model's layout choice, then let the
    // data override it where the model can't know better ──
    let layout: Layout = (MODEL_LAYOUTS as readonly string[]).includes(intent.layout ?? '')
      ? (intent.layout as Layout)
      : 'grid';

    let itinerary: ItineraryPair | null = null;
    if (layout === 'itinerary') {
      itinerary = buildItinerary(flights, intent, medianCo2);
      if (!itinerary) layout = 'grid'; // no viable pair — degrade gracefully
    }

    let alternatives: AlertAlternatives | undefined;
    if (layout !== 'itinerary' && filteredResults.length === 0) {
      layout = 'alert';
      alternatives = nearbyAlternatives(flights, intent, medianCo2);
    }

    logAiResponse({ ...intent, layout_rendered: layout });

    const aiReply = generateNaturalReply(intent, filteredResults.length, layout);

    setMessages((prev) =>
      placeScreen(prev, {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text: aiReply,
        query,
        intent: intent || {},
        flights: filteredResults,
        layout,
        itinerary,
        alternatives,
        isExpanded: false,
        timestamp: Date.now(),
      })
    );
  };

  // Deterministic refinement of the CURRENT view (the "Refine this view" chips
  // and the destination/map/calendar drill-ins). The patch is merged ONTO the
  // base intent, so every prior slot (destination, dates, price cap, stops,
  // low_co2…) persists unless the patch explicitly overrides it — this is the
  // whole point: chips compose, they don't replace. No LLM round-trip, so the
  // composition is exact and reproducible. Still logs as an ordinary
  // user_message + ai_response, exactly like a typed query.
  const refineView = async (
    base: ChatMessage,
    patch: Partial<IntentJSON & { layout?: string }>,
    label: string
  ) => {
    const baseIntent = (base.intent ?? {}) as IntentJSON & { layout?: string };
    const merged: IntentJSON & { layout?: string } = {
      ...baseIntent,
      ...patch,
      // Keep the template the user is refining unless the patch changes it.
      // base.layout is the rendered (post-fallback) layout the user can see;
      // it is never 'alert' here because refine chips require a non-empty result.
      layout: patch.layout ?? base.layout ?? baseIntent.layout,
    };

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', text: label, timestamp: Date.now() },
    ]);
    logUserMessage(label);
    // A chip refinement skips the LLM, so it starts at the search step — but it
    // still shows the search running rather than swapping the screen instantly.
    setLoadingPhase('searching');
    setIsLoading(true);
    try {
      await applyIntent(merged, label);
    } finally {
      setIsLoading(false);
      setLoadingPhase('thinking');
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    setError(null);

    const userMsgId = `user-${Date.now()}`;
    const newMessages: ChatMessage[] = [
      ...messages,
      { id: userMsgId, role: 'user', text, timestamp: Date.now() },
    ];
    setMessages(newMessages);
    logUserMessage(text);
    setLoadingPhase('thinking');
    setIsLoading(true);

    // The intent behind the screen currently on the canvas. A typed refinement
    // composes onto it the same way a "Refine this view" chip composes onto
    // base.intent in refineView — until now only the chips did, so typing the
    // refinement instead of clicking it silently lost every established slot.
    const previousIntent =
      ([...messages].reverse().find((m) => m.role === 'assistant' && m.intent)?.intent ??
        null) as GenIntent | null;

    // Local-first: study tasks and clear city/date / explore turns never call
    // Groq. Also the main same-thread city fix — typed destination wins without
    // the model echoing Barcelona from earlier userHistory.
    const localIntent = tryLocalIntent(text, previousIntent != null);
    if (localIntent) {
      try {
        const resolved = resolveTurnIntent(previousIntent, localIntent, text);
        // Align with conversational-ui: never silently search-all when a city
        // is set but the turn (or a mid-task drop) left dates empty.
        if (needsDatesClarification(resolved)) {
          logAiResponse({
            ...resolved,
            local_intent: true,
            skipped_groq: true,
            layout_rendered: 'none',
            awaiting_dates: true,
          });
          setMessages((prev) => [
            ...prev,
            {
              id: `ai-${Date.now()}`,
              role: 'assistant',
              text: datesQuestionFor(resolved),
              intent: resolved,
              timestamp: Date.now(),
            },
          ]);
        } else {
          logAiResponse({ ...resolved, local_intent: true, skipped_groq: true });
          await applyIntent(resolved, text);
        }
      } finally {
        setIsLoading(false);
        setLoadingPhase('thinking');
      }
      return;
    }

    // When the user names a NEW city (or starts an open explore), prior user
    // turns in the Groq payload only teach the model to keep the old city.
    const historyForGroq = shouldOmitGroqHistory(text, previousIntent) ? [] : messages;

    try {
      let rawContent = await callGroqWithBackoff(text, historyForGroq);
      // Dev-only: dumps the full raw model JSON per query. Gated so it never
      // fires during a participant session (production build sets DEV = false).
      if (import.meta.env.DEV) console.log('[Groq Raw Response]', rawContent);

      let intent: GenIntent | null = null;
      try {
        const cleanJsonString = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
        intent = JSON.parse(cleanJsonString);
      } catch (parseErr) {
        console.warn('Groq response was not valid JSON. Retrying...', parseErr);
        // The API call is deliberately OUTSIDE the inner try: a rate limit on
        // the retry must surface as the rate-limit notice, not be swallowed and
        // reported to the participant as "I couldn't understand that query".
        rawContent = await callGroqWithBackoff(text, historyForGroq, true);
        try {
          const cleanJsonStringRetry = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
          intent = JSON.parse(cleanJsonStringRetry);
        } catch (retryErr) {
          console.error('Groq retry also failed parsing:', retryErr);
        }
      }

      if (!intent) {
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            text: "I couldn't understand that query. Could you rephrase it?",
            timestamp: Date.now(),
          },
        ]);
        setIsLoading(false);
        return;
      }

      // Typed city / price / time / dates win; new city clears leaked filters.
      // Replaces the thin return-leg-only / blank-date-only backstops that let
      // Task 2 keep showing Barcelona after Task 1 in the same chat.
      intent = resolveTurnIntent(previousIntent, intent, text);

      // Off-topic messages: answer politely instead of dumping the whole dataset
      if (intent.off_topic) {
        logAiResponse({ ...intent, layout_rendered: 'none' });
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            text: "I'm a flight search assistant, so I can't help with that — but I can find you flights from London to over 100 European destinations. Try asking something like \"cheapest direct flight to Barcelona in August\".",
            timestamp: Date.now(),
          },
        ]);
        setIsLoading(false);
        return;
      }

      // No usable constraints: ask the user to narrow down — UNLESS the model
      // chose an exploratory layout (map / destinations), where "everything
      // reachable from London" is exactly what the user asked to see.
      const exploratory = intent.layout === 'map' || intent.layout === 'destinations';
      if (!hasSearchConstraints(intent) && !exploratory) {
        logAiResponse({ ...intent, layout_rendered: 'none' });
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            text: 'That search is a little too broad for me. Could you narrow it down with a destination, a date, or a budget? For example: "direct flights to Rome next weekend" or "where can I fly for under £50 in September?"',
            timestamp: Date.now(),
          },
        ]);
        setIsLoading(false);
        return;
      }

      // Destination mentioned but not in our route network
      const wantsDestination = Boolean(intent.dest_city?.trim() || intent.dest_code?.trim());
      const resolvedDest = resolveDestCodes(intent);
      if (wantsDestination && resolvedDest.length === 0) {
        const askedFor = intent.dest_city || intent.dest_code;
        logAiResponse({ ...intent, layout_rendered: 'none' });
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            text: `I couldn't find "${askedFor}" in this flight network. I cover flights from London to European destinations like Paris, Barcelona, Rome, Amsterdam and about 100 more. Try one of those?`,
            timestamp: Date.now(),
          },
        ]);
        setIsLoading(false);
        return;
      }

      // City set, no dates → ask (do not search the whole remaining window).
      // Same undated policy as conversational-ui; open explore has no city.
      if (needsDatesClarification(intent)) {
        askForDates(intent);
        setIsLoading(false);
        return;
      }

      await applyIntent(intent, text);
    } catch (err: any) {
      console.error('[Groq API Error]', err?.status, err);
      const message = friendlyApiError(err);

      // This canvas renders exactly ONE screen: the newest assistant/system
      // message. Appending a system message therefore DESTROYS the layout the
      // participant was working with — the whole generated screen is replaced
      // by an error card. So the failure is surfaced as a banner over the
      // existing screen instead, and only takes the canvas when there is no
      // screen yet to preserve.
      const hasScreen = messages.some((m) => m.role === 'assistant');
      setError(message);
      if (!hasScreen) {
        setMessages((prev) => [
          ...prev,
          {
            id: `sys-${Date.now()}`,
            role: 'system',
            text: message,
            retryable: isRetryableError(err),
            timestamp: Date.now(),
          },
        ]);
      }
    } finally {
      setIsLoading(false);
      setLoadingPhase('thinking');
    }
  };

  const toggleExpandMessage = (messageId: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === messageId) {
          const nextExpanded = !msg.isExpanded;
          if (nextExpanded && msg.flights) {
            logShowAllResults(msg.flights.length);
          }
          return { ...msg, isExpanded: nextExpanded };
        }
        return msg;
      })
    );
  };

  const clearConversation = () => {
    setMessages([]);
    setError(null);
  };

  return {
    flights,
    csvLoading,
    isLoading,
    loadingPhase,
    error,
    dismissError: () => setError(null),
    messages,
    medianCo2,
    sendMessage,
    refineView,
    clearConversation,
    toggleExpandMessage,
  };
};
