/**
 * Deterministic slots for the five dissertation study tasks.
 *
 * Each scripted task phrasing (and close variants participants type while
 * testing) is resolved locally so those turns never call Groq. On the free
 * tier a cold call costs ~3.5k tokens against a 200k/day org quota; skipping
 * the five task opens plus common follow-up restarts is the highest-leverage
 * protection during user testing.
 *
 * Free-form follow-ups that are not matched here still go through the model
 * (or through the existing local handlers: show-all, pick-best, return-leg,
 * detail answers).
 */

import {
  applyWordingBackstops,
  dateFromText,
  departureAfterFromText,
  flexibleWindowFromText,
  maxPriceFromText,
} from './slots';
import type { SlotJSON } from './slots';

const blank = (over: Partial<SlotJSON> = {}): SlotJSON => ({
  destination: null,
  date_from: null,
  date_to: null,
  cabin: null,
  direct_only: null,
  sort: 'cheapest',
  missing: [],
  origin: null,
  max_price: null,
  departure_after: null,
  departure_before: null,
  airline: null,
  flexibility: null,
  low_co2: null,
  anywhere: false,
  compare: false,
  cheapest_when: false,
  weekend: false,
  detail_field: null,
  detail_target: null,
  off_topic: false,
  ...over,
});

const finalize = (slot: SlotJSON, text: string): SlotJSON =>
  applyWordingBackstops(slot, text);

/** Task 1 — cheapest direct one-way London → Barcelona on a stated day. */
const matchBarcelonaDirect = (text: string): SlotJSON | null => {
  if (!/\bbarcelona\b/i.test(text)) return null;
  if (!/\b(?:one[\s-]?way|direct|non[\s-]?stop)\b/i.test(text)) return null;
  const day = dateFromText(text);
  if (!day) return null;
  return finalize(
    blank({
      destination: 'Barcelona',
      date_from: day,
      date_to: day,
      cabin: 'Economy',
      direct_only: true,
      sort: 'cheapest',
    }),
    text
  );
};

/**
 * Task 2 — one-way Amsterdam with evening departure and/or a price cap.
 * Date optional in wording ("on november 21st?") — when absent, dates stay
 * missing so the app asks rather than inventing a day.
 */
const matchAmsterdamConstrained = (text: string): SlotJSON | null => {
  if (!/\bamsterdam\b/i.test(text)) return null;
  const price = maxPriceFromText(text);
  const after = departureAfterFromText(text);
  // Need at least one of the Task 2 constraints so a bare "flights to Amsterdam"
  // still goes through the model.
  if (price == null && after == null) return null;
  if (!/\b(?:one[\s-]?way|flight|flights|fly|flying)\b/i.test(text)) return null;
  const day = dateFromText(text);
  return finalize(
    blank({
      destination: 'Amsterdam',
      date_from: day,
      date_to: day,
      cabin: 'Economy',
      sort: 'cheapest',
      max_price: price,
      departure_after: after,
      missing: day ? [] : ['dates'],
    }),
    text
  );
};

/** Task 3 — compare one-way direct vs one-stop to Rome (date optional). */
const matchRomeCompare = (text: string): SlotJSON | null => {
  if (!/\brome\b/i.test(text)) return null;
  if (!/\bcompar(?:e|ing|ison)\b/i.test(text)) return null;
  if (!/\b(?:direct|non[\s-]?stop|stop|stops)\b/i.test(text)) return null;
  const day = dateFromText(text);
  return finalize(
    blank({
      destination: 'Rome',
      date_from: day,
      date_to: day,
      cabin: 'Economy',
      direct_only: null,
      sort: 'cheapest',
      compare: true,
      missing: day ? [] : ['dates'],
    }),
    text
  );
};

/** Task 4 — cheapest weekend return to Paris in the next three months. */
const matchParisWeekendReturn = (text: string): SlotJSON | null => {
  if (!/\bparis\b/i.test(text)) return null;
  if (!/\bweekend\b/i.test(text)) return null;
  if (!/\b(?:return|round[\s-]?trip|return\s+trip)\b/i.test(text)) return null;
  const window = flexibleWindowFromText(text);
  if (!window) return null;
  return finalize(
    blank({
      destination: 'Paris',
      date_from: window.date_from,
      date_to: window.date_to,
      cabin: 'Economy',
      sort: 'cheapest',
      weekend: true,
      round_trip: true,
      cheapest_when: true,
    }),
    text
  );
};

/**
 * Task 5 — open £150 weekend explore ("where could you go" / budget options).
 * Must not name a destination city.
 */
const matchBudgetWeekendExplore = (text: string): SlotJSON | null => {
  if (/\b(?:barcelona|amsterdam|rome|paris|lisbon|madrid|milan|athens|vienna|prague)\b/i.test(text)) {
    return null;
  }
  const price = maxPriceFromText(text);
  if (price == null) return null;
  if (!/\bweekend\b/i.test(text)) return null;
  const openEnded =
    /\b(?:where|anywhere|somewhere|options?|could\s+you\s+go|can\s+i\s+go)\b/i.test(text) ||
    /\byou\s+have\b.*\bfree\s+weekend\b/i.test(text) ||
    /\bbudget\b/i.test(text);
  if (!openEnded) return null;
  if (!/\b(?:fly|flying|flight|flights|go|travel|trip|options?)\b/i.test(text)) return null;
  return finalize(
    blank({
      destination: null,
      cabin: 'Economy',
      sort: 'cheapest',
      max_price: price,
      anywhere: true,
      weekend: true,
      missing: [],
    }),
    text
  );
};

/**
 * If this message is one of the five study tasks (or a close variant), return
 * a complete slot and skip Groq. Otherwise null.
 */
export const matchStudyTaskSlot = (text: string): SlotJSON | null => {
  const t = text.trim();
  if (!t) return null;
  return (
    matchBarcelonaDirect(t) ||
    matchAmsterdamConstrained(t) ||
    matchRomeCompare(t) ||
    matchParisWeekendReturn(t) ||
    matchBudgetWeekendExplore(t)
  );
};
