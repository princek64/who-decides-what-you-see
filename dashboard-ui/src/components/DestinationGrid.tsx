import React from 'react';
import { Card } from './ui/card';
import { MapPin, ArrowRight } from 'lucide-react';
import { getCityCountry } from '../lib/airportMap';

export interface DestinationGroup {
  code: string;
  city: string;
  count: number;
  cheapest: number;
}

interface DestinationGridProps {
  destinations: DestinationGroup[];
  isRoundTrip: boolean;
  onSelect: (city: string) => void;
}

// Shown instead of the flat flight list when no destination is picked (anywhere search).
export const DestinationGrid: React.FC<DestinationGridProps> = ({ destinations, isRoundTrip, onSelect }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 w-full">
      {destinations.map((dest) => {
        const country = getCityCountry(dest.city);
        return (
          <Card
            key={dest.code}
            role="button"
            tabIndex={0}
            aria-label={`See flights to ${dest.city}, from £${dest.cheapest.toFixed(2)}`}
            onClick={() => onSelect(dest.city)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(dest.city);
              }
            }}
            className="p-4 flex flex-col gap-2 rounded-lg cursor-pointer select-none bg-card border border-border shadow-card hover:border-white/20 hover:shadow-card-md transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-muted-foreground" />
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground mt-1.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-foreground text-sm truncate">{dest.city}</span>
              {country && <span className="text-[11px] text-muted-foreground truncate">{country}</span>}
            </div>
            <div className="flex items-end justify-between gap-2 mt-1 pt-2 border-t border-border">
              <span className="text-[10px] text-muted-foreground font-mono">
                {dest.count.toLocaleString()}{' '}
                {isRoundTrip
                  ? (dest.count === 1 ? 'itinerary' : 'itineraries')
                  : (dest.count === 1 ? 'flight' : 'flights')}
              </span>
              <span className="text-right">
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-mono">From</div>
                <div className="font-mono font-semibold text-foreground text-sm tabular-nums">£{dest.cheapest.toFixed(2)}</div>
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
