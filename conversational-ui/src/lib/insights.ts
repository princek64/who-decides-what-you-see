import type { Flight } from '../hooks/useFlightFilter';
import { formatFlightDate } from './utils';
import { cheapestPair, splitLegs } from './returnGroups';

// Compact "1h 55m" from raw minutes (falls back to CSV formatted string).
const fmtMins = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h ? `${h}h ` : ''}${m}m`;
};

const money = (n: number): string => `£${n.toFixed(2)}`;

/**
 * Cheapest by price only (not current sort). Ties: duration, then flight_id.
 * Prevents "cheapest" labels flipping after the user sorts by fastest.
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

/** Direct-vs-connecting tradeoff + light recommendation (verdict, why, bullets). */
export const buildComparisonSentence = (results: Flight[], destLabel: string): string | null => {
  // One-way compare must use outbound only (prior round-trip flag can leak return fares).
  const legs = splitLegs(results);
  const pool =
    legs.outbound.length > 0
      ? legs.outbound
      : results.filter((f) => f.direction !== 'return');
  const direct = cheapestBy(pool.filter((f) => f.stops === 0));
  const connecting = cheapestBy(pool.filter((f) => f.stops >= 1));
  const dest = destLabel ? ` to ${destLabel}` : '';
  if (!direct && !connecting) return null;
  if (direct && !connecting) {
    return (
      `**Only direct flights${dest} are available.**\n\n` +
      `Cheapest is **${money(direct.price_gbp)}** · ${direct.duration_formatted} · ${direct.airline_name}. No connecting option to compare.`
    );
  }
  if (connecting && !direct) {
    return (
      `**Only connecting flights${dest} are available.**\n\n` +
      `Cheapest is **${money(connecting.price_gbp)}** · ${connecting.duration_formatted} · ${connecting.airline_name}. No direct option to compare.`
    );
  }
  const d = direct!;
  const c = connecting!;
  const priceGap = d.price_gbp - c.price_gbp; // + => direct dearer
  const timeGap = c.duration_mins - d.duration_mins; // + => connecting slower

  let tradeoff: string;
  if (priceGap > 0 && timeGap > 0) {
    tradeoff = `Direct costs **${money(priceGap)}** more but saves ${fmtMins(timeGap)}.`;
  } else if (priceGap <= 0 && timeGap > 0) {
    tradeoff = `Direct is both cheaper (by **${money(Math.abs(priceGap))}**) and ${fmtMins(timeGap)} faster.`;
  } else if (priceGap > 0 && timeGap <= 0) {
    tradeoff = `The stop is cheaper by **${money(priceGap)}** and no slower.`;
  } else {
    tradeoff = `The two are within **${money(Math.abs(priceGap))}** and ${fmtMins(Math.abs(timeGap))} of each other.`;
  }

  // Prefer direct when time saved is worth a modest premium; else the stop.
  let rec: string;
  if (priceGap <= 0 && timeGap >= 0) {
    rec = "**I'd take the direct** — it wins on both price and time.";
  } else if (priceGap > 0 && timeGap >= 90 && priceGap <= 40) {
    rec = "**I'd take the direct** — the time saved is worth the small premium.";
  } else if (priceGap >= 40 && timeGap <= 90) {
    rec = "**I'd take the one with a stop** — the saving outweighs the short extra time.";
  } else {
    rec = '**Either works** — pick the direct for speed, or the stop to save money.';
  }

  return [
    rec,
    tradeoff,
    [
      `- **Direct${dest}:** **${money(d.price_gbp)}** · ${d.duration_formatted} · ${d.airline_name}`,
      `- **With a stop:** **${money(c.price_gbp)}** · ${c.duration_formatted} · ${c.airline_name}`,
    ].join('\n'),
  ].join('\n\n');
};

/** "Cheapest day/weekend is X" — verdict first, then key facts. */
export const buildCheapestWhenSentence = (
  results: Flight[],
  destLabel: string,
  weekendOnly: boolean
): string | null => {
  const isWeekendDay = (date: string) => {
    const day = new Date(`${date}T00:00:00`).getDay();
    return day === 5 || day === 6 || day === 0; // Fri–Sun — match filter
  };
  const pool = weekendOnly ? results.filter((f) => isWeekendDay(f.date)) : results;
  const dest = destLabel ? ` to ${destLabel}` : '';
  const label = weekendOnly ? 'weekend' : 'day';

  const legs = splitLegs(pool);
  const pair = cheapestPair(legs);
  if (pair) {
    return [
      `**Cheapest ${label} return${dest}: ${money(pair.total)} total**`,
      [
        `- **Outbound:** **${money(pair.outbound.price_gbp)}** · ${formatFlightDate(pair.outbound.date)} · ${pair.outbound.airline_name}`,
        `- **Return:** **${money(pair.inbound.price_gbp)}** · ${formatFlightDate(pair.inbound.date)} · ${pair.inbound.airline_name}`,
      ].join('\n'),
    ].join('\n\n');
  }

  const cheapest = cheapestBy(pool);
  if (!cheapest) return null;
  return (
    `**Cheapest ${label}${dest}: ${money(cheapest.price_gbp)}**\n\n` +
    `${formatFlightDate(cheapest.date)} · ${cheapest.airline_name} · ${cheapest.duration_formatted}` +
    `${cheapest.stops === 0 ? ' · direct' : ` · ${cheapest.stops}-stop`}`
  );
};
