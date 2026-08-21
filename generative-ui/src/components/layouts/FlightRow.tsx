import React from 'react';
import type { Flight } from '../../hooks/useFlightFilter';
import { bookingHref } from '../../lib/utils';
import { Plane } from 'lucide-react';

// Compact clickable flight row shared by several layouts.
export const formatRowDate = (dateStr: string): string => {
  const d = new Date(`${dateStr}T00:00:00`);
  return isNaN(d.getTime())
    ? dateStr
    : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

export const FlightRow: React.FC<{
  flight: Flight;
  onSelect: (flight: Flight) => void;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}> = ({ flight, onSelect, prefix, suffix }) => (
  // div+button role so a real booking <a> can sit inside (invalid inside <button>).
  <div
    role="button"
    tabIndex={0}
    onClick={() => onSelect(flight)}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(flight);
      }
    }}
    className="w-full flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 bg-card border border-border rounded-lg hover:border-white/20 transition-colors text-left cursor-pointer"
  >
    {prefix}
    <div className="w-[120px] shrink-0 min-w-0">
      <div className="text-xs font-semibold text-foreground truncate">{flight.airline_name}</div>
      <div className="text-[10px] font-mono tabular-nums text-muted-foreground truncate">
        {flight.flight_number} · {formatRowDate(flight.date)}
      </div>
    </div>
    {/* Route/times: full-width on phones, inline from sm up. */}
    <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1 flex items-center gap-2 min-w-0">
      <span className="text-sm font-mono tabular-nums font-semibold text-foreground shrink-0">{flight.departure_time}</span>
      <span className="text-[10px] font-mono font-medium text-muted-foreground shrink-0">{flight.origin_code}</span>
      <span className="flex-1 flex items-center relative min-w-[24px]">
        <span className="h-px bg-border w-full"></span>
        <Plane className="w-2.5 h-2.5 text-muted-foreground absolute left-1/2 -translate-x-1/2 bg-card px-0.5" />
      </span>
      <span className="text-[10px] font-mono font-medium text-muted-foreground shrink-0">{flight.dest_code}</span>
      <span className="text-sm font-mono tabular-nums font-semibold text-foreground shrink-0">{flight.arrival_time}</span>
      <span className="hidden sm:inline text-[10px] font-mono tabular-nums text-muted-foreground shrink-0 ml-1">
        {flight.duration_formatted} · {flight.stops === 0 ? 'Direct' : `${flight.stops} stop`}
      </span>
    </div>
    <div className="shrink-0 text-right ml-auto sm:ml-0">
      <span className="text-sm font-mono tabular-nums font-semibold text-foreground">£{flight.price_gbp.toFixed(2)}</span>
    </div>
    <a
      href={bookingHref(flight)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium text-foreground border border-border hover:border-white/20 rounded-full py-1 px-2.5 transition-colors whitespace-nowrap"
    >
      Book on {flight.airline_name}
    </a>
    {suffix}
  </div>
);
