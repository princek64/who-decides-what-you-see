/** Wording backstops + same-thread intent merge (parity with conversational-ui). */

import type { IntentJSON } from '../hooks/useFlightFilter';
import { DATA_MAX, getSearchAnchor } from '../constants/prompts';
import {
  dateFromText,
  destinationFromText,
  isPureRefinement,
  isReturnOnlyQuery,
} from './returnLeg';

export type GenIntent = IntentJSON & { layout?: string };

/** Dest set, dates empty → ask (same undated policy as conversational-ui). Open explore exempt. */
export const needsDatesClarification = (intent: GenIntent): boolean => {
  const hasDest = Boolean(intent.dest_city?.trim() || intent.dest_code?.trim());
  if (!hasDest) return false;
  const hasDates = Boolean(
    intent.date?.trim() || intent.date_from?.trim() || intent.date_to?.trim()
  );
  return !hasDates;
};

/** Same wording as conversational-ui datesQuestionFor. */
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
  /\bwhere (?:can|could|should) (?:i|we|you)\b/i.test(text) ||
  /\bany\s+destinations?\b/i.test(text) ||
  /\bsuggest(?:\s+\w+){0,3}\s+destinations?\b/i.test(text) ||
  /\brecommend(?:\s+\w+){0,3}\s+destinations?\b/i.test(text) ||
  /\bno\s+(?:particular|specific|preferred)\s+(?:city|destination|place)\b/i.test(text);

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
  /\bround[\s-]?trips?\b/i.test(text) ||
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
  (/\bweekend\b/i.test(text) ||
    /\banywhere\b|\bsomewhere\b|\bwhere\b/i.test(text) ||
    /\bbudget\b/i.test(text)) &&
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
  const three =
    /\b(?:in|over|for|during|within)\s+the\s+next\s+(?:three|3)\s+months?\b/i.exec(text) ||
    /\bnext\s+(?:three|3)\s+months?\b/i.exec(text);
  const one =
    !three &&
    (/\b(?:in|over|for|during|within)\s+the\s+next\s+months?\b/i.exec(text) ||
      /\bnext\s+months?\b/i.exec(text));
  const weeks =
    !three &&
    !one &&
    (/\b(?:in|over|for|during|within)\s+the\s+next\s+(?:few|\d+)\s+weeks?\b/i.exec(text) ||
      /\bnext\s+(?:few|\d+)\s+weeks?\b/i.exec(text));

  const monthYear =
    !three &&
    !one &&
    !weeks &&
    /\b(?:in|during|for)\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/i.exec(text);

  if (monthYear) {
    const monthName = monthYear[1].toLowerCase();
    const monthsMap: Record<string, number> = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    };
    const m = monthsMap[monthName];
    const year = monthYear[2] ? Number(monthYear[2]) : 2026;
    if (m) {
      const from = `${year}-${pad(m)}-01`;
      const lastDay = new Date(year, m, 0).getDate();
      const to = `${year}-${pad(m)}-${pad(lastDay)}`;
      return { date_from: from, date_to: to };
    }
  }

  if (!three && !one && !weeks) return null;
  const from = getSearchAnchor();
  const end = new Date(`${from}T00:00:00`);
  if (three) end.setMonth(end.getMonth() + 3);
  else if (weeks) end.setDate(end.getDate() + 28);
  else end.setDate(end.getDate() + 30);
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

