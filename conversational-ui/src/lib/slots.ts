import type { IntentJSON } from '../hooks/useFlightFilter';
import { AIRPORT_TO_CITY, DESTINATION_CITIES } from './airportMap';
import { DATA_MIN, DATA_MAX } from '../constants/prompts';

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
  // "return flight(s)" / "return trip" / "return ticket(s)" — the noun varies,
  // the meaning does not. Matching only "flight" sent "the cheapest return TRIP
  // to Paris" down the one-way path, which is how a round-trip request came
  // back with outbound flights only.
  /\breturn\s+(?:flights?|trips?|tickets?|fares?|journeys?)\b/i.test(text) ||
  /\bround[- ]trip\b/i.test(text) ||
  /\bthere\s+and\s+back\b/i.test(text) ||
  /\bout\s+and\s+back\b/i.test(text) ||
  /\bboth\s+ways\b/i.test(text) ||
  /\bgoing\s+and\s+coming\s+back\b/i.test(text) ||
  /\b(?:fly|flying|travel|travelling|traveling)\s+(?:out\s+)?and\s+back\b/i.test(text);

/**
 * A follow-up asking for the return leg of the search already on screen:
 * "show me the return tickets", "what about coming back", "return flights",
 * "flights back", "and the way back".
 *
 * Distinct from isReturnOnlyQuery, which answers a request that names its own
 * destination and date ("a flight back from Barcelona on 20 September") with the
 * inbound leg alone. As a follow-up to an outbound search the same wording means
 * something different — add the way home to what I already have — so the answer
 * is BOTH legs, and the existing destination, dates and constraints carry
 * forward untouched.
 *
 * Callers gate this on the message naming no destination and no date of its own,
 * so a fresh "return flights to Barcelona in October" is still a new search.
 */
export const isAddReturnLegQuery = (text: string): boolean =>
  /\b(?:show|see|get|give|find|add|include)\b[^.?!]{0,20}\breturn\s+(?:flights?|trips?|tickets?|fares?|legs?|journeys?)\b/i.test(text) ||
  /\bwhat\s+about\s+(?:the\s+)?(?:coming\s+back|getting\s+back|the\s+way\s+back|the\s+return)\b/i.test(text) ||
  /\b(?:and\s+)?(?:the\s+)?way\s+back\b/i.test(text) ||
  /\b(?:what|how)\s+about\s+(?:flights?\s+)?back\b/i.test(text) ||
  /^\s*(?:and\s+)?(?:the\s+)?return(?:\s+leg)?\s*[.?!]?\s*$/i.test(text) ||
  /\breturn\s+(?:flights?|tickets?)\b/i.test(text) ||
  /\bflights?\s+back\b/i.test(text) ||
  /\bcoming\s+back\b/i.test(text);

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

// When the model rejects a turn outright (see the return-leg branch below) it
// returns no slots at all, discarding a destination and date the user actually
// typed. These two read those fields straight off the message text so the
// backstop can put them back. Both are deliberately narrow: they only ever run
// behind a regex gate that has already established the message IS a flight
// request, so they never get a chance to mine a place name or a date out of an
// unrelated message.

