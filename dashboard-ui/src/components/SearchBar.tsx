import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Search, MapPin, ArrowLeftRight, User, Armchair, Loader2, Compass } from 'lucide-react';
import { DESTINATION_CITIES, CITY_TO_CODE, getCityCountry, getCityName } from '../lib/airportMap';
import { computeDatePrices } from '../hooks/useFlights';
import type { Flight } from '../hooks/useFlights';
import { PriceCalendar } from './PriceCalendar';

interface SearchBarProps {
  initialOrigin: string;
  initialDest: string;
  initialDate: string;
  initialEndDate?: string;
  initialDirection: 'outbound' | 'return';
  initialPassengers?: number;
  rawFlights: Flight[];
  // Cabin class is an instant-apply filter (like Google Flights' cabin control)
  // surfaced in the search header — it updates results without a Search click.
  cabinClass: 'all' | 'Economy' | 'Premium Economy' | 'Business';
  onCabinChange: (value: 'all' | 'Economy' | 'Premium Economy' | 'Business') => void;
  onSearch: (search: { originCode: string; destCity: string; date: string; endDate?: string; direction: 'outbound' | 'return'; passengers: number }) => void;
  // Fired the moment a date (or full date range) is picked, independent of
  // the Search button — lets the results screen refresh in place, keeping
  // every other filter, instead of requiring a full re-search.
  onDateChange?: (date: string, endDate?: string) => void;
  // True while the submitted search is still resolving — the button shows a
  // spinner and rejects re-submits so a double click can't restart the window.
  isSearching?: boolean;
}

// Shown when the destination field is focused while still empty,
// like Google Flights' suggested destinations.
const POPULAR_DESTINATIONS = ['Barcelona', 'Paris', 'Rome', 'Amsterdam', 'Madrid', 'Lisbon'];

