import React from 'react';
import type { Flight } from '../hooks/useFlightFilter';
import { FlightCompactCard } from './FlightCompactCard';
import { Button } from './ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface FlightCarouselProps {
  flights: Flight[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelectFlight: (flight: Flight) => void;
}

// Hard cap on how many cards we render in the expanded list. The list is not
// virtualized, so rendering thousands of cards would freeze the browser.
const MAX_EXPANDED_RESULTS = 100;

export const FlightCarousel: React.FC<FlightCarouselProps> = ({
  flights,
  isExpanded,
  onToggleExpand,
  onSelectFlight,
}) => {
  if (flights.length === 0) return null;

  const showAllButton = flights.length > 5;
  const visibleCarouselFlights = flights.slice(0, 5);
  const expandedFlights = flights.slice(0, MAX_EXPANDED_RESULTS);
  const isTruncated = flights.length > MAX_EXPANDED_RESULTS;

  return (
    <div className="w-full mt-3 space-y-3">
      {!isExpanded ? (
        <>
          {/* Horizontal carousel */}
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent snap-x">
            {visibleCarouselFlights.map((flight) => (
              <div key={flight.flight_id} className="snap-start">
                <FlightCompactCard flight={flight} onSelect={onSelectFlight} />
              </div>
            ))}
          </div>

          {/* Show all button */}
          {showAllButton && (
            <div className="flex justify-center pt-1">
              <Button
                size="sm"
                onClick={onToggleExpand}
                className="text-xs font-medium text-background bg-foreground hover:bg-foreground/90 border-transparent rounded-full px-4 flex items-center gap-1"
              >
                <ChevronDown className="w-4 h-4" />
                Show all {flights.length} results
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Full vertical list (capped for performance) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto p-2 border border-border rounded-lg bg-muted">
            {expandedFlights.map((flight) => (
              <div key={flight.flight_id} className="flex justify-center">
                <FlightCompactCard flight={flight} onSelect={onSelectFlight} />
              </div>
            ))}
          </div>

          {isTruncated && (
            <p className="text-[11px] text-muted-foreground font-normal text-center font-mono tabular-nums">
              Showing the top {MAX_EXPANDED_RESULTS} of {flights.length.toLocaleString()} results — refine your search to see more specific options.
            </p>
          )}

          {/* Show less button */}
          <div className="flex justify-center pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleExpand}
              className="text-xs font-medium text-foreground bg-transparent border-border hover:bg-muted hover:text-foreground rounded-full px-4 flex items-center gap-1"
            >
              <ChevronUp className="w-4 h-4" />
              Show less
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