/** Prefer typed facts over model invent/drop. */
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
    if (isEasternEuropeQuery(text) && !isLiftRegionQuery(text)) {
      next.dest_region = 'eastern_europe';
    }
    if (isLiftRegionQuery(text)) {
      delete next.dest_region;
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
    // Typed concrete day wins over a wrong model date.
    next.date = day;
    delete next.date_from;
    delete next.date_to;
  }

  if (/\bweekend\b/i.test(text)) next.weekend = true;

  if (isOneWayQuery(text)) {
    next.direction = 'outbound';
  } else if (isReturnOnlyQuery(text)) {
    next.direction = 'return';
  } else if (isRoundTripQuery(text)) {
    next.direction = 'both';
    // Free round-trip → itinerary; studyParisWeekend still forces calendar.
    if (!isCompareQuery(text)) {
      next.layout = 'itinerary';
    }
  } else if (isCheapestWhenQuery(text) && (!next.layout || next.layout === 'grid')) {
    next.layout = 'calendar';
  }

  if (isCompareQuery(text)) {
    delete next.stops;
    next.layout = 'comparison';
  } else if (isDirectOnlyQuery(text)) {
    next.stops = 0;
  }

  if (/\bmap\b/i.test(text)) {
    next.layout = 'map';
  } else if (/\btrend\b|price picture|prices over time|cheapest time|when is it cheapest/i.test(text)) {
    next.layout = 'trend';
  } else if (/\bbudget\b|how much would I have left|left over/i.test(text)) {
    next.layout = 'budget';
  } else if (/\branked\b|something good|best options/i.test(text)) {
    next.layout = 'ranked';
  } else if (/\bmultileg\b|layover|layovers|connection/i.test(text)) {
    next.layout = 'multileg';
  } else if (/\bitinerary\b|plan a weekend trip|plan a trip/i.test(text)) {
    next.layout = 'itinerary';
  }

  if (!next.sort_by) next.sort_by = 'cheapest';

  // Exploratory layouts group by dest_code — force outbound so London returns aren't cards.
  const exploratoryLayout =
    next.layout === 'destinations' || next.layout === 'map' || next.layout === 'budget';
  if (exploratoryLayout && !next.dest_city && !next.dest_code) {
    next.direction = 'outbound';
  }

  return next;
};

/** Explicit reset — drop prior city/date even if the model echoed them. */
export const RESET_CUE =
  /\b(?:start over|start again|new search|forget(?:\s+(?:that|it|the|everything|all))?(?:\s+please)?|reset|never ?mind|clear(?:\s+(?:search|all|everything))?)\b/i;

export const isLiftRegionQuery = (text: string): boolean =>
  /\blift\s+(?:the\s+)?restriction\b/i.test(text) ||
  /\ball\s+europe\b/i.test(text) ||
  /\bany(?:where)?\s+in\s+europe\b/i.test(text) ||
  /\bentire\s+europe\b/i.test(text) ||
  /\bno\s+(?:region\s+)?restriction\b/i.test(text) ||
  (!destinationFromText(text) &&
    (/\bwithin\s+europe\b/i.test(text) ||
      /\b(?:destinations?|places?|cities|options?|flights?)\s+in\s+europe\b/i.test(text) ||
      /\bonly\s+(?:in\s+)?europe\b/i.test(text)));

export const isEasternEuropeQuery = (text: string): boolean =>
  /\beastern\s+europe(?:an)?\b/i.test(text) ||
  /\beast(?:ern)?\s+(?:of\s+)?(?:europe|germany)\b/i.test(text) ||
  /\bcountries?\s+east(?:ern)?\s+of\s+germany\b/i.test(text) ||
  /\beast\s+of\s+germany\b/i.test(text);

