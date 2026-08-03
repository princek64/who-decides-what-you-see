import { useState, useEffect } from 'react';
import Groq from 'groq-sdk';
import { buildSystemPrompt, STRICT_RETRY_PROMPT } from '../constants/prompts';
import { filterAndSortFlights, resolveDestCodes } from './useFlightFilter';
import type { Flight, IntentJSON } from './useFlightFilter';
import { getCityName } from '../lib/airportMap';
import {
  applyWordingBackstops,
  classifyOrigin,
  firstMissingRequiredSlot,
  londonAirportLabel,
  resolveTurnSlot,
  slotToIntent,
  SLOT_QUESTIONS,
} from '../lib/slots';
import type { SlotJSON } from '../lib/slots';
import { buildComparisonSentence, buildCheapestWhenSentence } from '../lib/insights';
import {
  MAX_API_RETRIES,
  friendlyApiError,
  isRetryableStatus,
  retryDelayMs,
  sleep,
} from '../lib/apiRetry';
import { useSessionLogger } from './useSessionLogger';
import { buildProseAnswer, describeConstraints } from '../lib/prose';
import {
  DETAIL_NO_CONTEXT,
  buildDetailAnswer,
  detectDetailField,
  resolveTargets,
} from '../lib/detailAnswers';
import type { DetailField } from '../lib/detailAnswers';

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
  isExpanded?: boolean;
  timestamp: number;
}

// Initialize Groq client using browser-compatible config
const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  dangerouslyAllowBrowser: true,
});

const SEARCH_STEP_MS = 900;

let flightsDataPromise: Promise<any> | null = null;

