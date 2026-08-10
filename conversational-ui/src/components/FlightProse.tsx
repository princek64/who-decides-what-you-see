import React from 'react';
import type { Flight, IntentJSON } from '../hooks/useFlightFilter';
import { formatFlightDate } from '../lib/utils';
import { bookingHref, buildProseAnswer } from '../lib/prose';
import type { ProseBlock, ProseNode } from '../lib/prose';
import { getCityName } from '../lib/airportMap';

interface FlightProseProps {
  flights: Flight[];
  intent: IntentJSON;
  /** Comparison / cheapest-day answers keep connecting flights on screen. */
  keepStops?: boolean;
}

export const FlightProse: React.FC<FlightProseProps> = ({
  flights,
  intent,
  keepStops,
}) => {
  // The builder decides what is on screen (direct-only display rule, bullets vs
  // table, how many rows).
  const answer = buildProseAnswer(flights, intent, { keepStops });
  const rows = answer.table ?? [];

  const cell = 'py-2 pr-5 whitespace-nowrap align-middle';
  const linkClass =
    'text-muted-foreground hover:text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground transition-colors';

  // One table body, shared by the flat one-way table and each labelled leg of a
  // round trip, so the two presentations can never drift into showing different
  // columns for the same flight.
  const flightTable = (tableRows: typeof rows, showDate: boolean) => (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left text-[13px] border-collapse">
        <thead>
          <tr className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <th className={`${cell} font-medium`}>Airline</th>
            {showDate && <th className={`${cell} font-medium`}>Date</th>}
            <th className={`${cell} font-medium`}>Depart</th>
            <th className={`${cell} font-medium`}>Arrive</th>
            <th className={`${cell} font-medium`}>Duration</th>
            <th className={`${cell} font-medium`}>Stops</th>
            <th className={`${cell} font-medium`}>Price</th>
            <th className={`${cell} font-medium pr-0`} />
          </tr>
        </thead>
        <tbody>
          {tableRows.map((f) => (
            <tr key={f.flight_id} className="border-t border-border">
              <td className={cell}>
                {f.airline_name}{' '}
                <span className="font-mono text-muted-foreground">{f.flight_number}</span>
              </td>
              {showDate && <td className={cell}>{formatFlightDate(f.date)}</td>}
              <td className={`${cell} font-mono tabular-nums`}>
                {f.departure_time} <span className="text-muted-foreground">{f.origin_code}</span>
              </td>
              <td className={cell}>
                <span className="font-mono tabular-nums">{f.arrival_time}</span>{' '}
                <span className="text-muted-foreground">
                  {getCityName(f.dest_code)} ({f.dest_code})
                </span>
              </td>
              <td className={`${cell} font-mono tabular-nums text-muted-foreground`}>
                {f.duration_formatted}
              </td>
              <td className={`${cell} text-muted-foreground`}>
                {f.stops === 0 ? 'Direct' : `${f.stops} stop${f.stops === 1 ? '' : 's'}`}
              </td>
              <td className={`${cell} font-mono tabular-nums`}>£{f.price_gbp.toFixed(2)}</td>
              <td className={`${cell} pr-0`}>
                <a
                  href={bookingHref(f)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground border border-border hover:border-white/20 rounded-full py-1 px-2.5 transition-colors whitespace-nowrap"
                >
                  Book on {f.airline_name}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderNodes = (nodes: ProseNode[]) =>
    nodes.map((node, i) => {
      if (node.type === 'text') return <React.Fragment key={i}>{node.text}</React.Fragment>;
      if (node.type === 'link') {
        return (
          <a key={i} href={node.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {node.text}
          </a>
        );
      }
      return (
        <strong key={i} className="font-semibold text-foreground">
          {node.text}
        </strong>
      );
    });

  const renderBlocks = (blocks: ProseBlock[]) =>
    blocks.map((block, i) =>
      block.kind === 'paragraph' ? (
        <p key={i} className="[&:not(:first-child)]:mt-2.5">
          {renderNodes(block.nodes)}
        </p>
      ) : (
        <ul key={i} className="mt-2 space-y-1.5">
          {block.items.map((item, j) => (
            <li key={j} className="flex gap-2">
              <span aria-hidden className="text-muted-foreground select-none">
                •
              </span>
              <span>{renderNodes(item)}</span>
            </li>
          ))}
        </ul>
      )
    );

  return (
    <div className="w-full text-sm leading-relaxed text-foreground">
      {renderBlocks(answer.blocks)}

      {answer.table && <div className="mt-3">{flightTable(rows, answer.tableShowsDate)}</div>}

      {/* Round trip: one labelled table per leg, outbound first, with a rule
          between them. The heading names both ends of the leg in the direction
          it flies, which is the fact participants could not recover from the
          merged table. */}
      {answer.tableGroups?.map((group, i) => (
        <section
          key={group.label}
          className={
            i === 0
              ? 'mt-3'
              : 'mt-5 pt-5 border-t border-border'
          }
        >
          <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">
            {group.label}
          </h4>
          {group.flights.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-2">
              No flights on this leg match the search.
            </p>
          ) : (
            <>
              {flightTable(group.flights, answer.tableShowsDate)}
              {group.available > group.flights.length && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Showing {group.flights.length} of {group.available}, cheapest first.
                </p>
              )}
            </>
          )}
        </section>
      ))}

      {/* Closing recommendation sits under the table, where the reader lands */}
      {answer.closing.length > 0 && (
        <div className="mt-3">{renderBlocks(answer.closing)}</div>
      )}
    </div>
  );
};
