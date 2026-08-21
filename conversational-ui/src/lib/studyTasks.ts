/**
 * Local-first slot resolution for study sessions (shared Groq TPD is tight).
 * Study-task matches and clear wording → skip Groq; ambiguous turns still call it.
 */

import {
  applyWordingBackstops,
  dateFromText,
  departureAfterFromText,
  destinationFromText,
  flexibleWindowFromText,
  isCheapestWhenQuery,
  isCompareQuery,
  isDirectOnlyQuery,
  isDropDirectQuery,
  isEasternEuropeQuery,
  isLiftRegionQuery,
  isOneWayQuery,
  isOpenExploreQuery,
  isPureRefinement,
  isReturnOnlyQuery,
  isRoundTripQuery,
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

/** Hotel/visa/etc. — leave for the model (or its off_topic path). */
const looksOffTopic = (text: string): boolean =>
  /\b(?:hotel|hostel|airbnb|accommodation|visa|passport|weather|insurance|taxi|uber|train|parking|transfer)\b/i.test(
    text
  );

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
 * Date optional — when absent, dates stay missing so the app asks.
 */
const matchAmsterdamConstrained = (text: string): SlotJSON | null => {
  if (!/\bamsterdam\b/i.test(text)) return null;
  const price = maxPriceFromText(text);
  const after = departureAfterFromText(text);
  // Need a Task 2 constraint so bare "flights to Amsterdam" still hits the model.
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
 * Task 5 — open £150 weekend explore. Must not name a destination city.
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
      dest_region: isEasternEuropeQuery(text) ? 'eastern_europe' : null,
      missing: [],
    }),
    text
  );
};

/** Study-task (or close variant) → complete slot and skip Groq; else null. */
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

/**
 * Slot from wording alone when signal is enough (before any Groq call).
 * @param hasPreviousSlot enables date/price/time-only refinements without a city.
 */
export const tryLocalSlot = (
  text: string,
  hasPreviousSlot = false
): SlotJSON | null => {
  const t = text.trim();
  if (!t) return null;
  if (looksOffTopic(t)) return null;

  const study = matchStudyTaskSlot(t);
  if (study) return study;

  if (isOpenExploreQuery(t) || isLiftRegionQuery(t) || (isEasternEuropeQuery(t) && !destinationFromText(t))) {
    const eastern = isEasternEuropeQuery(t) && !isLiftRegionQuery(t);
    const window = flexibleWindowFromText(t);
    return finalize(
      blank({
        anywhere: true,
        cabin: 'Economy',
        sort: 'cheapest',
        max_price: maxPriceFromText(t),
        weekend: /\bweekend\b/i.test(t),
        dest_region: eastern ? 'eastern_europe' : null,
        date_from: window?.date_from ?? null,
        date_to: window?.date_to ?? null,
        missing: [],
      }),
      t
    );
  }

  const dest = destinationFromText(t);
  const day = dateFromText(t);
  const window = flexibleWindowFromText(t);
  const price = maxPriceFromText(t);
  const after = departureAfterFromText(t);
  const hasDate = Boolean(day || window);
  const compare = isCompareQuery(t);
  const oneWay = isOneWayQuery(t);

  if (dest) {
    return finalize(
      blank({
        destination: dest,
        date_from: day ?? window?.date_from ?? null,
        date_to: day ?? window?.date_to ?? null,
        cabin: 'Economy',
        sort: 'cheapest',
        missing: hasDate ? [] : ['dates'],
        compare,
        cheapest_when: isCheapestWhenQuery(t),
        weekend: /\bweekend\b/i.test(t),
        round_trip: isRoundTripQuery(t) && !oneWay,
        direct_only: compare ? null : isDirectOnlyQuery(t) ? true : null,
        max_price: price,
        departure_after: after,
        anywhere: false,
      }),
      t
    );
  }

  // Constraint / date-only follow-up against results already on screen.
  if (
    hasPreviousSlot &&
    (hasDate ||
      price != null ||
      after != null ||
      isPureRefinement(t) ||
      isDropDirectQuery(t) ||
      isDirectOnlyQuery(t) ||
      isRoundTripQuery(t) ||
      oneWay ||
      isReturnOnlyQuery(t) ||
      /\bweekend\b/i.test(t) ||
      isCheapestWhenQuery(t) ||
      compare)
  ) {
    return finalize(blank({ cabin: 'Economy', sort: 'cheapest' }), t);
  }

  return null;
};
