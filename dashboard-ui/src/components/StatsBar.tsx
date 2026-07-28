import React from 'react';
import { Plane, Leaf, CreditCard } from 'lucide-react';

interface StatsBarProps {
  total: number;
  cheapest: number;
  avgCo2: number;
  // While a search is resolving the figures would otherwise still show the
  // PREVIOUS query's totals, which reads as a (wrong) answer rather than a
  // pending one — so the values are replaced with placeholder bars.
  loading?: boolean;
}

export const StatsBar: React.FC<StatsBarProps> = ({ total, cheapest, avgCo2, loading = false }) => {
  const Value: React.FC<{ width: string; children: React.ReactNode }> = ({ width, children }) =>
    loading ? (
      <span className={`inline-block align-middle h-3 ${width} rounded bg-muted animate-pulse`} />
    ) : (
      <>{children}</>
    );

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 w-full px-4 py-2.5 bg-card border border-border rounded-lg shadow-card text-xs text-muted-foreground select-none"
      aria-busy={loading || undefined}
    >
      <div className="flex items-center gap-1.5">
        <Plane className="w-4 h-4 text-muted-foreground shrink-0" />
        <span>
          Total Found:{' '}
          <Value width="w-12">
            <span className="font-mono tabular-nums font-semibold text-foreground">{total.toLocaleString()}</span>
          </Value>
        </span>
      </div>

      <div className="hidden md:block h-4 w-px bg-border" />

      <div className="flex items-center gap-1.5">
        <CreditCard className="w-4 h-4 text-muted-foreground shrink-0" />
        <span>
          Cheapest Price:{' '}
          <Value width="w-14">
            <span className="font-mono tabular-nums font-semibold text-foreground">
              {total > 0 ? `£${cheapest.toFixed(2)}` : 'N/A'}
            </span>
          </Value>
        </span>
      </div>

      <div className="hidden md:block h-4 w-px bg-border" />

      <div className="flex items-center gap-1.5">
        <Leaf className="w-4 h-4 text-accent-green shrink-0" />
        <span>
          Avg CO₂ Emission:{' '}
          <Value width="w-12">
            <span className="font-mono tabular-nums font-semibold text-accent-green">
              {total > 0 ? `${avgCo2} kg` : 'N/A'}
            </span>
          </Value>
        </span>
      </div>
    </div>
  );
};
