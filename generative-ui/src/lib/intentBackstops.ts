/**
 * Wording backstops + same-thread intent merge for generative-ui.
 *
 * Conversational-ui already had these guards (typed city wins, new city =
 * fresh search, open explore clears prior city). Generative only filled
 * blank dates on return-leg wording and trusted Groq + the last three user
 * messages — so Task 2/3 in the same chat often kept showing Barcelona.
 */

import type { IntentJSON } from '../hooks/useFlightFilter';
import { DATA_MAX, getSearchAnchor } from '../constants/prompts';
import {
  dateFromText,
  destinationFromText,
  isPureRefinement,
  isReturnOnlyQuery,
} from './returnLeg';

export type GenIntent = IntentJSON & { layout?: string };

/**
 * Destination named, no dates given — ask rather than silently searching the
 * whole remaining dataset window. Mirrors conversational-ui's
 * firstMissingRequiredSlot('dates') policy so a mid-task refinement that drops
 * the date cannot diverge between interfaces (ask vs search-all).
 *
 * Open explore (no city / destinations|map with no dest) is exempt: undated
 * budget/anywhere searches are intentional.
 */
export const needsDatesClarification = (intent: GenIntent): boolean => {
  const hasDest = Boolean(intent.dest_city?.trim() || intent.dest_code?.trim());
  if (!hasDest) return false;
  const hasDates = Boolean(
    intent.date?.trim() || intent.date_from?.trim() || intent.date_to?.trim()
  );
  return !hasDates;
};

/** Same wording as conversational-ui datesQuestionFor for one-way vs round-trip. */
export const datesQuestionFor = (intent: GenIntent): string =>
  intent.direction === 'both' || intent.weekend
    ? 'Which dates? A single day shows flights both ways — or give an outbound and return date, like "30 August out, 3 September back."'
    : 'Which dates?';

const pad = (n: number): string => String(n).padStart(2, '0');

const normCity = (c?: string | null): string | null => {
  const t = c?.trim();
  return t ? t.toLowerCase() : null;
};

export const isAnywhereQuery = (text: string): boolean =>
  /\bwhere (?:can|could|should|might|would|to)\b/i.test(text) ||
  /\b(?:surprise me|anywhere|somewhere)\b/i.test(text) ||
  /\bwhere (?:can|could|should) (?:i|we|you)\b/i.test(text);

export const isOneWayQuery = (text: string): boolean =>
  /\bone[- ]way\b/i.test(text) ||
  /\boutbound\s+only\b/i.test(text) ||
  /\bsingle\s+(?:flight|ticket|fare|leg)\b/i.test(text);

export const isCompareQuery = (text: string): boolean =>
  /\bcompare\b/i.test(text) ||
  /\bdirect\b.*\b(?:vs\.?|versus|or|against|with)\b.*\b(?:connect|stop|indirect|1[- ]?stop|one[- ]?stop)/i.test(
    text
  ) ||
  /\b(?:connect|stop|indirect)\w*\b.*\b(?:vs\.?|versus|or)\b.*\bdirect\b/i.test(text) ||
  /\bdirect (?:vs\.?|or) (?:a )?(?:stop|connecting)/i.test(text);

export const isDirectOnlyQuery = (text: string): boolean =>
  /\b(?:only|just)\s+(?:show\s+|see\s+|give\s+me\s+)?(?:me\s+)?(?:the\s+)?direct\b/i.test(text) ||
  /\bdirect\s+(?:flights?\s+)?only\b/i.test(text) ||
  /\bnarrow(?:\s+it)?\s+to\s+direct\b/i.test(text) ||
  /\bnon[- ]?stop\s+only\b/i.test(text) ||
  /\bdirect(?:\s+one[- ]way)?\s+flights?\b/i.test(text) ||
  /\bone[- ]way\s+direct\s+flights?\b/i.test(text) ||
  /\bfly\s+direct\b/i.test(text) ||
  /\bnon[- ]?stops?\b/i.test(text);

