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
  
  anywhere?: boolean;
  compare?: boolean;
  cheapest_when?: boolean;
  weekend?: boolean;
  detail_field?: string | null;
  detail_target?: string | null;
  /** App-side only (never set by the model): true once a destination has been
   *  picked from a budget/anywhere search, or the user said "return flight(s)"
   *  / "round trip" explicitly, so the search shows both directions rather
   *  than one-way flights. Persists across refinements like the other carried
   *  slots, until a new search resets it. */
  round_trip?: boolean;
  /** App-side only (never set by the model): true when the user explicitly
   *  asked for the return/inbound leg ("return flights to Paris", "flight
   *  back from Barcelona"). Takes priority over round_trip. Persists across
   *  refinements like the other carried slots. */
  return_only?: boolean;
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

// A round trip needs a different dates question up front: it states both
// valid answer shapes (one day, or an outbound+return pair) in a single turn
// so the user doesn't need a follow-up clarifying exchange to figure out
// which one we meant.
export const datesQuestionFor = (slot: SlotJSON): string =>
  slot.round_trip || slot.return_only
    ? 'Which dates? A single day shows flights both ways — or give an outbound and return date, like "30 August out, 3 September back."'
    : SLOT_QUESTIONS.dates;


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

// "Cheapest weekend / cheapest day / best time to go"
export const isCheapestWhenQuery = (text: string): boolean =>
  /\bcheapest\b.*\b(?:day|weekend|date|time|to (?:go|fly|travel))\b/i.test(text) ||
  /\bbest (?:time|day|weekend|date)\b.*\b(?:to (?:go|fly|travel)|for)\b/i.test(text) ||
  /\bwhen(?:'s| is)?\b.*\bcheapest\b/i.test(text);

// "Show me only direct flights"
export const isDirectOnlyQuery = (text: string): boolean =>
  /\b(?:only|just)\s+(?:show\s+|see\s+|give\s+me\s+)?(?:me\s+)?(?:the\s+)?direct\b/i.test(text) ||
  /\bdirect\s+(?:flights?\s+)?only\b/i.test(text) ||
  /\bnarrow(?:\s+it)?\s+to\s+direct\b/i.test(text) ||
  /\bnon[- ]?stop\s+only\b/i.test(text);

// "include flights with a stop" / "allow a stop"
export const isDropDirectQuery = (text: string): boolean =>
  /\b(?:include|allow|add|also show|consider|open up to|open it up to)\b[^.?!]{0,40}\b(?:stop|stops|stopover|stopovers|connecting|indirect)\b/i.test(text) ||
  /\b(?:don'?t|do not|no longer)\s+(?:keep|make|need)\s+(?:it\s+)?direct\b/i.test(text) ||
  /\bnot\s+just\s+direct\b/i.test(text);

// "show the lower-CO₂ options" — the third standing offer. The 8B model sets
// low_co2 only about half the time when CO₂ is written as a symbol.
export const isLowCo2Query = (text: string): boolean =>
  /\b(?:low|lower|lowest|less|least|reduce|reduced|greener?|eco)\w*[\s-]*(?:co2\b|co₂|carbon\b|emissions?\b|footprint\b)/i.test(text);

// "return flights to Barcelona" / "round trip to Rome" — in everyday English
// (especially UK English, where this app is set) "return flight(s)" as a bare
// noun phrase means a ROUND TRIP ticket, not "just the leg back." Show both
// directions, same as picking a city from a budget/anywhere search.
export const isRoundTripQuery = (text: string): boolean =>
  /\breturn\s+flights?\b/i.test(text) ||
  /\bround[- ]trip\b/i.test(text) ||
  /\bthere\s+and\s+back\b/i.test(text);

// "flight back from Barcelona" / "the return leg" — unlike bare "return
// flight(s)" above, these specifically single out the INBOUND leg only.
// Deliberately does NOT match bare "...and come back on 14 July" (no adjacent
// flight/leg word), which describes a round-trip date range, not one leg.
export const isReturnOnlyQuery = (text: string): boolean =>
  /\bflights?\s+back\b/i.test(text) ||
  /\bflying\s+back\b/i.test(text) ||
  /\b(?:return|inbound)\s+leg\b/i.test(text) ||
  /\bcoming\s+back\s+flights?\b/i.test(text);

// A bare price correction/follow-up ("12 pounds?", "sorry, 120 pounds", "£90")
// — carries no date information at all. The 8B model sometimes still echoes a
// date range from a nearby few-shot example that happens to share the same
// price figure (e.g. the "...for under £120" example) rather than leaving
// dates null as instructed. Force dates back to null so the app's own
// carry-forward logic (resolveTurnSlot) keeps whatever date was already
// established, instead of trusting the model's hallucinated range.
export const isPriceOnlyQuery = (text: string): boolean =>
  /^\s*(?:sorry,?\s*|ok(?:ay)?,?\s*|actually,?\s*)?£?\s*\d+(?:\.\d+)?\s*(?:pounds?|gbp|quid)?\s*[.!?]?\s*$/i.test(
    text
  );

export const applyWordingBackstops = (slot: SlotJSON, text: string): SlotJSON => {
  if (isPriceOnlyQuery(text)) {
    slot.date_from = null;
    slot.date_to = null;
  }
  // "Anywhere" exploration is a destination-suggestion request
  if (!slot.anywhere && !String(slot.destination ?? '').trim() && isAnywhereQuery(text)) {
    slot.anywhere = true;
  }
  
  if (slot.anywhere && !isAnywhereQuery(text)) {
    slot.anywhere = false;
  }
  if (isCompareQuery(text)) slot.compare = true;
  if (isCheapestWhenQuery(text)) slot.cheapest_when = true;
  if (/\bweekend\b/i.test(text)) slot.weekend = true;

  if (slot.direct_only == null && !isCompareQuery(text) && isDirectOnlyQuery(text)) {
    slot.direct_only = true;
  }
  if (!slot.low_co2 && isLowCo2Query(text)) slot.low_co2 = true;
  if (!slot.round_trip && isRoundTripQuery(text)) slot.round_trip = true;
  if (!slot.return_only && isReturnOnlyQuery(text)) slot.return_only = true;
  return slot;
};

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
  'compare',
  'cheapest_when',
  'round_trip',
  'return_only',
] as const;

const MODIFIER_CUE =
  /\b(?:instead|same date|same day|same dates|same time|same budget|same price|same cap|that date|those dates|make it|change (?:it|that) to|what about|how about|and also|as well|rather than|but)\b/i;

// Explicit "throw away the current search" phrases.
const RESET_CUE = /\b(?:start over|start again|new search|forget (?:that|it|the)|reset|never ?mind)\b/i;

const SAME_DATE_CUE = /\bsame (?:date|day|dates|time)\b/i;

const hasValue = (v: unknown): boolean =>
  v !== null && v !== undefined && !(typeof v === 'string' && !v.trim());

export const resolveTurnSlot = (
  prev: SlotJSON | null | undefined,
  next: SlotJSON,
  text: string
): SlotJSON => {
  const wantsAnywhere = Boolean(next.anywhere) && isAnywhereQuery(text);
  if (!prev || RESET_CUE.test(text) || wantsAnywhere || next.off_topic) return next;

  const hasDestination = hasValue(next.destination);
  const hasDates = hasValue(next.date_from) || hasValue(next.date_to);
  const isModifier = MODIFIER_CUE.test(text);

  const prevDest = hasValue(prev.destination) ? String(prev.destination).trim().toLowerCase() : null;
  const nextDest = hasValue(next.destination) ? String(next.destination).trim().toLowerCase() : null;
  const sameDestination = prevDest !== null && nextDest !== null && prevDest === nextDest;
  const destinationIntroduced = hasDestination && !sameDestination;

  // A destination picked from a prior budget/anywhere search (no destination
  // named yet) defaults to round trip: the user is choosing somewhere to
  // actually go, not just checking one-way fares.
  const fromExploration = Boolean(prev.anywhere) && !hasValue(prev.destination);

  if ((destinationIntroduced && !isModifier) || (hasDestination && hasDates && !isModifier)) {
    return fromExploration ? { ...next, round_trip: true } : next;
  }

  const merged: SlotJSON = { ...next, anywhere: false };
  const dropsDirect = isDropDirectQuery(text);
  for (const key of CARRYABLE_SLOTS) {
    if (key === 'direct_only' && dropsDirect) continue;
    if (!hasValue(merged[key]) && hasValue(prev[key])) {
      (merged[key] as unknown) = prev[key];
    }
  }
  if (dropsDirect && next.direct_only == null) merged.direct_only = null;
  if (SAME_DATE_CUE.test(text) && (hasValue(prev.date_from) || hasValue(prev.date_to))) {
    merged.date_from = prev.date_from;
    merged.date_to = prev.date_to;
  }
  merged.missing = [
    ...(hasValue(merged.destination) ? [] : ['destination']),
    ...(hasValue(merged.date_from) || hasValue(merged.date_to) ? [] : ['dates']),
  ];
  return merged;
};

// Map the LLM's slot object onto the existing IntentJSON the filter consumes.
export const slotToIntent = (slot: SlotJSON): IntentJSON => {
  const intent: IntentJSON = {
    direction: slot.return_only ? 'return' : slot.round_trip ? 'both' : 'outbound',
  };

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
  if (slot.weekend) intent.weekend_only = true;

  return intent;
};

// Display helper for a London airport code (falls back to the code).
export const londonAirportLabel = (code: string): string =>
  AIRPORT_TO_CITY[code] || code;
