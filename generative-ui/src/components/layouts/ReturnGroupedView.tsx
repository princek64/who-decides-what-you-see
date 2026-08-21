import React from 'react';
import type { Flight, IntentJSON } from '../../hooks/useFlightFilter';
import {
  cheapestPair,
  destinationLabel,
  outboundLabel,
  returnLabel,
  splitLegs,
} from '../../lib/returnGroups';
import { FlightRow } from './FlightRow';
import { PlaneTakeoff, PlaneLanding } from 'lucide-react';

/** Rows per leg so both groups stay visible for side-by-side comparison. */
const ROWS_PER_LEG = 5;

const Leg: React.FC<{
  label: string;
  icon: React.ReactNode;
  flights: Flight[];
  onSelectFlight: (f: Flight) => void;
}> = ({ label, icon, flights, onSelectFlight }) => {
  const visible = flights.slice(0, ROWS_PER_LEG);
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      {visible.length === 0 ? (
        <p className="text-xs text-muted-foreground px-1 py-2">
          No flights on this leg match the search.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            {visible.map((flight) => (
              <FlightRow key={flight.flight_id} flight={flight} onSelect={onSelectFlight} />
            ))}
          </div>
          {flights.length > visible.length && (
            <p className="text-[11px] text-muted-foreground font-mono tabular-nums px-1">
              Showing {visible.length} of {flights.length}, cheapest first.
            </p>
          )}
        </>
      )}
    </section>
  );
};

/**
 * Round-trip results as two labelled groups (outbound / return).
 * Trip total = cheapest outbound + cheapest return.
 */
export const ReturnGroupedView: React.FC<{
  flights: Flight[];
  intent: IntentJSON;
  onSelectFlight: (f: Flight) => void;
}> = ({ flights, intent, onSelectFlight }) => {
  const legs = splitLegs(flights);
  const destination = destinationLabel(legs, intent);
  const pair = cheapestPair(legs);

  return (
    <div className="w-full mt-3 space-y-4">
      <Leg
        label={outboundLabel(destination)}
        icon={<PlaneTakeoff className="w-3.5 h-3.5" />}
        flights={legs.outbound}
        onSelectFlight={onSelectFlight}
      />

      {/* The rule is what stops the two groups reading as one long list. */}
      <div className="border-t border-border pt-4">
        <Leg
          label={returnLabel(destination)}
          icon={<PlaneLanding className="w-3.5 h-3.5" />}
          flights={legs.inbound}
          onSelectFlight={onSelectFlight}
        />
      </div>

      {pair && (
        <div className="bg-white/[0.04] border border-border rounded-lg px-4 py-3 flex flex-wrap justify-between items-center gap-2 text-foreground">
          <span className="text-xs font-medium">
            Cheapest round trip · {pair.outbound.airline_name} out + {pair.inbound.airline_name} back
          </span>
          <span className="text-xl font-mono tabular-nums font-semibold tracking-tight">
            £{pair.total.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
};
