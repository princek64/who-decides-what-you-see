import type { IntentJSON } from '../hooks/useFlightFilter';
import { AIRPORT_TO_CITY, DESTINATION_CITIES } from './airportMap';
import { DATA_MIN, DATA_MAX, getSearchAnchor } from '../constants/prompts';

// Strict JSON slot contract; optional keys preserve price/time/airline filters.
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
  /** App-side only: both directions (anywhere→city pick or explicit round trip). */
  round_trip?: boolean;
  /** App-side only: inbound leg only; takes priority over round_trip. */
  return_only?: boolean;
  /** App-side only: keep connecting flights when prose would prefer directs. */
  keep_stops?: boolean;
  /** App-side only: open-explore region filter; cleared on city or lift. */
  dest_region?: 'eastern_europe' | null;
}

// Dataset origins are London-only.
export const LONDON_CODES = ['LHR', 'LGW', 'STN', 'LTN', 'SEN', 'LCY'] as const;
const LONDON_CODE_SET = new Set<string>(LONDON_CODES);

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

export const classifyOrigin = (origin: string | null | undefined): OriginKind => {
  if (!origin || !origin.trim()) return { kind: 'none' };
  const raw = origin.trim();
  const up = raw.toUpperCase();
  if (LONDON_CODE_SET.has(up)) return { kind: 'london-code', code: up };

  const low = raw.toLowerCase();
  for (const [token, code] of LONDON_NAME_TOKENS) {
    if (low.includes(token)) return { kind: 'london-code', code };
  }
  // Bare "London…" → all London airports.
  if (low === 'london' || low.startsWith('london')) return { kind: 'london-all' };

  return { kind: 'foreign', label: raw };
};

