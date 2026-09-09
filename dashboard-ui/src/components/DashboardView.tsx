import React, { useState } from 'react';
import { useFlights, DEFAULT_FILTERS } from '../hooks/useFlights';
import type { Flight, FilterState, SearchState } from '../hooks/useFlights';
import { useSessionLogger } from '../hooks/useSessionLogger';
import { SearchBar } from './SearchBar';
import { FilterBar } from './FilterBar';
import { StatsBar } from './StatsBar';
import { SortBar } from './SortBar';
import { FlightCard } from './FlightCard';
import { FlightDetailModal } from './FlightDetailModal';
import { Button } from './ui/button';
import { useVirtualizer } from '@tanstack/react-virtual';
import { HelpCircle, Plane, ArrowLeft, ArrowRight, Pencil, ChevronUp } from 'lucide-react';
import { FlightSketchLogo } from './FlightSketchLogo';
import { RoundTripCard } from './RoundTripCard';
import { ResultsSkeleton } from './ResultsSkeleton';
import { SearchProgress } from './SearchProgress';
import { getCityName } from '../lib/airportMap';
import { DestinationGrid } from './DestinationGrid';
import { useIsMobile } from '../hooks/useIsMobile';

// How long the search-pending state is held. Filtering is synchronous, so this
// is a fixed presentational window: without it the results replace the hero in
// the same frame as the click, which reads as "nothing happened" rather than as
// a search. Long enough to register the progress bar and skeleton, short enough
// not to add meaningful time to a participant's task.
const SEARCH_LOADING_MS = 800;

// Debounce before the filter loader shows, so rapid changes don't flicker it.
const FILTER_LOADING_DEBOUNCE_MS = 400;

// Defaults reapplied when the user backs out to the search screen.
const DEFAULT_SEARCH_STATE: SearchState = {
  originCode: 'LON',
  destCity: '',
  date: '',
  endDate: '',
  direction: 'return',
};

