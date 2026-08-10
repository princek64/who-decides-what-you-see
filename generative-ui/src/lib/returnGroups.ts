import type { Flight, IntentJSON } from '../hooks/useFlightFilter';
import { getCityName } from './airportMap';

/**
 * Round-trip results arrive as ONE list. filterAndSortFlights runs the outbound
 * and inbound searches separately and then merges and re-sorts them as a single
 * price-ordered array, so the two legs interleave: a London → Paris row, then a
 * Paris → London row, then another London → Paris. Rendered flat, nothing on
 * screen says which row is which leg, and testing participants could not tell
 * them apart.
 *
 * These helpers split that list back into its two legs so each can be labelled
 * and shown on its own. Deliberately a read-only view over the results — the
 * filtering and sorting are unchanged, and one-way searches never reach here.
 */

export interface LegGroups {
  outbound: Flight[];
  inbound: Flight[];
}

/**
 * True when the results are a two-directional round trip, i.e. the case this
 * grouping exists for. direction 'return' is a single leg and needs no
 * splitting; 'outbound' and undefined are one-way and are left exactly as they
 * were.
 */
export const isTwoWayResult = (intent: IntentJSON): boolean =>
  intent.direction === 'both';

/**
 * Split a merged round-trip result list back into its legs. Return rows in the
 * dataset fly EU → London, so f.direction is the authority here rather than any
 * inference from the airport codes.
 */
export const splitLegs = (flights: Flight[]): LegGroups => ({
  outbound: flights.filter((f) => f.direction === 'outbound'),
  inbound: flights.filter((f) => f.direction === 'return'),
});

/** The city at the non-London end, for the leg labels. */
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

/**
 * Cheapest outbound + cheapest return, priced together. Each leg is picked on
 * its own — the dataset has no fare rules tying one leg to another, so the
 * cheapest combination is just the two cheapest legs. Null unless BOTH legs
 * have at least one flight, since a total across one leg would misstate what
 * the trip costs.
 */
export const cheapestPair = (groups: LegGroups): CheapestPair | null => {
  if (groups.outbound.length === 0 || groups.inbound.length === 0) return null;
  const cheapestOf = (list: Flight[]): Flight =>
    list.reduce((best, f) => (f.price_gbp < best.price_gbp ? f : best), list[0]);
  const outbound = cheapestOf(groups.outbound);
  const inbound = cheapestOf(groups.inbound);
  return { outbound, inbound, total: outbound.price_gbp + inbound.price_gbp };
};
