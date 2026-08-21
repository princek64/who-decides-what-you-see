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
  /** Query that produced this screen (needed after in-place refine; scan-back fails). */
  query?: string;
  intent?: IntentJSON & { layout?: string };
  /** System message is re-sendable (rate limit / 5xx), not a setup failure. */
  retryable?: boolean;
  flights?: Flight[];
  /** Template actually rendered (post-validation / fallback). */
  layout?: Layout;
  itinerary?: ItineraryPair | null;
  alternatives?: AlertAlternatives;
  isExpanded?: boolean;
  timestamp: number;
}

// Browser Groq client (API key via Vite env).
const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  dangerouslyAllowBrowser: true,
});

/** Artificial search pause so results don't appear instantly (matches conversational-ui). */
const SEARCH_STEP_MS = 900;

export const useGenChat = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [csvLoading, setCsvLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  /** Progress step: 'thinking' (parse) or 'searching' (filter). */
  const [loadingPhase, setLoadingPhase] = useState<'thinking' | 'searching'>('thinking');
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [medianCo2, setMedianCo2] = useState<number>(80);

  const { logUserMessage, logAiResponse, logShowAllResults } = useSessionLogger();

  // loadFlightData is once-per-page-load; StrictMode remount reuses the same request.
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

  // "18:00" -> "6pm" for reply copy.
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

  const generateNaturalReply = (intent: IntentJSON, count: number, layout: Layout) => {
    if (count === 0 && layout === 'alert') {
      return 'No flights matched that exactly — here are the closest alternatives I could find.';
    }
    const stopInfo = intent.stops === 0 ? 'direct ' : intent.stops === 1 ? '1-stop ' : '';
    const destination = intent.dest_city || intent.dest_code;
    const destInfo = destination ? ` to ${destination}` : '';
    const priceInfo = intent.max_price ? ` under £${intent.max_price}` : '';
    // Mention every applied constraint so the reply matches the filtered set.
    const timeInfo = describeTimeWindow(intent.departure_after, intent.departure_before);
    const weekendInfo = intent.weekend ? ' departing at the weekend' : '';
    let dateInfo = '';
    if (intent.date) {
      dateInfo = ` on ${formatFlightDate(intent.date)}`;
    } else if (intent.date_from && intent.date_to) {
      if (intent.date_from === intent.date_to) {
        dateInfo = ` on ${formatFlightDate(intent.date_from)}`;
      } else if (isRoundTripItinerary(intent)) {
        // Close round-trip dates are out/return, not a flexible window.
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
    // System prompt must stay byte-identical (cache prefix); STRICT_RETRY is a separate message.
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
      // Headroom (unused tokens free); truncated JSON is a guaranteed parse failure.
      max_tokens: 800,
      // gpt-oss-20b spends reasoning from max_tokens; low effort leaves room for JSON.
      reasoning_effort: 'low',
    });

    return completion.choices[0]?.message?.content ?? '';
  };

  // Shared org Groq quota: retry TPM 429s (same policy as conversational-ui).
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
        // Log each failed attempt on the existing ai_response event.
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

  /** City set, dates empty → ask (no search); keeps intent on the assistant turn. */
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

  // Resolve layout + filter, then land the screen (shared by sendMessage and refineView).
  const applyIntent = async (intent: IntentJSON & { layout?: string }, query: string) => {
    setLoadingPhase('searching');
    await sleep(SEARCH_STEP_MS);

    const resolvedDest = resolveDestCodes(intent);
    const filteredResults = filterAndSortFlights(flights, intent, medianCo2);
    if (!intent.dest_city && resolvedDest.length === 1) {
      intent.dest_city = getCityName(resolvedDest[0]);
    }

    // Validate layout; data may override (empty → alert, no itinerary pair → grid).
    let layout: Layout = (MODEL_LAYOUTS as readonly string[]).includes(intent.layout ?? '')
      ? (intent.layout as Layout)
      : 'grid';

    let itinerary: ItineraryPair | null = null;
    if (layout === 'itinerary') {
      itinerary = buildItinerary(flights, intent, medianCo2);
      if (!itinerary) layout = 'grid'; // no viable pair
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

  // Chip/drill-in refine: merge patch onto base intent (compose, don't replace). No LLM.
  const refineView = async (
    base: ChatMessage,
    patch: Partial<IntentJSON & { layout?: string }>,
    label: string
  ) => {
    const baseIntent = (base.intent ?? {}) as IntentJSON & { layout?: string };
    const merged: IntentJSON & { layout?: string } = {
      ...baseIntent,
      ...patch,
      // Keep rendered layout unless the patch changes it (chips require non-empty results).
      layout: patch.layout ?? base.layout ?? baseIntent.layout,
    };

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', text: label, timestamp: Date.now() },
    ]);
    logUserMessage(label);
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

    // Current canvas intent — typed refinements compose onto it like chips.
    const previousIntent =
      ([...messages].reverse().find((m) => m.role === 'assistant' && m.intent)?.intent ??
        null) as GenIntent | null;

    // Local-first: study / clear city-date / explore skips Groq (typed city wins).
    const localIntent = tryLocalIntent(text, previousIntent != null);
    if (localIntent) {
      try {
        const resolved = resolveTurnIntent(previousIntent, localIntent, text);
        // Undated city → ask (parity with conversational-ui).
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

    // New city / open explore: omit Groq history so the model doesn't keep the old city.
    const historyForGroq = shouldOmitGroqHistory(text, previousIntent) ? [] : messages;

    try {
      let rawContent = await callGroqWithBackoff(text, historyForGroq);
      // Dev-only raw dump (stripped in production).
      if (import.meta.env.DEV) console.log('[Groq Raw Response]', rawContent);

      let intent: GenIntent | null = null;
      try {
        const cleanJsonString = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
        intent = JSON.parse(cleanJsonString);
      } catch (parseErr) {
        console.warn('Groq response was not valid JSON. Retrying...', parseErr);
        // Retry outside inner try so 429 surfaces as rate-limit, not parse failure.
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

      // Typed slots win; new city clears leaked filters.
      intent = resolveTurnIntent(previousIntent, intent, text);

      // Off-topic: polite refusal, not a full-dataset dump
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

      // Too broad unless exploratory (map / destinations).
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

      // Unknown destination
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

      // City set, no dates → ask (same undated policy as conversational-ui).
      if (needsDatesClarification(intent)) {
        askForDates(intent);
        setIsLoading(false);
        return;
      }

      await applyIntent(intent, text);
    } catch (err: any) {
      console.error('[Groq API Error]', err?.status, err);
      const message = friendlyApiError(err);

      // Prefer error banner over replacing the live screen with a system card.
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