export const isCheapestWhenQuery = (text: string): boolean =>
  /\bcheapest\b.*\b(?:day|weekend|date|time|to (?:go|fly|travel))\b/i.test(text) ||
  /\bbest (?:time|day|weekend|date)\b.*\b(?:to (?:go|fly|travel)|for)\b/i.test(text) ||
  /\bwhen(?:'s| is)?\b.*\bcheapest\b/i.test(text);

export const isRoundTripQuery = (text: string): boolean =>
  /\bround[- ]trips?\b/i.test(text) ||
  /\breturn\s+trips?\b/i.test(text) ||
  /\breturn\s+flights?\b/i.test(text) ||
  /\bthere\s+and\s+back\b/i.test(text) ||
  /\bboth\s+ways\b/i.test(text) ||
  /\bout\s+and\s+back\b/i.test(text);

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

export const isBudgetExploreQuery = (text: string): boolean =>
  !destinationFromText(text) &&
  maxPriceFromText(text) != null &&
  (/\bweekend\b/i.test(text) || /\banywhere\b|\bsomewhere\b|\bwhere\b/i.test(text)) &&
  /\b(?:fly|flying|flight|flights|options?|go|travel|trip)\b/i.test(text);

export const isOpenExploreQuery = (text: string): boolean =>
  isAnywhereQuery(text) || isBudgetExploreQuery(text);

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
    if (!meridiem && !clock[2] && hours >= 1 && hours <= 11) hours += 12;
    if (hours >= 0 && hours <= 23 && mins >= 0 && mins <= 59) {
      return `${pad(hours)}:${pad(mins)}`;
    }
  }
  if (/\bevening\b/i.test(text)) return '18:00';
  return null;
};

export const flexibleWindowFromText = (
  text: string
): { date_from: string; date_to: string } | null => {
  const monthsMatch =
    /\b(?:in|over|for|during)\s+the\s+next\s+(?:three|3)\s+months?\b/i.exec(text) ||
    /\bnext\s+(?:three|3)\s+months?\b/i.exec(text);
  if (!monthsMatch) return null;
  const from = getSearchAnchor();
  const end = new Date(`${from}T00:00:00`);
  end.setMonth(end.getMonth() + 3);
  let to = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  if (to > DATA_MAX) to = DATA_MAX;
  if (from > to) return null;
  return { date_from: from, date_to: to };
};

const looksOffTopic = (text: string): boolean =>
  /\b(?:hotel|hostel|airbnb|accommodation|visa|passport|weather|insurance|taxi|uber|train|parking|transfer)\b/i.test(
    text
  );