// Today's date as a YYYY-MM-DD key in the user's local time — used as the
// floor for selectable travel dates so nothing in the past is bookable.
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  initialOrigin,
  initialDest,
  initialDate,
  initialEndDate,
  initialDirection,
  initialPassengers = 1,
  rawFlights,
  cabinClass,
  onCabinChange,
  onSearch,
  onDateChange,
  isSearching = false,
}) => {
  // Flight data covers H2 2026, but we never let a participant pick a date in
  // the past: the selectable floor is today (or the dataset start if the study
  // is somehow run before it). MAX stays at the dataset's last day.
  const DATA_MIN = '2026-07-01';
  const DATA_MAX = '2026-12-31';
  const MIN_DATE = todayKey() > DATA_MIN ? todayKey() : DATA_MIN;
  // Pull a pre-filled date forward to today if it would otherwise be in the past
  const clampDate = (d: string) => (d && d < MIN_DATE ? MIN_DATE : d);

  const [originCode, setOriginCode] = useState(initialOrigin);
  const [destCity, setDestCity] = useState(initialDest);
  const [date, setDate] = useState(clampDate(initialDate));
  const [endDate, setEndDate] = useState(clampDate(initialEndDate || '') || '');
  const [direction, setDirection] = useState<'outbound' | 'return'>(initialDirection);
  const [passengers, setPassengers] = useState(initialPassengers);

  // Autocomplete suggestions state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [dateError, setDateError] = useState<string | null>(null);
  const suggestionRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setActiveSuggestion(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync state with props for programmatic updates (e.g., example searches)
  useEffect(() => {
    setOriginCode(initialOrigin);
  }, [initialOrigin]);

  useEffect(() => {
    setDestCity(initialDest);
  }, [initialDest]);

  useEffect(() => {
    setDate(clampDate(initialDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDate]);

  useEffect(() => {
    if (initialEndDate) {
      setEndDate(clampDate(initialEndDate));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEndDate]);

  useEffect(() => {
    setDirection(initialDirection);
  }, [initialDirection]);

  useEffect(() => {
    setPassengers(initialPassengers);
  }, [initialPassengers]);

  // Rank prefix matches above substring matches (Google Flights behaviour)
  const buildMatches = (value: string): string[] => {
    const q = value.trim().toLowerCase();
    if (!q) return POPULAR_DESTINATIONS;
    const starts: string[] = [];
    const contains: string[] = [];
    for (const city of DESTINATION_CITIES) {
      const lower = city.toLowerCase();
      if (lower.startsWith(q)) starts.push(city);
      else if (lower.includes(q)) contains.push(city);
    }
    return [...starts, ...contains].slice(0, 8);
  };

  // Update suggestions on input change
  const handleDestChange = (value: string) => {
    setDestCity(value);
    setSuggestions(buildMatches(value));
    setShowSuggestions(true);
    setActiveSuggestion(-1);
  };

  const handleDestFocus = () => {
    setSuggestions(buildMatches(destCity));
    setShowSuggestions(true);
    setActiveSuggestion(-1);
  };

  const handleSuggestionClick = (city: string) => {
    setDestCity(city);
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSuggestion(-1);
  };

  // Swaps Origin and Destination. Origin is a fixed London-airport dropdown
  // and Destination is a free-text city, so the swap maps as best it can: the
  // destination city becomes the new origin, but only if it's actually one of
  // the London airports the Origin dropdown offers (falling back to "London
  // (All Airports)" otherwise — every flight in this dataset departs from or
  // returns to London), and the old origin's city name becomes the new
  // destination text.
  const handleSwap = () => {
    const ORIGIN_CODES = new Set(['LON', 'LHR', 'LGW', 'STN', 'LTN', 'LCY', 'SEN']);
    const originCity = originCode === 'LON' ? 'London' : getCityName(originCode);
    const matchedCodes = CITY_TO_CODE[destCity.trim().toLowerCase()] || [];
    const newOriginCode = matchedCodes.find((code) => ORIGIN_CODES.has(code));
    setOriginCode(newOriginCode || 'LON');
    setDestCity(originCity);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // Arrow-key navigation over the suggestion list
  const handleDestKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      if (activeSuggestion >= 0) {
        e.preventDefault();
        handleSuggestionClick(suggestions[activeSuggestion]);
      } else {
        setShowSuggestions(false);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setActiveSuggestion(-1);
    }
  };

  // Cheapest-fare-per-day maps for the price calendars. Return legs fly
  // EU→London in the dataset, so the return calendar scans 'return' rows.
  const getOutboundPrices = useCallback(
    () => computeDatePrices(rawFlights, originCode, destCity, 'outbound'),
    [rawFlights, originCode, destCity]
  );
  const getReturnPrices = useCallback(
    () => computeDatePrices(rawFlights, originCode, destCity, 'return'),
    [rawFlights, originCode, destCity]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Enter-to-submit bypasses the disabled button, so re-entry is blocked here too
    if (isSearching) return;

    // A departure date is always required — an empty date would otherwise match
    // every date in the dataset and flood the results.
    if (!date) {
      setDateError('Please select a departure date to search for flights.');
      return;
    }

    // Flight data covers H2 2026 only; block out-of-range or past dates
    if (date && (date < MIN_DATE || date > DATA_MAX)) {
      setDateError(
        date < MIN_DATE
          ? 'Departure date cannot be in the past. Please pick today or a later date.'
          : 'Flights are available up to 31 Dec 2026. Please pick a date in that range.'
      );
      return;
    }
    if (direction === 'return') {
      if (!endDate) {
        setDateError('Please select a return date to search round-trip flights.');
        return;
      }
      if (endDate < MIN_DATE || endDate > DATA_MAX) {
        setDateError('Return date must be between today and 31 Dec 2026.');
        return;
      }
      if (date && endDate < date) {
        setDateError('Return date cannot be before the departure date.');
        return;
      }
    }

    setDateError(null);
    onSearch({ originCode, destCity, date, endDate, direction, passengers });
  };

  return (
    <form
      onSubmit={handleSearchSubmit}
      className="w-full bg-card border border-border shadow-card-lg rounded-xl p-5 pt-3 max-[480px]:p-4 max-[480px]:pt-2.5 flex flex-wrap gap-4 max-[480px]:gap-3 items-end relative z-30"
    >
      {/* 0. Trip options row (Google Flights-style: trip type above the fields).
           `w-full` plus a negative margin made this row WIDER than the card's
           content box, and `justify-end` then pushed the overflow out past the
           card's left edge on a phone. Below sm it starts at the left, wraps if
           the three triggers don't fit, and the negative margin only cancels the
           triggers' own px-2 so their text lines up with the field labels. */}
      <div className="w-full basis-full flex flex-wrap items-center gap-1 justify-start sm:justify-end -mx-2 sm:mx-0 sm:-mr-2">
        <Select value={direction} onValueChange={(val) => setDirection(val as 'outbound' | 'return')}>
          <SelectTrigger
            size="sm"
            className="w-auto h-8 bg-transparent border-transparent shadow-none hover:bg-secondary rounded-md text-xs font-medium text-foreground gap-1.5 px-2 max-[480px]:gap-1 max-[480px]:px-1.5"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border border-border shadow-modal">
            <SelectItem value="return">Round trip</SelectItem>
            <SelectItem value="outbound">One-way</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(passengers)} onValueChange={(val) => setPassengers(parseInt(val, 10))}>
          <SelectTrigger
            size="sm"
            className="w-auto h-8 bg-transparent border-transparent shadow-none hover:bg-secondary rounded-md text-xs font-medium text-foreground gap-1.5 px-2 max-[480px]:gap-1 max-[480px]:px-1.5"
          >
            <User className="w-3.5 h-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border border-border shadow-modal">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} adult{n === 1 ? '' : 's'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={cabinClass} onValueChange={(val) => onCabinChange(val as SearchBarProps['cabinClass'])}>
          <SelectTrigger
            size="sm"
            className="w-auto h-8 bg-transparent border-transparent shadow-none hover:bg-secondary rounded-md text-xs font-medium text-foreground gap-1.5 px-2 max-[480px]:gap-1 max-[480px]:px-1.5"
          >
            <Armchair className="w-3.5 h-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border border-border shadow-modal">
            <SelectItem value="Economy">Economy</SelectItem>
            <SelectItem value="Premium Economy">Premium Economy</SelectItem>
            <SelectItem value="Business">Business</SelectItem>
            <SelectItem value="all">All cabin classes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 1. Origin Airport Dropdown */}
      <div className="flex flex-col gap-1.5 text-left flex-[1.4_1_180px] max-[480px]:basis-full">
        <label className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">Origin</label>
        <Select value={originCode} onValueChange={setOriginCode}>
          <SelectTrigger size="lg" className="w-full bg-transparent border-border font-medium text-foreground h-10 rounded-md">
            <SelectValue placeholder="Origin" />
          </SelectTrigger>
          <SelectContent className="bg-popover border border-border shadow-modal">
            <SelectItem value="LON">London (All Airports)</SelectItem>
            <SelectItem value="LHR">London Heathrow (LHR)</SelectItem>
            <SelectItem value="LGW">London Gatwick (LGW)</SelectItem>
            <SelectItem value="STN">London Stansted (STN)</SelectItem>
            <SelectItem value="LTN">London Luton (LTN)</SelectItem>
            <SelectItem value="LCY">London City (LCY)</SelectItem>
            <SelectItem value="SEN">London Southend (SEN)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Swap Origin/Destination. The blank label keeps the button's h-10
          hit area aligned with the two field inputs, not their labels. */}
      <div className="flex flex-col gap-1.5 shrink-0">
        <span className="text-[11px] leading-4 opacity-0 select-none hidden sm:block" aria-hidden="true">Swap</span>
        <button
          type="button"
          onClick={handleSwap}
          aria-label="Swap origin and destination"
          title="Swap origin and destination"
          className="w-10 h-10 flex items-center justify-center rounded-md border border-border bg-transparent text-foreground hover:bg-secondary hover:border-white/20 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeftRight className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Destination City Input with Suggestions */}
      <div className="flex flex-col gap-1.5 text-left relative flex-[2_1_220px] max-[480px]:basis-full" ref={suggestionRef}>
        <label className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">Destination City</label>
        <div className="relative">
          <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input
            value={destCity}
            onChange={(e) => handleDestChange(e.target.value)}
            onFocus={handleDestFocus}
            onKeyDown={handleDestKeyDown}
            placeholder="Where to?"
            autoComplete="off"
            role="combobox"
            aria-expanded={showSuggestions}
            className="pl-9 bg-transparent border-border h-10 font-medium text-foreground rounded-md"
          />
        </div>

        {/* Suggestion list overlay */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-16 left-0 right-0 bg-card border border-border rounded-md shadow-modal max-h-56 overflow-y-auto overscroll-contain z-40 py-1">
            {!destCity.trim() && (
              <div className="px-3 pt-1.5 pb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Popular destinations
              </div>
            )}
            {suggestions.map((city, idx) => {
              const codes = CITY_TO_CODE[city.toLowerCase()] || [];
              const country = getCityCountry(city);
              return (
                <div
                  key={city}
                  onClick={() => handleSuggestionClick(city)}
                  onMouseEnter={() => setActiveSuggestion(idx)}
                  className={`px-3 py-2 flex items-center gap-2.5 cursor-pointer transition-colors ${
                    idx === activeSuggestion ? 'bg-secondary' : ''
                  }`}
                >
                  <span className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                  </span>
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-foreground truncate">{city}</span>
                    {country && <span className="text-[11px] text-muted-foreground leading-tight">{country}</span>}
                  </span>
                  <span className="flex gap-1 shrink-0">
                    {codes.map((code) => (
                      <span key={code} className="text-[10px] font-mono text-muted-foreground bg-secondary border border-border rounded px-1 py-0.5">
                        {code}
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Travel Date Picker with per-day fares (H2 2026 Only) */}
      <div className="flex flex-col gap-1.5 text-left flex-[2_1_240px] max-[480px]:basis-full">
        <label className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">
          {direction === 'return' ? 'Dates' : 'Date'}
        </label>
        {direction === 'return' ? (
          <PriceCalendar
            mode="range"
            value={date}
            endValue={endDate}
            onRangeChange={(start, end) => {
              setDate(start);
              setEndDate(end);
              // Only propagate once both dates are picked — the first click of
              // a range re-pick clears `end`, which isn't a complete date yet.
              if (end) onDateChange?.(start, end);
            }}
            minDate={MIN_DATE}
            maxDate={DATA_MAX}
            getPrices={getOutboundPrices}
            getEndPrices={getReturnPrices}
            pricesEnabled={!!destCity.trim()}
          />
        ) : (
          <PriceCalendar
            value={date}
            onChange={(d) => {
              setDate(d);
              onDateChange?.(d);
            }}
            minDate={MIN_DATE}
            maxDate={DATA_MAX}
            getPrices={getOutboundPrices}
            placeholder="Departure"
            pricesEnabled={!!destCity.trim()}
          />
        )}
      </div>

      {/* 4. Search Button (full width under 480px). No fixed destination means
          this is an open-ended budget/date exploration rather than a lookup
          for a specific route, so the action reads as "Explore". */}
      <div className="flex-[0.8_1_120px] max-[480px]:basis-full">
        <Button
          type="submit"
          disabled={isSearching}
          aria-busy={isSearching || undefined}
          className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-medium flex items-center justify-center gap-1.5 transition-all rounded-md disabled:opacity-70 disabled:pointer-events-none"
        >
          {isSearching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : destCity.trim() ? (
            <Search className="w-4 h-4" />
          ) : (
            <Compass className="w-4 h-4" />
          )}
          {isSearching ? (destCity.trim() ? 'Searching' : 'Exploring') : destCity.trim() ? 'Search' : 'Explore'}
        </Button>
      </div>

      {/* Date validation error */}
      {dateError && (
        <div className="w-full text-xs font-medium text-error text-left mt-1">
          {dateError}
        </div>
      )}
    </form>
  );
};
