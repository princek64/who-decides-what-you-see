import React from 'react';
import type { Flight } from '../hooks/useFlightFilter';
import { bookingHref } from '../lib/utils';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Plane, Leaf } from 'lucide-react';

interface FlightCompactCardProps {
  flight: Flight;
  onSelect: (flight: Flight) => void;
}

export const FlightCompactCard: React.FC<FlightCompactCardProps> = ({ flight, onSelect }) => {
  const getDemandBadge = () => {
    switch (flight.demand_indicator) {
      case 'Low':
        return <Badge variant="outline" className="text-muted-foreground border-border text-[10px] py-0 px-1.5">Low Demand</Badge>;
      case 'Medium':
        return <Badge variant="outline" className="text-muted-foreground border-border text-[10px] py-0 px-1.5">Med Demand</Badge>;
      case 'High':
        return <Badge variant="outline" className="text-foreground border-border font-medium text-[10px] py-0 px-1.5">High Demand</Badge>;
      case 'Filling Fast':
        return <Badge variant="outline" className="text-accent-amber border-accent-amber/40 font-medium text-[10px] py-0 px-1.5 animate-pulse">Filling Fast</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card
      onClick={() => onSelect(flight)}
      className="w-[280px] h-[212px] shrink-0 p-3.5 flex flex-col justify-between hover:border-white/20 transition-all cursor-pointer bg-card border border-border rounded-lg shadow-none select-none"
    >
      {/* Top row: Carrier & Status */}
      <div className="flex justify-between items-center text-[10px] text-muted-foreground font-medium">
        <div className="flex items-center gap-1.5">
          {/* Black line-art on transparent: `invert` renders it white so it is
              visible on the dark canvas (same fix as FlightSketchLogo) */}
          <img src="/airline_4586958.png" className="w-3.5 h-3.5 object-contain shrink-0 opacity-70 invert" alt="" />
          <span className="font-semibold text-foreground text-xs truncate max-w-[100px]">{flight.airline_name}</span>
          <span className="text-border">•</span>
          <span className="font-mono tabular-nums">{flight.flight_number}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="bg-muted text-foreground text-[9px] px-1.5 py-0.5 rounded-full font-mono tabular-nums font-medium">
            {(() => {
              const d = new Date(`${flight.date}T00:00:00`);
              // Weekday shown so flexible-date searches ("cheapest weekend")
              // can be answered by scanning the cards
              return isNaN(d.getTime())
                ? flight.date
                : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
            })()}
          </span>
        </div>
      </div>

      {/* Middle row: Times & route */}
      <div className="flex items-center justify-between gap-1.5 my-2">
        <div className="text-left leading-none">
          <div className="text-sm font-mono tabular-nums font-semibold text-foreground">{flight.departure_time}</div>
          <div className="text-[10px] font-mono font-medium text-muted-foreground">{flight.origin_code}</div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center min-w-[50px]">
          <span className="text-[9px] font-mono tabular-nums text-muted-foreground font-medium">{flight.duration_formatted}</span>
          <div className="w-full flex items-center justify-center relative my-0.5">
            <div className="h-[1px] bg-border w-full"></div>
            <Plane className="w-2.5 h-2.5 text-muted-foreground absolute bg-card px-0.5" />
          </div>
          <span className="text-[9px] text-muted-foreground font-medium">
            {flight.stops === 0 ? 'Direct' : `${flight.stops} Stop`}
          </span>
        </div>

        <div className="text-right leading-none">
          <div className="text-sm font-mono tabular-nums font-semibold text-foreground">{flight.arrival_time}</div>
          <div className="text-[10px] font-mono font-medium text-muted-foreground">{flight.dest_code}</div>
        </div>
      </div>

      {/* Price row */}
      <div className="flex justify-between items-end border-t border-border pt-2 text-xs">
        <div className="flex flex-col text-left">
          <span className="bg-muted text-muted-foreground font-medium px-1.5 py-0.5 rounded-full text-[9px] max-w-[60px] truncate">
            {flight.cabin_class}
          </span>
          <span className="flex items-center gap-0.5 text-accent-green text-[10px] mt-1 font-mono tabular-nums font-medium">
            <Leaf className="w-3 h-3 text-accent-green" />
            {flight.co2_kg} kg
          </span>
        </div>

        <div className="text-right flex flex-col">
          <span className="text-base font-mono tabular-nums font-semibold text-foreground">£{flight.price_gbp.toFixed(2)}</span>
          {getDemandBadge()}
        </div>
      </div>

      {/* Booking CTA — a placeholder link; clicking through to book is the
          expected next step, not an in-app action. */}
      <a
        href={bookingHref(flight)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="w-full text-center text-[11px] font-medium text-foreground border border-border hover:border-white/20 rounded-full py-1.5 transition-colors"
      >
        Book on {flight.airline_name}
      </a>
    </Card>
  );
};
