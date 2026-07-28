import type { IntentJSON } from '../hooks/useFlightFilter';
import { AIRPORT_TO_CITY } from './airportMap';

// The strict JSON contract the LLM must return. The first seven keys are the
// always-present slot-filling contract; the rest are optional constraints kept
// so price/time/airline filtering (research Tasks 2 & 5) does not regress.
export interface SlotJSON {
  destination: string | null;
  date_from: string | null;
  date_to: string | null;
  cabin: 'Economy' | 'Premium Economy' | 'Business' | string | null;
  direct_only: boolean | null;
  sort: 'cheapest' | 'fastest' | null;
  missing: string[];
  // Optional / preserved constraints
  origin?: string | null;
  max_price?: number | null;
  departure_after?: string | null;
  departure_before?: string | null;
  airline?: string | null;
  flexibility?: string | null;
  low_co2?: boolean | null;
  off_topic?: boolean;
  /** Open-ended "where could I go" exploration: the user wants destination
   *  SUGGESTIONS, so destination (and dates) must NOT be asked for — the search
   *  runs across every reachable city. Mirrors dashboard-ui's empty-destination
   *  "anywhere" search and generative-ui's map/destinations layouts. */
  anywhere?: boolean;
  /** Direct-vs-connecting comparison ("compare direct vs connecting, which
   *  would you choose?"): the summary states the price/time tradeoff and a
   *  recommendation, mirroring generative-ui's comparison template. Set by a
   *  deterministic backstop from the user's wording. */
  compare?: boolean;
  /** "Cheapest weekend / cheapest day / best time to go" queries: the summary
   *  states the single cheapest day (with weekday) explicitly instead of only
   *  returning a sorted list. Set by a deterministic backstop. */
  cheapest_when?: boolean;
  /** The user asked specifically about a WEEKEND, so a cheapest_when summary is
   *  restricted to Saturday/Sunday departures. Set by a deterministic backstop. */
  weekend?: boolean;
  /** A question ABOUT a flight already on screen ("what's the baggage
   *  allowance for the cheapest one?") rather than a new search: which field
   *  of the dataset to read, and which flight to read it from. Answered by
   *  src/lib/detailAnswers.ts, never by a search. Like compare/cheapest_when
   *  these describe THIS message, so they are never carried between turns. */
  detail_field?: string | null;
  detail_target?: string | null;
}

// The only origin in the dataset is London. These are its airports.
export const LONDON_CODES = ['LHR', 'LGW', 'STN', 'LTN', 'SEN', 'LCY'] as const;
const LONDON_CODE_SET = new Set<string>(LONDON_CODES);

// Short name tokens that unambiguously identify a specific London airport.
const LONDON_NAME_TOKENS: [string, string][] = [
  ['heathrow', 'LHR'],
  ['gatwick', 'LGW'],
  ['stansted', 'STN'],
  ['luton', 'LTN'],
  ['southend', 'SEN'],
  ['london city', 'LCY'],
];

export type OriginKind =
  | { kind: 'none' }
  | { kind: 'london-all' }
  | { kind: 'london-code'; code: string }
  | { kind: 'foreign'; label: string };

// Decide whether a mentioned origin is (a) not mentioned, (b) generic London,
// (c) a specific London airport, or (d) somewhere we do not serve.
export const classifyOrigin = (origin: string | null | undefined): OriginKind => {
  if (!origin || !origin.trim()) return { kind: 'none' };
  const raw = origin.trim();
  const up = raw.toUpperCase();
  if (LONDON_CODE_SET.has(up)) return { kind: 'london-code', code: up };

  const low = raw.toLowerCase();
  for (const [token, code] of LONDON_NAME_TOKENS) {
    if (low.includes(token)) return { kind: 'london-code', code };
  }
  // "London" (or "London <something we didn't name>") means all London airports.
  if (low === 'london' || low.startsWith('london')) return { kind: 'london-all' };

  return { kind: 'foreign', label: raw };
};

