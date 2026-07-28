import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { getCityName } from '../lib/airportMap';
import { useSessionLogger } from './useSessionLogger';

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
  airline_tier: string;
  aircraft_type: string;
  stops: number;
  layover_details: string;
  cabin_class: string;
  price_gbp: number;
  currency: string;
  seats_remaining: number;
  baggage_policy: string;
  meal: string;
  flexibility_policy: string;
  co2_kg: number;
  demand_indicator: string;
  flight_status: 'Scheduled' | 'On time' | 'Delayed' | 'Cancelled';
  
  // Helper field
  departure_mins_from_midnight: number;
}

export interface SearchState {
  originCode: string;
  destCity: string;
  date: string;
  endDate?: string;
  direction: 'outbound' | 'return';
}

export interface FilterState {
  priceRange: [number, number];
  stops: 'all' | 'direct' | '1stop';
  cabinClass: 'all' | 'Economy' | 'Premium Economy' | 'Business';
  airlines: string[];
  departureTime: 'all' | 'morning' | 'afternoon' | 'evening' | 'night';
  flexibility: 'all' | 'Non-refundable' | 'Changeable' | 'Fully flexible';
  lowCo2Only: boolean;
  demandIndicator: 'all' | 'Low' | 'Medium' | 'High' | 'Filling Fast';
  flightStatus: 'all' | 'Scheduled' | 'On time' | 'Delayed' | 'Cancelled';
  includeCancelled: boolean;
}

export type SortType = 'cheapest' | 'fastest' | 'earliest' | 'latest';

function parseTimeToMins(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length < 2) return 0;
  const hours = parseInt(parts[0], 10) || 0;
  const mins = parseInt(parts[1], 10) || 0;
  return hours * 60 + mins;
}

function calculateMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Cheapest fare per date for a route, feeding the price-calendar date picker.
// Mirrors the route-matching rules used in filtering below (LON = any London
// origin; return legs fly EU→London so origin/dest are swapped). Cancelled
// flights are skipped so the calendar never advertises an unbookable fare.
export function computeDatePrices(
  flights: Flight[],
  originCode: string,
  destCity: string,
  leg: 'outbound' | 'return'
): Record<string, number> {
  const prices: Record<string, number> = {};
  const query = destCity.trim().toLowerCase();

  for (const f of flights) {
    if (f.direction !== leg) continue;
    if (f.flight_status === 'Cancelled') continue;

    if (leg === 'outbound') {
      if (originCode !== 'LON' && f.origin_code !== originCode) continue;
      if (query && !getCityName(f.dest_code).toLowerCase().includes(query)) continue;
    } else {
      if (originCode !== 'LON' && f.dest_code !== originCode) continue;
      if (query && !getCityName(f.origin_code).toLowerCase().includes(query)) continue;
    }

    const current = prices[f.date];
    if (current === undefined || f.price_gbp < current) {
      prices[f.date] = f.price_gbp;
    }
  }

  return prices;
}

