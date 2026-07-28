import type { Flight } from '../hooks/useFlightFilter';
import { formatFlightDate } from './utils';

// Compact "1h 55m" from raw minutes (falls back to the CSV's formatted string).
const fmtMins = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h ? `${h}h ` : ''}${m}m`;
};

/**
 * The cheapest flight in a set, chosen by PRICE and nothing else.
 *
 * This exists because the comparison sentence used to pick its two flights with
 * `results.find(...)`, i.e. "whichever direct/connecting flight the CURRENT SORT
 * put first". Under the default cheapest sort that happens to be the cheapest;
 * after the user clicks "Sort them by fastest" it is the FASTEST — so the same
 * Rome/3-August query reported "cheapest direct £22.33 / cheapest stop £21.32"
 * on one turn and "£32.91 / £71.68" on the next, and neither of the second
 * pair matched the £21.32 the stats panel showed. The candidate set was
 * identical throughout; only the pick was sort-dependent.
 *
 * Ties are broken by duration then flight_id so the choice is fully
 * deterministic even when two flights share a price.
 */
export const cheapestBy = (pool: Flight[]): Flight | null => {
  let best: Flight | null = null;
  for (const f of pool) {
    if (
      !best ||
      f.price_gbp < best.price_gbp ||
      (f.price_gbp === best.price_gbp && f.duration_mins < best.duration_mins) ||
      (f.price_gbp === best.price_gbp &&
        f.duration_mins === best.duration_mins &&
        f.flight_id < best.flight_id)
    ) {
      best = f;
    }
  }
  return best;
};

/**
 * Plain-text direct-vs-connecting tradeoff + a light recommendation, built from
 * the cheapest flight of each kind in the result set. Mirrors the insight the
 * generative-ui comparison template synthesizes, but rendered as a sentence so
 * the conversational app can keep showing a flat card list below.
 *
 * `results` is the SAME array the cards and the stats panel are rendered from,
 * so the quoted figures and the panel's Min Price cannot disagree: the panel's
 * minimum is by definition the cheaper of the two flights quoted here.
 */
export const buildComparisonSentence = (results: Flight[], destLabel: string): string | null => {
  const direct = cheapestBy(results.filter((f) => f.stops === 0));
  const connecting = cheapestBy(results.filter((f) => f.stops >= 1));
  const dest = destLabel ? ` to ${destLabel}` : '';
  if (!direct && !connecting) return null;
  if (direct && !connecting) {
    return `Only direct flights${dest} are available — the cheapest is £${direct.price_gbp.toFixed(2)} (${direct.duration_formatted}). No connecting option to compare.`;
  }
  if (connecting && !direct) {
    return `Only connecting flights${dest} are available — the cheapest is £${connecting.price_gbp.toFixed(2)} (${connecting.duration_formatted}). No direct option to compare.`;
  }
  const d = direct!;
  const c = connecting!;
  const priceGap = d.price_gbp - c.price_gbp; // + => direct dearer
  const timeGap = c.duration_mins - d.duration_mins; // + => connecting slower
  const lead =
    `Cheapest direct${dest} is £${d.price_gbp.toFixed(2)} (${d.duration_formatted}); ` +
    `cheapest with a stop is £${c.price_gbp.toFixed(2)} (${c.duration_formatted}). `;

  let tradeoff: string;
  if (priceGap > 0 && timeGap > 0) {
    tradeoff = `Direct costs £${priceGap.toFixed(2)} more but saves ${fmtMins(timeGap)}. `;
  } else if (priceGap <= 0 && timeGap > 0) {
    tradeoff = `Direct is both cheaper (by £${Math.abs(priceGap).toFixed(2)}) and ${fmtMins(timeGap)} faster. `;
  } else if (priceGap > 0 && timeGap <= 0) {
    tradeoff = `The stop is cheaper by £${priceGap.toFixed(2)} and no slower. `;
  } else {
    tradeoff = `The two are within £${Math.abs(priceGap).toFixed(2)} and ${fmtMins(Math.abs(timeGap))} of each other. `;
  }

  // Light recommendation: reward direct when the time saved is worth a modest
  // premium; favour the stop when it saves real money for little extra time.
  let rec: string;
  if (priceGap <= 0 && timeGap >= 0) {
    rec = "I'd take the direct — it wins on both price and time.";
  } else if (priceGap > 0 && timeGap >= 90 && priceGap <= 40) {
    rec = "I'd take the direct — the time saved is worth the small premium.";
  } else if (priceGap >= 40 && timeGap <= 90) {
    rec = "I'd take the one with a stop — the saving outweighs the short extra time.";
  } else {
    rec = 'Pick the direct for speed, or the stop to save money — both are reasonable.';
  }
  return lead + tradeoff + rec;
};

/**
 * Plain-text "cheapest day/weekend is X" statement. Weekend queries are
 * restricted to Sat/Sun. Like the comparison sentence, the pick is by PRICE
 * explicitly rather than by "first in the array" — otherwise a fastest-sorted
 * result set would name the quickest day and call it the cheapest.
 */
export const buildCheapestWhenSentence = (
  results: Flight[],
  destLabel: string,
  weekendOnly: boolean
): string | null => {
  const isWeekendDay = (date: string) => {
    const day = new Date(`${date}T00:00:00`).getDay();
    return day === 0 || day === 6; // Sun or Sat
  };
  const pool = weekendOnly ? results.filter((f) => isWeekendDay(f.date)) : results;
  const cheapest = cheapestBy(pool);
  if (!cheapest) return null;
  const dest = destLabel ? ` to ${destLabel}` : '';
  const label = weekendOnly ? 'weekend day' : 'day';
  return `The cheapest ${label} to fly${dest} is ${formatFlightDate(cheapest.date)} at £${cheapest.price_gbp.toFixed(2)}.`;
};
