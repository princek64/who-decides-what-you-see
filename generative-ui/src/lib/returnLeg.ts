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
};
const MONTH_NAMES = Object.keys(MONTHS).join('|');
const DAY_THEN_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAMES})\\b`, 'i');
const MONTH_THEN_DAY = new RegExp(`\\b(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');

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

/** "20 September" / "20th Sept" / "September 20" -> "2026-09-20". */
export const dateFromText = (text: string): string | null => {
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
  return null;
};