export function useFlights() {
  const { logFilterChange } = useSessionLogger();

  const [rawFlights, setRawFlights] = useState<Flight[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [medianCo2, setMedianCo2] = useState<number>(0);

  // Search parameters (applied only when "Search" is clicked).
  // Round trip is the default, matching Google Flights / Skyscanner.
  const [searchState, setSearchState] = useState<SearchState>({
    originCode: 'LON',
    destCity: '',
    date: '',
    endDate: '',
    direction: 'return',
  });

  // Active filters (applied in real-time). Cabin class defaults to Economy,
  // matching the Google Flights reference (the header cabin dropdown is the
  // single control for this filter).
  const [filters, setFilters] = useState<FilterState>({
    priceRange: [0, 1500],
    stops: 'all',
    cabinClass: 'Economy',
    airlines: [],
    departureTime: 'all',
    flexibility: 'all',
    lowCo2Only: false,
    demandIndicator: 'all',
    flightStatus: 'all',
    includeCancelled: false,
  });

  // Sort criteria
  const [sortType, setSortType] = useState<SortType>('cheapest');

  // Load and parse CSV on mount
  useEffect(() => {
    setIsLoading(true);
    Papa.parse('/ux_research_flights_h2_2026_final.csv', {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed: Flight[] = results.data.map((row: any) => {
          const depTime = row.departure_time || '';
          return {
            flight_id: row.flight_id || '',
            flight_number: row.flight_number || '',
            origin_code: row.origin_code || '',
            origin_terminal: row.origin_terminal || '',
            dest_code: row.dest_code || '',
            date: row.date || '',
            departure_time: depTime,
            arrival_time: row.arrival_time || '',
            arrival_date: row.arrival_date || '',
            duration_mins: parseInt(row.duration_mins, 10) || 0,
            duration_formatted: row.duration_formatted || '',
            direction: row.direction as 'outbound' | 'return',
            airline_name: row.airline_name || '',
            airline_tier: row.airline_tier || '',
            aircraft_type: row.aircraft_type || '',
            stops: parseInt(row.stops, 10) || 0,
            layover_details: row.layover_details || '',
            cabin_class: row.cabin_class || '',
            price_gbp: parseFloat(row.price_gbp) || 0,
            currency: row.currency || 'GBP',
            seats_remaining: parseInt(row.seats_remaining, 10) || 0,
            baggage_policy: row.baggage_policy || '',
            meal: row.meal || '',
            flexibility_policy: row.flexibility_policy || '',
            co2_kg: parseFloat(row.co2_kg) || 0,
            demand_indicator: row.demand_indicator || '',
            flight_status: row.flight_status as Flight['flight_status'],
            // Calculate helper numeric field
            departure_mins_from_midnight: parseTimeToMins(depTime),
          };
        });

        // Compute median CO2 of the entire dataset
        const co2Values = parsed.map((f) => f.co2_kg).filter((v) => !isNaN(v));
        const medianVal = calculateMedian(co2Values);
        
        setRawFlights(parsed);
        setMedianCo2(medianVal);
        setIsLoading(false);
      },
      error: (err) => {
        console.error('Error loading CSV:', err);
        setIsLoading(false);
      },
    });
  }, []);

  // Filter setters that wrap session logging
  const updateSearch = (newSearch: SearchState) => {
    setSearchState(newSearch);
    logFilterChange('search_origin', newSearch.originCode);
    logFilterChange('search_destination_city', newSearch.destCity);
    logFilterChange('search_date', newSearch.date);
    if (newSearch.endDate) {
      logFilterChange('search_end_date', newSearch.endDate);
    }
    logFilterChange('search_direction', newSearch.direction);
  };

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    logFilterChange(key, value);
  };

  const resetFilters = () => {
    const resetValues: FilterState = {
      priceRange: [0, 1500],
      stops: 'all',
      cabinClass: 'Economy',
      airlines: [],
      departureTime: 'all',
      flexibility: 'all',
      lowCo2Only: false,
      demandIndicator: 'all',
      flightStatus: 'all',
      includeCancelled: false,
    };
    setFilters(resetValues);
    logFilterChange('reset_filters', 'all');
  };

  const updateSortType = (newSort: SortType) => {
    setSortType(newSort);
    logFilterChange('sort_change', newSort);
  };

  // Filter rawFlights by searchState route criteria (independent of other filter state)
  const routeFlights = useMemo(() => {
    return rawFlights.filter((flight) => {
      if (searchState.direction === 'outbound') {
        if (flight.direction !== 'outbound') return false;
        if (searchState.originCode !== 'LON' && flight.origin_code !== searchState.originCode) return false;
        if (searchState.destCity) {
          const cityName = getCityName(flight.dest_code).toLowerCase();
          if (!cityName.includes(searchState.destCity.toLowerCase())) return false;
        }
        if (searchState.date && flight.date !== searchState.date) return false;
      } else {
        const isOutboundLeg = 
          flight.direction === 'outbound' &&
          (searchState.originCode === 'LON' || flight.origin_code === searchState.originCode) &&
          (!searchState.destCity || getCityName(flight.dest_code).toLowerCase().includes(searchState.destCity.toLowerCase())) &&
          (!searchState.date || flight.date === searchState.date);
          
        const isReturnLeg = 
          flight.direction === 'return' &&
          (searchState.originCode === 'LON' || flight.dest_code === searchState.originCode) &&
          (!searchState.destCity || getCityName(flight.origin_code).toLowerCase().includes(searchState.destCity.toLowerCase())) &&
          (!searchState.endDate || flight.date === searchState.endDate);
          
        if (!isOutboundLeg && !isReturnLeg) return false;
      }
      return true;
    });
  }, [rawFlights, searchState]);

  // Get list of all unique airlines matching the route search, sorted by flight count frequency
  const uniqueAirlines = useMemo(() => {
    const counts: Record<string, number> = {};
    routeFlights.forEach((f) => {
      if (f.airline_name) {
        counts[f.airline_name] = (counts[f.airline_name] || 0) + 1;
      }
    });

    return Array.from(new Set(routeFlights.map((f) => f.airline_name)))
      .filter(Boolean)
      .sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
  }, [routeFlights]);

  // Cheapest price for each airline matching the route search
  const airlinePrices = useMemo(() => {
    const prices: Record<string, number> = {};
    routeFlights.forEach((f) => {
      if (f.airline_name) {
        if (!prices[f.airline_name] || f.price_gbp < prices[f.airline_name]) {
          prices[f.airline_name] = f.price_gbp;
        }
      }
    });
    return prices;
  }, [routeFlights]);

  // Main filtering logic (Memoized)
  const filteredFlights = useMemo(() => {
    return rawFlights.filter((flight) => {
      // 1. Route, Direction & Date matching
      if (searchState.direction === 'outbound') {
        // One-way: Outbound flights only
        if (flight.direction !== 'outbound') return false;

        // Origin must match selected dropdown code (unless 'LON' is selected)
        if (searchState.originCode !== 'LON' && flight.origin_code !== searchState.originCode) return false;
        
        // Destination city match
        if (searchState.destCity) {
          const cityName = getCityName(flight.dest_code).toLowerCase();
          if (!cityName.includes(searchState.destCity.toLowerCase())) return false;
        }

        // Date match
        if (searchState.date && flight.date !== searchState.date) return false;
      } else {
        // Round trip: Can match outbound leg (start date) OR return leg (end date)
        const isOutboundLeg = 
          flight.direction === 'outbound' &&
          (searchState.originCode === 'LON' || flight.origin_code === searchState.originCode) &&
          (!searchState.destCity || getCityName(flight.dest_code).toLowerCase().includes(searchState.destCity.toLowerCase())) &&
          (!searchState.date || flight.date === searchState.date);
          
        const isReturnLeg = 
          flight.direction === 'return' &&
          (searchState.originCode === 'LON' || flight.dest_code === searchState.originCode) &&
          (!searchState.destCity || getCityName(flight.origin_code).toLowerCase().includes(searchState.destCity.toLowerCase())) &&
          (!searchState.endDate || flight.date === searchState.endDate);
          
        if (!isOutboundLeg && !isReturnLeg) return false;
      }

      // 4. Cancelled Flights filter (default exclude unless includeCancelled is toggled
      // or the user explicitly filters for cancelled flights)
      if (
        flight.flight_status === 'Cancelled' &&
        !filters.includeCancelled &&
        filters.flightStatus !== 'Cancelled'
      ) {
        return false;
      }

      // 5. Price filter
      if (flight.price_gbp < filters.priceRange[0] || flight.price_gbp > filters.priceRange[1]) return false;

      // 6. Stops filter
      if (filters.stops === 'direct' && flight.stops !== 0) return false;
      if (filters.stops === '1stop' && flight.stops !== 1) return false;

      // 7. Cabin class filter
      if (filters.cabinClass !== 'all' && flight.cabin_class !== filters.cabinClass) return false;

      // 8. Airline checklist
      if (filters.airlines.length > 0 && !filters.airlines.includes(flight.airline_name)) return false;

      // 9. Departure time filter (using integer minutes from midnight)
      const depMins = flight.departure_mins_from_midnight;
      if (filters.departureTime === 'morning') {
        if (depMins < 360 || depMins >= 720) return false; // 06:00 - 11:59
      } else if (filters.departureTime === 'afternoon') {
        if (depMins < 720 || depMins >= 1080) return false; // 12:00 - 17:59
      } else if (filters.departureTime === 'evening') {
        if (depMins < 1080 || depMins >= 1440) return false; // 18:00 - 23:59
      } else if (filters.departureTime === 'night') {
        if (depMins < 0 || depMins >= 360) return false; // 00:00 - 05:59
      }

      // 10. Flexibility policy
      if (filters.flexibility !== 'all') {
        const policy = flight.flexibility_policy.toLowerCase();
        const searchPolicy = filters.flexibility.toLowerCase();
        if (searchPolicy === 'fully flexible') {
          if (!policy.includes('fully flexible') && !policy.includes('flexible')) return false;
        } else if (searchPolicy === 'changeable') {
          if (!policy.includes('changeable')) return false;
        } else if (searchPolicy === 'non-refundable') {
          if (!policy.includes('non-refundable')) return false;
        }
      }

      // 11. CO2 low emission filter (must be below dataset median)
      if (filters.lowCo2Only && flight.co2_kg > medianCo2) return false;

      // 12. Demand indicator
      if (filters.demandIndicator !== 'all') {
        if (flight.demand_indicator.toLowerCase() !== filters.demandIndicator.toLowerCase()) return false;
      }

      // 13. Flight status
      if (filters.flightStatus !== 'all') {
        if (flight.flight_status.toLowerCase() !== filters.flightStatus.toLowerCase()) return false;
      }

      return true;
    });
  }, [rawFlights, searchState, filters, medianCo2]);

  // Sorting logic with performance guard
  const sortedFlights = useMemo(() => {
    const sortFn = (a: Flight, b: Flight) => {
      switch (sortType) {
        case 'cheapest':
          return a.price_gbp - b.price_gbp;
        case 'fastest':
          return a.duration_mins - b.duration_mins;
        case 'earliest':
          return a.departure_mins_from_midnight - b.departure_mins_from_midnight;
        case 'latest':
          return b.departure_mins_from_midnight - a.departure_mins_from_midnight;
        default:
          return 0;
      }
    };

    // Sort the FULL filtered set first, then truncate for rendering performance.
    // (Slicing before sorting would drop the true cheapest/fastest flights.)
    const sorted = [...filteredFlights].sort(sortFn);
    if (sorted.length > 5000) {
      return sorted.slice(0, 2000);
    }
    return sorted;
  }, [filteredFlights, sortType]);

  // Derived stats for stats bar
  const stats = useMemo(() => {
    const totalCount = filteredFlights.length;
    if (totalCount === 0) {
      return { total: 0, cheapest: 0, avgCo2: 0 };
    }

    let minPrice = Infinity;
    let totalCo2 = 0;

    for (let i = 0; i < filteredFlights.length; i++) {
      const flight = filteredFlights[i];
      if (flight.price_gbp < minPrice) {
        minPrice = flight.price_gbp;
      }
      totalCo2 += flight.co2_kg;
    }

    return {
      total: totalCount,
      cheapest: minPrice === Infinity ? 0 : minPrice,
      avgCo2: parseFloat((totalCo2 / totalCount).toFixed(1)),
    };
  }, [filteredFlights]);

  return {
    flights: sortedFlights,
    rawFlights,
    totalFilteredCount: filteredFlights.length,
    isLoading,
    searchState,
    filters,
    sortType,
    uniqueAirlines,
    airlinePrices,
    medianCo2,
    stats,
    updateSearch,
    updateFilter,
    resetFilters,
    updateSortType,
  };
}
