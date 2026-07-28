import React from 'react';

interface ResultsSkeletonProps {
  isRoundTrip: boolean;
  count?: number;
}

const Bar: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded bg-muted ${className}`} />
);

// One placeholder card, shaped to match the real result rows (188px one-way /
// 204px round-trip) so the list doesn't jump when the skeletons swap out.
const SkeletonCard: React.FC<{ isRoundTrip: boolean }> = ({ isRoundTrip }) => (
  <div className="p-1.5 w-full box-border">
    <div
      className={`${isRoundTrip ? 'h-[204px]' : 'h-[188px]'} w-full rounded-lg bg-card border border-border shadow-card p-4 flex flex-col justify-between`}
    >
      {/* Top line */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Bar className="w-4 h-4 rounded-full" />
          <Bar className="w-28 h-3.5" />
          <Bar className="w-14 h-3.5" />
        </div>
        <Bar className="w-20 h-3.5" />
      </div>

      {/* Middle: route + price */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="flex flex-col gap-1.5">
            <Bar className="w-14 h-5" />
            <Bar className="w-10 h-3" />
          </div>
          <div className="flex-1 flex flex-col items-center gap-1.5 min-w-[60px]">
            <Bar className="w-12 h-2.5" />
            <Bar className="w-full h-[2px]" />
            <Bar className="w-10 h-2.5" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Bar className="w-14 h-5" />
            <Bar className="w-10 h-3" />
          </div>
        </div>
        <div className="w-[128px] shrink-0 flex flex-col items-end gap-1.5 pl-4 border-l border-border h-12 justify-center">
          <Bar className="w-8 h-2.5" />
          <Bar className="w-20 h-6" />
        </div>
      </div>

      {/* Bottom line */}
      <div className="flex justify-between items-center border-t border-border pt-3">
        <div className="flex items-center gap-3">
          <Bar className="w-16 h-4" />
          <Bar className="w-12 h-3.5" />
          <Bar className="w-16 h-3.5" />
        </div>
        <Bar className="w-20 h-4" />
      </div>
    </div>
  </div>
);

// Loading placeholder for the results list. Shown for a 400ms minimum after a
// search so a fast client-side filter never flashes an empty-to-full flicker.
export const ResultsSkeleton: React.FC<ResultsSkeletonProps> = ({ isRoundTrip, count = 6 }) => (
  <div
    className="h-[650px] overflow-hidden w-full border border-border rounded-lg bg-secondary/60 p-2"
    aria-busy="true"
    aria-label="Loading flight results"
  >
    <div className="animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} isRoundTrip={isRoundTrip} />
      ))}
    </div>
  </div>
);
