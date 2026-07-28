import React from 'react';
import type { ItineraryPair } from '../../lib/layoutData';
import type { Flight } from '../../hooks/useFlightFilter';
import { getCityName } from '../../lib/airportMap';
import { formatRowDate } from './FlightRow';
import { PlaneTakeoff, PlaneLanding, MoonStar } from 'lucide-react';

const LegCard: React.FC<{
  flight: Flight;
  label: string;
  icon: React.ReactNode;
  onSelect: (f: Flight) => void;
}> = ({ flight, label, icon, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(flight)}
    className="w-full bg-card border border-border rounded-lg p-5 hover:border-white/20 transition-colors text-left"
  >
    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
      {icon}
      {label} · {formatRowDate(flight.date)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-lg font-mono tabular-nums font-semibold tracking-tight text-foreground leading-none">{flight.departure_time}</div>
          <div className="text-[10px] font-mono font-medium text-muted-foreground mt-1">{flight.origin_code} · {getCityName(flight.origin_code)}</div>
        </div>
        <div className="text-muted-foreground text-sm px-1">→</div>
        <div>
          <div className="text-lg font-mono tabular-nums font-semibold tracking-tight text-foreground leading-none">{flight.arrival_time}</div>
          <div className="text-[10px] font-mono font-medium text-muted-foreground mt-1">{flight.dest_code} · {getCityName(flight.dest_code)}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-mono tabular-nums font-semibold tracking-tight text-foreground">£{flight.price_gbp.toFixed(2)}</div>
        <div className="text-[10px] text-muted-foreground">
          {flight.airline_name} · <span className="font-mono tabular-nums">{flight.duration_formatted}</span> · {flight.stops === 0 ? 'Direct' : `${flight.stops} stop`}
        </div>
      </div>
    </div>
  </button>
);

// Round trip as a connected vertical flow: out → nights there → back → total.
export const ItineraryView: React.FC<{
  pair: ItineraryPair;
  onSelectFlight: (f: Flight) => void;
}> = ({ pair, onSelectFlight }) => {
  const { out, ret, nights } = pair;
  const total = out.price_gbp + ret.price_gbp;
  const city = getCityName(out.dest_code);

  return (
    <div className="w-full mt-3 space-y-0">
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Suggested itinerary</div>

      <LegCard flight={out} label="Outbound" icon={<PlaneTakeoff className="w-3.5 h-3.5" />} onSelect={onSelectFlight} />

      {/* Connector */}
      <div className="flex items-center gap-3 pl-6 py-1.5">
        <div className="w-px h-8 bg-border"></div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
          <MoonStar className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-mono tabular-nums">{nights}</span> night{nights === 1 ? '' : 's'} in {city}
        </div>
      </div>

      <LegCard flight={ret} label="Return" icon={<PlaneLanding className="w-3.5 h-3.5" />} onSelect={onSelectFlight} />

      <div className="bg-white/[0.04] border border-border rounded-lg px-4 py-3 mt-2 flex justify-between items-center text-foreground">
        <span className="text-xs font-medium">Trip total · both flights, per adult</span>
        <span className="text-xl font-mono tabular-nums font-semibold tracking-tight">£{total.toFixed(2)}</span>
      </div>
    </div>
  );
};
