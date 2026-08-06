import { useMemo } from 'react';
import { getCodesForCityQuery, getCityName } from '../lib/airportMap';

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
  /** 'both' shows outbound AND return legs together (round trip) — used when
   *  a destination is picked from a budget/anywhere search, since the user is
   *  choosing somewhere to actually go, not just checking one-way fares. */
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
  /** "a free weekend" / "cheapest weekend" — restrict DEPARTURES to the
   *  weekend-break window (Fri/Sat/Sun). Additive: when unset the filter
   *  behaves exactly as before. Kept deliberately distinct from the
   *  "cheapest weekend DAY" insight, which is Sat/Sun only. */
  weekend_only?: boolean;
}

// Weekend-break departure days: Friday (5), Saturday (6), Sunday (0). Flying
// out Friday evening is the common weekend-away pattern, so Friday counts as a
// weekend departure even though it is not a "weekend day".
export const isWeekendDeparture = (date: string): boolean => {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 5 || day === 6 || day === 0;
};

// Helper to convert HH:MM string to minutes from midnight
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

// Resolve the intent's destination (code or city name) to airport codes.
// Exported so the chat layer can tell "unknown city" apart from "no matches".
export const resolveDestCodes = (intent: IntentJSON): string[] => {
  let destCodes: string[] = [];
  if (intent.dest_code && intent.dest_code.trim()) {
    const dest = intent.dest_code.trim().toUpperCase();
    // If it's a valid airport code in our map, filter by it.
    // Otherwise, treat it as a city query (e.g. "ROM" maps to "FCO" via getCodesForCityQuery)
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

// Round trip: filter each direction on its own terms (destination matching
// differs for outbound vs return, see step 3 below), then merge and re-sort
// as one list.
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

export const filterAndSortFlights = (
  flights: Flight[],
  intent: IntentJSON,
  medianCo2: number
): Flight[] => {
  if (intent.direction === 'both') {
    const outbound = filterAndSortFlights(flights, { ...intent, direction: 'outbound' }, medianCo2);
    const inbound = filterAndSortFlights(flights, { ...intent, direction: 'return' }, medianCo2);
    return sortFlights([...outbound, ...inbound], intent.sort_by);
  }

  let filtered = [...flights];

  // 1. Direction (Default: outbound if not mentioned).
  // NOTE: return rows in the dataset fly EU -> London, so for direction
  // "return" the searched city matches the row's ORIGIN, not its destination.
  const direction = intent.direction || 'outbound';
  filtered = filtered.filter((f) => f.direction === direction);

  // 2. Origin Airport: If specified, match it. If not, include all (no filter).
  // A London airport code always refers to the London end of the journey.
  if (intent.origin_code && intent.origin_code.trim()) {
    const origin = intent.origin_code.trim().toUpperCase();
    if (direction === 'return' && LONDON_CODES.has(origin)) {
      filtered = filtered.filter((f) => f.dest_code === origin);
    } else {
      filtered = filtered.filter((f) => f.origin_code === origin);
    }
  }

  // 3. Destination Code or City
  const destCodes = resolveDestCodes(intent);

  if (destCodes.length > 0) {
    const londonSide = destCodes.filter((c) => LONDON_CODES.has(c));
    const euSide = destCodes.filter((c) => !LONDON_CODES.has(c));
    filtered = filtered.filter((f) => {
      if (direction === 'return') {
        // Return legs: EU city is the row's origin; London is the row's destination
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

  // 4. Date: single day, or an inclusive date range (YYYY-MM-DD strings compare safely)
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
  }

  // 5. Max Price (GBP)
  if (intent.max_price !== undefined && intent.max_price !== null) {
    const maxVal = Number(intent.max_price);
    if (!isNaN(maxVal)) {
      filtered = filtered.filter((f) => f.price_gbp <= maxVal);
    }
  }

  // 6. Stops
  if (intent.stops !== undefined && intent.stops !== null) {
    const stopsVal = Number(intent.stops);
    if (!isNaN(stopsVal)) {
      filtered = filtered.filter((f) => f.stops === stopsVal);
    }
  }

  // 6b. Weekend-only departures (Fri/Sat/Sun). Applies to any weekend query —
  // "cheapest weekend" and "a free weekend" alike — so the stated constraint
  // and the returned set always agree.
  if (intent.weekend_only) {
    filtered = filtered.filter((f) => isWeekendDeparture(f.date));
  }

  // 7. Cabin Class (Case-insensitive matching)
  if (intent.cabin_class && intent.cabin_class.trim()) {
    const cabin = intent.cabin_class.trim().toLowerCase();
    filtered = filtered.filter((f) => f.cabin_class.toLowerCase() === cabin);
  }

  // 8. Departure Time Bounds (using minutes from midnight helper)
  const depAfterMins = parseTimeToMins(intent.departure_after);
  if (depAfterMins !== null) {
    filtered = filtered.filter((f) => f.departure_mins_from_midnight >= depAfterMins);
  }

  const depBeforeMins = parseTimeToMins(intent.departure_before);
  if (depBeforeMins !== null) {
    filtered = filtered.filter((f) => f.departure_mins_from_midnight <= depBeforeMins);
  }

  // 9. Flexibility Policy
  if (intent.flexibility && intent.flexibility.trim()) {
    const flex = intent.flexibility.trim().toLowerCase();
    // Normalize to exact CSV terms
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

  // 10. Low Emissions (CO2 <= Median CO2 of the dataset)
  if (intent.low_co2) {
    filtered = filtered.filter((f) => f.co2_kg <= medianCo2);
  }

  // 11. Airline Name (Case-insensitive substring match)
  if (intent.airline && intent.airline.trim()) {
    const airlineQuery = intent.airline.trim().toLowerCase();
    filtered = filtered.filter((f) => 
      f.airline_name.toLowerCase().includes(airlineQuery)
    );
  }

  // 12. Sorting
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
