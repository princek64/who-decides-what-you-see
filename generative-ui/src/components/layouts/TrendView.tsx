import React, { useMemo } from 'react';
import type { Flight } from '../../hooks/useFlightFilter';
import { weeklyTrend } from '../../lib/layoutData';

// Monochrome bar chart of the cheapest fare per week; cheapest week in ink.
export const TrendView: React.FC<{
  flights: Flight[];
  onSelectFlight: (f: Flight) => void;
}> = ({ flights, onSelectFlight }) => {
  const weeks = useMemo(() => weeklyTrend(flights).slice(0, 16), [flights]);
  if (weeks.length === 0) return null;

  const maxPrice = Math.max(...weeks.map((w) => w.minPrice));
  const cheapest = weeks.reduce((a, b) => (b.minPrice < a.minPrice ? b : a));

  const W = 560, H = 180, PAD = 8, LABEL_H = 30;
  const barW = (W - PAD * 2) / weeks.length;

  return (
    <div className="w-full mt-3 space-y-2">
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Price trend · cheapest fare per week</div>

      <div className="bg-card border border-border rounded-lg p-4 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H + LABEL_H}`} className="w-full min-w-[420px]" role="img" aria-label="Weekly minimum fares">
          {weeks.map((w, i) => {
            const h = Math.max(8, (w.minPrice / maxPrice) * (H - 30));
            const x = PAD + i * barW;
            const isMin = w.weekStart === cheapest.weekStart;
            return (
              <g key={w.weekStart} className="cursor-pointer" onClick={() => onSelectFlight(w.flight)}>
                <rect
                  x={x + barW * 0.15}
                  y={H - h}
                  width={barW * 0.7}
                  height={h}
                  rx={4}
                  fill={isMin ? '#ededed' : 'rgba(255,255,255,0.14)'}
                />
                <text
                  x={x + barW / 2}
                  y={H - h - 6}
                  textAnchor="middle"
                  fontSize={barW > 32 ? 11 : 9}
                  fontFamily="'Geist Mono Variable', ui-monospace, monospace"
                  fill={isMin ? '#ededed' : '#a1a1a1'}
                  fontWeight={isMin ? 600 : 400}
                >
                  £{Math.round(w.minPrice)}
                </text>
                <text
                  x={x + barW / 2}
                  y={H + 16}
                  textAnchor="middle"
                  fontSize={9}
                  fontFamily="'Geist Mono Variable', ui-monospace, monospace"
                  fill="#a1a1a1"
                >
                  {w.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="bg-muted border border-border rounded-lg px-4 py-2.5 text-xs font-medium text-foreground text-center">
        Cheapest week: w/c {cheapest.label} from <span className="font-mono tabular-nums">£{cheapest.minPrice.toFixed(2)}</span> — click a bar to see that flight.
      </div>
    </div>
  );
};