export const DashboardView: React.FC = () => {
  const {
    flights,
    filteredFlights,
    rawFlights,
    totalFilteredCount,
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
    applyFilters,
    resetFilters,
    updateSortType,
  } = useFlights();

  const { logCardClick, logDetailView, logFilterChange } = useSessionLogger();
  const isMobile = useIsMobile();
  // One flight (one-way) or [outbound, return] shown in the detail popup
  const [selectedFlights, setSelectedFlights] = useState<Flight[] | null>(null);

  // Travellers — display-only multiplier; all fares in the data are per adult
  const [adults, setAdults] = useState(1);

  // Track if search has been run
  const [hasSearched, setHasSearched] = useState(false);

  // True when the current results came from an open-destination ("Explore")
  // search. Lets a destination picked off the grid be backed out of, back to
  // the grid, instead of only being able to restart the whole search.
  const [exploreMode, setExploreMode] = useState(false);

  // Mobile only: after a search the full search form collapses into a compact
  // sticky summary so results land above the fold. Tapping it re-expands the
  // form. Desktop always shows the full form (this flag is ignored ≥sm).
  const [mobileFormExpanded, setMobileFormExpanded] = useState(false);

  // Loading state for a submitted search (see SEARCH_LOADING_MS above).
  const [resultsLoading, setResultsLoading] = useState(false);
  const loadingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginResultsLoading = React.useCallback(() => {
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    setResultsLoading(true);
    loadingTimerRef.current = setTimeout(() => setResultsLoading(false), SEARCH_LOADING_MS);
  }, []);

  const filterDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // draftFilters drives the controls instantly; filters (committed) only updates once the loader is up.
  const [draftFilters, setDraftFilters] = useState<FilterState>(filters);
  const pendingFiltersRef = React.useRef<FilterState>(filters);

  React.useEffect(() => {
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    };
  }, []);

  // Debounced loader; filters commit in the same tick it shows, so new data is always hidden until it's done.
  const handleFilterChange = React.useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
      const next = { ...pendingFiltersRef.current, [key]: value };
      pendingFiltersRef.current = next;
      setDraftFilters(next);
      logFilterChange(key, value);
      if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
      filterDebounceRef.current = setTimeout(() => {
        applyFilters(pendingFiltersRef.current);
        beginResultsLoading();
      }, FILTER_LOADING_DEBOUNCE_MS);
    },
    [applyFilters, beginResultsLoading, logFilterChange]
  );

  const handleFilterReset = React.useCallback(() => {
    if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    pendingFiltersRef.current = DEFAULT_FILTERS;
    setDraftFilters(DEFAULT_FILTERS);
    resetFilters();
    beginResultsLoading();
  }, [resetFilters, beginResultsLoading]);

  // Resets the search form to defaults when backing out to the search screen.
  const handleBackToSearch = React.useCallback(() => {
    if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    updateSearch(DEFAULT_SEARCH_STATE);
    pendingFiltersRef.current = DEFAULT_FILTERS;
    setDraftFilters(DEFAULT_FILTERS);
    setAdults(1);
    setHasSearched(false);
    setExploreMode(false);
    setMobileFormExpanded(false);
  }, [updateSearch]);

  const handleSearchSubmit = (newSearch: { originCode: string; destCity: string; date: string; endDate?: string; direction: 'outbound' | 'return'; passengers: number }) => {
    setAdults(newSearch.passengers);
    // A new search resets stale filters and drops any pending filter debounce.
    if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    pendingFiltersRef.current = DEFAULT_FILTERS;
    setDraftFilters(DEFAULT_FILTERS);
    resetFilters();
    updateSearch({
      originCode: newSearch.originCode,
      destCity: newSearch.destCity,
      date: newSearch.date,
      endDate: newSearch.endDate,
      direction: newSearch.direction,
    });
    // An empty destination is a valid "anywhere" search (e.g. the open-ended
    // "£150 budget, where can I go?" research task) — always show results.
    // Remembered so a destination picked off the results grid can later be
    // backed out of without losing the rest of the search.
    setExploreMode(!newSearch.destCity);
    setHasSearched(true);
    setMobileFormExpanded(false);
    beginResultsLoading();
  };

  // A date pick behaves like a filter change, not a new search: it applies
  // instantly and leaves every other filter (price, stops, airlines, times…)
  // untouched, instead of wiping them the way a "Search" submit does.
  const handleDateChange = React.useCallback(
    (date: string, endDate?: string) => {
      if (!hasSearched) return;
      if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
      updateSearch({ ...searchState, date, endDate: endDate ?? searchState.endDate });
      beginResultsLoading();
    },
    [hasSearched, searchState, updateSearch, beginResultsLoading]
  );

  // Reference for the virtual list scroll container
  const parentRef = React.useRef<HTMLDivElement>(null);

  const isRoundTrip = searchState.direction === 'return';

  // How many of each leg survive the filters (drives the empty-state copy)
  const legCounts = React.useMemo(() => {
    if (!isRoundTrip) return { outbound: flights.length, return: 0 };
    let outbound = 0;
    for (const f of flights) if (f.direction === 'outbound') outbound++;
    return { outbound, return: flights.length - outbound };
  }, [flights, isRoundTrip]);

  // Skyscanner-style round-trip itineraries: pair each outbound leg with
  // return legs FROM THE SAME AIRPORT (so an "anywhere" search never mixes
  // cities), rank the pairs by the active sort criterion, and cap the
  // combinations to keep the list usable.
  const PAIR_OUTBOUND_CAP = 120;
  const PAIR_RETURNS_PER_OUTBOUND = 8;
  const PAIR_RESULT_CAP = 400;
  const roundTripPairs = React.useMemo(() => {
    if (!isRoundTrip) return [];
    const outbound: Flight[] = [];
    const returnsByAirport: Record<string, Flight[]> = {};
    for (const f of flights) {
      if (f.direction === 'outbound') {
        if (outbound.length < PAIR_OUTBOUND_CAP) outbound.push(f);
      } else {
        (returnsByAirport[f.origin_code] ||= []).push(f);
      }
    }
    const pairs: { out: Flight; ret: Flight }[] = [];
    for (const out of outbound) {
      const candidates = returnsByAirport[out.dest_code];
      if (!candidates) continue;
      // Both lists inherit the active sort order, so the first few return
      // candidates are the best ones under the current criterion.
      for (const ret of candidates.slice(0, PAIR_RETURNS_PER_OUTBOUND)) {
        // Filter by the combined leg total, not each leg individually, since that's what's shown.
        const total = out.price_gbp + ret.price_gbp;
        if (total < filters.priceRange[0] || total > filters.priceRange[1]) continue;
        pairs.push({ out, ret });
      }
    }
    const rank = (p: { out: Flight; ret: Flight }) => {
      switch (sortType) {
        case 'cheapest': return p.out.price_gbp + p.ret.price_gbp;
        case 'fastest': return p.out.duration_mins + p.ret.duration_mins;
        case 'earliest': return p.out.departure_mins_from_midnight;
        case 'latest': return -p.out.departure_mins_from_midnight;
        default: return 0;
      }
    };
    pairs.sort((a, b) => rank(a) - rank(b));
    return pairs.slice(0, PAIR_RESULT_CAP);
  }, [flights, isRoundTrip, sortType, filters.priceRange]);

  const resultCount = isRoundTrip ? roundTripPairs.length : flights.length;
  const hasResults = resultCount > 0;

  // StatsBar reads per-leg prices from useFlights. For round trips the list is
  // itineraries, so "Cheapest" / "Total Found" must use combined pair fares
  // and the pair count — otherwise cheapest shows a one-way leg (e.g. £62.54
  // outbound) while every card shows the real trip total (£126.89).
  const displayStats = React.useMemo(() => {
    if (!isRoundTrip) return stats;
    if (roundTripPairs.length === 0) {
      return { total: 0, cheapest: 0, avgCo2: stats.avgCo2 };
    }
    let cheapest = Infinity;
    let totalCo2 = 0;
    for (const { out, ret } of roundTripPairs) {
      const fare = out.price_gbp + ret.price_gbp;
      if (fare < cheapest) cheapest = fare;
      totalCo2 += out.co2_kg + ret.co2_kg;
    }
    return {
      total: roundTripPairs.length,
      cheapest: cheapest === Infinity ? 0 : cheapest,
      avgCo2: parseFloat((totalCo2 / (roundTripPairs.length * 2)).toFixed(1)),
    };
  }, [isRoundTrip, roundTripPairs, stats]);

  // Groups results by destination city for an anywhere (no-destination) search.
  // Built from filteredFlights (the full route/filter match), NOT the capped
  // `flights`/roundTripPairs used to render rows and itineraries. Both of
  // those caps (sortedFlights' 2000-row cap, roundTripPairs'
  // PAIR_OUTBOUND_CAP) exist to bound what gets drawn on screen, not which
  // cities are reachable — and over a wide date window (e.g. the no-date
  // Explore default) the same handful of popular routes repeat across many
  // dates, filling those caps entirely and hiding cities that only fly
  // occasionally. This is a cheap O(n) aggregation (grouping by city), not a
  // render, so scanning the uncapped list here is fine. PAIR_RETURNS_PER_OUTBOUND
  // still caps how many return candidates are checked per outbound leg; that
  // only affects count/cheapest precision, not which cities appear.
  const destinationGroups = React.useMemo(() => {
    if (searchState.destCity) return [];
    const map = new Map<string, { code: string; city: string; count: number; cheapest: number }>();
    if (isRoundTrip) {
      const returnsByAirport: Record<string, Flight[]> = {};
      for (const f of filteredFlights) {
        if (f.direction === 'return') (returnsByAirport[f.origin_code] ||= []).push(f);
      }
      for (const out of filteredFlights) {
        if (out.direction !== 'outbound') continue;
        const candidates = returnsByAirport[out.dest_code];
        if (!candidates) continue;
        for (const ret of candidates.slice(0, PAIR_RETURNS_PER_OUTBOUND)) {
          const total = out.price_gbp + ret.price_gbp;
          if (total < filters.priceRange[0] || total > filters.priceRange[1]) continue;
          const entry = map.get(out.dest_code);
          if (entry) {
            entry.count++;
            if (total < entry.cheapest) entry.cheapest = total;
          } else {
            map.set(out.dest_code, { code: out.dest_code, city: getCityName(out.dest_code), count: 1, cheapest: total });
          }
        }
      }
    } else {
      for (const f of filteredFlights) {
        if (f.direction !== 'outbound') continue;
        const entry = map.get(f.dest_code);
        if (entry) {
          entry.count++;
          if (f.price_gbp < entry.cheapest) entry.cheapest = f.price_gbp;
        } else {
          map.set(f.dest_code, { code: f.dest_code, city: getCityName(f.dest_code), count: 1, cheapest: f.price_gbp });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.cheapest - b.cheapest);
  }, [searchState.destCity, isRoundTrip, filteredFlights, filters.priceRange]);
  const showDestinationGrid = !searchState.destCity && destinationGroups.length > 0;

  const handleDestinationSelect = (city: string) => {
    updateSearch({ ...searchState, destCity: city });
    beginResultsLoading();
  };

  // Clears the picked destination without touching origin/date/direction or
  // filters, so an Explore search can step back to the destination grid
  // instead of restarting the whole search.
  const handleBackToDestinations = React.useCallback(() => {
    if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    updateSearch({ ...searchState, destCity: '' });
    beginResultsLoading();
  }, [searchState, updateSearch, beginResultsLoading]);

  const originLabel = searchState.originCode === 'LON' ? 'London' : getCityName(searchState.originCode);
  const destLabel = searchState.destCity
    ? searchState.destCity.charAt(0).toUpperCase() + searchState.destCity.slice(1)
    : 'All destinations';

  // Compact one-line pieces for the mobile collapsed search summary
  const fmtSummaryDate = (d: string) => {
    const dt = new Date(`${d}T00:00:00`);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
  const summaryOrigin = searchState.originCode === 'LON' ? 'LON' : searchState.originCode;
  const summaryDest = searchState.destCity ? destLabel : 'Anywhere';
  const summaryDates = searchState.date
    ? (isRoundTrip && searchState.endDate
        ? `${fmtSummaryDate(searchState.date)} – ${fmtSummaryDate(searchState.endDate)}`
        : fmtSummaryDate(searchState.date))
    : '';

  // Virtualizer setup — fixed row heights. Mobile cards are shorter (the card
  // layouts drop metadata below sm), so the row height has to follow the
  // breakpoint or the rows overlap / leave gaps.
  //   desktop: 216px itinerary, 200px one-way   mobile: 196px / 180px
  const rowVirtualizer = useVirtualizer({
    count: resultCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () =>
      isRoundTrip ? (isMobile ? 148 : 216) : isMobile ? 180 : 200,
    overscan: 5,
  });

  // Row heights differ between one-way and round-trip result sets, and between
  // the mobile and desktop card layouts
  React.useEffect(() => {
    rowVirtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRoundTrip, resultCount, isMobile]);

  const handleFlightSelect = (flight: Flight) => {
    logCardClick(flight.flight_id);
    logDetailView(flight.flight_id);
    setSelectedFlights([flight]);
  };

  // Round-trip card click: both legs open in one popup, so both are logged
  // as viewed (one card_click + detail_view per flight, same event schema).
  const handlePairSelect = (outbound: Flight, inbound: Flight) => {
    logCardClick(outbound.flight_id);
    logDetailView(outbound.flight_id);
    logCardClick(inbound.flight_id);
    logDetailView(inbound.flight_id);
    setSelectedFlights([outbound, inbound]);
  };

  // Full-page loading screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 select-none">
        <div className="w-24 h-24 rounded-full border border-dashed border-border flex items-center justify-center overflow-hidden bg-muted relative">
          <FlightSketchLogo size={36} className="text-foreground animate-flight-takeoff" />
        </div>
        <div className="mt-4 text-xs font-mono text-muted-foreground uppercase tracking-widest animate-pulse">
          Launching Flight Dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-md font-medium text-xs"
      >
        Skip to main content
      </a>

      {/* 1. Sticky Header */}
      <header className="sticky top-0 z-40 bg-background border-b border-border h-16 px-4 md:px-8 flex justify-between items-center select-none">
        <button
          type="button"
          onClick={() => hasSearched && handleBackToSearch()}
          disabled={!hasSearched}
          aria-label={hasSearched ? 'Back to search' : 'Flight Dashboard'}
          className={`flex items-center gap-2.5 text-left rounded-md -mx-1 px-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${hasSearched ? 'hover:bg-secondary cursor-pointer' : 'cursor-default'}`}
        >
          <div className="w-9 h-9 flex items-center justify-center text-foreground">
            <FlightSketchLogo size={28} />
          </div>
          <div className="text-left">
            <h1 className="text-sm font-semibold text-foreground tracking-tight leading-none">Flight Dashboard</h1>
          </div>
        </button>

        {/* Results indicator */}
        <div className="flex items-center gap-3">
          {hasSearched && (
            resultsLoading ? (
              /* Counts from the previous query would read as this query's
                 answer, so they are held back until the search resolves */
              <div className="text-right flex flex-col items-end gap-1 animate-pulse" aria-hidden="true">
                <div className="h-3 w-28 rounded bg-muted" />
                <div className="h-2.5 w-20 rounded bg-muted" />
              </div>
            ) : (
              <div className="text-right">
                <div className="text-xs font-medium text-foreground">
                  Showing <span className="font-mono tabular-nums">{resultCount.toLocaleString()}</span> {isRoundTrip ? 'itineraries' : 'flights'}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  of <span className="font-mono tabular-nums">{totalFilteredCount.toLocaleString()}</span> matched flights
                </div>
              </div>
            )
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main id="main-content" className="flex-1 flex flex-col max-w-7xl w-full mx-auto p-4 md:p-6 gap-6 box-border">
        {!hasSearched ? (
          /* Pre-search hero: the search card sits ~30% down the viewport (not
             vertically centred), with a tight logo→heading→subtext rhythm above it */
          /* max-[480px]:px-0 — <main> already pads 16px; doubling it here left
             the search card too narrow for its own trip-options row */
          <div className="flex-1 flex flex-col items-center justify-start pt-[16vh] max-[480px]:pt-6 max-w-5xl w-full mx-auto p-4 max-[480px]:px-0 md:px-8 animate-fade-in select-none">
            <div className="w-14 h-14 max-[480px]:w-11 max-[480px]:h-11 rounded-full bg-card flex items-center justify-center border border-border shadow-card mb-3 max-[480px]:mb-2 overflow-hidden p-2.5 max-[480px]:p-2 text-foreground">
              <FlightSketchLogo size={36} className="animate-pulse" style={{ width: '100%', height: '100%' }} />
            </div>
            <h2 className="text-3xl max-[480px]:text-[1.5rem] font-semibold text-foreground tracking-tighter text-center mb-1.5 max-[480px]:mb-1">Find your next flight.</h2>
            <p className="text-sm max-[480px]:text-xs text-muted-foreground text-center mb-5 max-[480px]:mb-3 max-w-md">
              Search for outbound and return flights across Europe, with details on pricing, cabin classes, and CO₂ emissions.
            </p>

            <div className="w-full">
              <SearchBar
                initialOrigin={searchState.originCode}
                initialDest={searchState.destCity}
                initialDate={searchState.date}
                initialEndDate={searchState.endDate}
                initialDirection={searchState.direction}
                initialPassengers={adults}
                rawFlights={rawFlights}
                cabinClass={filters.cabinClass}
                onCabinChange={(val) => updateFilter('cabinClass', val)}
                onSearch={handleSearchSubmit}
                onDateChange={handleDateChange}
                isSearching={resultsLoading}
              />
            </div>
          </div>
        ) : (
          <>
            {/* 2. Top Search Bar */}
            <section aria-label="Search Controls" className="flex flex-col gap-3">
              {/* Desktop back-to-hero link (mobile uses the header logo for this).
                  Styled as a real button — border + fill on hover, generous
                  padding — so it reads as an actionable control, not a caption,
                  and has a hit area worth aiming for. */}
              <button
                type="button"
                onClick={handleBackToSearch}
                className="hidden sm:inline-flex self-start items-center gap-1.5 text-xs font-semibold text-foreground bg-secondary hover:bg-muted border border-border transition-colors -mb-1 rounded-md pl-2.5 pr-3 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to search
              </button>

              {/* Mobile collapsed summary — sticky under the header. An explicit
                  back arrow returns to the search screen (tapping the header
                  logo also works, but that affordance is not discoverable);
                  tapping the summary itself re-opens the form. */}
              {!mobileFormExpanded && (
                <div className="sm:hidden sticky top-16 z-30 -mx-4 px-2 py-2.5 bg-background border-b border-border flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleBackToSearch}
                    aria-label="Back to search"
                    className="shrink-0 w-9 h-9 -my-1 inline-flex items-center justify-center rounded-md text-foreground hover:bg-secondary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileFormExpanded(true)}
                    aria-label="Edit search"
                    className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left"
                  >
                    <span className="flex items-center gap-1.5 min-w-0 text-sm font-medium text-foreground truncate">
                      <span className="font-mono shrink-0">{summaryOrigin}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{summaryDest}</span>
                      {summaryDates && (
                        <>
                          <span className="text-muted-foreground shrink-0">·</span>
                          <span className="text-muted-foreground font-mono text-xs shrink-0">{summaryDates}</span>
                        </>
                      )}
                    </span>
                    <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-link pr-2">
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </span>
                  </button>
                </div>
              )}

              {/* Full search form: always on desktop, on mobile only when expanded */}
              <div className={mobileFormExpanded ? 'flex flex-col gap-3' : 'hidden sm:flex sm:flex-col sm:gap-3'}>
                {mobileFormExpanded && (
                  <button
                    type="button"
                    onClick={() => setMobileFormExpanded(false)}
                    className="sm:hidden self-end inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground -mb-1"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                    Collapse
                  </button>
                )}
                <SearchBar
                  initialOrigin={searchState.originCode}
                  initialDest={searchState.destCity}
                  initialDate={searchState.date}
                  initialEndDate={searchState.endDate}
                  initialDirection={searchState.direction}
                  initialPassengers={adults}
                  rawFlights={rawFlights}
                  cabinClass={draftFilters.cabinClass}
                  onCabinChange={(val) => handleFilterChange('cabinClass', val)}
                  onSearch={handleSearchSubmit}
                  onDateChange={handleDateChange}
                  isSearching={resultsLoading}
                />
              </div>

              {/* Search progress — sits directly under the form (Google Flights'
                  thin sliding bar) so the pending state is visible on the
                  collapsed mobile summary too, not only inside the form. */}
              {resultsLoading && (
                <SearchProgress originLabel={originLabel} destLabel={destLabel} />
              )}

              {/* 3. Persistent filter row (Google Flights-style). Always visible on
                   the results screen; every control applies instantly. */}
              <FilterBar
                filters={draftFilters}
                uniqueAirlines={uniqueAirlines}
                airlinePrices={airlinePrices}
                medianCo2={medianCo2}
                isRoundTrip={isRoundTrip}
                onFilterChange={handleFilterChange}
                onReset={handleFilterReset}
              />
            </section>

            {/* Layout: full-width Results Panel */}
            <div className="flex flex-col gap-6 items-start">
              {/* Results column */}
              <section className="flex-1 w-full flex flex-col gap-4 overflow-hidden" aria-label="Flight Results">
                {/* Explore flow only: stepping into a destination's flights
                    from the "anywhere" grid must not be a dead end — this
                    steps back to the grid with search state and filters
                    intact, distinct from the full "Back to search" reset. */}
                {exploreMode && searchState.destCity && (
                  <button
                    type="button"
                    onClick={handleBackToDestinations}
                    className="self-start inline-flex items-center gap-1.5 text-xs font-semibold text-foreground bg-secondary hover:bg-muted border border-border transition-colors rounded-md pl-2.5 pr-3 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to all destinations
                  </button>
                )}

                {/* 4. Stats Summary Card Row */}
                <StatsBar
                  total={displayStats.total}
                  cheapest={displayStats.cheapest}
                  avgCo2={displayStats.avgCo2}
                  loading={resultsLoading}
                />

                {/* 5. Sorting Controls — hidden over the destination grid (always cheapest-first) */}
                {!showDestinationGrid && (
                  <SortBar
                    sortType={sortType}
                    onChange={updateSortType}
                  />
                )}

                {/* Performance Warning if results are truncated for sorting */}
                {!resultsLoading && !showDestinationGrid && totalFilteredCount > 5000 && (
                  <div className="bg-transparent border border-accent-amber/40 text-accent-amber rounded-lg p-3 text-xs text-left font-medium flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-accent-amber shrink-0 mt-0.5" />
                    <div>
                      <p>Large search query (<span className="font-mono tabular-nums">{totalFilteredCount.toLocaleString()}</span> matches).</p>
                      <p className="text-muted-foreground mt-0.5">
                        Showing and sorting the top 2,000 flights to ensure high performance and fluid scrolling.
                      </p>
                    </div>
                  </div>
                )}

                {/* 6. Results: destination grid if no destination is picked, flight list otherwise */}
                {resultsLoading ? (
                  <ResultsSkeleton isRoundTrip={isRoundTrip} />
                ) : showDestinationGrid ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-muted-foreground">
                      No destination picked — showing <span className="font-mono tabular-nums">{destinationGroups.length.toLocaleString()}</span> destinations from {originLabel}. Pick one to see flights.
                    </p>
                    <DestinationGrid
                      destinations={destinationGroups}
                      isRoundTrip={isRoundTrip}
                      onSelect={handleDestinationSelect}
                    />
                  </div>
                ) : !hasResults ? (
                  <div className="w-full bg-card border border-border rounded-lg p-12 text-center flex flex-col items-center justify-center gap-4 shadow-card min-h-[400px]">
                    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center border border-border">
                      <Plane className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col gap-1 max-w-sm">
                      <h3 className="font-semibold text-foreground tracking-tight text-base">
                        {isRoundTrip && legCounts.outbound > 0 && legCounts.return === 0
                          ? 'No return flights match your criteria.'
                          : isRoundTrip && legCounts.outbound === 0 && legCounts.return > 0
                            ? 'No outbound flights match your criteria.'
                            : 'No flights match your criteria.'}
                      </h3>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        {isRoundTrip && legCounts.outbound > 0 && legCounts.return === 0
                          ? `We found ${legCounts.outbound} outbound flight${legCounts.outbound === 1 ? '' : 's'} to ${destLabel}, but nothing back to ${originLabel} on your return date under the current filters.`
                          : isRoundTrip && legCounts.outbound === 0 && legCounts.return > 0
                            ? `We found ${legCounts.return} return flight${legCounts.return === 1 ? '' : 's'} from ${destLabel}, but nothing outbound from ${originLabel} on your departure date under the current filters.`
                            : 'Try relaxing your price constraints, selecting alternative departure times, or resetting your filter checklist.'}
                      </p>
                    </div>
                    <Button
                      onClick={handleFilterReset}
                      variant="outline"
                      className="font-medium border-border text-foreground hover:bg-secondary text-xs"
                    >
                      Clear Filters
                    </Button>
                  </div>
                ) : (
                  <div
                    ref={parentRef}
                    className="h-[650px] overflow-y-auto w-full border border-border rounded-lg bg-secondary/60 p-2 scrollbar-thin scrollbar-thumb-neutral-200"
                  >
                    <div
                      style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                      }}
                    >
                      {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                        const rowStyle: React.CSSProperties = {
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualItem.size}px`,
                          transform: `translateY(${virtualItem.start}px)`,
                        };

                        if (isRoundTrip) {
                          const pair = roundTripPairs[virtualItem.index];
                          if (!pair) return null;
                          return (
                            <RoundTripCard
                              key={`${pair.out.flight_id}-${pair.ret.flight_id}`}
                              outbound={pair.out}
                              inbound={pair.ret}
                              adults={adults}
                              onSelect={handlePairSelect}
                              style={rowStyle}
                            />
                          );
                        }

                        const flight = flights[virtualItem.index];
                        if (!flight) return null;
                        return (
                          <FlightCard
                            key={flight.flight_id}
                            flight={flight}
                            onSelect={handleFlightSelect}
                            style={rowStyle}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      {/* 7. Flight Details Popup (centered; shows both legs for round trips) */}
      <FlightDetailModal
        flights={selectedFlights}
        adults={adults}
        isOpen={selectedFlights !== null}
        onClose={() => setSelectedFlights(null)}
      />
    </div>
  );
};
