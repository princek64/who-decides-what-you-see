import React, { useMemo, useState } from 'react';
import type { Flight, IntentJSON } from '../../hooks/useFlightFilter';
import { summarizeDestinations } from '../../lib/layoutData';
import { MapPin, Leaf } from 'lucide-react';

// City cards for open "where can I go"; click drills in preserving other filters.
export const DestinationGridView: React.FC<{
  flights: Flight[];
  intent: IntentJSON;
  onRefine?: (patch: Partial<IntentJSON & { layout?: string }>, label: string) => void;
}> = ({ flights, intent, onRefine }) => {
  const [showAll, setShowAll] = useState(false);
  const destinations = useMemo(() => summarizeDestinations(flights), [flights]);
  if (destinations.length === 0) return null;

  const visible = showAll ? destinations.slice(0, 30) : destinations.slice(0, 12);

  return (
    <div className="w-full mt-3 space-y-2">
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        {destinations.length} destination{destinations.length === 1 ? '' : 's'}{intent.max_price ? ` within £${intent.max_price}` : ''} · ~ = typical fare
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {visible.map((d) => (
          <button
            key={d.code}
            type="button"
            onClick={() =>
              // Open/budget pick → round-trip drill-in.
              onRefine?.(
                { dest_city: d.city, dest_code: undefined, direction: 'both', layout: 'grid' },
                `Flights to ${d.city}`
              )
            }
            title={`Search flights to ${d.city}`}
            className="bg-card border border-border rounded-lg p-5 hover:border-white/20 transition-colors text-left disabled:cursor-default"
            disabled={!onRefine}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-semibold text-foreground truncate">{d.city}</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5 ml-5">{d.country}</div>
            <div className="flex justify-between items-end mt-2.5 ml-5">
              <span
                className="text-base font-mono tabular-nums font-semibold tracking-tight text-foreground"
                title={`Typical fare — cheapest found: £${d.minPrice.toFixed(2)}`}
              >~£{Math.round(d.typicalPrice)}</span>
              <span className="flex items-center gap-1 text-[10px] font-mono tabular-nums text-accent-green">
                <Leaf className="w-3 h-3" />
                {Math.round(d.minCo2)} kg
              </span>
            </div>
            <div className="text-[10px] font-mono tabular-nums text-muted-foreground ml-5 mt-0.5">{d.count} flight{d.count === 1 ? '' : 's'}</div>
          </button>
        ))}
      </div>

      {destinations.length > 12 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:border-white/20 rounded-full py-2 px-4 transition-colors"
          >
            {showAll ? 'Show fewer' : `Show ${Math.min(destinations.length, 30) - 12} more destinations`}
          </button>
        </div>
      )}
    </div>
  );
};
