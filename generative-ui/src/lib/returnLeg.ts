import { DESTINATION_CITIES } from './airportMap';
import { DATA_MIN, DATA_MAX } from '../constants/prompts';

// Mirrors the return-leg backstop in conversational-ui's lib/slots.ts. Kept as
// its own module because this app has no slot layer — its wording backstops
// live inline in useGenChat — and because these helpers are worth testing on
// their own.
//
// gpt-oss-20b answers some return-leg phrasings with {"off_topic": true} and
// nothing else, discarding a destination and date the user actually typed.
// useGenChat checks off_topic and returns before any backstop runs, so the
// correction has to happen ahead of that check.

// "flight back from Barcelona" / "the return leg" single out the INBOUND leg.
// Deliberately does not match bare "...and come back on 14 July" (no adjacent
// flight/leg word), which is round-trip date phrasing, not a leg request.
export const isReturnOnlyQuery = (text: string): boolean =>
  /\bflights?\s+back\b/i.test(text) ||
  /\bflying\s+back\b/i.test(text) ||
  /\b(?:return|inbound)\s+leg\b/i.test(text) ||
  /\bcoming\s+back\s+flights?\b/i.test(text);

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
  // German spellings seen in live sessions ("oktober 21") — without these,
  // dateFromText misses the day and the app re-asks "Which dates?".
  januar: 1, februar: 2, maerz: 3, 'märz': 3, marz: 3, mai: 5, juni: 6,
  juli: 7, oktober: 10, dezember: 12,
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
 * A message that refines the screen already rendered rather than starting a
 * new search: "show me the other flight", "show me the other option", "what
 * about the one with a stop", "the second one", "the next cheapest".
 *
 * Mirrors isRefinementQuery in conversational-ui's lib/slots.ts. These carry no
 * destination and no date of their own, so every constraint already established
 * has to survive them. That is not automatic: this app sends only the last
 * three USER messages as history, so once the dated turn falls out of that
 * window the model answers a refinement cold — and cold, gpt-oss-20b echoes a
 * destination and date straight out of the few-shot examples in the system
 * prompt rather than returning nothing.
 *
 * The referent noun is required (…"the other ONE/OPTION/FLIGHT"), so this does
 * not fire on "the other hotel" and turn an off-topic message into a search.
 */
export const isRefinementQuery = (text: string): boolean =>
  /\bthe\s+(?:other|next|second|third|last|first|cheaper|earlier|later)\s+(?:one|ones|option|options|flight|flights|result|results)\b/i.test(text) ||
  /\bthe\s+other\b\s*[.!?]?\s*$/i.test(text) ||
  /\bthe\s+(?:one|ones)\s+(?:with|without|that|which)\b/i.test(text) ||
  /\b(?:next|other)\s+(?:cheapest|fastest)\b/i.test(text);

/** True when the message is a refinement AND names no destination or date of
 *  its own — the case where every established constraint must carry forward. */
export const isPureRefinement = (text: string): boolean =>
  isRefinementQuery(text) && !destinationFromText(text) && !dateFromText(text);
