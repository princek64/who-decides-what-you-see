import { useMemo } from 'react';
import { getCodesForCityQuery, getCityName, easternEuropeAirportCodes } from '../lib/airportMap';

export interface Flight {
  flight_id: string;
  flight_number: string;
  origin_code: string;
  origin_terminal: string;
  dest_code: string;
  date: string;
  departure_time: string;
  arrival_time: string;
  arrival_date: string;
  duration_mins: number;
  duration_formatted: string;
  direction: 'outbound' | 'return';
  airline_name: string;
  airline_tier: 'Budget' | 'EU Flag' | 'UK Flag' | string;
  aircraft_type: string;
  stops: number;
  layover_details: string;
  cabin_class: 'Economy' | 'Premium Economy' | 'Business' | string;
  price_gbp: number;
  currency?: string;
  seats_remaining: number;
  baggage_policy: string;
  meal: string;
  flexibility_policy: 'Non-refundable' | 'Changeable for a fee' | 'Fully flexible' | string;
  co2_kg: number;
  demand_indicator: 'Low' | 'Medium' | 'High' | 'Filling Fast' | string;
  flight_status: 'Scheduled' | 'On time' | 'Delayed' | 'Cancelled' | string;
  departure_mins_from_midnight: number;
}

export interface IntentJSON {
  off_topic?: boolean;
  origin_code?: string;
  dest_code?: string;
  dest_city?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  /** 'both' = outbound + return in one result list (round trip). */
  direction?: 'outbound' | 'return' | 'both';
  max_price?: number;
  stops?: number;
  cabin_class?: string;
  departure_after?: string;
  departure_before?: string;
  flexibility?: string;
  low_co2?: boolean;
  airline?: string;
  sort_by?: 'cheapest' | 'fastest' | 'earliest' | 'latest';
  /** Weekend trip: itinerary Fri/Sat→Sun/Mon; other layouts filter outbound Fri–Sun. */
  weekend?: boolean;
  /** Coarse region allowlist for open explore. */
  dest_region?: 'eastern_europe';
}

// Weekend-break departures: Fri/Sat/Sun (outbound only; itinerary pairs return separately).
export const isWeekendDeparture = (date: string): boolean => {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 5 || day === 6 || day === 0;
};

const parseTimeToMins = (timeStr?: string): number | null => {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const LONDON_CODES = new Set(['LHR', 'LGW', 'STN', 'LTN', 'LCY', 'SEN']);

// Dest code/city → airport codes (exported so chat can detect unknown cities).
export const resolveDestCodes = (intent: IntentJSON): string[] => {
  let destCodes: string[] = [];
  if (intent.dest_code && intent.dest_code.trim()) {
    const dest = intent.dest_code.trim().toUpperCase();
    // Valid airport code vs city query (e.g. "ROM" → FCO via getCodesForCityQuery).
    const airportExists = !!getCityName(dest) && getCityName(dest) !== dest;
    if (airportExists) {
      destCodes = [dest];
    } else {
      destCodes = getCodesForCityQuery(intent.dest_code);
    }
  }

  if (destCodes.length === 0 && intent.dest_city && intent.dest_city.trim()) {
    destCodes = getCodesForCityQuery(intent.dest_city);
  }
  return destCodes;
};

// Round trip: filter each direction separately (dest matching differs), then merge.
const sortFlights = (flights: Flight[], sortBy?: IntentJSON['sort_by']): Flight[] => {
  const by = sortBy || 'cheapest';
  return [...flights].sort((a, b) => {
    switch (by) {
      case 'fastest':
        return a.duration_mins - b.duration_mins;
      case 'earliest':
        return a.departure_mins_from_midnight - b.departure_mins_from_midnight;
      case 'latest':
        return b.departure_mins_from_midnight - a.departure_mins_from_midnight;
      case 'cheapest':
      default:
        return a.price_gbp - b.price_gbp;
    }
  });
};

// Close date_from/date_to on direction=both → pin each leg (not a flexible window).
const MAX_ITINERARY_SPAN_DAYS = 21;

const daySpan = (from: string, to: string): number => {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / msPerDay);
};

export const isRoundTripItinerary = (intent: IntentJSON): boolean =>
  intent.direction === 'both' &&
  !!intent.date_from &&
  !!intent.date_to &&
  intent.date_from !== intent.date_to &&
  daySpan(intent.date_from, intent.date_to) > 0 &&
  daySpan(intent.date_from, intent.date_to) <= MAX_ITINERARY_SPAN_DAYS;

