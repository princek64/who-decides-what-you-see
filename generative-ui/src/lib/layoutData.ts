import type { Flight, IntentJSON } from '../hooks/useFlightFilter';
import { filterAndSortFlights, isRoundTripItinerary } from '../hooks/useFlightFilter';
import { getCityName, getCityCountry, LONDON_AIRPORT_CODES } from './airportMap';

// ─── Pure data adapters for the generative layouts ───
// Everything here derives view-models from the already-filtered results (or,
// for itinerary/alert, re-runs the SAME filter code with adjusted intents).
// No fabricated data: every number shown comes from dataset rows.

export interface DestinationSummary {
  code: string;
  city: string;
  country: string;
  minPrice: number;
  /** Median fare to this destination across the result set. Unlike minPrice —
   *  which collapses to the dataset's ~£21 budget-fare floor on nearly every
   *  route, making all cards look identical — the median genuinely varies per
   *  destination, so it's what we rank and surface. Labelled "~£X" (typical),
   *  never "from £X", so it doesn't misrepresent itself as the cheapest fare. */
  typicalPrice: number;
  minCo2: number;
  count: number;
}

/** Per-destination fare summary, ranked by the typical (median) fare ascending.
 *  We report the median rather than the minimum because the synthetic dataset
 *  has a near-uniform ~£21 price floor on every route: over any reasonable
 *  window each city has SOME £21 fare, so a per-destination minimum is real but
 *  useless for comparison (every card reads "from £21"). The median separates
 *  genuinely cheap destinations from pricier ones.
 *
 *  London airport codes are never destination cards: return legs land in London,
 *  and grouping by dest_code would otherwise surface Heathrow/Gatwick/… as if
 *  they were places you could fly *to* from London. */