export const useChat = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [csvLoading, setCsvLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<'thinking' | 'searching'>('thinking');
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [medianCo2, setMedianCo2] = useState<number>(80);

  const { logUserMessage, logAiResponse, logShowAllResults } = useSessionLogger();

  // Load and parse the JSON on mount
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
      intent.stops === 0 ? 'allowing a stop' : null,
      intent.max_price ? 'a higher budget' : null,
      'a different date',
      'a nearby destination',
    ].filter(Boolean) as string[];
    return (
      `No ${stopInfo}flights${describeConstraints(intent)} — nothing matches all of that. ` +
      `Try ${suggestions.slice(0, 3).join(', ')}.`
    );
  };

  // call Groq completions API.
  const callGroq = async (userMessage: string, isRetry = false): Promise<string> => {
    const systemPrompt = buildSystemPrompt();
    const messagesPayload = [
      { role: 'system' as const, content: isRetry ? `${systemPrompt}\n${STRICT_RETRY_PROMPT}` : systemPrompt },
      { role: 'user' as const, content: userMessage },
    ];

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: messagesPayload,
      temperature: 0,
      max_tokens: 400,
    });

    return completion.choices[0]?.message?.content ?? '';
  };

  const callGroqWithBackoff = async (userMessage: string, isRetry = false): Promise<string> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await callGroq(userMessage, isRetry);
      } catch (err: any) {
        const status: number | undefined = err?.status;
        const retryable = isRetryableStatus(status);

        logAiResponse({
          api_error: true,
          status: status ?? null,
          attempt: attempt + 1,
          retryable,
          message: String(err?.message ?? err).slice(0, 300),
          at: new Date().toISOString(),
        });
        if (!retryable || attempt >= MAX_API_RETRIES) throw err;
        await sleep(retryDelayMs(err, attempt));
      }
    }
  };

  // Small helper: append one assistant message to the feed.
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

  const handleParsedSlot = async (slot: SlotJSON) => {
    logAiResponse(slot);

    if (slot.off_topic) {
      pushAssistant({
        text: "I'm a flight search assistant, so I can't help with that — but I can find you flights from London to over 100 European destinations. Try asking something like \"cheapest direct flight to Barcelona in August\".",
      });
      return;
    }

    // Origin outside London: the dataset is London-only. Say so and offer London.
    const origin = classifyOrigin(slot.origin);
    if (origin.kind === 'foreign') {
      pushAssistant({
        text: `I only have flights departing London right now. Want me to search from London instead?`,
        slot,
        offerLondon: true,
      });
      return;
    }

    // Explicit slot-filling (app decides, not the model)
    const missing = firstMissingRequiredSlot(slot);
    if (missing) {
      pushAssistant({ text: SLOT_QUESTIONS[missing], slot, awaitingSlot: missing });
      return;
    }

    // Build the intent the existing filter understands. A specific London
    // airport becomes an origin_code; generic London stays unfiltered.
    const intent = slotToIntent(slot);
    if (origin.kind === 'london-code') intent.origin_code = origin.code;

    // A comparison must show BOTH direct and connecting so the two are on the table
    if (slot.compare && slot.direct_only == null) intent.stops = undefined;

    // Destination named but not in our route network
    const resolvedDest = resolveDestCodes(intent);
    const namedDestination = Boolean(String(slot.destination ?? '').trim());
    if (namedDestination && resolvedDest.length === 0) {
      const askedFor = slot.destination;
      pushAssistant({
        text: `I couldn't find "${askedFor}" in this flight network. I cover flights from London to European destinations like Paris, Barcelona, Rome, Amsterdam and about 100 more. Try one of those?`,
        slot,
      });
      return;
    }

    // Name the city properly when the user searched by code.
    if (!intent.dest_city && resolvedDest.length === 1) {
      intent.dest_city = getCityName(resolvedDest[0]);
    }

    setLoadingPhase('searching');
    await sleep(SEARCH_STEP_MS);

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
      keepStops: Boolean(slot.compare || slot.cheapest_when),
    });
    pushAssistant({
      text: insight ? `${insight}\n\n${prose.text}` : prose.text,
      preface: insight ?? undefined,
      intent,
      slot,
      flights: filteredResults,
      isExpanded: false,
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
    try {
      await handleParsedSlot(slot);
    } finally {
      setIsLoading(false);
      setLoadingPhase('thinking');
    }
  };

  const currentPool = (): Flight[] =>
    [...messages].reverse().find((m) => m.role === 'assistant' && m.flights?.length)?.flights ?? [];

  const NEW_SEARCH_CUE =
    /\b(?:flights?|fly|flying|travel)\s+(?:to|from)\b|\b(?:find|search|show|book)\b.*\b(?:flight|flights)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\b(?:tomorrow|next week|this weekend|next weekend|next month)\b/i;

  // A referent to something already answered
  const REFERENT_CUE = /\b(?:that|those|these|this|it|its|it's|them|they|the one|ones)\b/i;

  const isFollowUpDetail = (text: string, pool: Flight[]): boolean => {
    const field = detectDetailField(text);
    if (!field || NEW_SEARCH_CUE.test(text)) return false;
    const unambiguous: DetailField[] = ['baggage', 'aircraft', 'flexibility', 'co2', 'seats', 'demand'];
    return (
      unambiguous.includes(field) ||
      REFERENT_CUE.test(text) ||
      resolveTargets(text, pool).length > 0
    );
  };

  /** Post-model detail turn: log the parsed slot, then answer from the data. */
  const handleDetailTurn = async (
    text: string,
    pool: Flight[],
    field: DetailField | null,
    slot: SlotJSON
  ) => {
    logAiResponse(slot);
    answerFromData(text, pool, field, slot.detail_target ?? null);
  };

  /** Answer a detail question from the data and log it as an ordinary turn. */
  const answerFromData = (
    text: string,
    pool: Flight[],
    field?: DetailField | null,
    targetHint?: string | null
  ) => {
    const answer = buildDetailAnswer(text, pool, field, targetHint);
    // Existing ai_response event, value object enriched — no new event types.
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

  // Parse the model's raw text into a slot object, tolerating stray fences.
  const parseSlot = (raw: string): SlotJSON | null => {
    try {
      const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(clean) as SlotJSON;
    } catch {
      return null;
    }
  };

  // Send message action
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

    // A follow-up turn: answer from the data
    const pool = currentPool();
    if (pool.length > 0 && isFollowUpDetail(text, pool)) {
      answerFromData(text, pool);
      return;
    }

    setLoadingPhase('thinking');
    setIsLoading(true);

    // The model classified this as a question ABOUT the flights on screen
    const previousSlot =
      [...messages].reverse().find((m) => m.role === 'assistant' && m.slot)?.slot ?? null;

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
        // Keep parse failures traceable in the research log (existing event type).
        logAiResponse({ parse_error: true, raw: rawContent });
        pushAssistant({ text: "I couldn't understand that query. Could you rephrase it?" });
        return;
      }

      const modelField = String(slot.detail_field ?? '').trim() as DetailField | '';
      const wordField = detectDetailField(text);

      const wordingAgrees =
        wordField != null ||
        (Boolean(slot.detail_target) && resolveTargets(text, pool, slot.detail_target).length > 0);
      if (pool.length > 0 && wordingAgrees && (modelField || slot.off_topic)) {
        await handleDetailTurn(text, pool, modelField || wordField, slot);
        return;
      }

      applyWordingBackstops(slot, text);

      await handleParsedSlot(resolveTurnSlot(previousSlot, slot, text));
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
          retryable: isRetryableStatus(err?.status),
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
      setLoadingPhase('thinking');
    }
  };

  // "Only flights departing London" offered after a non-London origin.
  const refineOrigin = (sourceSlot: SlotJSON, originCode: string) => {
    const echo = originCode
      ? `Only flights departing ${londonAirportLabel(originCode)} (${originCode})`
      : 'Flights from all London airports';
    void runDeterministicSearch({ ...sourceSlot, origin: originCode || null }, echo);
  };

  // "Search from London instead" offered after a non-London origin.
  const searchFromLondon = (sourceSlot: SlotJSON) => {
    void runDeterministicSearch({ ...sourceSlot, origin: null }, 'Search from London instead');
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
    messages,
    medianCo2,
    sendMessage,
    refineOrigin,
    searchFromLondon,
    clearConversation,
    toggleExpandMessage,
  };
};
