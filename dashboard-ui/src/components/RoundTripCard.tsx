import React from 'react';
import type { Flight } from '../hooks/useFlights';
import { Card } from './ui/card';
import { Plane, PlaneTakeoff, PlaneLanding } from 'lucide-react';

interface RoundTripCardProps {
  outbound: Flight;
  inbound: Flight;
  adults: number;
  onSelect: (outbound: Flight, inbound: Flight) => void;
  style?: React.CSSProperties;
}

const formatLegDate = (dateStr: string) => {
  const d = new Date(`${dateStr}T00:00:00`);
  return isNaN(d.getTime())
    ? dateStr
    : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

const LegRow: React.FC<{
  flight: Flight;
  leg: 'outbound' | 'return';
}> = ({ flight, leg }) => {
  const isCancelled = flight.flight_status === 'Cancelled';
  return (
    <div
      className={`w-full flex items-start sm:items-center gap-2 sm:gap-3 px-3 sm:px-4 flex-1 min-h-0 text-left ${
        isCancelled ? 'opacity-60' : ''
      }`}
    >
      {leg === 'outbound' ? (
        <PlaneTakeoff className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 sm:mt-0" />
      ) : (
        <PlaneLanding className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 sm:mt-0" />
      )}

      {/* Below sm the airline line stacks ABOVE the times: side by side there is
          not enough width left for the arrival time, which used to slide under
          the fare panel. */}
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3">
        {/* Airline / flight number / date */}
        <div className="w-full sm:w-[150px] shrink-0 min-w-0 flex items-baseline justify-between gap-1.5 sm:block">
          <div className="text-[11px] sm:text-xs font-medium text-foreground truncate">{flight.airline_name}</div>
          <div className="text-[10px] font-mono text-muted-foreground truncate shrink-0 sm:shrink">
            {/* The flight number gives way to the date on a phone — which day
                each leg flies is what a round-trip scan needs. */}
            <span className="hidden sm:inline">{flight.flight_number} · </span>
            {formatLegDate(flight.date)}
          </div>
        </div>

        {/* Times & route */}
        <div className="flex items-center gap-2 sm:gap-3 flex-1 w-full min-w-0">
          <div className="text-left shrink-0">
            <div className={`text-sm sm:text-base font-mono tabular-nums font-semibold tracking-tight text-foreground leading-tight ${isCancelled ? 'line-through text-muted-foreground' : ''}`}>
              {flight.departure_time}
            </div>
            <div className="text-[10px] font-mono font-medium text-muted-foreground">{flight.origin_code}</div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center min-w-[48px] sm:min-w-[56px]">
            <span className="text-[10px] text-muted-foreground font-mono tabular-nums font-medium">{flight.duration_formatted}</span>
            <div className="w-full flex items-center justify-center relative my-0.5">
              <div className="h-[1px] bg-border w-full"></div>
              <Plane className="w-2.5 h-2.5 text-muted-foreground absolute bg-card px-0.5" />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">
              {flight.stops === 0 ? 'Direct' : `${flight.stops} Stop`}
            </span>
          </div>

          <div className="text-left shrink-0">
            <div className={`text-sm sm:text-base font-mono tabular-nums font-semibold tracking-tight text-foreground leading-tight ${isCancelled ? 'line-through text-muted-foreground' : ''}`}>
              {flight.arrival_time}
            </div>
            <div className="text-[10px] font-mono font-medium text-muted-foreground">{flight.dest_code}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Skyscanner-style round-trip itinerary card: outbound and return legs
// stacked in one card with the combined fare on the right. Clicking the
// card opens a centered popup with both flights' full details.
export const RoundTripCard: React.FC<RoundTripCardProps> = ({ outbound, inbound, adults, onSelect, style }) => {
  const total = (outbound.price_gbp + inbound.price_gbp) * adults;
  const hasCancelledLeg = outbound.flight_status === 'Cancelled' || inbound.flight_status === 'Cancelled';

  return (
    <div style={style} className="p-1.5 w-full box-border">
      <Card
        role="button"
        tabIndex={0}
        aria-label={`Round trip ${outbound.origin_code} to ${outbound.dest_code} and back, total £${total.toFixed(2)}`}
        onClick={() => onSelect(outbound, inbound)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(outbound, inbound);
          }
        }}
        className="h-[136px] sm:h-[204px] w-full p-0 gap-0 flex flex-row overflow-hidden rounded-lg select-none cursor-pointer bg-card border border-border shadow-card hover:border-white/20 hover:shadow-card-md transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {/* Legs */}
        <div className="flex-1 min-w-0 flex flex-col py-2">
          <LegRow flight={outbound} leg="outbound" />
          <div className="h-px bg-border mx-4 shrink-0" />
          <LegRow flight={inbound} leg="return" />
        </div>

        {/* Combined fare — per-leg breakdown sits directly above the total so
            the money reads as one block when scanning left to right. Each leg
            carries a mono uppercase micro-label so the two figures are legible. */}
        <div className="w-[112px] sm:w-[140px] shrink-0 border-l border-border bg-background flex flex-col items-center justify-center gap-1 px-2 sm:px-3 text-center">
          <div className="w-full flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground truncate">Outbound</span>
              <span className="text-[10px] sm:text-[11px] font-mono tabular-nums text-foreground shrink-0">£{outbound.price_gbp.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground truncate">Return</span>
              <span className="text-[10px] sm:text-[11px] font-mono tabular-nums text-foreground shrink-0">£{inbound.price_gbp.toFixed(2)}</span>
            </div>
          </div>
          <div className="w-full h-px bg-border my-0.5" />
          <span className={`text-base sm:text-xl font-mono font-semibold tracking-tight text-foreground tabular-nums ${hasCancelledLeg ? 'line-through text-muted-foreground' : ''}`}>
            £{total.toFixed(2)}
          </span>
          <span className="text-[10px] text-muted-foreground leading-tight">
            total · {adults} adult{adults === 1 ? '' : 's'}
          </span>
        </div>
      </Card>
    </div>
  );
};
