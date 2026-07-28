import { useState, useEffect } from 'react';
import Papa from 'papaparse';
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
  /** The raw slot object parsed from the model, kept so assumption-line chips
   *  (origin picker / "search from London") can re-run a refined search. */
  slot?: SlotJSON;
  /** Set on the "I only fly from London" reply to offer a London re-search. */
  offerLondon?: boolean;
  /** Set when this assistant message is a slot-filling QUESTION ("Which
   *  dates?"). The next user message is then an ANSWER to it, and is the only
   *  case where prior turns may legitimately inform the parse — see
   *  sendMessage. */
  awaitingSlot?: 'destination' | 'dates';
  /** Set on a system message the user can simply re-send (rate limit / 5xx),
   *  as opposed to one that needs the researcher (bad API key). */
  retryable?: boolean;
  /** Comparison / cheapest-day sentence stated ahead of the prose answer. Also
   *  included in `text`, which stays the full plain-text response. */
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

// The comparison / cheapest-day summary sentences live in ../lib/insights, and
// the prose answer itself in ../lib/prose, so both can be exercised directly by
// scripts/session-bugs-repro.mts.

/** How long the "searching flights" step is shown before results appear. The
 *  filter itself is instant; the pause makes the search visible in a chat
 *  interface (ChatGPT/Perplexity show their retrieval step) instead of results
 *  materialising the moment the user hits enter. */
const SEARCH_STEP_MS = 900;

