import React, { useState } from 'react';
import type { Flight } from '../../hooks/useFlightFilter';
import { COMPARISON_PREVIEW_ROWS, groupByStops, parseLayover } from '../../lib/layoutData';
import type { StopGroup } from '../../lib/layoutData';
import { FlightRow } from './FlightRow';
import { ChevronDown, ChevronUp, Leaf, Lightbulb } from 'lucide-react';

/** Layover city on a connecting row, so the stop is a place and not a number. */
const layoverTag = (flight: Flight): React.ReactNode => {
  if (flight.stops === 0) return null;
  const layover = parseLayover(flight.layover_details);
  if (!layover) return null;
  return (
    <span className="hidden md:inline-flex text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
      via {layover.city} · {layover.duration}
    </span>
  );
};

const co2Tag = (flight: Flight): React.ReactNode => (
  <span className="hidden lg:inline-flex items-center gap-1 text-[10px] font-mono tabular-nums text-accent-green shrink-0">
    <Leaf className="w-3 h-3" />
    {flight.co2_kg} kg
  </span>
);

const Group: React.FC<{
  group: StopGroup;
  onSelectFlight: (f: Flight) => void;
}> = ({ group, onSelectFlight }) => {
  const [showAll, setShowAll] = useState(false);
  const isTruncated = group.flights.length > COMPARISON_PREVIEW_ROWS;
  const visible = showAll ? group.flights : group.flights.slice(0, COMPARISON_PREVIEW_ROWS);

  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          {group.label}
        </h3>
        <span className="text-[11px] font-mono tabular-nums text-muted-foreground/70">
          {group.flights.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {visible.map((flight) => (
          <FlightRow
            key={flight.flight_id}
            flight={flight}
            onSelect={onSelectFlight}
            suffix={
              <>
                {layoverTag(flight)}
                {co2Tag(flight)}
              </>
            }
          />
        ))}
      </div>
      {isTruncated && (
        <button
          type="button"
          onClick={() => setShowAll((open) => !open)}
          aria-expanded={showAll}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border hover:border-white/20 rounded-full py-1.5 px-3 transition-colors"
        >
          {showAll ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Show fewer
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Show all {group.flights.length} flights
            </>
          )}
        </button>
      )}
    </section>
  );
};

/** Cheapest flight in a group, or null when the group does not exist. */
const cheapestIn = (groups: StopGroup[], stops: number): Flight | null =>
  groups.find((g) => g.stops === stops)?.flights[0] ?? null;

/**
 * Direct vs connecting, with EVERY qualifying flight accounted for.
 *
 * This screen used to render exactly one direct and one connecting flight and
 * drop the rest without saying so — a participant who had seen six results
 * asked why only two were left. Flights are now grouped by stop count, fewest
 * stops first, cheapest first inside each group, with a per-group toggle once a
 * group runs past COMPARISON_PREVIEW_ROWS.
 *
 * The recommendation sits UNDER the groups rather than above them: the point of
 * a comparison screen is that the participant reads the options and then the
 * verdict, not a verdict they have to scroll past to check.
 */
export const ComparisonView: React.FC<{
  flights: Flight[];
  onSelectFlight: (f: Flight) => void;
}> = ({ flights, onSelectFlight }) => {
  const groups = groupByStops(flights);
  if (groups.length === 0) return null;

  // The verdict compares the cheapest of each kind — the two flights someone
  // choosing on price would actually be weighing against each other.
  const direct = cheapestIn(groups, 0);
  const oneStop = cheapestIn(groups, 1);

  let delta: string | null = null;
  if (direct && oneStop) {
    const priceDiff = direct.price_gbp - oneStop.price_gbp;
    const timeDiff = oneStop.duration_mins - direct.duration_mins;
    const h = Math.floor(Math.abs(timeDiff) / 60);
    const m = Math.abs(timeDiff) % 60;
    const timeStr = `${h ? `${h}h ` : ''}${m}m`;
    delta =
      priceDiff > 0
        ? `Direct costs £${priceDiff.toFixed(2)} more but saves ${timeStr}.`
        : priceDiff < 0
          ? `Direct is £${Math.abs(priceDiff).toFixed(2)} cheaper AND saves ${timeStr}.`
          : `Same price — direct saves ${timeStr}.`;
  } else if (direct) {
    delta = 'Every flight on this route is direct — there is no connecting option to weigh it against.';
  } else if (oneStop) {
    delta = 'Nothing direct on this route — every option below makes a stop.';
  }

  return (
    <div className="w-full mt-3 space-y-5">
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        Comparison · {flights.length} flight{flights.length === 1 ? '' : 's'}
      </div>

      {groups.map((group) => (
        <Group key={group.stops} group={group} onSelectFlight={onSelectFlight} />
      ))}

      {delta && (
        <div className="bg-white/[0.04] border border-border rounded-lg px-4 py-3 flex items-start gap-2.5">
          <Lightbulb className="w-4 h-4 text-accent-amber shrink-0 mt-px" />
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
              Recommendation
            </div>
            <p className="text-xs font-medium text-foreground leading-relaxed">{delta}</p>
          </div>
        </div>
      )}
    </div>
  );
};
