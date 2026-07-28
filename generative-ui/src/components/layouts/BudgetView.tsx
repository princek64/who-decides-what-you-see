import React from 'react';
import type { Flight, IntentJSON } from '../../hooks/useFlightFilter';
import { FlightRow } from './FlightRow';

// Top pick measured against the stated budget, with a spend bar and
// the money left over — then what else still fits.
export const BudgetView: React.FC<{
  flights: Flight[];
  intent: IntentJSON;
  onSelectFlight: (f: Flight) => void;
}> = ({ flights, intent, onSelectFlight }) => {
  const best = flights[0];
  if (!best) return null;

  const budget = intent.max_price ?? null;
  const alternates = flights.slice(1, 4);

  return (
    <div className="w-full mt-3 space-y-2">
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        {budget ? `Your £${budget} budget` : 'Budget pick'}
      </div>

      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <FlightRow flight={best} onSelect={onSelectFlight} />

        {budget && (
          <div className="px-1">
            <div className="flex justify-between text-[11px] font-medium mb-1.5 font-mono tabular-nums">
              <span className="text-foreground">£{best.price_gbp.toFixed(2)} spent</span>
              <span className="text-muted-foreground">£{Math.max(0, budget - best.price_gbp).toFixed(2)} left of £{budget}</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-foreground rounded-full transition-all"
                style={{ width: `${Math.min(100, (best.price_gbp / budget) * 100)}%` }}
              ></div>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1.5">
              <span className="font-mono tabular-nums">{Math.round((best.price_gbp / budget) * 100)}%</span> of budget used on the cheapest option
            </div>
          </div>
        )}
      </div>

      {alternates.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground pt-1">Also fits your budget</div>
          {alternates.map((f) => (
            <FlightRow
              key={f.flight_id}
              flight={f}
              onSelect={onSelectFlight}
              suffix={
                budget ? (
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0 w-[64px] text-right">
                    £{Math.max(0, budget - f.price_gbp).toFixed(0)} left
                  </span>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};
