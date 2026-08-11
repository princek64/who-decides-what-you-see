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

/** Nights away for an open-window pairing (Fri→Mon is 3). */
export const MAX_OPEN_TRIP_SPAN_DAYS = 4;

const daySpan = (from: string, to: string): number => {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / msPerDay
  );
};

/**
 * Cheapest coherent round trip: outbound then return within a few days.
 *
 * Independent "cheapest out + cheapest back" used to pair a Friday in August
 * with a Friday in September — not a trip anyone can take. Prefer return 1–4
 * days after outbound; if nothing fits, fall back to any return strictly after
 * outbound. Null only when a leg is empty.
 */
export const cheapestPair = (groups: LegGroups): CheapestPair | null => {
  if (groups.outbound.length === 0 || groups.inbound.length === 0) return null;

  const prefer = (spanMax: number | null): CheapestPair | null => {
    let best: CheapestPair | null = null;
    for (const outbound of groups.outbound) {
      for (const inbound of groups.inbound) {
        const span = daySpan(outbound.date, inbound.date);
        if (span < 1) continue;
        if (spanMax != null && span > spanMax) continue;
        const total = outbound.price_gbp + inbound.price_gbp;
        if (
          !best ||
          total < best.total ||
          (total === best.total && outbound.date < best.outbound.date) ||
          (total === best.total &&
            outbound.date === best.outbound.date &&
            outbound.flight_id < best.outbound.flight_id)
        ) {
          best = { outbound, inbound, total };
        }
      }
    }
    return best;
  };

  return prefer(MAX_OPEN_TRIP_SPAN_DAYS) ?? prefer(null);
};