/** Same-thread merge: new city / open explore must not keep unstated prior filters. */
export const resolveTurnIntent = (
  prev: GenIntent | null,
  incoming: GenIntent,
  text: string
): GenIntent => {
  let next = applyIntentBackstops(incoming, text);

  if (RESET_CUE.test(text)) {
    const day = dateFromText(text);
    const window = flexibleWindowFromText(text);
    const dest = destinationFromText(text);
    const eastern = isEasternEuropeQuery(text) && !isLiftRegionQuery(text) && !dest;
    const fresh: GenIntent = {
      sort_by: 'cheapest',
      layout: eastern || isOpenExploreQuery(text) || isLiftRegionQuery(text) ? 'destinations' : next.layout ?? 'grid',
      direction: isRoundTripQuery(text) ? 'both' : 'outbound',
    };
    if (dest) fresh.dest_city = dest;
    if (day) fresh.date = day;
    else if (window) {
      fresh.date_from = window.date_from;
      fresh.date_to = window.date_to;
    }
    if (maxPriceFromText(text) != null) fresh.max_price = maxPriceFromText(text)!;
    if (/\bweekend\b/i.test(text)) fresh.weekend = true;
    if (eastern) fresh.dest_region = 'eastern_europe';
    return applyIntentBackstops(fresh, text);
  }

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

  // Scope refine without a new city — compose onto prior search.
  const scopeRefine =
    prev &&
    !destinationFromText(text) &&
    (/\brestrict\b|\bnarrow\b|\bonly\s+show\b|\bfilter\s+to\b|\blimit\s+to\b/i.test(text) ||
      isEasternEuropeQuery(text));
  if (scopeRefine && prev && !isOpenExploreQuery(text) && !isLiftRegionQuery(text)) {
    const eastern = isEasternEuropeQuery(text);
    return applyIntentBackstops(
      {
        ...prev,
        ...next,
        dest_city: prev.dest_city,
        dest_code: prev.dest_code,
        date: prev.date ?? next.date,
        date_from: prev.date_from ?? next.date_from,
        date_to: prev.date_to ?? next.date_to,
        dest_region: eastern ? 'eastern_europe' : next.dest_region ?? prev.dest_region,
        layout: next.layout ?? prev.layout,
        off_topic: false,
      },
      text
    );
  }

  if (
    isOpenExploreQuery(text) ||
    isLiftRegionQuery(text) ||
    (isEasternEuropeQuery(text) && !destinationFromText(text))
  ) {
    const price = maxPriceFromText(text) ?? next.max_price ?? prev?.max_price;
    const weekend = /\bweekend\b/i.test(text) || next.weekend || false;
    const eastern = isEasternEuropeQuery(text) && !isLiftRegionQuery(text);
    const window = flexibleWindowFromText(text);
    const explore: GenIntent = {
      sort_by: 'cheapest',
      max_price: price,
      weekend: weekend || undefined,
      layout: next.layout ?? 'destinations',
      direction: 'outbound',
      dest_region: eastern ? 'eastern_europe' : undefined,
    };
    if (window) {
      explore.date_from = window.date_from;
      explore.date_to = window.date_to;
    } else if (prev && (prev.date_from || prev.date_to || prev.date)) {
      // Region refine keeps prior window.
      if (prev.date) explore.date = prev.date;
      if (prev.date_from) explore.date_from = prev.date_from;
      if (prev.date_to) explore.date_to = prev.date_to;
    }
    return explore;
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
    delete fresh.dest_region;
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
  if (isOpenExploreQuery(text) || isLiftRegionQuery(text) || isEasternEuropeQuery(text) || RESET_CUE.test(text)) {
    return true;
  }
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
  // No date in wording → leave empty so useGenChat asks (needsDatesClarification).
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
  const eastern = isEasternEuropeQuery(text) && !isLiftRegionQuery(text);
  return {
    max_price: price,
    weekend: true,
    sort_by: 'cheapest',
    direction: 'outbound',
    layout: 'destinations',
    dest_region: eastern ? 'eastern_europe' : undefined,
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

/** Local-first intent when wording is enough — skips Groq. */
export const tryLocalIntent = (text: string, hasPrevious = false): GenIntent | null => {
  const t = text.trim();
  if (!t || looksOffTopic(t)) return null;

  const study = matchStudyTaskIntent(t);
  if (study) {
    const next = applyIntentBackstops(study, t);
    // Study-task layouts are authoritative.
    if (study.layout) next.layout = study.layout;
    return next;
  }

  if (
    isOpenExploreQuery(t) ||
    isLiftRegionQuery(t) ||
    (isEasternEuropeQuery(t) && !destinationFromText(t))
  ) {
    const eastern = isEasternEuropeQuery(t) && !isLiftRegionQuery(t);
    return applyIntentBackstops(
      {
        max_price: maxPriceFromText(t) ?? undefined,
        weekend: /\bweekend\b/i.test(t) || undefined,
        sort_by: 'cheapest',
        layout: 'destinations',
        dest_region: eastern ? 'eastern_europe' : undefined,
      },
      t
    );
  }

  const dest = destinationFromText(t);
  const day = dateFromText(t);
  const window = flexibleWindowFromText(t);

  if (/\bmap\b|\btrend\b|\bbudget\b|\branked\b|\bmultileg\b|\blayover\b|\blayovers\b|\bconnection\b|\bplan\b|\bitinerary\b/i.test(t)) {
    const layout = /\bmap\b/i.test(t)
      ? 'map'
      : /\btrend\b|price picture|prices over time|cheapest time|when is it cheapest/i.test(t)
        ? 'trend'
        : /\bbudget\b|how much would I have left|left over/i.test(t)
          ? 'budget'
          : /\branked\b|something good|best options/i.test(t)
            ? 'ranked'
            : /\bmultileg\b|layover|layovers|connection/i.test(t)
              ? 'multileg'
              : 'itinerary';
    const intent: GenIntent = {
      sort_by: 'cheapest',
      cabin_class: 'Economy',
      layout,
      direction: 'outbound',
    };
    if (dest) intent.dest_city = dest;
    if (day) intent.date = day;
    if (window && !day) {
      intent.date_from = window.date_from;
      intent.date_to = window.date_to;
    }
    return applyIntentBackstops(intent, t);
  }
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
