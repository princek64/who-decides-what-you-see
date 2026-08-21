import React from 'react';
import type { Flight } from '../../hooks/useFlightFilter';
import { parseLayover } from '../../lib/layoutData';
import { getCityName } from '../../lib/airportMap';
import { FlightRow, formatRowDate } from './FlightRow';
import { PlaneTakeoff, PlaneLanding, Clock } from 'lucide-react';

// Connection view: steps + layover. Per-leg times are not in the dataset.
export const MultiLegView: React.FC<{
  flights: Flight[];
  onSelectFlight: (f: Flight) => void;
}> = ({ flights, onSelectFlight }) => {
  const connecting = flights.filter((f) => f.stops > 0);
  const best = connecting[0];
  if (!best) {
    // Question was about connections but only direct flights match
    return (
      <div className="w-full mt-3 space-y-1.5">
        <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          No connecting flights match — direct options instead
        </div>
        {flights.slice(0, 3).map((f) => (
          <FlightRow key={f.flight_id} flight={f} onSelect={onSelectFlight} />
        ))}
      </div>
    );
  }

  const layover = parseLayover(best.layover_details);
  const alternates = connecting.slice(1, 4);

  return (
    <div className="w-full mt-3 space-y-2">
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        Connection details · {best.airline_name} <span className="normal-case font-mono tabular-nums">{best.flight_number}</span> · {formatRowDate(best.date)}
      </div>

      <button
        type="button"
        onClick={() => onSelectFlight(best)}
        className="w-full bg-card border border-border rounded-lg p-5 hover:border-white/20 transition-colors text-left space-y-2"
      >
        {/* Step 1 */}
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-[11px] font-mono tabular-nums font-semibold shrink-0">1</span>
          <PlaneTakeoff className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="text-sm min-w-0">
            <span className="font-semibold text-foreground">{getCityName(best.origin_code)} ({best.origin_code})</span>
            <span className="text-muted-foreground"> → </span>
            <span className="font-semibold text-foreground">{layover ? `${layover.city} (${layover.code})` : 'connection'}</span>
            <div className="text-[11px] text-muted-foreground">Departs <span className="font-mono tabular-nums">{best.departure_time}</span> · Terminal {best.origin_terminal}</div>
          </div>
        </div>

        {/* Layover — the point of this view */}
        <div className="ml-3.5 pl-6 border-l border-dashed border-border py-1">
          <div className="bg-muted rounded-lg px-4 py-3 flex items-center gap-3">
            <Clock className="w-4 h-4 text-foreground shrink-0" />
            <div>
              <div className="text-sm font-semibold text-foreground">
                {layover ? `${layover.duration} layover in ${layover.city}` : 'Layover'}
              </div>
              {layover && <div className="text-[11px] text-muted-foreground">{layover.code} · {layover.country} · change of aircraft possible</div>}
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-[11px] font-mono tabular-nums font-semibold shrink-0">2</span>
          <PlaneLanding className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="text-sm min-w-0">
            <span className="font-semibold text-foreground">{layover ? `${layover.city} (${layover.code})` : 'connection'}</span>
            <span className="text-muted-foreground"> → </span>
            <span className="font-semibold text-foreground">{getCityName(best.dest_code)} ({best.dest_code})</span>
            <div className="text-[11px] text-muted-foreground">Arrives <span className="font-mono tabular-nums">{best.arrival_time}</span> ({formatRowDate(best.arrival_date)})</div>
          </div>
        </div>

        <div className="flex justify-between items-center border-t border-border pt-2.5 mt-1 text-xs">
          <span className="text-muted-foreground">Total journey <span className="font-mono tabular-nums">{best.duration_formatted}</span> · {best.cabin_class}</span>
          <span className="text-base font-mono tabular-nums font-semibold tracking-tight text-foreground">£{best.price_gbp.toFixed(2)}</span>
        </div>
      </button>

      {alternates.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground pt-1">Other connections</div>
          {alternates.map((f) => {
            const l = parseLayover(f.layover_details);
            return (
              <FlightRow
                key={f.flight_id}
                flight={f}
                onSelect={onSelectFlight}
                suffix={l ? (
                  <span className="hidden md:inline text-[10px] font-mono tabular-nums text-muted-foreground shrink-0">via {l.code} · {l.duration}</span>
                ) : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
