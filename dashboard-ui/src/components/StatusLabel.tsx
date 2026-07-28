import React from 'react';
import type { Flight } from '../hooks/useFlights';

interface StatusLabelProps {
  status: Flight['flight_status'];
  className?: string;
}

// Quiet flight-status label. Normal states (Scheduled / On time) are plain grey
// text with no accent; only the exceptional states are coloured — amber for
// Delayed, red for Cancelled — each with a small leading dot. This keeps the
// results list calm and lets the eye jump straight to the flights that need
// attention, matching Google Flights' restraint.
export const StatusLabel: React.FC<StatusLabelProps> = ({ status, className = '' }) => {
  const label =
    status === 'On time' ? 'On time' : status === 'Delayed' ? 'Delayed' : status === 'Cancelled' ? 'Cancelled' : 'Scheduled';

  const isColoured = status === 'Delayed' || status === 'Cancelled';
  const tone = status === 'Delayed' ? 'text-warning-deep' : status === 'Cancelled' ? 'text-error' : 'text-muted-foreground';

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tone} ${className}`}>
      {isColoured && <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />}
      {label}
    </span>
  );
};
