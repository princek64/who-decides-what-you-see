import React, { useMemo } from 'react';
import type { Flight, IntentJSON } from '../../hooks/useFlightFilter';
import { cheapestByDate } from '../../lib/layoutData';
import { formatFlightDate } from '../../lib/utils';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Static month grid(s) of cheapest fares per day, tercile-tinted like the
// dashboard's price calendar; weekend days carry a dot marker.
export const CalendarView: React.FC<{
  flights: Flight[];
  intent: IntentJSON;
  onRefine?: (patch: Partial<IntentJSON & { layout?: string }>, label: string) => void;
}> = ({ flights, intent, onRefine }) => {
  // Every hook below runs unconditionally — the empty-results guard sits after
  // them, not between them, or the hook order changes between renders.
  const prices = useMemo(() => cheapestByDate(flights), [flights]);
  const dates = useMemo(() => Object.keys(prices).sort(), [prices]);

  const [lowCut, highCut] = useMemo(() => {
    const vals = Object.values(prices).map((f) => f.price_gbp).sort((a, b) => a - b);
    if (vals.length < 8) return [Infinity, Infinity];
    return [vals[Math.floor(vals.length / 3)], vals[Math.floor((vals.length * 2) / 3)]];
  }, [prices]);

  // Cheapest weekend-break day across the window — Fri/Sat/Sun, matching
  // isWeekendDeparture in the filter (and explicit "Friday–Sunday" wording).
  // Sat/Sun-only used to ignore Friday even when the user asked Fri–Sun.
  const cheapestWeekend = useMemo(() => {
    let best: Flight | null = null;
    for (const d of dates) {
      const day = new Date(`${d}T00:00:00`).getDay();
      if (day !== 5 && day !== 6 && day !== 0) continue; // Fri, Sat, Sun
      if (!best || prices[d].price_gbp < best.price_gbp) best = prices[d];
    }
    return best;
  }, [dates, prices]);

  if (dates.length === 0) return null;

  // Months covered by the results, capped to 3 grids
  const monthKeys = [...new Set(dates.map((d) => d.slice(0, 7)))].slice(0, 3);

  const dest = intent.dest_city || '';

  return (
    <div className="w-full mt-3 space-y-2">
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Price calendar</div>

      {cheapestWeekend && (
        <div className="bg-muted border border-border rounded-lg px-4 py-2.5 text-xs font-medium flex justify-between items-center text-foreground">
          <span>
            Cheapest weekend departure (Fri–Sun): {new Date(`${cheapestWeekend.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          <span className="font-mono tabular-nums font-semibold">£{cheapestWeekend.price_gbp.toFixed(2)}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {monthKeys.map((mk) => {
          const [y, m] = [parseInt(mk.slice(0, 4), 10), parseInt(mk.slice(5, 7), 10) - 1];
          const daysInMonth = new Date(y, m + 1, 0).getDate();
          const blanks = (new Date(y, m, 1).getDay() + 6) % 7;
          return (
            <div key={mk} className="flex-1 min-w-[240px] bg-card border border-border rounded-lg p-4">
              <div className="text-center text-sm font-heading font-medium text-foreground mb-1.5">{MONTHS[m]} {y}</div>
              <div className="grid grid-cols-7 mb-0.5">
                {WEEKDAYS.map((wd, i) => (
                  <div key={i} className={`text-center text-[9px] font-mono py-0.5 ${i >= 5 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{wd}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: blanks }).map((_, i) => <div key={`b${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const key = `${mk}-${String(day).padStart(2, '0')}`;
                  const flight = prices[key];
                  const level = !flight ? 'none' : flight.price_gbp <= lowCut ? 'low' : flight.price_gbp >= highCut ? 'high' : 'mid';
                  const isCheapestWeekend = cheapestWeekend && key === cheapestWeekend.date;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!flight || !onRefine}
                      onClick={() =>
                        onRefine?.(
                          { date: key, date_from: undefined, date_to: undefined, layout: 'grid' },
                          `Flights${dest ? ` to ${dest}` : ''} on ${formatFlightDate(key)}`
                        )
                      }
                      title={flight ? `From £${flight.price_gbp.toFixed(2)} — click to search this day` : undefined}
                      className={`h-10 rounded-md flex flex-col items-center justify-center text-[10px] transition-colors ${
                        isCheapestWeekend
                          ? 'bg-foreground text-background'
                          : !flight
                            ? 'text-muted-foreground/40 cursor-default'
                            : level === 'low'
                              ? 'bg-white/[0.06] hover:bg-white/10 text-foreground'
                              : level === 'high'
                                ? 'hover:bg-white/[0.04] text-muted-foreground'
                                : 'hover:bg-white/[0.04] text-foreground'
                      }`}
                    >
                      <span className="leading-none font-mono tabular-nums font-medium">{day}</span>
                      {flight && (
                        <span className={`leading-none mt-0.5 text-[8px] font-mono tabular-nums ${isCheapestWeekend ? 'text-background/70' : 'text-muted-foreground'}`}>
                          £{Math.round(flight.price_gbp)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-white/[0.06] border border-border"></span>Cheaper</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-muted border border-border"></span>Typical</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border border-border"></span>Pricier</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-foreground"></span>Cheapest Fri–Sun departure</span>
      </div>
    </div>
  );
};
