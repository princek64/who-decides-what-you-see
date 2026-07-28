import React from 'react';

interface SearchProgressProps {
  originLabel: string;
  destLabel: string;
}

// Shown between a Search click and the results landing: a status line plus the
// thin indeterminate bar Google Flights runs under its search form. Purely a
// progress affordance — the filtering itself is synchronous.
export const SearchProgress: React.FC<SearchProgressProps> = ({ originLabel, destLabel }) => (
  <div className="w-full flex flex-col gap-2" role="status" aria-live="polite">
    <div className="text-xs text-muted-foreground select-none">
      Searching flights from{' '}
      <span className="font-medium text-foreground">{originLabel}</span> to{' '}
      <span className="font-medium text-foreground">{destLabel}</span>…
    </div>
    <div className="h-[2px] w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full w-1/4 rounded-full bg-accent-blue animate-search-progress" />
    </div>
  </div>
);
