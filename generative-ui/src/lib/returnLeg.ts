import { DESTINATION_CITIES } from './airportMap';
import { DATA_MIN, DATA_MAX } from '../constants/prompts';

// Return-leg / date / refinement wording helpers (mirrors conversational-ui slots).
// Must run before off_topic short-circuit — model sometimes returns only {"off_topic": true}.

// Requires an adjacent flight/leg word; bare "come back on 14 July" is round-trip dates.
export const isReturnOnlyQuery = (text: string): boolean =>
  /\bflights?\s+back\b/i.test(text) ||
  /\bflying\s+back\b/i.test(text) ||
  /\b(?:return|inbound)\s+leg\b/i.test(text) ||
  /\bcoming\s+back\s+flights?\b/i.test(text);

// Longest match wins ("Palma de Mallorca" before "Palma"). London airports excluded.
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
  // German spellings ("oktober 21") — otherwise dateFromText misses and we re-ask.
  januar: 1, februar: 2, maerz: 3, 'märz': 3, marz: 3, mai: 5, juni: 6,
  juli: 7, oktober: 10, dezember: 12,
};
const MONTH_NAMES = Object.keys(MONTHS).join('|');
const DAY_THEN_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAMES})\\b`, 'i');
const MONTH_THEN_DAY = new RegExp(`\\b(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');
// "the 21st of November" — "of" blocks DAY_THEN_MONTH adjacency.
const DAY_OF_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+of\\s+(${MONTH_NAMES})\\b`, 'i');
// UK day/month with slash only — "-" / "." collide with price ranges and decimals.
const NUMERIC_DAY_MONTH = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;

const pad = (n: number): string => String(n).padStart(2, '0');

// Yearless "20 September" → year inside the dataset window (or null if impossible).
const isoWithinDataWindow = (day: number, month: number): string | null => {
  for (let year = Number(DATA_MIN.slice(0, 4)); year <= Number(DATA_MAX.slice(0, 4)); year++) {
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    const d = new Date(`${iso}T00:00:00`);
    const real = !isNaN(d.getTime()) && d.getDate() === day && d.getMonth() + 1 === month;
    if (real && iso >= DATA_MIN && iso <= DATA_MAX) return iso;
  }
  return null;
};

/** Parse a day+month (or ISO) into YYYY-MM-DD inside the data window. */
export const dateFromText = (text: string): string | null => {
  // "of" form first — bare day+month `\s+` cannot span it.
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
 * Refinement wording ("the other option", etc.). Requires a referent noun so
 * "the other hotel" stays off-topic. With only last-3 user history, cold model
 * answers otherwise invent dest/date from few-shots.
 */
export const isRefinementQuery = (text: string): boolean =>
  /\bthe\s+(?:other|next|second|third|last|first|cheaper|earlier|later)\s+(?:one|ones|option|options|flight|flights|result|results)\b/i.test(text) ||
  /\bthe\s+other\b\s*[.!?]?\s*$/i.test(text) ||
  /\bthe\s+(?:one|ones)\s+(?:with|without|that|which)\b/i.test(text) ||
  /\b(?:next|other)\s+(?:cheapest|fastest)\b/i.test(text);

/** Refinement with no dest/date of its own — prior constraints must carry forward. */
export const isPureRefinement = (text: string): boolean =>
  isRefinementQuery(text) && !destinationFromText(text) && !dateFromText(text);
