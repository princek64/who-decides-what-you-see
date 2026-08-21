import type { Flight, IntentJSON } from '../hooks/useFlightFilter';
import { getCityName } from './airportMap';

/**
 * Split merged round-trip results into labelled outbound/inbound legs.
 * filterAndSortFlights interleaves both directions; this is a read-only view.
 */

export interface LegGroups {
  outbound: Flight[];
  inbound: Flight[];
}

/** True for direction 'both' — the only case that needs leg splitting. */
export const isTwoWayResult = (intent: IntentJSON): boolean =>
  intent.direction === 'both';

/** Split by f.direction (EU→London rows are inbound). */
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

/** Nights away for an open-window pairing (Fri→Mon is 3). */
export const MAX_OPEN_TRIP_SPAN_DAYS = 4;

const daySpan = (from: string, to: string): number => {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / msPerDay
  );
};

/**
 * Cheapest coherent round trip: prefer return 1–MAX_OPEN_TRIP_SPAN_DAYS after
 * outbound (independent cheapest-out + cheapest-back can pair months apart).
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