const windowLooksCollapsed = (
  intent: GenIntent,
  window: { date_from: string; date_to: string }
): boolean => {
  const from = intent.date_from?.trim() || intent.date?.trim() || '';
  const to = intent.date_to?.trim() || intent.date?.trim() || '';
  if (!from || !to) return true;
  const span =
    (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000;
  const want =
    (new Date(`${window.date_to}T00:00:00`).getTime() -
      new Date(`${window.date_from}T00:00:00`).getTime()) /
    86400000;
  return span < Math.min(60, want * 0.5);
};

/** Prefer facts the user typed over whatever the model invented or dropped. */
export const applyIntentBackstops = (intent: GenIntent, text: string): GenIntent => {
  const next: GenIntent = { ...intent };

  if (isReturnOnlyQuery(text)) {
    next.off_topic = false;
  }

  if (isOpenExploreQuery(text)) {
    delete next.dest_city;
    delete next.dest_code;
    next.off_topic = false;
    if (!next.layout || next.layout === 'grid' || next.layout === 'highlight') {
      next.layout = /\bbudget\b|how far|left over|have left/i.test(text)
        ? 'budget'
        : 'destinations';
    }
  }

  const named = destinationFromText(text);
  if (named && !isPureRefinement(text) && !isOpenExploreQuery(text)) {
    next.dest_city = named;
    delete next.dest_code;
    next.off_topic = false;
  }

  const statedPrice = maxPriceFromText(text);
  if (statedPrice != null) next.max_price = statedPrice;

  const after = departureAfterFromText(text);
  if (after) next.departure_after = after;

  const day = dateFromText(text);
  const window = flexibleWindowFromText(text);
  if (window && (windowLooksCollapsed(next, window) || (!next.date_from && !next.date_to && !next.date))) {
    delete next.date;
    next.date_from = window.date_from;
    next.date_to = window.date_to;
  } else if (day) {
    // User-stated concrete day wins over a wrong model date (July echo, etc.).
    next.date = day;
    delete next.date_from;
    delete next.date_to;
  }

  if (/\bweekend\b/i.test(text)) next.weekend = true;

  if (isCompareQuery(text)) {
    delete next.stops;
    next.layout = 'comparison';
  } else if (isDirectOnlyQuery(text)) {
    next.stops = 0;
  }

  if (isCheapestWhenQuery(text) && (!next.layout || next.layout === 'grid')) {
    next.layout = 'calendar';
  }

  if (isOneWayQuery(text)) {
    next.direction = 'outbound';
  } else if (isReturnOnlyQuery(text)) {
    next.direction = 'return';
  } else if (isRoundTripQuery(text)) {
    next.direction = 'both';
  }

  if (!next.sort_by) next.sort_by = 'cheapest';

  return next;
};

/**
 * Same-thread merge: a newly named city (or open explore) is a fresh search
 * and must not keep prior-task filters the current message did not restate.
 */
export const resolveTurnIntent = (
  prev: GenIntent | null,
  incoming: GenIntent,
  text: string
): GenIntent => {
  let next = applyIntentBackstops(incoming, text);

  if (isPureRefinement(text) && prev) {
    const {
      dest_city: _c,
      dest_code: _code,
      date: _d,
      date_from: _from,
      date_to: _to,
      ...refinements
    } = next;
    next = applyIntentBackstops(
      {
        ...prev,
        ...refinements,
        layout: refinements.layout ?? prev.layout,
        off_topic: false,
      },
      text
    );
    return next;
  }

  if (isOpenExploreQuery(text)) {
    const price = maxPriceFromText(text) ?? next.max_price ?? prev?.max_price;
    const weekend = /\bweekend\b/i.test(text) || next.weekend || false;
    return {
      sort_by: 'cheapest',
      max_price: price,
      weekend: weekend || undefined,
      layout: next.layout ?? 'destinations',
      direction: 'outbound',
    };
  }

  if (!prev) return next;

  const textCity = destinationFromText(text);
  const prevCity = normCity(prev.dest_city);
  const nextCity = normCity(next.dest_city);
  const cityChanged =
    (textCity != null && prevCity != null && textCity.toLowerCase() !== prevCity) ||
    (nextCity != null && prevCity != null && nextCity !== prevCity);

  if (cityChanged) {
    const fresh: GenIntent = { ...next };
    if (textCity) {
      fresh.dest_city = textCity;
      delete fresh.dest_code;
    }
    if (maxPriceFromText(text) == null) delete fresh.max_price;
    if (departureAfterFromText(text) == null) {
      delete fresh.departure_after;
      delete fresh.departure_before;
    }
    if (!isCompareQuery(text) && !isDirectOnlyQuery(text)) delete fresh.stops;
    if (isCompareQuery(text)) delete fresh.stops;
    if (!/\bweekend\b/i.test(text)) delete fresh.weekend;
    if (isOneWayQuery(text)) fresh.direction = 'outbound';
    else if (!isRoundTripQuery(text) && !isReturnOnlyQuery(text)) {
      // Don't inherit round-trip 'both' from a prior anywhere→city pick.
      if (prev.direction === 'both' && !isRoundTripQuery(text)) {
        fresh.direction = isOneWayQuery(text) ? 'outbound' : fresh.direction ?? 'outbound';
      }
    }
    return fresh;
  }

  return next;
};

/** Whether Groq user-history would only contaminate this turn. */
export const shouldOmitGroqHistory = (text: string, prev: GenIntent | null): boolean => {
  if (isOpenExploreQuery(text)) return true;
  const city = destinationFromText(text);
  if (!city || !prev?.dest_city) return false;
  return city.toLowerCase() !== prev.dest_city.trim().toLowerCase();
};

const studyBarcelona = (text: string): GenIntent | null => {
  if (!/\bbarcelona\b/i.test(text)) return null;
  if (!/\b(?:one[\s-]?way|direct|non[\s-]?stop)\b/i.test(text)) return null;
  const day = dateFromText(text);
  if (!day) return null;
  return {
    dest_city: 'Barcelona',
    date: day,
    stops: 0,
    direction: 'outbound',
    sort_by: 'cheapest',
    cabin_class: 'Economy',
    layout: 'highlight',
  };
};

const studyAmsterdam = (text: string): GenIntent | null => {
  if (!/\bamsterdam\b/i.test(text)) return null;
  const price = maxPriceFromText(text);
  const after = departureAfterFromText(text);
  if (price == null && after == null) return null;
  if (!/\b(?:one[\s-]?way|flight|flights|fly|flying)\b/i.test(text)) return null;
  const day = dateFromText(text);
  // Date optional in wording — when absent, leave date empty so useGenChat
  // asks (needsDatesClarification) rather than searching the whole window.
  const intent: GenIntent = {
    dest_city: 'Amsterdam',
    direction: 'outbound',
    sort_by: 'cheapest',
    cabin_class: 'Economy',
    layout: 'grid',
  };
  if (day) intent.date = day;
  if (price != null) intent.max_price = price;
  if (after) intent.departure_after = after;
  return intent;
};

const studyRomeCompare = (text: string): GenIntent | null => {
  if (!/\brome\b/i.test(text)) return null;
  if (!/\bcompar(?:e|ing|ison)\b/i.test(text)) return null;
  if (!/\b(?:direct|non[\s-]?stop|stop|stops)\b/i.test(text)) return null;
  const day = dateFromText(text);
  const intent: GenIntent = {
    dest_city: 'Rome',
    direction: 'outbound',
    sort_by: 'cheapest',
    cabin_class: 'Economy',
    layout: 'comparison',
  };
  if (day) intent.date = day;
  return intent;
};

const studyParisWeekend = (text: string): GenIntent | null => {
  if (!/\bparis\b/i.test(text)) return null;
  if (!/\bweekend\b/i.test(text)) return null;
  if (!/\b(?:return|round[\s-]?trip|return\s+trip)\b/i.test(text)) return null;
  const window = flexibleWindowFromText(text);
  if (!window) return null;
  return {
    dest_city: 'Paris',
    date_from: window.date_from,
    date_to: window.date_to,
    direction: 'both',
    sort_by: 'cheapest',
    weekend: true,
    cabin_class: 'Economy',
    layout: 'calendar',
  };
};

const studyBudgetExplore = (text: string): GenIntent | null => {
  if (destinationFromText(text)) return null;
  const price = maxPriceFromText(text);
  if (price == null || !/\bweekend\b/i.test(text)) return null;
  const openEnded =
    /\b(?:where|anywhere|somewhere|options?|could\s+you\s+go|can\s+i\s+go)\b/i.test(text) ||
    /\byou\s+have\b.*\bfree\s+weekend\b/i.test(text) ||
    /\bbudget\b/i.test(text);
  if (!openEnded) return null;
  if (!/\b(?:fly|flying|flight|flights|go|travel|trip|options?)\b/i.test(text)) return null;
  return {
    max_price: price,
    weekend: true,
    sort_by: 'cheapest',
    direction: 'outbound',
    layout: 'destinations',
  };
};

export const matchStudyTaskIntent = (text: string): GenIntent | null => {
  const t = text.trim();
  if (!t) return null;
  return (
    studyBarcelona(t) ||
    studyAmsterdam(t) ||
    studyRomeCompare(t) ||
    studyParisWeekend(t) ||
    studyBudgetExplore(t)
  );
};

/**
 * Local-first intent when wording is enough — skips Groq for study tasks and
 * most clear city/date / explore turns.
 */
export const tryLocalIntent = (text: string, hasPrevious = false): GenIntent | null => {
  const t = text.trim();
  if (!t || looksOffTopic(t)) return null;

  const study = matchStudyTaskIntent(t);
  if (study) return applyIntentBackstops(study, t);

  if (isOpenExploreQuery(t)) {
    return applyIntentBackstops(
      {
        max_price: maxPriceFromText(t) ?? undefined,
        weekend: /\bweekend\b/i.test(t) || undefined,
        sort_by: 'cheapest',
        layout: 'destinations',
      },
      t
    );
  }

  const dest = destinationFromText(t);
  const day = dateFromText(t);
  const window = flexibleWindowFromText(t);
  if (dest && (day || window)) {
    const intent: GenIntent = {
      dest_city: dest,
      sort_by: 'cheapest',
      cabin_class: 'Economy',
      layout: isCompareQuery(t) ? 'comparison' : day ? 'highlight' : 'calendar',
      direction: isOneWayQuery(t)
        ? 'outbound'
        : isRoundTripQuery(t)
          ? 'both'
          : 'outbound',
    };
    if (day) intent.date = day;
    if (window && !day) {
      intent.date_from = window.date_from;
      intent.date_to = window.date_to;
    }
    return applyIntentBackstops(intent, t);
  }

  if (dest) {
    return applyIntentBackstops(
      {
        dest_city: dest,
        sort_by: 'cheapest',
        cabin_class: 'Economy',
        layout: isCompareQuery(t) ? 'comparison' : 'grid',
        direction: 'outbound',
      },
      t
    );
  }

  if (
    hasPrevious &&
    (day ||
      window ||
      maxPriceFromText(t) != null ||
      departureAfterFromText(t) != null ||
      isPureRefinement(t) ||
      isDirectOnlyQuery(t) ||
      isRoundTripQuery(t) ||
      isOneWayQuery(t) ||
      isReturnOnlyQuery(t) ||
      /\bweekend\b/i.test(t) ||
      isCheapestWhenQuery(t) ||
      isCompareQuery(t))
  ) {
    return applyIntentBackstops({ sort_by: 'cheapest' }, t);
  }

  return null;
};