export const summarizeDestinations = (flights: Flight[]): DestinationSummary[] => {
  const priced: Record<string, { prices: number[]; minPrice: number; minCo2: number }> = {};
  for (const f of flights) {
    if (LONDON_AIRPORT_CODES.has(f.dest_code)) continue;
    const cur = (priced[f.dest_code] ||= { prices: [], minPrice: f.price_gbp, minCo2: f.co2_kg });
    cur.prices.push(f.price_gbp);
    if (f.price_gbp < cur.minPrice) cur.minPrice = f.price_gbp;
    if (f.co2_kg < cur.minCo2) cur.minCo2 = f.co2_kg;
  }
  const median = (nums: number[]): number => {
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const out: DestinationSummary[] = Object.entries(priced).map(([code, { prices, minPrice, minCo2 }]) => ({
    code,
    city: getCityName(code),
    country: getCityCountry(getCityName(code)),
    minPrice,
    typicalPrice: median(prices),
    minCo2,
    count: prices.length,
  }));
  return out.sort((a, b) => a.typicalPrice - b.typicalPrice);
};

/** Cheapest flight per date (YYYY-MM-DD → flight). */
export const cheapestByDate = (flights: Flight[]): Record<string, Flight> => {
  const map: Record<string, Flight> = {};
  for (const f of flights) {
    if (!map[f.date] || f.price_gbp < map[f.date].price_gbp) map[f.date] = f;
  }
  return map;
};

export interface WeekBucket {
  weekStart: string; // Monday, YYYY-MM-DD
  label: string; // "6 Jul"
  minPrice: number;
  flight: Flight;
}

/** Min fare per ISO week across the result set, chronological. */
export const weeklyTrend = (flights: Flight[]): WeekBucket[] => {
  const buckets: Record<string, WeekBucket> = {};
  for (const f of flights) {
    const d = new Date(`${f.date}T00:00:00`);
    if (isNaN(d.getTime())) continue;
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    if (!buckets[key] || f.price_gbp < buckets[key].minPrice) {
      buckets[key] = {
        weekStart: key,
        label: monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        minPrice: f.price_gbp,
        flight: f,
      };
    }
  }
  return Object.values(buckets).sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
};

export interface ComparisonPair {
  direct: Flight | null;
  oneStop: Flight | null;
}

/** Best option of each kind under the current sort (results arrive sorted). */
export const splitComparison = (flights: Flight[]): ComparisonPair => {
  return {
    direct: flights.find((f) => f.stops === 0) ?? null,
    oneStop: flights.find((f) => f.stops === 1) ?? null,
  };
};

/** Rows shown per group before the "show all" toggle. */
export const COMPARISON_PREVIEW_ROWS = 4;

export interface StopGroup {
  stops: number;
  label: string;
  /** Cheapest first, regardless of the sort applied to the result set: the
   *  question a comparison asks is what each kind of journey costs. */
  flights: Flight[];
}

export const stopsGroupLabel = (stops: number): string =>
  stops === 0 ? 'Direct flights' : `${stops}-stop flights`;

/**
 * Every matching flight, bucketed by how many stops it makes, fewest stops
 * first.
 *
 * The comparison screen used to show ONE direct and ONE connecting flight and
 * silently drop the rest — a participant who could see six results in an
 * earlier screen asked why only two were left. Grouping keeps the direct/
 * connecting contrast the comparison exists for while accounting for every
 * flight that qualified. Buckets are derived from the data rather than hard-
 * coded to 0 and 1, so a 2-stop result is labelled and shown instead of
 * vanishing for want of a heading.
 */
export const groupByStops = (flights: Flight[]): StopGroup[] => {
  const buckets = new Map<number, Flight[]>();
  for (const f of flights) {
    const bucket = buckets.get(f.stops);
    if (bucket) bucket.push(f);
    else buckets.set(f.stops, [f]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([stops, group]) => ({
      stops,
      label: stopsGroupLabel(stops),
      flights: [...group].sort((a, b) => a.price_gbp - b.price_gbp),
    }));
};

export interface ParsedLayover {
  code: string;
  city: string;
  country: string;
  duration: string;
}

/** layover_details format: "FRA, Frankfurt, Germany, 2h 32m" */
export const parseLayover = (details: string): ParsedLayover | null => {
  const parts = details.split(',').map((s) => s.trim());
  if (parts.length < 4) return null;
  return { code: parts[0], city: parts[1], country: parts[2], duration: parts[3] };
};

export interface ItineraryPair {
  out: Flight;
  ret: Flight;
  nights: number;
}

const nightsBetween = (a: string, b: string): number =>
  Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);

// JS getDay(): 0=Sun … 6=Sat. A "weekend trip" departs Fri/Sat and returns
// Sun/Mon, so the traveller is away for the weekend, not any random midweek pair.
const dayOfWeek = (date: string): number => new Date(`${date}T00:00:00`).getDay();
const isWeekendDeparture = (date: string): boolean => dayOfWeek(date) === 5 || dayOfWeek(date) === 6; // Fri, Sat
const isWeekendReturn = (date: string): boolean => dayOfWeek(date) === 0 || dayOfWeek(date) === 1; // Sun, Mon

/**
 * Build a round-trip itinerary by running the SAME filter code twice:
 * once for outbound legs, once for return legs (the dataset's return rows fly
 * EU→London, and filterAndSortFlights already handles that swap).
 * Picks the cheapest outbound that still allows a later return in the window.
 *
 * When the intent is a "weekend" trip, candidate days are constrained to a real
 * weekend — outbound Fri/Sat, return Sun/Mon, 1–4 nights — rather than the
 * globally cheapest pair of any weekdays inside the window.
 */
export const buildItinerary = (
  rawFlights: Flight[],
  intent: IntentJSON,
  medianCo2: number
): ItineraryPair | null => {
  // Two explicit, close-together dates ("30 August out, 3 September back")
  // are a real itinerary, not a window to search for the cheapest pairing
  // within — pin each leg to its own exact date, same as the plain
  // both-directions search does, so the answer text and the itinerary card
  // never disagree about which dates were actually searched.
  if (isRoundTripItinerary(intent)) {
    const outbound = filterAndSortFlights(
      rawFlights,
      { ...intent, direction: 'outbound', date: intent.date_from },
      medianCo2
    );
    const returns = filterAndSortFlights(
      rawFlights,
      { ...intent, direction: 'return', date: intent.date_to },
      medianCo2
    );
    if (outbound.length === 0 || returns.length === 0) return null;
    return { out: outbound[0], ret: returns[0], nights: nightsBetween(outbound[0].date, returns[0].date) };
  }

  let outbound = filterAndSortFlights(rawFlights, { ...intent, direction: 'outbound' }, medianCo2);
  let returns = filterAndSortFlights(rawFlights, { ...intent, direction: 'return' }, medianCo2);

  if (intent.weekend) {
    outbound = outbound.filter((f) => isWeekendDeparture(f.date));
    returns = returns.filter((f) => isWeekendReturn(f.date));
  }
  if (outbound.length === 0 || returns.length === 0) return null;

  for (const out of outbound.slice(0, 40)) {
    const ret = returns.find((r) => {
      if (r.date <= out.date) return false;
      // Weekend trips must land on the SAME weekend as the outbound leg.
      if (intent.weekend) {
        const nights = nightsBetween(out.date, r.date);
        return nights >= 1 && nights <= 4;
      }
      return true;
    });
    if (ret) return { out, ret, nights: nightsBetween(out.date, ret.date) };
  }
  return null;
};

export interface AlertAlternatives {
  overBudget: Flight[]; // same search without the price cap
  nearbyDates: Flight[]; // same search, date widened ±3 days
}

/** Honest alternatives when a search matches nothing. */
export const nearbyAlternatives = (
  rawFlights: Flight[],
  intent: IntentJSON,
  medianCo2: number
): AlertAlternatives => {
  let overBudget: Flight[] = [];
  if (intent.max_price != null) {
    overBudget = filterAndSortFlights(rawFlights, { ...intent, max_price: undefined }, medianCo2).slice(0, 3);
  }

  let nearbyDates: Flight[] = [];
  if (intent.date) {
    const d = new Date(`${intent.date}T00:00:00`);
    if (!isNaN(d.getTime())) {
      const shift = (days: number) => {
        const n = new Date(d);
        n.setDate(d.getDate() + days);
        return n.toISOString().slice(0, 10);
      };
      nearbyDates = filterAndSortFlights(
        rawFlights,
        { ...intent, date: undefined, date_from: shift(-3), date_to: shift(3) },
        medianCo2
      ).slice(0, 3);
    }
  }
  return { overBudget, nearbyDates };
};

export interface RankedEntry {
  flight: Flight;
  why: string;
}

/** Top 5 with a "why" tag; value = normalized price+duration blend. */
export const rankFlights = (flights: Flight[]): RankedEntry[] => {
  if (flights.length === 0) return [];
  const pool = flights.slice(0, 200);
  let minP = Infinity, maxP = 0, minD = Infinity, maxD = 0, minC = Infinity;
  for (const f of pool) {
    if (f.price_gbp < minP) minP = f.price_gbp;
    if (f.price_gbp > maxP) maxP = f.price_gbp;
    if (f.duration_mins < minD) minD = f.duration_mins;
    if (f.duration_mins > maxD) maxD = f.duration_mins;
    if (f.co2_kg < minC) minC = f.co2_kg;
  }
  const norm = (v: number, lo: number, hi: number) => (hi === lo ? 0 : (v - lo) / (hi - lo));
  const score = (f: Flight) => norm(f.price_gbp, minP, maxP) * 0.6 + norm(f.duration_mins, minD, maxD) * 0.4;

  const sorted = [...pool].sort((a, b) => score(a) - score(b)).slice(0, 5);
  return sorted.map((f) => ({
    flight: f,
    why:
      f.price_gbp === minP ? 'Cheapest' :
      f.duration_mins === minD ? 'Fastest' :
      f.co2_kg === minC ? 'Lowest CO₂' :
      f.stops === 0 ? 'Direct' : 'Best value',
  }));
};