export const useChat = () => {
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

  // Load and parse the CSV on mount
  useEffect(() => {
    const loadFlights = async () => {
      try {
        setCsvLoading(true);
        const response = await fetch('/ux_research_flights_h2_2026_final.csv');
        if (!response.ok) {
          throw new Error('Failed to fetch dataset');
        }
        const csvText = await response.text();

        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const parsedData: Flight[] = [];
            const co2Values: number[] = [];

            results.data.forEach((row: any) => {
              // Exclude cancelled flights entirely on load
              if (row.flight_status === 'Cancelled') {
                return;
              }

              // Duration parsing
              const durationMins = parseInt(row.duration_mins, 10) || 0;
              const priceGbp = parseFloat(row.price_gbp) || 0;
              const seatsRemaining = parseInt(row.seats_remaining, 10) || 0;
              const stops = parseInt(row.stops, 10) || 0;
              const co2Kg = parseFloat(row.co2_kg) || 0;

              // Helper numeric departure minutes from midnight
              let departureMins = 0;
              if (row.departure_time) {
                const [h, m] = row.departure_time.split(':');
                departureMins = (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
              }

              if (row.flight_id) {
                parsedData.push({
                  flight_id: row.flight_id,
                  flight_number: row.flight_number || '',
                  origin_code: row.origin_code || '',
                  origin_terminal: row.origin_terminal || '',
                  dest_code: row.dest_code || '',
                  date: row.date || '',
                  departure_time: row.departure_time || '',
                  arrival_time: row.arrival_time || '',
                  arrival_date: row.arrival_date || '',
                  duration_mins: durationMins,
                  duration_formatted: row.duration_formatted || '',
                  direction: row.direction || 'outbound',
                  airline_name: row.airline_name || '',
                  airline_tier: row.airline_tier || '',
                  aircraft_type: row.aircraft_type || '',
                  stops: stops,
                  layover_details: row.layover_details || '',
                  cabin_class: row.cabin_class || '',
                  price_gbp: priceGbp,
                  currency: row.currency || 'GBP',
                  seats_remaining: seatsRemaining,
                  baggage_policy: row.baggage_policy || '',
                  meal: row.meal || '',
                  flexibility_policy: row.flexibility_policy || '',
                  co2_kg: co2Kg,
                  demand_indicator: row.demand_indicator || '',
                  flight_status: row.flight_status || '',
                  departure_mins_from_midnight: departureMins,
                });

                if (!isNaN(co2Kg)) {
                  co2Values.push(co2Kg);
                }
              }
            });

            // Calculate median CO2
            if (co2Values.length > 0) {
              co2Values.sort((a, b) => a - b);
              const mid = Math.floor(co2Values.length / 2);
              const median = co2Values.length % 2 !== 0 ? co2Values[mid] : (co2Values[mid - 1] + co2Values[mid]) / 2;
              setMedianCo2(median);
              console.log('[useChat] Calculated Median CO2:', median);
            }

            setFlights(parsedData);
            setCsvLoading(false);
          },
          error: (err: any) => {
            console.error('Error parsing CSV:', err);
            setCsvLoading(false);
          },
        });
      } catch (err: any) {
        console.error('Error fetching CSV:', err);
        setCsvLoading(false);
      }
    };

    loadFlights();
  }, []);

  // Zero-result reply. Every constraint we actually applied must appear in it,
  // so the participant can see what is filtering them out — that matters more
  // now that a follow-up message inherits the constraints of the query it
  // modifies ("under 25" quietly keeps the destination, date and direct-only
  // filter from earlier turns). describeConstraints lives in ../lib/prose so
  // this sentence and the found-results prose word the constraints identically.
  const generateEmptyReply = (intent: IntentJSON) => {
    const stopInfo = intent.stops === 0 ? 'direct ' : intent.stops === 1 ? '1-stop ' : '';
    // Name the way out that actually applies, rather than offering to relax a
    // filter the search never had.
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
  //
  // Every message is parsed on its OWN words — no conversational history is
  // sent. The 8B model copies constraints out of earlier user turns when it can
  // see them (that is what leaked "departing after 6pm" from an Amsterdam turn
  // onto a Rome comparison). Continuity across turns is restored
  // deterministically instead, by resolveTurnSlot in sendMessage.
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

  // Both research apps share ONE org-level Groq quota, so a 429 mid-session is
  // routine rather than exceptional — and a participant seeing a raw "could not
  // reach the AI service" alert loses the thread of the task. Wait out the
  // window the API names and try again (twice), then say something useful.
  const callGroqWithBackoff = async (userMessage: string, isRetry = false): Promise<string> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await callGroq(userMessage, isRetry);
      } catch (err: any) {
        const status: number | undefined = err?.status;
        const retryable = isRetryableStatus(status);
        // Every failed attempt is logged through the EXISTING ai_response event
        // (status code + ISO timestamp), so a session log shows exactly where
        // the rate limit interrupted the participant.
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

  // Everything that happens AFTER we have a parsed slot object. Shared by the
  // typed-message path and by the assumption-line chips (origin picker / London
  // re-search), so all three routes go through the exact same gates.
  const handleParsedSlot = async (slot: SlotJSON) => {
    // Requirement 5: log every parsed JSON object (logger stamps the timestamp).
    logAiResponse(slot);

    // Off-topic: answer politely instead of dumping the dataset.
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

    // Explicit slot-filling (app decides, not the model): ask ONE question for
    // the first missing required slot instead of running a search.
    const missing = firstMissingRequiredSlot(slot);
    if (missing) {
      pushAssistant({ text: SLOT_QUESTIONS[missing], slot, awaitingSlot: missing });
      return;
    }

    // Build the intent the existing filter understands. A specific London
    // airport becomes an origin_code; generic London stays unfiltered.
    const intent = slotToIntent(slot);
    if (origin.kind === 'london-code') intent.origin_code = origin.code;

    // A comparison must show BOTH direct and connecting so the two are on the
    // table — never let a stray stops filter collapse one side. But ONLY when
    // the user has not asked for one side explicitly: this rule used to be
    // unconditional, so clicking "Only show direct flights" on a comparison
    // answer merged direct_only:true onto a slot whose compare flag then wiped
    // intent.stops again. The chip produced a byte-identical response, 1-stop
    // flights included.
    if (slot.compare && slot.direct_only == null) intent.stops = undefined;

    // Destination named but not in our route network: say so explicitly. An
    // "anywhere" search has NO destination on purpose (it spans every city), so
    // an empty resolution there is expected — never mistake it for an unknown
    // city.
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

    // Everything above this point is a reply the assistant can give without
    // looking anything up. From here it is actually searching, so show that
    // step before the answer lands.
    setLoadingPhase('searching');
    await sleep(SEARCH_STEP_MS);

    const filteredResults = filterAndSortFlights(flights, intent, medianCo2);

    if (filteredResults.length === 0) {
      pushAssistant({ text: generateEmptyReply(intent), intent, slot, flights: [] });
      return;
    }

    // Synthesized insight sentence (comparison / cheapest-day), stated ahead of
    // the prose answer. Kept separate from the prose so the paragraph below can
    // be rebuilt from the flights at render time.
    const destLabel =
      intent.dest_city || (resolvedDest.length === 1 ? getCityName(resolvedDest[0]) : '');
    let insight: string | null = null;
    if (slot.compare) {
      insight = buildComparisonSentence(filteredResults, destLabel);
    } else if (slot.cheapest_when) {
      insight = buildCheapestWhenSentence(filteredResults, destLabel, Boolean(slot.weekend));
    }

    // The answer itself is prose (ChatBubble renders it from these same flights
    // via buildProseAnswer); `text` keeps the plain-text version for the copy
    // button and for anything reading the message log.
    const prose = buildProseAnswer(filteredResults, intent, {
      // A comparison or a cheapest-day answer must keep connecting flights on
      // screen; every other mixed set is shown as direct flights only.
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

  // Refinement chips are gone: the answer now ENDS with a follow-up question
  // (see buildFollowUpQuestion in ../lib/prose) and the participant answers it
  // by typing, which goes through sendMessage -> resolveTurnSlot like any other
  // modifying message. What remains deterministic are the two actions that are
  // not really queries: the origin picker and the London re-search.

  // Shared by every deterministic (no-LLM) action: echo the action as an
  // ordinary user_message, then run the same gates and show the same search
  // step a typed query would.
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

  // ─── Detail questions about flights already on screen ────────────────────

  /** The result set the conversation is currently looking at. */
  const currentPool = (): Flight[] =>
    [...messages].reverse().find((m) => m.role === 'assistant' && m.flights?.length)?.flights ?? [];

  // Wording that starts a NEW search rather than asking about the current one.
  // Without this, "how much is a flight to Paris in August" would be answered
  // from the previous result set, because it mentions a price.
  const NEW_SEARCH_CUE =
    /\b(?:flights?|fly|flying|travel)\s+(?:to|from)\b|\b(?:find|search|show|book)\b.*\b(?:flight|flights)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\b(?:tomorrow|next week|this weekend|next weekend|next month)\b/i;

  // A referent to something already answered ("that one", "the KLM flight").
  const REFERENT_CUE = /\b(?:that|those|these|this|it|its|it's|them|they|the one|ones)\b/i;

  /**
   * Whether to answer from the dataset without a model round-trip. Requires a
   * recognisable field AND either a reference to a flight on screen or a field
   * no search phrasing uses, AND no new-search wording — so a genuine search is
   * never swallowed by a follow-up answer.
   */
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

    // Questions about a flight already on screen are answered from the dataset
    // itself — baggage, aircraft, cabin, seats, CO₂, refunds, times, stops,
    // price — never with the out-of-scope deflection, which is for things the
    // data does not hold at all (hotels, visas, ground transport).
    const pool = currentPool();
    if (pool.length > 0 && isFollowUpDetail(text, pool)) {
      answerFromData(text, pool);
      return;
    }

    setLoadingPhase('thinking');
    setIsLoading(true);

    // The slot state the user is currently talking about: the last assistant
    // turn that carried one (a results turn, a "Which dates?" question, or an
    // unknown-city reply). resolveTurnSlot decides whether this message edits
    // that query or replaces it. The message itself is always parsed WITHOUT
    // history — see callGroq.
    const previousSlot =
      [...messages].reverse().find((m) => m.role === 'assistant' && m.slot)?.slot ?? null;

    try {
      let rawContent = await callGroqWithBackoff(text);
      // Dev-only: dumps the full raw model JSON per query. Gated so it never
      // fires during a participant session (production build sets DEV = false).
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

      // The model classified this as a question ABOUT the flights on screen
      // (or mislabelled such a question off_topic). Either way the answer is in
      // the data, so read it from there instead of searching or deflecting.
      const modelField = String(slot.detail_field ?? '').trim() as DetailField | '';
      const wordField = detectDetailField(text);
      // The model's classification is only honoured when the wording backs it
      // up — either it reads as a question about a flight, or it names one that
      // is on screen. A stray detail_field on a refinement ("under 25") would
      // otherwise swallow a real search and answer from the previous results.
      const wordingAgrees =
        wordField != null ||
        (Boolean(slot.detail_target) && resolveTargets(text, pool, slot.detail_target).length > 0);
      if (pool.length > 0 && wordingAgrees && (modelField || slot.off_topic)) {
        await handleDetailTurn(text, pool, modelField || wordField, slot);
        return;
      }

      // Comparison / cheapest-day / weekend / anywhere flags are decided from
      // the user's own wording, because the 8B model raises and drops them
      // inconsistently. Re-derived every turn, so they never go stale.
      applyWordingBackstops(slot, text);

      // Restore multi-turn continuity deterministically: a modifying message
      // ("…4th august instead", "under 25", "for sevilla for same date?")
      // inherits the destination/dates/filters it did not mention; a
      // self-contained new query inherits nothing.
      await handleParsedSlot(resolveTurnSlot(previousSlot, slot, text));
    } catch (err: any) {
      console.error('[Groq API Error]', err?.status, err);
      const message = friendlyApiError(err);
      setError(message);

      // The feed, the previous answer's cards and every logged event stay
      // exactly as they were — the failure is appended, it does not replace
      // anything, so the participant can pick the task back up.
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

  // Assumption-line origin picker: re-run the same search from a specific
  // London airport (or all of them). Deterministic — no LLM round-trip — but
  // still echoed as a user_message + ai_response so the research log records
  // the action through the EXISTING event types.
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