/** Today YYYY-MM-DD in local time (not toISOString — UTC would roll early in BST). */
export const searchStartDate = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const filterAndSortFlights = (
  flights: Flight[],
  intent: IntentJSON,
  medianCo2: number
): Flight[] => {
  if (intent.direction === 'both') {
    // Pin outbound to date_from and return to date_to via intent.date.
    if (isRoundTripItinerary(intent)) {
      const outbound = filterAndSortFlights(
        flights,
        { ...intent, direction: 'outbound', date: intent.date_from },
        medianCo2
      );
      const inbound = filterAndSortFlights(
        flights,
        { ...intent, direction: 'return', date: intent.date_to },
        medianCo2
      );
      return sortFlights([...outbound, ...inbound], intent.sort_by);
    }

    const outbound = filterAndSortFlights(flights, { ...intent, direction: 'outbound' }, medianCo2);
    const inbound = filterAndSortFlights(flights, { ...intent, direction: 'return' }, medianCo2);
    return sortFlights([...outbound, ...inbound], intent.sort_by);
  }

  let filtered = [...flights];

  // Return rows are EU→London: searched city matches origin, not dest.
  const direction = intent.direction || 'outbound';
  filtered = filtered.filter((f) => f.direction === direction);

  // Origin: London codes always mean the London end of the journey.
  if (intent.origin_code && intent.origin_code.trim()) {
    const origin = intent.origin_code.trim().toUpperCase();
    if (direction === 'return' && LONDON_CODES.has(origin)) {
      filtered = filtered.filter((f) => f.dest_code === origin);
    } else {
      filtered = filtered.filter((f) => f.origin_code === origin);
    }
  }

  const destCodes = resolveDestCodes(intent);

  if (destCodes.length > 0) {
    const londonSide = destCodes.filter((c) => LONDON_CODES.has(c));
    const euSide = destCodes.filter((c) => !LONDON_CODES.has(c));
    filtered = filtered.filter((f) => {
      if (direction === 'return') {
        // Return: EU city = origin; London = dest
        return (
          (euSide.length > 0 && euSide.includes(f.origin_code)) ||
          (londonSide.length > 0 && londonSide.includes(f.dest_code))
        );
      }
      return destCodes.includes(f.dest_code);
    });
  } else if (intent.dest_city && intent.dest_city.trim()) {
    const destCityQuery = intent.dest_city.trim().toLowerCase();
    filtered = filtered.filter((f) =>
      f.dest_code.toLowerCase().includes(destCityQuery)
    );
  }

  // Eastern Europe allowlist (open explore, no single city).
  if (intent.dest_region === 'eastern_europe' && destCodes.length === 0) {
    const region = easternEuropeAirportCodes();
    filtered = filtered.filter((f) =>
      direction === 'return' ? region.has(f.origin_code) : region.has(f.dest_code)
    );
  }

  // Date: single day or inclusive YYYY-MM-DD range
  if (intent.date && intent.date.trim()) {
    const dateQuery = intent.date.trim();
    filtered = filtered.filter((f) => f.date === dateQuery);
  } else {
    if (intent.date_from && intent.date_from.trim()) {
      const from = intent.date_from.trim();
      filtered = filtered.filter((f) => f.date >= from);
    }
    if (intent.date_to && intent.date_to.trim()) {
      const to = intent.date_to.trim();
      filtered = filtered.filter((f) => f.date <= to);
    }
    // Undated: bound at today so departed fares aren't returned as cheapest.
    if (!intent.date_from?.trim() && !intent.date_to?.trim()) {
      const start = searchStartDate();
      filtered = filtered.filter((f) => f.date >= start);
    }
  }

  if (intent.max_price !== undefined && intent.max_price !== null) {
    const maxVal = Number(intent.max_price);
    if (!isNaN(maxVal)) {
      filtered = filtered.filter((f) => f.price_gbp <= maxVal);
    }
  }

  if (intent.stops !== undefined && intent.stops !== null) {
    const stopsVal = Number(intent.stops);
    if (!isNaN(stopsVal)) {
      filtered = filtered.filter((f) => f.stops === stopsVal);
    }
  }

  // Weekend Fri–Sun, outbound only (itinerary pairs return separately).
  if (intent.weekend && direction === 'outbound') {
    filtered = filtered.filter((f) => isWeekendDeparture(f.date));
  }

  if (intent.cabin_class && intent.cabin_class.trim()) {
    const cabin = intent.cabin_class.trim().toLowerCase();
    filtered = filtered.filter((f) => f.cabin_class.toLowerCase() === cabin);
  }

  const depAfterMins = parseTimeToMins(intent.departure_after);
  if (depAfterMins !== null) {
    filtered = filtered.filter((f) => f.departure_mins_from_midnight >= depAfterMins);
  }

  const depBeforeMins = parseTimeToMins(intent.departure_before);
  if (depBeforeMins !== null) {
    filtered = filtered.filter((f) => f.departure_mins_from_midnight <= depBeforeMins);
  }

  if (intent.flexibility && intent.flexibility.trim()) {
    const flex = intent.flexibility.trim().toLowerCase();
    // Normalize to CSV terms
    let matchStr = flex;
    if (flex.includes('changeable')) {
      matchStr = 'changeable for a fee';
    } else if (flex.includes('non-refundable') || flex.includes('non refundable')) {
      matchStr = 'non-refundable';
    } else if (flex.includes('fully flexible') || flex.includes('flexible')) {
      matchStr = 'fully flexible';
    }

    filtered = filtered.filter((f) => f.flexibility_policy.toLowerCase() === matchStr);
  }

  if (intent.low_co2) {
    filtered = filtered.filter((f) => f.co2_kg <= medianCo2);
  }

  if (intent.airline && intent.airline.trim()) {
    const airlineQuery = intent.airline.trim().toLowerCase();
    filtered = filtered.filter((f) => 
      f.airline_name.toLowerCase().includes(airlineQuery)
    );
  }

  return sortFlights(filtered, intent.sort_by);
};

export const useFlightFilter = (
  flights: Flight[],
  intent: IntentJSON | null,
  medianCo2: number
) => {
  return useMemo(() => {
    if (!intent) return [];
    return filterAndSortFlights(flights, intent, medianCo2);
  }, [flights, intent, medianCo2]);
};
