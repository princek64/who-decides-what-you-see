import React, { useMemo, useState } from 'react';
import type { Flight, IntentJSON } from '../../hooks/useFlightFilter';
import { summarizeDestinations } from '../../lib/layoutData';
import { AIRPORT_COORDS } from '../../lib/airportMap';

// Hand-rolled SVG map: equirectangular projection over core Europe.
// No tiles, no external requests — pins are cheapest fares per destination.
const LON_MIN = -12, LON_MAX = 30, LAT_MIN = 34, LAT_MAX = 62;
const W = 640, H = 480;

const project = (lat: number, lon: number): [number, number] => [
  ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * W,
  ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * H,
];

const LONDON: [number, number] = project(51.47, -0.45);

export const MapView: React.FC<{
  flights: Flight[];
  intent: IntentJSON;
  onRefine?: (patch: Partial<IntentJSON & { layout?: string }>, label: string) => void;
}> = ({ flights, onRefine }) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const destinations = useMemo(() => summarizeDestinations(flights), [flights]);

  const { pins, offMap } = useMemo(() => {
    const inFrame = [];
    let outside = 0;
    for (const d of destinations) {
      const coords = AIRPORT_COORDS[d.code];
      if (!coords) { outside++; continue; }
      const [lat, lon] = coords;
      if (lat < LAT_MIN || lat > LAT_MAX || lon < LON_MIN || lon > LON_MAX) { outside++; continue; }
      inFrame.push({ ...d, xy: project(lat, lon) });
    }
    return { pins: inFrame.slice(0, 30), offMap: outside + Math.max(0, inFrame.length - 30) };
  }, [destinations]);

  if (destinations.length === 0) return null;

  return (
    <div className="w-full mt-3 space-y-2">
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        Route map · {pins.length} destination{pins.length === 1 ? '' : 's'} from London
      </div>

      <div className="bg-card border border-border rounded-lg p-2 overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-h-[70vh] mx-auto" role="img" aria-label="Map of reachable destinations">
          {/* Graticule dot grid — the map's only "geography", deliberately abstract */}
          {Array.from({ length: 15 }).map((_, r) =>
            Array.from({ length: 20 }).map((_, c) => (
              <circle key={`${r}-${c}`} cx={16 + c * 32} cy={16 + r * 32} r={1} fill="rgba(255,255,255,0.08)" />
            ))
          )}

          {/* Routes */}
          {pins.map((p) => (
            <line
              key={`l-${p.code}`}
              x1={LONDON[0]} y1={LONDON[1]} x2={p.xy[0]} y2={p.xy[1]}
              stroke={hovered === p.code ? '#ededed' : 'rgba(255,255,255,0.14)'}
              strokeWidth={hovered === p.code ? 1.5 : 1}
            />
          ))}

          {/* Origin */}
          <circle cx={LONDON[0]} cy={LONDON[1]} r={6} fill="#ededed" />
          <text x={LONDON[0] - 10} y={LONDON[1] + 4} textAnchor="end" fontSize={11} fontWeight={600} fill="#ededed">London</text>

          {/* Destination pins */}
          {pins.map((p) => (
            <g
              key={p.code}
              className="cursor-pointer"
              onMouseEnter={() => setHovered(p.code)}
              onMouseLeave={() => setHovered(null)}
              onClick={() =>
                onRefine?.({ dest_city: p.city, dest_code: undefined, layout: 'grid' }, `Flights to ${p.city}`)
              }
            >
              <circle cx={p.xy[0]} cy={p.xy[1]} r={hovered === p.code ? 5 : 3.5} fill={hovered === p.code ? '#ededed' : '#a1a1a1'} />
              <g transform={`translate(${p.xy[0] + 6}, ${p.xy[1] - 6})`}>
                <rect x={0} y={-11} width={(String(Math.round(p.typicalPrice)).length + 1) * 6 + 16} height={14} rx={7}
                  fill={hovered === p.code ? '#ededed' : '#171717'} stroke="rgba(255,255,255,0.12)" strokeWidth={hovered === p.code ? 0 : 1} />
                <text x={8} y={0} fontSize={9} fontFamily="'Geist Mono Variable', ui-monospace, monospace"
                  fill={hovered === p.code ? '#0a0a0a' : '#a1a1a1'}>~£{Math.round(p.typicalPrice)}</text>
              </g>
              {hovered === p.code && (
                <text x={p.xy[0] + 6} y={p.xy[1] + 14} fontSize={10} fontWeight={600} fill="#ededed">{p.city}</text>
              )}
            </g>
          ))}
        </svg>
      </div>

      <div className="text-[10px] text-muted-foreground text-center">
        ~ = typical fare per city · click a pin to search that destination
        {offMap > 0 && ` · ${offMap} more destination${offMap === 1 ? '' : 's'} beyond this map`}
      </div>
    </div>
  );
};
