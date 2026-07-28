import React, { useMemo } from 'react';
import type { Flight } from '../../hooks/useFlightFilter';
import { rankFlights } from '../../lib/layoutData';
import { FlightRow } from './FlightRow';

// Numbered top-5 with a plain-English "why" tag per row. The ranking is a
// transparent client-side heuristic (price + duration blend), not the LLM.
export const RankedView: React.FC<{
  flights: Flight[];
  onSelectFlight: (f: Flight) => void;
}> = ({ flights, onSelectFlight }) => {
  const ranked = useMemo(() => rankFlights(flights), [flights]);
  if (ranked.length === 0) return null;

  return (
    <div className="w-full mt-3 space-y-2">
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        Top {ranked.length} · balancing price and journey time
      </div>
      <div className="space-y-1.5">
        {ranked.map((entry, i) => (
          <FlightRow
            key={entry.flight.flight_id}
            flight={entry.flight}
            onSelect={onSelectFlight}
            prefix={
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono tabular-nums font-semibold shrink-0 ${
                i === 0 ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
              }`}>
                {i + 1}
              </span>
            }
            suffix={
              <span className="hidden sm:inline-flex text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
                {entry.why}
              </span>
            }
          />
        ))}
      </div>
    </div>
  );
};
