import React from 'react';
import type { Flight } from '../../hooks/useFlightFilter';
import { splitComparison, parseLayover } from '../../lib/layoutData';
import { formatRowDate } from './FlightRow';
import { Leaf } from 'lucide-react';

const LegCard: React.FC<{
  title: string;
  flight: Flight | null;
  onSelect: (f: Flight) => void;
}> = ({ title, flight, onSelect }) => {
  if (!flight) {
    return (
      <div className="flex-1 border border-dashed border-border rounded-lg p-5 flex items-center justify-center text-xs text-muted-foreground min-h-[160px]">
        No {title.toLowerCase()} option matches
      </div>
    );
  }
  const layover = flight.stops > 0 ? parseLayover(flight.layover_details) : null;
  return (
    <button
      type="button"
      onClick={() => onSelect(flight)}
      className="flex-1 bg-card border border-border rounded-lg p-5 hover:border-white/20 transition-colors text-left min-w-0"
    >
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      <div className="text-2xl font-mono tabular-nums font-semibold tracking-tight text-foreground">£{flight.price_gbp.toFixed(2)}</div>
      <div className="mt-2 text-xs text-muted-foreground space-y-1">
        <div className="font-mono tabular-nums font-medium text-foreground">
          {flight.departure_time} {flight.origin_code} → {flight.arrival_time} {flight.dest_code}
        </div>
        <div><span className="font-mono tabular-nums">{flight.duration_formatted}</span> · {flight.airline_name} <span className="font-mono tabular-nums">{flight.flight_number}</span></div>
        <div>{formatRowDate(flight.date)} · {flight.cabin_class}</div>
        {layover ? (
          <div className="text-muted-foreground">Layover: {layover.duration} in {layover.city} ({layover.code})</div>
        ) : (
          <div className="text-muted-foreground">Non-stop</div>
        )}
        <div className="flex items-center gap-1 text-accent-green font-mono tabular-nums">
          <Leaf className="w-3 h-3 text-accent-green" />
          {flight.co2_kg} kg CO₂
        </div>
      </div>
    </button>
  );
};

// Two options side by side with an explicit delta line.
export const ComparisonView: React.FC<{
  flights: Flight[];
  onSelectFlight: (f: Flight) => void;
}> = ({ flights, onSelectFlight }) => {
  const { direct, oneStop } = splitComparison(flights);
  if (!direct && !oneStop) return null;

  let delta: string | null = null;
  if (direct && oneStop) {
    const priceDiff = direct.price_gbp - oneStop.price_gbp;
    const timeDiff = oneStop.duration_mins - direct.duration_mins;
    const h = Math.floor(Math.abs(timeDiff) / 60);
    const m = Math.abs(timeDiff) % 60;
    const timeStr = `${h ? `${h}h ` : ''}${m}m`;
    delta =
      priceDiff > 0
        ? `Direct costs £${priceDiff.toFixed(2)} more but saves ${timeStr}.`
        : priceDiff < 0
          ? `Direct is £${Math.abs(priceDiff).toFixed(2)} cheaper AND saves ${timeStr}.`
          : `Same price — direct saves ${timeStr}.`;
  }

  return (
    <div className="w-full mt-3 space-y-2">
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Comparison</div>
      <div className="flex flex-col sm:flex-row gap-2">
        <LegCard title="Direct" flight={direct} onSelect={onSelectFlight} />
        <LegCard title="1 stop" flight={oneStop} onSelect={onSelectFlight} />
      </div>
      {delta && (
        <div className="bg-muted border border-border rounded-lg px-4 py-2.5 text-xs font-medium text-foreground text-center">
          {delta}
        </div>
      )}
    </div>
  );
};
