import React from 'react';
import type { Flight, IntentJSON } from '../hooks/useFlightFilter';
import { formatFlightDate } from '../lib/utils';
import { buildProseAnswer, TABLE_MAX_ROWS } from '../lib/prose';
import type { ProseBlock, ProseNode } from '../lib/prose';
import { getCityName } from '../lib/airportMap';

interface FlightProseProps {
  flights: Flight[];
  intent: IntentJSON;
  isExpanded: boolean;
  onToggleExpand: () => void;
  /** Comparison / cheapest-day answers keep connecting flights on screen. */
  keepStops?: boolean;
}

export const FlightProse: React.FC<FlightProseProps> = ({
  flights,
  intent,
  isExpanded,
  onToggleExpand,
  keepStops,
}) => {
  // The builder decides what is on screen (direct-only display rule, bullets vs
  // table, how many rows), so the toggle below reads its numbers rather than
  // re-deriving them from the raw result set.
  const answer = buildProseAnswer(flights, intent, { keepStops, expanded: isExpanded });
  const rows = answer.table ?? [];
  const isTruncated = answer.available > TABLE_MAX_ROWS;

  const cell = 'py-2 pr-5 whitespace-nowrap align-middle';

  const renderNodes = (nodes: ProseNode[]) =>
    nodes.map((node, i) =>
      node.type === 'text' ? (
        <React.Fragment key={i}>{node.text}</React.Fragment>
      ) : (
        <strong key={i} className="font-semibold text-foreground">
          {node.text}
        </strong>
      )
    );

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

      {answer.table && (
        <div className="mt-3 w-full overflow-x-auto">
          <table className="w-full text-left text-[13px] border-collapse">
            <thead>
              <tr className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                <th className={`${cell} font-medium`}>Airline</th>
                {answer.tableShowsDate && <th className={`${cell} font-medium`}>Date</th>}
                <th className={`${cell} font-medium`}>Depart</th>
                <th className={`${cell} font-medium`}>Arrive</th>
                <th className={`${cell} font-medium`}>Duration</th>
                <th className={`${cell} font-medium`}>Stops</th>
                <th className={`${cell} font-medium pr-0`}>Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.flight_id} className="border-t border-border">
                  <td className={cell}>
                    {f.airline_name}{' '}
                    <span className="font-mono text-muted-foreground">{f.flight_number}</span>
                  </td>
                  {answer.tableShowsDate && (
                    <td className={cell}>{formatFlightDate(f.date)}</td>
                  )}
                  <td className={`${cell} font-mono tabular-nums`}>
                    {f.departure_time}{' '}
                    <span className="text-muted-foreground">{f.origin_code}</span>
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
                  <td className={`${cell} pr-0 font-mono tabular-nums`}>
                    £{f.price_gbp.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {isExpanded && isTruncated && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Showing the top {TABLE_MAX_ROWS} of {answer.available.toLocaleString()} results —
              refine your search to narrow it down.
            </p>
          )}
        </div>
      )}

      {/* Expand/collapse — drives both the bullet list and the table */}
      {answer.available > answer.displayed && !isExpanded && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="mt-2 text-[12px] text-muted-foreground hover:text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground transition-colors"
        >
          Show all {answer.available.toLocaleString()} results
        </button>
      )}
      {isExpanded && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="mt-2 text-[12px] text-muted-foreground hover:text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground transition-colors"
        >
          Show fewer
        </button>
      )}

      {/* Closing recommendation sits under the table, where the reader lands */}
      {answer.closing.length > 0 && (
        <div className="mt-3">{renderBlocks(answer.closing)}</div>
      )}
    </div>
  );
};
