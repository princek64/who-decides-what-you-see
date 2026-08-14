import React from 'react';
import type { Flight, IntentJSON } from '../../hooks/useFlightFilter';
import type { AlertAlternatives } from '../../lib/layoutData';
import { FlightRow } from './FlightRow';
import { formatFlightDate } from '../../lib/utils';
import { SearchX } from 'lucide-react';

// Zero-results state that offers honest ways out instead of a dead end.
export const AlertView: React.FC<{
  intent: IntentJSON;
  alternatives?: AlertAlternatives;
  onSelectFlight: (f: Flight) => void;
  onQuickReply?: (text: string) => void;
}> = ({ intent, alternatives, onSelectFlight, onQuickReply }) => {
  const overBudget = alternatives?.overBudget ?? [];
  const nearbyDates = alternatives?.nearbyDates ?? [];
  const dest = intent.dest_city || intent.dest_code || '';

  return (
    <div className="w-full mt-3 space-y-2">
      <div className="bg-card border border-border rounded-lg p-5 flex gap-3 items-start">
        <span className="w-9 h-9 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
          <SearchX className="w-4 h-4 text-accent-red" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">
            {overBudget.length > 0 || nearbyDates.length > 0
              ? 'No exact match — closest options:'
              : 'Nothing matched that search'}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {intent.max_price != null && `Your £${intent.max_price} limit is the tightest constraint. `}
            {intent.date && `Only ${formatFlightDate(intent.date)} was searched. `}
            {overBudget.length > 0 || nearbyDates.length > 0
              ? 'Here is what comes closest:'
              : 'Try a different date, budget, or destination.'}
          </div>
        </div>
      </div>

      {overBudget.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground pt-1">
            Cheapest available without the £{intent.max_price} cap
          </div>
          {overBudget.map((f) => (
            <FlightRow
              key={f.flight_id}
              flight={f}
              onSelect={onSelectFlight}
              suffix={
                intent.max_price != null ? (
                  <span className="text-[10px] font-mono tabular-nums text-accent-red font-medium shrink-0 w-[64px] text-right">
                    +£{(f.price_gbp - intent.max_price).toFixed(0)} over
                  </span>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      {nearbyDates.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground pt-1">
            Same search, nearby dates (±3 days)
          </div>
          {nearbyDates.map((f) => (
            <FlightRow key={f.flight_id} flight={f} onSelect={onSelectFlight} />
          ))}
        </div>
      )}

      {overBudget.length === 0 && nearbyDates.length === 0 && onQuickReply && (
        <div className="flex flex-wrap gap-1.5">
          {[
            dest ? `flights to ${dest} in August` : 'where can I go for £100?',
            dest ? `cheapest flights to ${dest} in the next 3 months` : 'cheapest flights this weekend',
          ].map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onQuickReply(chip)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:border-white/20 rounded-full py-1.5 px-3.5 transition-colors"
            >
              Try: {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