// Longest match wins, so "Palma de Mallorca" is not shadowed by "Palma".
// DESTINATION_CITIES already excludes the London airports, so "flight back to
// London" cannot produce a destination.
export const destinationFromText = (text: string): string | null => {
  let best: string | null = null;
  for (const city of DESTINATION_CITIES) {
    const pattern = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(text) && (!best || city.length > best.length)) best = city;
  }
  return best;
};

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sept: 9, sep: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};
const MONTH_NAMES = Object.keys(MONTHS).join('|');
const DAY_THEN_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAMES})\\b`, 'i');
const MONTH_THEN_DAY = new RegExp(`\\b(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');
// "the 21st of November" — the "of" blocks DAY_THEN_MONTH's `\s+` adjacency.
const DAY_OF_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+of\\s+(${MONTH_NAMES})\\b`, 'i');
// "21/11" and "21/11/2026" — UK order, day first. Only the slash separator is
// accepted: "-" and "." both collide with things that are not dates at all
// ("50-80" for a price range, "1.5 hours"), and a day/month pair read out of
// those is a plausible-looking date rather than an obvious miss.
const NUMERIC_DAY_MONTH = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
// "2026-11-21" typed verbatim.
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;

const pad = (n: number): string => String(n).padStart(2, '0');

// The user says "20 September", never a year. Pick the year that puts the date
// inside the dataset window, so "20 September" resolves forward rather than to
// a date that has no flights. Returns null when no year fits, or when the
// day/month pair is not a real date (31 February).
const isoWithinDataWindow = (day: number, month: number): string | null => {
  for (let year = Number(DATA_MIN.slice(0, 4)); year <= Number(DATA_MAX.slice(0, 4)); year++) {
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    const d = new Date(`${iso}T00:00:00`);
    const real = !isNaN(d.getTime()) && d.getDate() === day && d.getMonth() + 1 === month;
    if (real && iso >= DATA_MIN && iso <= DATA_MAX) return iso;
  }
  return null;
};

/**
 * "20 September" / "20th Sept" / "September 20" / "the 21st of November" /
 * "21/11" / "2026-11-21" -> "2026-09-20". Returns null when the text holds no
 * day+month pair, or when the pair is not a real date inside the data window.
 */
export const dateFromText = (text: string): string | null => {
  // "the 21st of November" is checked before the bare day+month form, whose
  // `\s+` adjacency cannot span the "of".
  const dayOf = DAY_OF_MONTH.exec(text);
  if (dayOf) {
    const iso = isoWithinDataWindow(Number(dayOf[1]), MONTHS[dayOf[2].toLowerCase()]);
    if (iso) return iso;
  }
  const dayFirst = DAY_THEN_MONTH.exec(text);
  if (dayFirst) {
    const iso = isoWithinDataWindow(Number(dayFirst[1]), MONTHS[dayFirst[2].toLowerCase()]);
    if (iso) return iso;
  }
  const monthFirst = MONTH_THEN_DAY.exec(text);
  if (monthFirst) {
    const iso = isoWithinDataWindow(Number(monthFirst[2]), MONTHS[monthFirst[1].toLowerCase()]);
    if (iso) return iso;
  }
  const iso8601 = ISO_DATE.exec(text);
  if (iso8601) {
    const iso = isoWithinDataWindow(Number(iso8601[3]), Number(iso8601[2]));
    if (iso) return iso;
  }
  const numeric = NUMERIC_DAY_MONTH.exec(text);
  if (numeric) {
    const iso = isoWithinDataWindow(Number(numeric[1]), Number(numeric[2]));
    if (iso) return iso;
  }
  return null;
};

/**
 * A message that refines the results already on screen rather than starting a
 * new search: "show me the other flight", "show me the other option", "what
 * about the one with a stop", "the second one", "the next cheapest".
 *
 * These carry no destination and no date of their own, so every slot already
 * established has to survive them. That is not automatic: asked one of these
 * cold, gpt-oss-20b answers by echoing a destination and date straight out of
 * the few-shot examples in the system prompt — "show me the other option"
 * reliably returns Rome / 2026-07-10 from the comparison example. A model
 * destination that the user never typed reads to resolveTurnSlot as a NEW
 * search, which is what discards the real destination and date and sends the
 * turn back to "Which dates?".
 *
 * The referent noun is required (…"the other ONE/OPTION/FLIGHT"), so this does
 * not fire on "the other hotel" and turn an off-topic message into a search.
 * Callers additionally require the message to name no destination and no date
 * of its own, so "show me the other flight to Paris" stays a new search.
 */
export const isRefinementQuery = (text: string): boolean =>
  /\bthe\s+(?:other|next|second|third|last|first|cheaper|earlier|later)\s+(?:one|ones|option|options|flight|flights|result|results)\b/i.test(text) ||
  /\bthe\s+other\b\s*[.!?]?\s*$/i.test(text) ||
  /\bthe\s+(?:one|ones)\s+(?:with|without|that|which)\b/i.test(text) ||
  /\b(?:next|other)\s+(?:cheapest|fastest)\b/i.test(text);

/** True when the message is a refinement AND names no destination or date of
 *  its own — the case where every established slot must be carried forward. */
export const isPureRefinement = (text: string): boolean =>
  isRefinementQuery(text) && !destinationFromText(text) && !dateFromText(text);

export const applyWordingBackstops = (slot: SlotJSON, text: string): SlotJSON => {
  if (isPriceOnlyQuery(text)) {
    slot.date_from = null;
    slot.date_to = null;
  }
  // A refinement of the current results is a flight turn by definition, so it
  // can never be off-topic — and off_topic short-circuits ahead of every slot
  // read in handleParsedSlot, so it has to be cleared here to take effect.
  if (isPureRefinement(text)) slot.off_topic = false;
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
  if (isReturnOnlyQuery(text)) {
    slot.return_only = true;
    // gpt-oss-20b classifies several return-leg phrasings as off_topic — even
    // unambiguous ones carrying a destination and a date ("I need a flight
    // back from Barcelona on 20 September"). off_topic short-circuits ahead of
    // everything else (resolveTurnSlot returns immediately on it, and
    // handleParsedSlot answers with the off-topic message before any slot is
    // read), so setting return_only alone could never take effect. The wording
    // this regex matches is a flight request by definition, so clear the flag
    // here — the one point that runs before both short-circuits.
    slot.off_topic = false;
    // Clearing the flag alone still loses whatever the user actually said:
    // on these turns the model returns off_topic and nothing else, so a stated
    // destination and date would be dropped and the app would ask for details
    // already given. Read them off the message text instead. Only ever fills
    // blanks — anything the model did extract wins.
    if (!hasValue(slot.destination)) {
      const destination = destinationFromText(text);
      if (destination) slot.destination = destination;
    }
    if (!hasValue(slot.date_from) && !hasValue(slot.date_to)) {
      const date = dateFromText(text);
      if (date) {
        slot.date_from = date;
        slot.date_to = date;
      }
    }
  }

  // General date backstop. The return-leg branch above only runs on return-leg
  // wording, so a date the model dropped on any OTHER phrasing was never
  // recovered — and the app would ask "Which dates?" for a date the user had
  // plainly written. Stacking constraints into one sentence ("... on November
  // 21st after 6pm under £80") is where that was reported. Runs last so it can
  // only ever fill a blank: anything the model extracted, and anything the
  // branches above recovered, is left alone.
  //
  // Deliberately skipped on the two turn shapes where empty dates are the
  // correct answer rather than a miss: a detail question about a flight already
  // on screen (which must stay an empty search), and a bare price correction
  // (whose dates are cleared just above so carry-forward can supply them).
  const isDetailTurn = Boolean(String(slot.detail_field ?? '').trim());
  if (
    !hasValue(slot.date_from) &&
    !hasValue(slot.date_to) &&
    !isDetailTurn &&
    !isPriceOnlyQuery(text)
  ) {
    const date = dateFromText(text);
    if (date) {
      slot.date_from = date;
      slot.date_to = date;
    }
  }
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
  nextRaw: SlotJSON,
  text: string
): SlotJSON => {
  const wantsAnywhere = Boolean(nextRaw.anywhere) && isAnywhereQuery(text);
  if (!prev || RESET_CUE.test(text) || wantsAnywhere || nextRaw.off_topic) return nextRaw;

  // A refinement of the results on screen names no destination and no date of
  // its own, so anything the model returned in those two fields came from the
  // prompt's few-shot examples rather than from the user ("show me the other
  // option" reliably comes back as Rome / 2026-07-10). Left in place they read
  // as a brand-new search below, which is exactly how an established date got
  // thrown away and re-asked. Clearing them here routes the turn down the merge
  // path, where the real destination and date carry forward from prev.
  const refinement = isPureRefinement(text);
  const next: SlotJSON = refinement
    ? { ...nextRaw, destination: null, date_from: null, date_to: null }
    : nextRaw;

  const hasDestination = hasValue(next.destination);
  const hasDates = hasValue(next.date_from) || hasValue(next.date_to);
  const isModifier = refinement || MODIFIER_CUE.test(text);

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