// App-side source of truth for which required slot to ask about first.
// Order matters: destination is asked before dates.
export const firstMissingRequiredSlot = (
  slot: SlotJSON
): 'destination' | 'dates' | null => {
  // "Anywhere" exploration is a valid, complete search on its own: the whole
  // point is that the user has NOT picked a destination (and often no dates),
  // so we never block it with a slot-filling question — we just search.
  if (slot.anywhere) return null;
  const hasDestination = Boolean(
    slot.destination && String(slot.destination).trim()
  );
  const hasDates = Boolean(
    (slot.date_from && slot.date_from.trim()) ||
      (slot.date_to && slot.date_to.trim())
  );
  if (!hasDestination) return 'destination';
  if (!hasDates) return 'dates';
  return null;
};

export const SLOT_QUESTIONS: Record<'destination' | 'dates', string> = {
  destination: 'Where are you flying to?',
  dates: 'Which dates?',
};

// ─── Deterministic wording backstops ──────────────────────────────────────
// The 8B model flags these inconsistently, so they are decided from the user's
// own words instead. They live here (rather than inline in useChat) so the app
// and scripts/pipeline-test.mts share ONE implementation and cannot drift.

// Open-ended "where could I go" exploration.
export const isAnywhereQuery = (text: string): boolean =>
  /\bwhere (?:can|could|should|might|would|to)\b/i.test(text) ||
  /\b(?:surprise me|anywhere|somewhere)\b/i.test(text) ||
  /\bwhere (?:can|could|should) (?:i|we|you)\b/i.test(text);

// "Compare direct vs connecting, which would you choose?" — a request for a
// synthesized direct-vs-stop recommendation, not just a filtered list.
export const isCompareQuery = (text: string): boolean =>
  /\bcompare\b/i.test(text) ||
  /\bdirect\b.*\b(?:vs\.?|versus|or|against|with)\b.*\b(?:connect|stop|indirect|1[- ]?stop|one[- ]?stop)/i.test(text) ||
  /\b(?:connect|stop|indirect)\w*\b.*\b(?:vs\.?|versus|or)\b.*\bdirect\b/i.test(text) ||
  /\bdirect (?:vs\.?|or) (?:a )?(?:stop|connecting)/i.test(text);

