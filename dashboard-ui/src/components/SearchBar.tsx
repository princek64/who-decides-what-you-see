import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Search, MapPin, ArrowLeftRight, User, Armchair, Loader2, Compass } from 'lucide-react';
import { DESTINATION_CITIES, CITY_TO_CODE, getCityCountry } from '../lib/airportMap';
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

// Mirrors the Origin dropdown's SelectItems below — used by the swap button
// to match a destination's text back to a valid origin code.
const ORIGIN_OPTIONS = [
  { code: 'LON', label: 'London (All Airports)' },
  { code: 'LHR', label: 'London Heathrow (LHR)' },
  { code: 'LGW', label: 'London Gatwick (LGW)' },
  { code: 'STN', label: 'London Stansted (STN)' },
  { code: 'LTN', label: 'London Luton (LTN)' },
  { code: 'LCY', label: 'London City (LCY)' },
  { code: 'SEN', label: 'London Southend (SEN)' },
];

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

  // Swaps Origin and Destination — a true value swap, not a one-way copy.
  // Origin is a fixed London-airport dropdown (see ORIGIN_OPTIONS, mirroring
  // the SelectItems below) and Destination is free text, so the two field
  // values are swapped via their exact display labels: the old origin's
  // label becomes the new destination text, and the old destination text
  // becomes the new origin only if it matches one of the origin dropdown's
  // labels exactly — otherwise origin is left empty (no London airport is a
  // valid stand-in for an arbitrary city). This makes the swap reversible:
  // swapping twice restores the original values.
  const handleSwap = () => {
    const originLabel = ORIGIN_OPTIONS.find((o) => o.code === originCode)?.label ?? '';
    const matched = ORIGIN_OPTIONS.find((o) => o.label.toLowerCase() === destCity.trim().toLowerCase());
    setOriginCode(matched ? matched.code : '');
    setDestCity(originLabel);
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

    // Dates are optional — an empty date runs a bounded Explore-style search
    // (today through 3 months out; see defaultExploreRange in useFlights.ts)
    // instead of being blocked. A date that IS provided must still fall
    // within the bookable range, so these checks stay, guarded so an empty
    // string (intentionally left blank) never trips them.
    if (date && (date < MIN_DATE || date > DATA_MAX)) {
      setDateError(
        date < MIN_DATE
          ? 'Departure date cannot be in the past. Please pick today or a later date.'
          : 'Flights are available up to 31 Dec 2026. Please pick a date in that range.'
      );
      return;
    }
    if (direction === 'return') {
      if (endDate && (endDate < MIN_DATE || endDate > DATA_MAX)) {
        setDateError('Return date must be between today and 31 Dec 2026.');
        return;
      }
      if (date && endDate && endDate < date) {
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

      {/* Swap Origin/Destination — Google Flights / Skyscanner style: a small
          circular button sitting ON the seam between the two fields rather
          than occupying its own layout slot. This anchor has zero width, so
          with equal gaps on both sides (the form's `gap-4`) it lands exactly
          on the border between Origin and Destination; the button is then
          centered on that point and overlaps both fields evenly. `mx-4`
          adds the same 16px breathing room on each side as the gap-4
          between every other field pair (e.g. Destination → Dates). Kept
          small (w-4/h-4) and borderless so it reads as a lightweight icon
          affordance rather than a third field competing for space. Hidden
          below 480px, where the fields stack and there's no shared border to
          sit on (mirrors the fields' own `max-[480px]:basis-full`). */}
      <div className="relative w-0 h-10 shrink-0 mx-4 max-[480px]:hidden" aria-hidden="false">
        <button
          type="button"
          onClick={handleSwap}
          aria-label="Swap origin and destination"
          title="Swap origin and destination"
          className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-4 h-4 flex items-center justify-center rounded-full bg-card text-foreground shadow-card hover:bg-secondary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
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