// Ask destination before dates.
export const firstMissingRequiredSlot = (
  slot: SlotJSON
): 'destination' | 'dates' | null => {
  // Anywhere / region explore is complete without a named city.
  if (slot.anywhere || slot.dest_region === 'eastern_europe') return null;
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

// Round-trip dates ask states both valid answer shapes in one turn.
export const datesQuestionFor = (slot: SlotJSON): string =>
  slot.round_trip || slot.return_only
    ? 'Which dates? A single day shows flights both ways — or give an outbound and return date, like "30 August out, 3 September back."'
    : SLOT_QUESTIONS.dates;


// Open explore + replies that decline to name a city after a destination ask.
export const isAnywhereQuery = (text: string): boolean =>
  /\bwhere (?:can|could|should|might|would|to)\b/i.test(text) ||
  /\b(?:surprise me|anywhere|somewhere)\b/i.test(text) ||
  /\bwhere (?:can|could|should) (?:i|we|you)\b/i.test(text) ||
  /\bany\s+destinations?\b/i.test(text) ||
  /\bsuggest(?:\s+\w+){0,3}\s+destinations?\b/i.test(text) ||
  /\brecommend(?:\s+\w+){0,3}\s+destinations?\b/i.test(text) ||
  /\bno\s+(?:particular|specific|preferred)\s+(?:city|destination|place)\b/i.test(text);

/** Explicit one-way — must clear round_trip even after an anywhere→city pick. */
export const isOneWayQuery = (text: string): boolean =>
  /\bone[- ]way\b/i.test(text) ||
  /\boutbound\s+only\b/i.test(text) ||
  /\bsingle\s+(?:flight|ticket|fare|leg)\b/i.test(text);

/** Recommend from on-screen results; do not re-run search. */
export const isPickBestQuery = (text: string): boolean =>
  /\bpick\s+(?:the\s+)?best\b/i.test(text) ||
  /\bbest\s+(?:one|option|flight|for\s+me)\b/i.test(text) ||
  /\b(?:you|just)\s+(?:choose|decide|pick)\b/i.test(text) ||
  /\bchoose\s+(?:one|for\s+me)\b/i.test(text) ||
  /\brecommend\b/i.test(text);

// Direct-vs-stop recommendation (not just a filtered list).
export const isCompareQuery = (text: string): boolean =>
  /\bcompare\b/i.test(text) ||
  /\bdirect\b.*\b(?:vs\.?|versus|or|against|with)\b.*\b(?:connect|stop|indirect|1[- ]?stop|one[- ]?stop)/i.test(text) ||
  /\b(?:connect|stop|indirect)\w*\b.*\b(?:vs\.?|versus|or)\b.*\bdirect\b/i.test(text) ||
  /\bdirect (?:vs\.?|or) (?:a )?(?:stop|connecting)/i.test(text);

export const isCheapestWhenQuery = (text: string): boolean =>
  /\bcheapest\b.*\b(?:day|weekend|date|time|to (?:go|fly|travel))\b/i.test(text) ||
  /\bbest (?:time|day|weekend|date)\b.*\b(?:to (?:go|fly|travel)|for)\b/i.test(text) ||
  /\bwhen(?:'s| is)?\b.*\bcheapest\b/i.test(text);

// Callers that set direct_only must also exclude isCompareQuery.
export const isDirectOnlyQuery = (text: string): boolean =>
  /\b(?:only|just)\s+(?:show\s+|see\s+|give\s+me\s+)?(?:me\s+)?(?:the\s+)?direct\b/i.test(text) ||
  /\bdirect\s+(?:flights?\s+)?only\b/i.test(text) ||
  /\bnarrow(?:\s+it)?\s+to\s+direct\b/i.test(text) ||
  /\bnon[- ]?stop\s+only\b/i.test(text) ||
  /\bdirect(?:\s+one[- ]way)?\s+flights?\b/i.test(text) ||
  /\bone[- ]way\s+direct\s+flights?\b/i.test(text) ||
  /\bfly\s+direct\b/i.test(text) ||
  /\bnon[- ]?stops?\b/i.test(text);

// Open connecting options (typos/"the stop" → search refine, not stops detail).
export const isDropDirectQuery = (text: string): boolean =>
  /\b(?:inclu\w*|allow|add|also show|show|see|consider|open up to|open it up to)\b[^.?!]{0,48}\b(?:stop|stops|stopover|stopovers|connecting|indirect)\b/i.test(
    text
  ) ||
  /\b(?:the\s+)?(?:ones?|flights?)\s+with\s+(?:a\s+|the\s+)?(?:stop|stops|stopover)\b/i.test(text) ||
  /\b(?:don'?t|do not|no longer)\s+(?:keep|make|need)\s+(?:it\s+)?direct\b/i.test(text) ||
  /\bnot\s+just\s+direct\b/i.test(text);

// Model often misses low_co2 when CO₂ is written as a symbol.
export const isLowCo2Query = (text: string): boolean =>
  /\b(?:low|lower|lowest|less|least|reduce|reduced|greener?|eco)\w*[\s-]*(?:co2\b|co₂|carbon\b|emissions?\b|footprint\b)/i.test(text);

/**
 * Explicit "all/every/full list" display request — requires the all-quantifier
 * so ordinary "show me flights to Rome" still goes through search.
 */
export const isShowAllQuery = (text: string): boolean =>
  /\b(?:show|list|see|give|display|view)\s+(?:me\s+|us\s+)?(?:all|every)\b/i.test(text) ||
  /\b(?:show|list|see|view)\s+(?:me\s+|us\s+)?(?:the\s+)?(?:full|complete|whole|entire)\s+(?:list|set|results?)\b/i.test(text) ||
  /\ball\s+(?:the\s+)?(?:options|flights|results)\b/i.test(text) ||
  /\beverything\s+(?:you\s+(?:have|found)|available)\b/i.test(text) ||
  /\b(?:what|which)\s+(?:are\s+)?(?:all\s+)?(?:my|the)\s+(?:other\s+)?options\b/i.test(text);

// UK English: bare "return flight(s)/trip/ticket" means round trip, not inbound-only.
export const isRoundTripQuery = (text: string): boolean =>
  // Match trip/ticket/etc. — "flight" alone missed "cheapest return trip".
  /\breturn\s+(?:flights?|trips?|tickets?|fares?|journeys?)\b/i.test(text) ||
  /\bround[\s-]?trips?\b/i.test(text) ||
  /\bthere\s+and\s+back\b/i.test(text) ||
  /\bout\s+and\s+back\b/i.test(text) ||
  /\bboth\s+ways\b/i.test(text) ||
  /\bgoing\s+and\s+coming\s+back\b/i.test(text) ||
  /\b(?:fly|flying|travel|travelling|traveling)\s+(?:out\s+)?and\s+back\b/i.test(text);

/**
 * Follow-up to add the return leg to the search on screen (both legs).
 * Distinct from isReturnOnlyQuery (inbound-only with its own dest/date).
 * Callers require no destination/date in the message.
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

// Inbound-only ("flight back" / "return leg") — not bare "…and come back on DATE".
export const isReturnOnlyQuery = (text: string): boolean =>
  /\bflights?\s+back\b/i.test(text) ||
  /\bflying\s+back\b/i.test(text) ||
  /\b(?:return|inbound)\s+leg\b/i.test(text) ||
  /\bcoming\s+back\s+flights?\b/i.test(text);

// Bare price correction — clear model-echoed dates so carry-forward can restore them.
export const isPriceOnlyQuery = (text: string): boolean =>
  /^\s*(?:sorry,?\s*|ok(?:ay)?,?\s*|actually,?\s*)?£?\s*\d+(?:\.\d+)?\s*(?:pounds?|gbp|quid)?\s*[.!?]?\s*$/i.test(
    text
  );

// Text extractors for off_topic / empty-slot backstops (gated behind flight regexes).

// Longest match wins; DESTINATION_CITIES excludes London airports.
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
  // German month spellings (live sessions) so dateFromText does not miss the day.
  januar: 1, februar: 2, maerz: 3, 'märz': 3, marz: 3, mai: 5, juni: 6,
  juli: 7, oktober: 10, dezember: 12,
};
const MONTH_NAMES = Object.keys(MONTHS).join('|');
const DAY_THEN_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAMES})\\b`, 'i');
const MONTH_THEN_DAY = new RegExp(`\\b(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');
const DAY_OF_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+of\\s+(${MONTH_NAMES})\\b`, 'i');
// UK day/month via slash only — "-" / "." collide with price ranges and decimals.
const NUMERIC_DAY_MONTH = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;

const pad = (n: number): string => String(n).padStart(2, '0');

// Yearless "20 September" → first year inside the dataset window (or null).
const isoWithinDataWindow = (day: number, month: number): string | null => {
  for (let year = Number(DATA_MIN.slice(0, 4)); year <= Number(DATA_MAX.slice(0, 4)); year++) {
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    const d = new Date(`${iso}T00:00:00`);
    const real = !isNaN(d.getTime()) && d.getDate() === day && d.getMonth() + 1 === month;
    if (real && iso >= DATA_MIN && iso <= DATA_MAX) return iso;
  }
  return null;
};

/** Day+month (or ISO) → ISO inside the data window, else null. */
export const dateFromText = (text: string): string | null => {
  // "of" form before bare day+month (adjacency cannot span "of").
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

/** "under £80" / "under 80" / "below 80 pounds" / "max £150" / "for under 25". */
export const maxPriceFromText = (text: string): number | null => {
  const m =
    /\b(?:under|below|less\s+than|up\s+to|max(?:imum)?)\s*£?\s*(\d+(?:\.\d+)?)\s*(?:pounds?|gbp|quid)?\b/i.exec(
      text
    ) ||
    /£\s*(\d+(?:\.\d+)?)/i.exec(text) ||
    /\b(\d+(?:\.\d+)?)\s*(?:pounds?|gbp|quid)\b/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

/** Budget/weekend explore with no city — treat like anywhere (don't keep prior city). */
export const isBudgetExploreQuery = (text: string): boolean =>
  !destinationFromText(text) &&
  maxPriceFromText(text) != null &&
  (/\bweekend\b/i.test(text) ||
    /\banywhere\b|\bsomewhere\b|\bwhere\b/i.test(text) ||
    /\bbudget\b/i.test(text)) &&
  /\b(?:fly|flying|flight|flights|options?|go|travel|trip)\b/i.test(text);

/** Anywhere wording OR an open budget/weekend explore with no city named. */
export const isOpenExploreQuery = (text: string): boolean =>
  isAnywhereQuery(text) || isBudgetExploreQuery(text);

/**
 * "after 6pm" / "from 6pm" (am/pm required on "from") / bare "evening" → HH:MM.
 */
export const departureAfterFromText = (text: string): string | null => {
  const clock =
    /\b(?:after|leaves?\s+after)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(text) ||
    /\bfrom\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text);
  if (clock) {
    let hours = Number(clock[1]);
    const mins = clock[2] ? Number(clock[2]) : 0;
    const meridiem = (clock[3] || '').toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    // Bare "after 6" → evening, not 06:00.
    if (!meridiem && !clock[2] && hours >= 1 && hours <= 11) hours += 12;
    if (hours >= 0 && hours <= 23 && mins >= 0 && mins <= 59) {
      return `${pad(hours)}:${pad(mins)}`;
    }
  }
  if (/\bevening\b/i.test(text)) return '18:00';
  return null;
};

/**
 * "next three months" / "next month" → [anchor, end] clamped to dataset; else null.
 */
export const flexibleWindowFromText = (
  text: string
): { date_from: string; date_to: string } | null => {
  const three =
    /\b(?:in|over|for|during|within)\s+the\s+next\s+(?:three|3)\s+months?\b/i.exec(text) ||
    /\bnext\s+(?:three|3)\s+months?\b/i.exec(text);
  const one =
    !three &&
    (/\b(?:in|over|for|during|within)\s+the\s+next\s+months?\b/i.exec(text) ||
      /\bnext\s+months?\b/i.exec(text));
  if (!three && !one) return null;
  const from = getSearchAnchor();
  const end = new Date(`${from}T00:00:00`);
  if (three) end.setMonth(end.getMonth() + 3);
  else end.setDate(end.getDate() + 30);
  let to = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  if (to > DATA_MAX) to = DATA_MAX;
  if (from > to) return null;
  return { date_from: from, date_to: to };
};

/** True when the model’s date span is clearly narrower than a stated multi-month window. */
const windowLooksCollapsed = (slot: SlotJSON, window: { date_from: string; date_to: string }): boolean => {
  const from = typeof slot.date_from === 'string' ? slot.date_from.trim() : '';
  const to = typeof slot.date_to === 'string' ? slot.date_to.trim() : '';
  if (!from || !to) return true;
  const span =
    (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000;
  const want =
    (new Date(`${window.date_to}T00:00:00`).getTime() -
      new Date(`${window.date_from}T00:00:00`).getTime()) /
    86400000;
  return span < Math.min(60, want * 0.5);
};

/**
 * Refinement of on-screen results ("the other flight") — no dest/date of its own.
 * Requires a referent noun; callers also require no dest/date in the message.
 * Without this, few-shot echoes look like a new search and drop carried slots.
 */
export const isRefinementQuery = (text: string): boolean =>
  /\bthe\s+(?:other|next|second|third|last|first|cheaper|earlier|later)\s+(?:one|ones|option|options|flight|flights|result|results)\b/i.test(text) ||
  /\bthe\s+other\b\s*[.!?]?\s*$/i.test(text) ||
  /\bthe\s+(?:one|ones)\s+(?:with|without|that|which)\b/i.test(text) ||
  /\b(?:next|other)\s+(?:cheapest|fastest)\b/i.test(text);

/** Refinement with no dest/date of its own — carry every established slot. */
export const isPureRefinement = (text: string): boolean =>
  isRefinementQuery(text) && !destinationFromText(text) && !dateFromText(text);

// Lets "same date" defer date recovery to resolveTurnSlot carry-forward.
const SAME_DATE_CUE = /\bsame (?:date|day|dates|time)\b/i;

export const applyWordingBackstops = (slot: SlotJSON, text: string): SlotJSON => {
  if (isPriceOnlyQuery(text)) {
    slot.date_from = null;
    slot.date_to = null;
  }
  // Refinement is a flight turn — clear off_topic before handleParsedSlot short-circuits.
  if (isPureRefinement(text)) slot.off_topic = false;
  // Open explore clears a leftover destination from the previous task.
  if (isOpenExploreQuery(text) && !destinationFromText(text)) {
    slot.anywhere = true;
    slot.destination = null;
  } else if (slot.anywhere && !isOpenExploreQuery(text) && !isEasternEuropeQuery(text) && !isLiftRegionQuery(text)) {
    slot.anywhere = false;
  }
  if (isEasternEuropeQuery(text) && !destinationFromText(text) && !isLiftRegionQuery(text)) {
    slot.anywhere = true;
    slot.destination = null;
    slot.dest_region = 'eastern_europe';
  }
  if (isLiftRegionQuery(text)) {
    slot.anywhere = true;
    slot.destination = null;
    slot.dest_region = null;
  }
  if (destinationFromText(text)) {
    slot.dest_region = null;
  }
  if (isCompareQuery(text)) {
    slot.compare = true;
    // Compare wording contains "direct" — force both stop types on first answer.
    slot.direct_only = null;
    slot.keep_stops = true;
  }
  if (isCheapestWhenQuery(text)) slot.cheapest_when = true;
  if (/\bweekend\b/i.test(text)) slot.weekend = true;

  if (slot.direct_only == null && !isCompareQuery(text) && isDirectOnlyQuery(text)) {
    slot.direct_only = true;
    slot.keep_stops = false;
  }
  // Connecting options are a search refine, not a stops detail lookup.
  if (isDropDirectQuery(text)) {
    slot.direct_only = null;
    slot.keep_stops = true;
    slot.detail_field = null;
    slot.off_topic = false;
  }
  if (!slot.low_co2 && isLowCo2Query(text)) slot.low_co2 = true;
  if (!slot.round_trip && isRoundTripQuery(text)) slot.round_trip = true;
  // Explicit one-way wins over return-trip echoes and anywhere→city round_trip.
  if (isOneWayQuery(text)) {
    slot.round_trip = false;
    slot.return_only = false;
  }

  // Prefer typed facts over model invent/drop. Named city wins so task switches
  // in-thread do not keep the previous destination.
  const namedDestination = destinationFromText(text);
  if (namedDestination && !isPureRefinement(text) && !isPriceOnlyQuery(text)) {
    slot.destination = namedDestination;
    slot.anywhere = false;
  }

  const statedPrice = maxPriceFromText(text);
  if (statedPrice != null) slot.max_price = statedPrice;

  const statedAfter = departureAfterFromText(text);
  if (statedAfter) slot.departure_after = statedAfter;

  if (isReturnOnlyQuery(text)) {
    slot.return_only = true;
    // Model often marks return-leg turns off_topic (clears before short-circuits).
    slot.off_topic = false;
    // Fill blanks from text when the model returned only off_topic.
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

  // User text wins on dates. Skip detail turns and price-only (carry-forward owns those).
  const isDetailTurn = Boolean(String(slot.detail_field ?? '').trim());
  if (!isDetailTurn && !isPriceOnlyQuery(text) && !SAME_DATE_CUE.test(text)) {
    const window = flexibleWindowFromText(text);
    if (window && windowLooksCollapsed(slot, window)) {
      slot.date_from = window.date_from;
      slot.date_to = window.date_to;
    } else {
      const date = dateFromText(text);
      if (date) {
        slot.date_from = date;
        slot.date_to = date;
      }
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
  'keep_stops',
  'dest_region',
  'anywhere',
] as const;

const MODIFIER_CUE =
  /\b(?:instead|same date|same day|same dates|same time|same budget|same price|same cap|that date|those dates|make it|change (?:it|that) to|what about|how about|and also|as well|rather than|but|restrict|narrow|only show|only\s+(?:the\s+)?(?:ones?|flights?)|filter(?:\s+to)?|limit(?:\s+to)?)\b/i;

/** Scope refine of the current results without naming a new city. */
export const isScopeRefineQuery = (text: string): boolean =>
  /\brestrict\b/i.test(text) ||
  /\bnarrow\b/i.test(text) ||
  /\bonly\s+(?:show|the|direct|weekend|flights?)\b/i.test(text) ||
  /\bfilter\s+to\b/i.test(text) ||
  /\blimit\s+to\b/i.test(text) ||
  isEasternEuropeQuery(text);

// Explicit reset — includes bare "forget everything".
export const RESET_CUE =
  /\b(?:start over|start again|new search|forget(?:\s+(?:that|it|the|everything|all))?(?:\s+please)?|reset|never ?mind|clear(?:\s+(?:search|all|everything))?)\b/i;

/** Broaden / lift a region restrict back to all Europe (anywhere explore). */
export const isLiftRegionQuery = (text: string): boolean =>
  /\blift\s+(?:the\s+)?restriction\b/i.test(text) ||
  /\ball\s+europe\b/i.test(text) ||
  /\bany(?:where)?\s+in\s+europe\b/i.test(text) ||
  /\bentire\s+europe\b/i.test(text) ||
  /\bno\s+(?:region\s+)?restriction\b/i.test(text) ||
  // Bare Europe-wide replies (no city) after a destination ask.
  (!destinationFromText(text) &&
    (/\bwithin\s+europe\b/i.test(text) ||
      /\b(?:destinations?|places?|cities|options?|flights?)\s+in\s+europe\b/i.test(text) ||
      /\bonly\s+(?:in\s+)?europe\b/i.test(text)));

/** Eastern Europe / east-of-Germany without a city — region filter, not dest ask. */
export const isEasternEuropeQuery = (text: string): boolean =>
  /\beastern\s+europe(?:an)?\b/i.test(text) ||
  /\beast(?:ern)?\s+(?:of\s+)?(?:europe|germany)\b/i.test(text) ||
  /\bcountries?\s+east(?:ern)?\s+of\s+germany\b/i.test(text) ||
  /\beast\s+of\s+germany\b/i.test(text);

/** Countries treated as Eastern Europe for the study dataset filter. */
export const EASTERN_EUROPE_COUNTRIES = new Set([
  'Poland',
  'Czechia',
  'Slovakia',
  'Hungary',
  'Romania',
  'Bulgaria',
  'Estonia',
  'Latvia',
  'Lithuania',
  'Croatia',
  'Slovenia',
  'Serbia',
  'Bosnia & Herzegovina',
  'Albania',
  'North Macedonia',
  'Moldova',
  'Montenegro',
  'Ukraine',
]);

/** Destination cities in-network that count as Eastern Europe (see airportMap). */
export { EASTERN_EUROPE_CITIES, easternEuropeAirportCodes } from './airportMap';

const hasValue = (v: unknown): boolean =>
  v !== null && v !== undefined && !(typeof v === 'string' && !v.trim());

export const resolveTurnSlot = (
  prev: SlotJSON | null | undefined,
  nextRaw: SlotJSON,
  text: string
): SlotJSON => {
  if (nextRaw.off_topic) return nextRaw;

  const wantsExplore =
    (Boolean(nextRaw.anywhere) && isOpenExploreQuery(text)) ||
    isLiftRegionQuery(text) ||
    (isEasternEuropeQuery(text) && !destinationFromText(text));

  if (RESET_CUE.test(text)) {
    const day = dateFromText(text);
    const window = flexibleWindowFromText(text);
    const dest = destinationFromText(text);
    const eastern = isEasternEuropeQuery(text) && !isLiftRegionQuery(text) && !dest;
    return {
      ...nextRaw,
      destination: dest ?? null,
      date_from: day ?? window?.date_from ?? null,
      date_to: day ?? window?.date_to ?? null,
      dest_region: eastern ? 'eastern_europe' : null,
      anywhere:
        Boolean(nextRaw.anywhere) ||
        isOpenExploreQuery(text) ||
        isLiftRegionQuery(text) ||
        eastern,
      missing: [],
    };
  }

  if (!prev) {
    if (wantsExplore || (isEasternEuropeQuery(text) && !destinationFromText(text))) {
      const eastern = isEasternEuropeQuery(text) && !isLiftRegionQuery(text);
      return {
        ...nextRaw,
        anywhere: true,
        destination: null,
        dest_region: eastern ? 'eastern_europe' : nextRaw.dest_region ?? null,
        missing: [],
      };
    }
    return nextRaw;
  }

  // Explore keeps budget/weekend from prev but drops city, dates, time filters.
  if (wantsExplore) {
    const eastern =
      isEasternEuropeQuery(text) && !isLiftRegionQuery(text);
    const window = flexibleWindowFromText(text);
    const day = dateFromText(text);
    return {
      ...nextRaw,
      anywhere: true,
      destination: null,
      departure_after: null,
      departure_before: null,
      compare: false,
      cheapest_when: false,
      round_trip: false,
      return_only: false,
      dest_region: eastern ? 'eastern_europe' : null,
      max_price: hasValue(nextRaw.max_price) ? nextRaw.max_price : prev.max_price ?? null,
      weekend: Boolean(nextRaw.weekend) || Boolean(prev.weekend) || /\bweekend\b/i.test(text),
      // Region refine of an already-dated explore keeps dates (avoid re-ask).
      date_from: day ?? window?.date_from ?? (hasValue(nextRaw.date_from) ? nextRaw.date_from : prev.date_from),
      date_to: day ?? window?.date_to ?? (hasValue(nextRaw.date_to) ? nextRaw.date_to : prev.date_to),
      missing: [],
    };
  }

  // Pure refinement: clear model few-shot dest/dates so merge carries prev.
  const refinement = isPureRefinement(text);
  const next: SlotJSON = refinement
    ? { ...nextRaw, destination: null, date_from: null, date_to: null }
    : nextRaw;

  const hasDestination = hasValue(next.destination);
  const hasDates = hasValue(next.date_from) || hasValue(next.date_to);
  const isModifier = refinement || MODIFIER_CUE.test(text) || isScopeRefineQuery(text);

  const prevDest = hasValue(prev.destination) ? String(prev.destination).trim().toLowerCase() : null;
  const nextDest = hasValue(next.destination) ? String(next.destination).trim().toLowerCase() : null;
  const textDestRaw = destinationFromText(text);
  const textDest = textDestRaw ? textDestRaw.trim().toLowerCase() : null;
  const sameDestination = prevDest !== null && nextDest !== null && prevDest === nextDest;
  // Prefer typed city when deciding "new search?".
  const destinationIntroduced =
    (hasDestination && !sameDestination) ||
    (textDest !== null && prevDest !== null && textDest !== prevDest);

  // Anywhere→city defaults to round trip unless one-way.
  const fromExploration = Boolean(prev.anywhere) && !hasValue(prev.destination);
  const oneWay = isOneWayQuery(text);

  if ((destinationIntroduced && !isModifier) || (hasDestination && hasDates && !isModifier)) {
    const fresh =
      fromExploration && !oneWay ? { ...next, round_trip: true } : { ...next };
    if (textDestRaw) fresh.destination = textDestRaw;
    if (oneWay) {
      fresh.round_trip = false;
      fresh.return_only = false;
    }
    // New city search must not keep prior-task filters the message did not restate.
    if (destinationIntroduced && !isModifier) {
      if (!maxPriceFromText(text)) fresh.max_price = null;
      if (!departureAfterFromText(text)) {
        fresh.departure_after = null;
        fresh.departure_before = null;
      }
      if (!isCompareQuery(text)) fresh.compare = false;
      if (!isCheapestWhenQuery(text)) fresh.cheapest_when = false;
      if (!/\bweekend\b/i.test(text)) fresh.weekend = false;
      if (!isRoundTripQuery(text) && !fromExploration) fresh.round_trip = false;
      if (!isReturnOnlyQuery(text)) fresh.return_only = false;
      if (isCompareQuery(text) || !isDirectOnlyQuery(text)) fresh.direct_only = null;
      if (!isDropDirectQuery(text)) fresh.keep_stops = false;
      if (oneWay) {
        fresh.round_trip = false;
        fresh.return_only = false;
      }
    }
    return fresh;
  }

  const merged: SlotJSON = { ...next, anywhere: false };
  const dropsDirect = isDropDirectQuery(text);
  for (const key of CARRYABLE_SLOTS) {
    if (key === 'direct_only' && dropsDirect) continue;
    // compare / cheapest_when are turn intents — do not carry into plain date changes.
    if (key === 'compare' && !isCompareQuery(text)) continue;
    if (key === 'cheapest_when' && !isCheapestWhenQuery(text)) continue;
    if (!hasValue(merged[key]) && hasValue(prev[key])) {
      (merged[key] as unknown) = prev[key];
    }
  }
  if (dropsDirect) {
    merged.direct_only = null;
    merged.keep_stops = true;
  }
  if (!isCompareQuery(text)) merged.compare = false;
  if (!isCheapestWhenQuery(text)) merged.cheapest_when = false;
  if (oneWay) {
    merged.round_trip = false;
    merged.return_only = false;
  }
  if (SAME_DATE_CUE.test(text) && (hasValue(prev.date_from) || hasValue(prev.date_to))) {
    merged.date_from = prev.date_from;
    merged.date_to = prev.date_to;
  }
  if (textDestRaw && destinationIntroduced) merged.destination = textDestRaw;
  merged.missing = [
    ...(hasValue(merged.destination) ? [] : ['destination']),
    ...(hasValue(merged.date_from) || hasValue(merged.date_to) ? [] : ['dates']),
  ];
  return merged;
};

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

  // true → direct only; false → with a stop; null → no filter
  if (slot.direct_only === true) intent.stops = 0;
  else if (slot.direct_only === false) intent.stops = 1;

  intent.sort_by = slot.sort === 'fastest' ? 'fastest' : 'cheapest';

  if (slot.max_price != null) intent.max_price = slot.max_price;
  if (slot.departure_after && slot.departure_after.trim()) intent.departure_after = slot.departure_after.trim();
  if (slot.departure_before && slot.departure_before.trim()) intent.departure_before = slot.departure_before.trim();
  if (slot.airline && slot.airline.trim()) intent.airline = slot.airline.trim();
  if (slot.flexibility && slot.flexibility.trim()) intent.flexibility = slot.flexibility.trim();
  if (slot.low_co2) intent.low_co2 = true;
  if (slot.weekend) intent.weekend_only = true;
  if (slot.dest_region === 'eastern_europe') intent.dest_region = 'eastern_europe';

  return intent;
};

export const londonAirportLabel = (code: string): string =>
  AIRPORT_TO_CITY[code] || code;
