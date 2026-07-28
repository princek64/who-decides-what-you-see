import React from 'react';
import type { Flight } from '../../hooks/useFlightFilter';
import { getCityName } from '../../lib/airportMap';
import { FlightRow, formatRowDate } from './FlightRow';
import { Plane, Leaf, Users } from 'lucide-react';

// One flight, big and unambiguous — the direct answer to a specific question.
export const HighlightView: React.FC<{
  flights: Flight[];
  onSelectFlight: (f: Flight) => void;
}> = ({ flights, onSelectFlight }) => {
  const best = flights[0];
  if (!best) return null;
  const alternates = flights.slice(1, 3);

  return (
    <div className="w-full mt-3 space-y-2">
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Best match</div>

      <button
        type="button"
        onClick={() => onSelectFlight(best)}
        className="w-full bg-card border border-border rounded-lg p-6 hover:border-white/20 transition-colors text-left"
      >
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {/* Black line-art on transparent: `invert` renders it white so it
                  is visible on the dark canvas (same fix as FlightSketchLogo) */}
              <img src="/airline_4586958.png" className="w-4 h-4 object-contain opacity-70 invert" alt="" />
              <span className="font-semibold text-foreground text-sm">{best.airline_name}</span>
              <span className="font-mono tabular-nums">{best.flight_number}</span>
              <span>·</span>
              <span>{formatRowDate(best.date)}</span>
            </div>

            <div className="flex items-center gap-4 mt-3">
              <div>
                <div className="text-2xl font-mono tabular-nums font-semibold tracking-tight text-foreground leading-none">{best.departure_time}</div>
                <div className="text-xs font-mono font-medium text-muted-foreground mt-1">{best.origin_code} · {getCityName(best.origin_code)}</div>
              </div>
              <div className="flex flex-col items-center min-w-[80px]">
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground">{best.duration_formatted}</span>
                <div className="w-full flex items-center relative my-1">
                  <div className="h-px bg-border w-full"></div>
                  <Plane className="w-3 h-3 text-muted-foreground absolute left-1/2 -translate-x-1/2 bg-card px-0.5" />
                </div>
                <span className="text-[10px] text-muted-foreground">{best.stops === 0 ? 'Direct' : `${best.stops} stop`}</span>
              </div>
              <div>
                <div className="text-2xl font-mono tabular-nums font-semibold tracking-tight text-foreground leading-none">{best.arrival_time}</div>
                <div className="text-xs font-mono font-medium text-muted-foreground mt-1">{best.dest_code} · {getCityName(best.dest_code)}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-4 text-[10px]">
              <span className="bg-muted text-muted-foreground font-medium px-2 py-0.5 rounded-full">{best.cabin_class}</span>
              <span className="flex items-center gap-1 text-muted-foreground font-mono tabular-nums">
                <Users className="w-3 h-3 text-muted-foreground" />
                {best.seats_remaining} seats left
              </span>
              <span className="flex items-center gap-1 text-accent-green font-mono tabular-nums">
                <Leaf className="w-3 h-3 text-accent-green" />
                {best.co2_kg} kg CO₂
              </span>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-3xl font-mono tabular-nums font-semibold tracking-tight text-foreground">£{best.price_gbp.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">per adult</div>
          </div>
        </div>
      </button>

      {alternates.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground pt-1">Close alternatives</div>
          {alternates.map((f) => (
            <FlightRow key={f.flight_id} flight={f} onSelect={onSelectFlight} />
          ))}
        </div>
      )}
    </div>
  );
};
