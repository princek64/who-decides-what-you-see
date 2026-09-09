import { useState, useEffect } from 'react';
import Groq from 'groq-sdk';
import { GROQ_MODEL } from '@shared/groq';
import { buildSystemPrompt, STRICT_RETRY_PROMPT } from '../constants/prompts';
import { filterAndSortFlights, resolveDestCodes } from './useFlightFilter';
import type { Flight, IntentJSON } from './useFlightFilter';
import { getCityName } from '../lib/airportMap';
import {
  applyWordingBackstops,
  isAddReturnLegQuery,
  destinationFromText,
  dateFromText,
  isShowAllQuery,
  isPickBestQuery,
  isDropDirectQuery,
  isDirectOnlyQuery,
  classifyOrigin,
  datesQuestionFor,
  firstMissingRequiredSlot,
  londonAirportLabel,
  resolveTurnSlot,
  slotToIntent,
  SLOT_QUESTIONS,
} from '../lib/slots';
import type { SlotJSON } from '../lib/slots';
import { buildComparisonSentence, buildCheapestWhenSentence, cheapestBy } from '../lib/insights';
import {
  MAX_API_RETRIES,
  friendlyApiError,
  isRetryableError,
  retryDelayMs,
  sleep,
} from '../lib/apiRetry';
import { tryLocalSlot } from '../lib/studyTasks';
import { useSessionLogger } from './useSessionLogger';
import { buildProseAnswer, describeConstraints } from '../lib/prose';
import {
  DETAIL_NO_CONTEXT,
  buildDetailAnswer,
  detectDetailField,
  resolveTargets,
} from '../lib/detailAnswers';
import type { DetailField } from '../lib/detailAnswers';
import { cheapestPair, splitLegs } from '../lib/returnGroups';
import { formatFlightDate } from '../lib/utils';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  intent?: IntentJSON;
  slot?: SlotJSON;
  offerLondon?: boolean;
  awaitingSlot?: 'destination' | 'dates';
  retryable?: boolean;
  preface?: string;
  flights?: Flight[];
  /** Full result table instead of a summarised preview ("show me all"). */
  showAll?: boolean;
  timestamp: number;
}

const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  dangerouslyAllowBrowser: true,
});

const SEARCH_STATUS_MS = 2200;
/** Shorter hold for clarify/detail replies vs full search wait. */
const REPLY_STATUS_MS = 1000;

/** Yield past the next paint so Searching is visible before a local search finishes. */
const nextPaint = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

/** Hold in-thread status until visible for at least `minMs`. */
const holdStatus = async (loadingSince: number, minMs: number): Promise<void> => {
  const remaining = minMs - (performance.now() - loadingSince);
  if (remaining > 0) await sleep(remaining);
};

let flightsDataPromise: Promise<any> | null = null;

