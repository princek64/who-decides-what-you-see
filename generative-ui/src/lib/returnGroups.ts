import type { Flight, IntentJSON } from '../hooks/useFlightFilter';
import { getCityName } from './airportMap';

// Split merged round-trip lists (outbound+inbound interleaved by price) into labelled legs.

export interface LegGroups {
  outbound: Flight[];
  inbound: Flight[];
}

/** True when results are direction 'both' (single-leg return/outbound need no split). */
export const isTwoWayResult = (intent: IntentJSON): boolean =>
  intent.direction === 'both';

/** Split by f.direction — return rows are EU→London. */
export const splitLegs = (flights: Flight[]): LegGroups => ({
  outbound: flights.filter((f) => f.direction === 'outbound'),
  inbound: flights.filter((f) => f.direction === 'return'),
});

/** City at the non-London end, for leg labels. */
export const destinationLabel = (groups: LegGroups, intent: IntentJSON): string => {
  const fromOutbound = groups.outbound[0]?.dest_code;
  const fromInbound = groups.inbound[0]?.origin_code;
  const code = fromOutbound ?? fromInbound;
  if (code) return getCityName(code);
  const named = intent.dest_city?.trim();
  return named && named.length > 0 ? named : 'your destination';
};

export const outboundLabel = (destination: string): string =>
  `Outbound — London → ${destination}`;

export const returnLabel = (destination: string): string =>
  `Return — ${destination} → London`;

export interface CheapestPair {
  outbound: Flight;
  inbound: Flight;
  total: number;
}

/** Cheapest of each leg; null unless both legs have flights (no fare rules between legs). */
export const cheapestPair = (groups: LegGroups): CheapestPair | null => {
  if (groups.outbound.length === 0 || groups.inbound.length === 0) return null;
  const cheapestOf = (list: Flight[]): Flight =>
    list.reduce((best, f) => (f.price_gbp < best.price_gbp ? f : best), list[0]);
  const outbound = cheapestOf(groups.outbound);
  const inbound = cheapestOf(groups.inbound);
  return { outbound, inbound, total: outbound.price_gbp + inbound.price_gbp };
};