// "Cheapest weekend / cheapest day / best time to go" — the answer is a
// specific day, which should be stated, not left for the user to eyeball.
export const isCheapestWhenQuery = (text: string): boolean =>
  /\bcheapest\b.*\b(?:day|weekend|date|time|to (?:go|fly|travel))\b/i.test(text) ||
  /\bbest (?:time|day|weekend|date)\b.*\b(?:to (?:go|fly|travel)|for)\b/i.test(text) ||
  /\bwhen(?:'s| is)?\b.*\bcheapest\b/i.test(text);

// "narrow it to direct flights only" / "only direct please" — the assistant
// OFFERS this in its closing follow-up question, so the answer to it has to
// land. Deliberately narrow: a bare "direct" (as in "direct vs connecting")
// must not trip it.
export const isDirectOnlyQuery = (text: string): boolean =>
  /\b(?:only|just)\s+(?:show\s+|see\s+|give\s+me\s+)?(?:me\s+)?(?:the\s+)?direct\b/i.test(text) ||
  /\bdirect\s+(?:flights?\s+)?only\b/i.test(text) ||
  /\bnarrow(?:\s+it)?\s+to\s+direct\b/i.test(text) ||
  /\bnon[- ]?stop\s+only\b/i.test(text);

// "include flights with a stop" / "allow a stop" — the opposite offer. This one
// asks to REMOVE the direct-only constraint, which is not the same as
// direct_only:false (that means "only flights WITH a stop" — see slotToIntent,
// unchanged). It is handled in resolveTurnSlot, which stops carrying the
// previous turn's direct_only forward.
export const isDropDirectQuery = (text: string): boolean =>
  /\b(?:include|allow|add|also show|consider|open up to|open it up to)\b[^.?!]{0,40}\b(?:stop|stops|stopover|stopovers|connecting|indirect)\b/i.test(text) ||
  /\b(?:don'?t|do not|no longer)\s+(?:keep|make|need)\s+(?:it\s+)?direct\b/i.test(text) ||
  /\bnot\s+just\s+direct\b/i.test(text);

// "show the lower-CO₂ options" — the third standing offer. The 8B model sets
// low_co2 only about half the time when CO₂ is written as a symbol.
export const isLowCo2Query = (text: string): boolean =>
  // No trailing \b after the alternatives: "₂" is not a word character, so
  // "lower-CO₂" would never match one.
  /\b(?:low|lower|lowest|less|least|reduce|reduced|greener?|eco)\w*[\s-]*(?:co2\b|co₂|carbon\b|emissions?\b|footprint\b)/i.test(text);

// Applied to every freshly parsed slot, before any gate runs. Mutates and
// returns the same object.
export const applyWordingBackstops = (slot: SlotJSON, text: string): SlotJSON => {
  // "Anywhere" exploration is a destination-suggestion request, not a gap to
  // fill — but only when they did NOT name a destination.
  if (!slot.anywhere && !String(slot.destination ?? '').trim() && isAnywhereQuery(text)) {
    slot.anywhere = true;
  }
  // The converse also matters: the model sets anywhere on bare constraints like
  // "under 25", which turned a Rome follow-up into a 3,746-flight search across
  // the whole network. An anywhere search must be supported by the wording.
  if (slot.anywhere && !isAnywhereQuery(text)) {
    slot.anywhere = false;
  }
  if (isCompareQuery(text)) slot.compare = true;
  if (isCheapestWhenQuery(text)) slot.cheapest_when = true;
  if (/\bweekend\b/i.test(text)) slot.weekend = true;
  // Answers to the closing follow-up question. Only ever FILL a slot the model
  // left empty — an explicit model value still wins.
  if (slot.direct_only == null && !isCompareQuery(text) && isDirectOnlyQuery(text)) {
    slot.direct_only = true;
  }
  if (!slot.low_co2 && isLowCo2Query(text)) slot.low_co2 = true;
  return slot;
};

// ─── Multi-turn slot carryover ────────────────────────────────────────────
// Every message is parsed by the LLM on its OWN words (no conversational
// history — that is what leaked "departing after 6pm" from an Amsterdam turn
// onto a Rome comparison). Continuity is then restored HERE, deterministically:
// a message that modifies the current query inherits the slots it did not
// mention; a message that stands on its own as a new query inherits nothing.
//
// Withholding history alone over-corrected: "find a flight for 4th august
// instead" dropped Rome and asked for a destination again, and "under 25"
// dropped it too and returned 3,746 flights across every city.

// Slots that describe the SEARCH and therefore survive a modifying turn.
// `compare` / `cheapest_when` / `off_topic` are deliberately absent: they
// describe THIS message's wording and are re-derived every turn by
// applyWordingBackstops. `missing` is recomputed by the caller.
const CARRYABLE_SLOTS = [
  'destination',
  'date_from',
  'date_to',
  'cabin',
  'direct_only',
  'sort',
  'origin',
  'max_price',
  'departure_after',
  'departure_before',
  'airline',
  'flexibility',
  'low_co2',
  'weekend',
] as const;

// Phrases that mark the message as an edit to the query already on screen.
const MODIFIER_CUE =
  /\b(?:instead|same date|same day|same dates|same time|that date|those dates|make it|change (?:it|that) to|what about|how about|and also|as well|rather than|but)\b/i;

// Explicit "throw away the current search" phrases.
const RESET_CUE = /\b(?:start over|start again|new search|forget (?:that|it|the)|reset|never ?mind)\b/i;

// "for sevilla for SAME DATE?" — the model does not know what the current date
// is, and fills the slot with today. The user's own words say otherwise, so the
// carried dates must WIN over the model's guess for these phrasings.
const SAME_DATE_CUE = /\bsame (?:date|day|dates|time)\b/i;

const hasValue = (v: unknown): boolean =>
  v !== null && v !== undefined && !(typeof v === 'string' && !v.trim());

/**
 * Resolve the slot to search with, given the previous turn's slot and the
 * freshly parsed one. `prev` is the slot of the last assistant turn that had
 * one (a results turn, a slot question, or an unknown-city reply); pass null on
 * the first message of a conversation.
 *
 * Rules, in order:
 *   1. No previous slot, an explicit reset phrase, or an "anywhere" exploration
 *      -> use the new slot untouched (single-turn behaviour, unchanged).
 *   2. The message stands alone as a complete query — it names BOTH a
 *      destination and dates — and carries no modifier cue -> new slot
 *      untouched. This is what keeps a fresh "Compare … to Rome on 31 July"
 *      from inheriting an earlier turn's price cap or departure window.
 *   3. Otherwise it is MODIFYING the current query: carry forward every
 *      carryable slot the new message left empty.
 */
export const resolveTurnSlot = (
  prev: SlotJSON | null | undefined,
  next: SlotJSON,
  text: string
): SlotJSON => {
  // `anywhere` is honoured only when the wording supports it — the model raises
  // it on bare constraints ("under 25"), which would silently discard the
  // destination the user is still talking about.
  const wantsAnywhere = Boolean(next.anywhere) && isAnywhereQuery(text);
  if (!prev || RESET_CUE.test(text) || wantsAnywhere || next.off_topic) return next;

  const hasDestination = hasValue(next.destination);
  const hasDates = hasValue(next.date_from) || hasValue(next.date_to);
  const isModifier = MODIFIER_CUE.test(text);
  if (hasDestination && hasDates && !isModifier) return next;

  const merged: SlotJSON = { ...next, anywhere: false };
  // "include flights with a stop" answers the assistant's own follow-up offer.
  // It names no slot value the model can fill (dropping a constraint is not
  // direct_only:false — that means "only flights WITH a stop"), so without this
  // the empty slot is refilled from the previous turn and the search returns a
  // byte-identical answer.
  const dropsDirect = isDropDirectQuery(text);
  for (const key of CARRYABLE_SLOTS) {
    if (key === 'direct_only' && dropsDirect) continue;
    if (!hasValue(merged[key]) && hasValue(prev[key])) {
      (merged[key] as unknown) = prev[key];
    }
  }
  if (dropsDirect && next.direct_only == null) merged.direct_only = null;
  // "same date" beats a date the model invented for a message that never
  // named one.
  if (SAME_DATE_CUE.test(text) && (hasValue(prev.date_from) || hasValue(prev.date_to))) {
    merged.date_from = prev.date_from;
    merged.date_to = prev.date_to;
  }
  // `missing` is recomputed from the merged slots by firstMissingRequiredSlot,
  // but keep the array honest for the research log.
  merged.missing = [
    ...(hasValue(merged.destination) ? [] : ['destination']),
    ...(hasValue(merged.date_from) || hasValue(merged.date_to) ? [] : ['dates']),
  ];
  return merged;
};

// Map the LLM's slot object onto the existing IntentJSON the filter consumes.
// Filtering semantics are unchanged — this is purely a translation layer.
export const slotToIntent = (slot: SlotJSON): IntentJSON => {
  const intent: IntentJSON = { direction: 'outbound' };

  if (slot.destination && String(slot.destination).trim()) {
    intent.dest_city = String(slot.destination).trim();
  }
  if (slot.date_from && slot.date_from.trim()) intent.date_from = slot.date_from.trim();
  if (slot.date_to && slot.date_to.trim()) intent.date_to = slot.date_to.trim();
  if (slot.cabin && String(slot.cabin).trim()) intent.cabin_class = String(slot.cabin).trim();

  // direct_only: true -> direct only; false -> with a stop; null -> no filter
  if (slot.direct_only === true) intent.stops = 0;
  else if (slot.direct_only === false) intent.stops = 1;

  intent.sort_by = slot.sort === 'fastest' ? 'fastest' : 'cheapest';

  // Preserved optional constraints
  if (slot.max_price != null) intent.max_price = slot.max_price;
  if (slot.departure_after && slot.departure_after.trim()) intent.departure_after = slot.departure_after.trim();
  if (slot.departure_before && slot.departure_before.trim()) intent.departure_before = slot.departure_before.trim();
  if (slot.airline && slot.airline.trim()) intent.airline = slot.airline.trim();
  if (slot.flexibility && slot.flexibility.trim()) intent.flexibility = slot.flexibility.trim();
  if (slot.low_co2) intent.low_co2 = true;
  // "weekend" is a real constraint on the result set, not just a hint for the
  // summary sentence. Without this it was silently dropped on any query that
  // was not a cheapest-day question (e.g. "£150 and a free weekend").
  if (slot.weekend) intent.weekend_only = true;

  return intent;
};

// Display helper for a London airport code (falls back to the code).
export const londonAirportLabel = (code: string): string =>
  AIRPORT_TO_CITY[code] || code;