export const useChat = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [csvLoading, setCsvLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<'thinking' | 'searching'>('thinking');
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [medianCo2, setMedianCo2] = useState<number>(80);

  const { logUserMessage, logAiResponse } = useSessionLogger();

  // Load flight JSON on mount
  useEffect(() => {
    let ignore = false;

    const loadFlights = async () => {
      try {
        setCsvLoading(true);
        if (!flightsDataPromise) {
          flightsDataPromise = fetch('/flightlab-study-flights.json').then((response) => {
            if (!response.ok) {
              throw new Error('Failed to fetch dataset');
            }
            return response.json();
          });
        }
        const data = await flightsDataPromise;
        if (ignore) return;
        
        const colMap = data.meta.columns.reduce((acc: Record<string, number>, name: string, index: number) => {
          acc[name] = index;
          return acc;
        }, {});

        const parsedData: Flight[] = [];
        const rows = data.rows;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const status = row[colMap.flight_status];
          if (status === 'Cancelled') continue;
          
          parsedData.push({
            flight_id: row[colMap.flight_id],
            flight_number: row[colMap.flight_number],
            origin_code: row[colMap.origin_code],
            origin_terminal: row[colMap.origin_terminal],
            dest_code: row[colMap.dest_code],
            date: row[colMap.date],
            departure_time: row[colMap.departure_time],
            arrival_time: row[colMap.arrival_time],
            arrival_date: row[colMap.arrival_date],
            duration_mins: row[colMap.duration_mins],
            duration_formatted: row[colMap.duration_formatted],
            direction: row[colMap.direction],
            airline_name: row[colMap.airline_name],
            airline_tier: row[colMap.airline_tier],
            aircraft_type: row[colMap.aircraft_type],
            stops: row[colMap.stops],
            layover_details: row[colMap.layover_details],
            cabin_class: row[colMap.cabin_class],
            price_gbp: row[colMap.price_gbp],
            seats_remaining: row[colMap.seats_remaining],
            baggage_policy: row[colMap.baggage_policy],
            meal: row[colMap.meal],
            flexibility_policy: row[colMap.flexibility_policy],
            co2_kg: row[colMap.co2_kg],
            demand_indicator: row[colMap.demand_indicator],
            flight_status: status,
            departure_mins_from_midnight: row[colMap.departure_mins_from_midnight]
          });
        }
        
        setMedianCo2(data.meta.medianCo2ExcludingCancelled);

        setFlights(parsedData);
        setCsvLoading(false);
      } catch (err: any) {
        console.error('Error loading JSON:', err);
        setCsvLoading(false);
      }
    };

    loadFlights();
    return () => {
      ignore = true;
    };
  }, []);

  const generateEmptyReply = (intent: IntentJSON) => {
    const stopInfo = intent.stops === 0 ? 'direct ' : intent.stops === 1 ? '1-stop ' : '';
    const suggestions = [
      intent.stops === 0 ? 'allow a stop' : null,
      intent.max_price ? 'a higher budget' : null,
      'a different date',
      'a nearby destination',
    ].filter(Boolean) as string[];
    return [
      `**No ${stopInfo}flights${describeConstraints(intent)}.**`,
      'Nothing matches all of that. Try:',
      suggestions.map((s) => `- ${s}`).join('\n'),
    ].join('\n\n');
  };

  const callGroq = async (userMessage: string, isRetry = false): Promise<string> => {
    const systemPrompt = buildSystemPrompt();
    // Keep system prompt byte-identical for cache; retry instruction is a separate message.
    const messagesPayload = [
      { role: 'system' as const, content: systemPrompt },
      ...(isRetry ? [{ role: 'system' as const, content: STRICT_RETRY_PROMPT }] : []),
      { role: 'user' as const, content: userMessage },
    ];

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: messagesPayload,
      temperature: 0,
      // Headroom only (unused tokens free). 400 truncated mid-JSON on real queries.
      max_tokens: 1000,
      // Low effort: default reasoning ate max_tokens before any JSON was emitted.
      reasoning_effort: 'low',
    });

    return completion.choices[0]?.message?.content ?? '';
  };

  const callGroqWithBackoff = async (userMessage: string, isRetry = false): Promise<string> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await callGroq(userMessage, isRetry);
      } catch (err: any) {
        const status: number | undefined = err?.status;
        const retryable = isRetryableError(err);

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

  const pushAssistant = (fields: Partial<ChatMessage> & { text: string }) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        timestamp: Date.now(),
        ...fields,
      },
    ]);
  };

  const handleParsedSlot = async (
    slot: SlotJSON,
    meta: Record<string, unknown> = {},
    loadingSince = performance.now()
  ) => {
    logAiResponse({ ...slot, ...meta });

    // Brief status hold so clarify/refuse replies don't flash instantly.
    const holdBriefReply = async () => {
      await nextPaint();
      await holdStatus(loadingSince, REPLY_STATUS_MS);
    };

    if (slot.off_topic) {
      await holdBriefReply();
      pushAssistant({
        text: "I'm a flight search assistant, so I can't help with that — but I can find you flights from London to over 100 European destinations. Try asking something like \"cheapest direct flight to Barcelona in August\".",
      });
      return;
    }

    // Dataset is London-only.
    const origin = classifyOrigin(slot.origin);
    if (origin.kind === 'foreign') {
      await holdBriefReply();
      pushAssistant({
        text: `I only have flights departing London right now. Want me to search from London instead?`,
        slot,
        offerLondon: true,
      });
      return;
    }

    const missing = firstMissingRequiredSlot(slot);
    if (missing) {
      await holdBriefReply();
      const text = missing === 'dates' ? datesQuestionFor(slot) : SLOT_QUESTIONS[missing];
      pushAssistant({ text, slot, awaitingSlot: missing });
      return;
    }

    // Specific London airport → origin_code; generic London stays unfiltered.
    const intent = slotToIntent(slot);
    if (origin.kind === 'london-code') intent.origin_code = origin.code;

    // Compare must include both direct and connecting.
    if (slot.compare && slot.direct_only == null) intent.stops = undefined;

    const resolvedDest = resolveDestCodes(intent);
    const namedDestination = Boolean(String(slot.destination ?? '').trim());
    if (namedDestination && resolvedDest.length === 0) {
      await holdBriefReply();
      const askedFor = slot.destination;
      pushAssistant({
        text: `I couldn't find "${askedFor}" in this flight network. I cover flights from London to European destinations like Paris, Barcelona, Rome, Amsterdam and about 100 more. Try one of those?`,
        slot,
      });
      return;
    }

    if (!intent.dest_city && resolvedDest.length === 1) {
      intent.dest_city = getCityName(resolvedDest[0]);
    }

    setLoadingPhase('searching');
    // Local searches are instant — paint then hold Searching so the fade is visible.
    await nextPaint();
    await holdStatus(loadingSince, SEARCH_STATUS_MS);

    const filteredResults = filterAndSortFlights(flights, intent, medianCo2);

    if (filteredResults.length === 0) {
      pushAssistant({ text: generateEmptyReply(intent), intent, slot, flights: [] });
      return;
    }

    const destLabel =
      intent.dest_city || (resolvedDest.length === 1 ? getCityName(resolvedDest[0]) : '');
    let insight: string | null = null;
    if (slot.compare) {
      insight = buildComparisonSentence(filteredResults, destLabel);
    } else if (slot.cheapest_when) {
      insight = buildCheapestWhenSentence(filteredResults, destLabel, Boolean(slot.weekend));
    }

    const prose = buildProseAnswer(filteredResults, intent, {
      skipPairLead: Boolean(slot.cheapest_when),
    });
    pushAssistant({
      text: insight ? `${insight}\n\n${prose.text}` : prose.text,
      preface: insight ?? undefined,
      intent,
      slot,
      flights: filteredResults,
    });
  };

  const runDeterministicSearch = async (slot: SlotJSON, echo: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', text: echo, timestamp: Date.now() },
    ]);
    logUserMessage(echo);
    setLoadingPhase('searching');
    setIsLoading(true);
    const loadingSince = performance.now();
    await nextPaint();
    try {
      await handleParsedSlot(slot, {}, loadingSince);
    } finally {
      setIsLoading(false);
      setLoadingPhase('thinking');
    }
  };

  /**
   * Follow-up "show me the return tickets": flip round_trip on the previous
   * slot (no model call) so dest/dates/constraints cannot drift. Clears return_only.
   */
  const addReturnLeg = async (): Promise<boolean> => {
    const source = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant' && m.slot && m.flights && m.flights.length > 0);
    const previous = source?.slot;
    if (!previous || !hasSearchContext(previous)) return false;

    setLoadingPhase('searching');
    setIsLoading(true);
    const loadingSince = performance.now();
    await nextPaint();
    try {
      await handleParsedSlot(
        { ...previous, round_trip: true, return_only: false, missing: [] },
        {},
        loadingSince
      );
    } finally {
      setIsLoading(false);
      setLoadingPhase('thinking');
    }
    return true;
  };

  /** Previous search has dest + dates so an inbound leg is fully determined. */
  const hasSearchContext = (slot: SlotJSON): boolean =>
    Boolean(String(slot.destination ?? '').trim()) &&
    Boolean((slot.date_from ?? '').trim() || (slot.date_to ?? '').trim());

  /** Newest assistant message that produced results (expand / pick-best target). */
  const currentResultMessage = (): ChatMessage | undefined =>
    [...messages].reverse().find((m) => m.role === 'assistant' && m.flights && m.flights.length > 0);

  /** Lay out the current result set in full — no model call, no re-filter. */
  const showAllResults = () => {
    const source = currentResultMessage();
    if (!source?.flights?.length) {
      pushAssistant({
        text: "I don't have a search on screen yet, so there's nothing to list. What are you looking for? Tell me where you'd like to fly and when — for example \"direct flights to Barcelona on 16 October\".",
      });
      logAiResponse({ show_all: true, pool_size: 0, at: new Date().toISOString() });
      return;
    }

    const intent = source.intent ?? {};
    logAiResponse({
      show_all: true,
      pool_size: source.flights.length,
      ...intent,
      at: new Date().toISOString(),
    });
    const prose = buildProseAnswer(source.flights, intent, { showAll: true });
    pushAssistant({
      text: prose.text,
      intent,
      slot: source.slot,
      flights: source.flights,
      showAll: true,
    });
  };

  /** Recommend from on-screen results — no model call / re-search. */
  const pickBestForMe = () => {
    const source = currentResultMessage();
    if (!source?.flights?.length) {
      pushAssistant({
        text: "I don't have a search on screen yet, so there's nothing to pick. Tell me where you'd like to fly and when first.",
      });
      logAiResponse({ pick_best: true, pool_size: 0, at: new Date().toISOString() });
      return;
    }

    const intent = source.intent ?? {};
    const dest =
      intent.dest_city ||
      (source.slot?.destination ? String(source.slot.destination) : '') ||
      '';

    if (intent.direction === 'both' || source.slot?.round_trip) {
      const pair = cheapestPair(splitLegs(source.flights));
      if (pair) {
        const verdict = `**I'd take this return${dest ? ` to ${dest}` : ''} — £${pair.total.toFixed(2)} total**`;
        const text = [
          verdict,
          [
            `- **Outbound:** **${pair.outbound.airline_name} ${pair.outbound.flight_number}** · ${formatFlightDate(pair.outbound.date)} · ${pair.outbound.departure_time} · **£${pair.outbound.price_gbp.toFixed(2)}**`,
            `- **Return:** **${pair.inbound.airline_name} ${pair.inbound.flight_number}** · ${formatFlightDate(pair.inbound.date)} · ${pair.inbound.departure_time} · **£${pair.inbound.price_gbp.toFixed(2)}**`,
          ].join('\n'),
          "It's the cheapest pair in the current results.",
        ].join('\n\n');
        logAiResponse({
          pick_best: true,
          kind: 'round_trip',
          total: pair.total,
          at: new Date().toISOString(),
        });
        // Short preface — FlightProse already leads with pair total + leg tables.
        pushAssistant({
          text,
          intent,
          slot: source.slot,
          flights: [pair.outbound, pair.inbound],
          preface: verdict,
        });
        return;
      }
    }

    if (source.slot?.compare) {
      const insight = buildComparisonSentence(source.flights, dest);
      if (insight) {
        logAiResponse({ pick_best: true, kind: 'compare', at: new Date().toISOString() });
        pushAssistant({
          text: insight,
          intent,
          slot: source.slot,
          flights: source.flights.filter((f) => f.direction !== 'return'),
          preface: insight,
        });
        return;
      }
    }

    const pool = source.flights.filter((f) => f.direction !== 'return');
    const best = cheapestBy(pool.length ? pool : source.flights);
    if (!best) {
      pushAssistant({ text: "I couldn't pick a favourite from what's on screen — try refining the search." });
      return;
    }
    const verdict = `**I'd take ${best.airline_name} ${best.flight_number}${dest ? ` to ${dest}` : ''}**`;
    const text = [
      verdict,
      [
        `- **${formatFlightDate(best.date)}** · departs ${best.departure_time} · ${best.stops === 0 ? 'direct' : `${best.stops}-stop`} · **£${best.price_gbp.toFixed(2)}**`,
      ].join('\n'),
      "It's the cheapest option in the current results.",
    ].join('\n\n');
    logAiResponse({
      pick_best: true,
      kind: 'one_way',
      flight_id: best.flight_id,
      at: new Date().toISOString(),
    });
    pushAssistant({
      text,
      intent,
      slot: source.slot,
      flights: [best],
      preface: verdict,
    });
  };

  const currentPool = (): Flight[] =>
    [...messages].reverse().find((m) => m.role === 'assistant' && m.flights?.length)?.flights ?? [];

  const NEW_SEARCH_CUE =
    /\b(?:flights?|fly|flying|travel)\s+(?:to|from)\b|\b(?:find|search|show|book)\b.*\b(?:flight|flights)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\b(?:tomorrow|next week|this weekend|next weekend|next month)\b/i;

  // Referent to something already answered
  const REFERENT_CUE = /\b(?:that|those|these|this|it|its|it's|them|they|the one|ones)\b/i;

  const isFollowUpDetail = (text: string, pool: Flight[]): boolean => {
    // "stop"/"direct" search refinements are not attribute lookups.
    if (isDropDirectQuery(text) || isDirectOnlyQuery(text)) return false;
    const field = detectDetailField(text);
    if (!field || NEW_SEARCH_CUE.test(text)) return false;
    const unambiguous: DetailField[] = ['baggage', 'aircraft', 'flexibility', 'co2', 'seats', 'demand'];
    return (
      unambiguous.includes(field) ||
      REFERENT_CUE.test(text) ||
      resolveTargets(text, pool).length > 0
    );
  };

  /** Post-model detail turn: log slot, then answer from data. */
  const handleDetailTurn = async (
    text: string,
    pool: Flight[],
    field: DetailField | null,
    slot: SlotJSON
  ) => {
    logAiResponse(slot);
    answerFromData(text, pool, field, slot.detail_target ?? null);
  };

  const answerFromData = (
    text: string,
    pool: Flight[],
    field?: DetailField | null,
    targetHint?: string | null
  ) => {
    const answer = buildDetailAnswer(text, pool, field, targetHint);
    // Enrich existing ai_response event — no new event types.
    logAiResponse({
      detail_lookup: true,
      field: field ?? detectDetailField(text),
      target: targetHint ?? null,
      matched: Boolean(answer),
      pool_size: pool.length,
      at: new Date().toISOString(),
    });
    pushAssistant({ text: answer ?? DETAIL_NO_CONTEXT });
  };

  const parseSlot = (raw: string): SlotJSON | null => {
    try {
      const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(clean) as SlotJSON;
    } catch {
      return null;
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

    const pool = currentPool();
    if (pool.length > 0 && isFollowUpDetail(text, pool)) {
      setIsLoading(true);
      const loadingSince = performance.now();
      try {
        await nextPaint();
        await holdStatus(loadingSince, REPLY_STATUS_MS);
        answerFromData(text, pool);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Add return leg to on-screen search when message names no dest/date of its own.
    if (
      isAddReturnLegQuery(text) &&
      !destinationFromText(text) &&
      !dateFromText(text) &&
      (await addReturnLeg())
    ) {
      return;
    }

    // Expand current results locally — avoid model re-summarising the same set.
    if (isShowAllQuery(text)) {
      setIsLoading(true);
      const loadingSince = performance.now();
      try {
        await nextPaint();
        await holdStatus(loadingSince, REPLY_STATUS_MS);
        showAllResults();
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (isPickBestQuery(text) && !destinationFromText(text) && !dateFromText(text)) {
      setIsLoading(true);
      const loadingSince = performance.now();
      try {
        await nextPaint();
        await holdStatus(loadingSince, REPLY_STATUS_MS);
        pickBestForMe();
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setLoadingPhase('thinking');
    setIsLoading(true);
    const loadingSince = performance.now();
    await nextPaint();

    const previousSlot =
      [...messages].reverse().find((m) => m.role === 'assistant' && m.slot)?.slot ?? null;

    // Local slot when wording + context is enough — skips Groq to save daily quota.
    const localSlot = tryLocalSlot(text, previousSlot != null);
    if (localSlot) {
      try {
        await handleParsedSlot(
          resolveTurnSlot(previousSlot, localSlot, text),
          {
            local_slot: true,
            skipped_groq: true,
          },
          loadingSince
        );
      } finally {
        setIsLoading(false);
        setLoadingPhase('thinking');
      }
      return;
    }

    try {
      let rawContent = await callGroqWithBackoff(text);

      if (import.meta.env.DEV) console.log('[Groq Raw Response]', rawContent);

      let slot = parseSlot(rawContent);
      if (!slot) {
        console.warn('Groq response was not valid JSON. Retrying...');
        rawContent = await callGroqWithBackoff(text, true);
        slot = parseSlot(rawContent);
      }

      if (!slot) {
        logAiResponse({ parse_error: true, raw: rawContent });
        pushAssistant({ text: "I couldn't understand that query. Could you rephrase it?" });
        return;
      }

      const modelField = String(slot.detail_field ?? '').trim() as DetailField | '';
      const wordField = detectDetailField(text);

      const wordingAgrees =
        wordField != null ||
        (Boolean(slot.detail_target) && resolveTargets(text, pool, slot.detail_target).length > 0);
      // "include the ones with a stop" mentions stops but is a search refinement.
      if (
        pool.length > 0 &&
        wordingAgrees &&
        (modelField || slot.off_topic) &&
        !isDropDirectQuery(text) &&
        !isDirectOnlyQuery(text)
      ) {
        await handleDetailTurn(text, pool, modelField || wordField, slot);
        return;
      }

      applyWordingBackstops(slot, text);

      await handleParsedSlot(resolveTurnSlot(previousSlot, slot, text), {}, loadingSince);
    } catch (err: any) {
      console.error('[Groq API Error]', err?.status, err);
      const message = friendlyApiError(err);
      setError(message);


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
    } finally {
      setIsLoading(false);
      setLoadingPhase('thinking');
    }
  };

  const refineOrigin = (sourceSlot: SlotJSON, originCode: string) => {
    const echo = originCode
      ? `Only flights departing ${londonAirportLabel(originCode)} (${originCode})`
      : 'Flights from all London airports';
    void runDeterministicSearch({ ...sourceSlot, origin: originCode || null }, echo);
  };

  const searchFromLondon = (sourceSlot: SlotJSON) => {
    void runDeterministicSearch({ ...sourceSlot, origin: null }, 'Search from London instead');
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
    messages,
    medianCo2,
    sendMessage,
    refineOrigin,
    searchFromLondon,
    clearConversation,
  };
};
