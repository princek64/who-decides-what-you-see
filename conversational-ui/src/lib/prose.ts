import type { Flight, IntentJSON } from '../hooks/useFlightFilter';
import { isRoundTripItinerary } from '../hooks/useFlightFilter';
import { AIRPORT_TO_CITY } from './airportMap';
import { formatFlightDate } from './utils';
import { cheapestBy } from './insights';
import {
  cheapestPair,
  destinationLabel,
  isTwoWayResult,
  outboundLabel,
  returnLabel,
  splitLegs,
} from './returnGroups';
import type { LegGroups } from './returnGroups';

export const TABLE_MIN_RESULTS = 4;
/** Preview rows — app never dumps the full set unless showAll. */
export const TABLE_PREVIEW_ROWS = 6;

export type ProseNode =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'flight'; text: string; flight: Flight }
  | { type: 'link'; text: string; href: string };

/** Dummy booking URL for the research prototype. */
export const bookingHref = (f: Flight): string =>
  `https://www.${f.airline_name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.example/book/${f.flight_id}`;


export type ProseBlock =
  | { kind: 'paragraph'; nodes: ProseNode[] }
  | { kind: 'bullets'; items: ProseNode[][] };

/** One labelled leg of a round trip, rendered as its own table. */
export interface ProseTableGroup {
  label: string;
  flights: Flight[];
  /** Rows matching the search beyond the ones shown, for the "of N" note. */
  available: number;
}

export interface ProseAnswer {
  blocks: ProseBlock[];
  closing: ProseBlock[];
  text: string;
  table: Flight[] | null;
  /** Round trip: outbound then return labelled tables (instead of `table`). */
  tableGroups: ProseTableGroup[] | null;
  tableShowsDate: boolean;
  displayed: number;
  available: number;
}

export interface ProseOptions {
  /** "Show all" — full table instead of a preview summary. */
  showAll?: boolean;
  /** Insight already named the cheapest pair — skip repeating it above leg tables. */
  skipPairLead?: boolean;
}

/**
 * Cap for explicit "show all" — beyond this, state the count rather than render
 * (undated anywhere can match thousands; thread is not virtualised).
 */
export const SHOW_ALL_MAX_ROWS = 100;

// "London Gatwick" → "Gatwick"; unknown codes fall back to the code.
const airportLabel = (code: string): string => {
  const full = AIRPORT_TO_CITY[code];
  if (!full) return code;
  return full.startsWith('London ') ? full.slice('London '.length) : full;
};

const destLabel = (code: string): string => {
  const city = AIRPORT_TO_CITY[code];
  return city ? `${city} (${code})` : code;
};

const money = (n: number) => `£${n.toFixed(2)}`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const stopsClause = (f: Flight): string =>
  f.stops === 0 ? '' : ` with ${plural(f.stops, 'stop')}`;

export const describeConstraints = (intent: IntentJSON): string => {
  const destination = intent.dest_city || intent.dest_code;
  const destInfo = destination ? ` to ${destination}` : '';
  const priceInfo = intent.max_price ? ` under £${intent.max_price}` : '';
  const timeBit = describeTimeWindow(intent.departure_after, intent.departure_before)
    .replace(/^\s*departing\s+/, '')
    .trim();
  const weekendBit = intent.weekend_only ? 'at the weekend' : '';
  let departInfo = '';
  if (timeBit && weekendBit) departInfo = ` departing ${timeBit} ${weekendBit}`;
  else if (timeBit) departInfo = ` departing ${timeBit}`;
  else if (weekendBit) departInfo = ` departing ${weekendBit}`;
  let dateInfo = '';
  if (intent.date) {
    dateInfo = ` on ${formatFlightDate(intent.date)}`;
  } else if (intent.date_from && intent.date_to) {
    if (intent.date_from === intent.date_to) {
      dateInfo = ` on ${formatFlightDate(intent.date_from)}`;
    } else if (isRoundTripItinerary(intent)) {
      // Round-trip date pair — not a flexible "between X and Y" window.
      dateInfo = ` — outbound ${formatFlightDate(intent.date_from)}, return ${formatFlightDate(intent.date_to)}`;
    } else {
      dateInfo = ` between ${formatFlightDate(intent.date_from)} and ${formatFlightDate(intent.date_to)}`;
    }
  }
  return `${destInfo}${priceInfo}${departInfo}${dateInfo}`;
};

const clockLabel = (hhmm: string): string => {
  const [hRaw, mRaw] = hhmm.split(':');
  const h = parseInt(hRaw, 10);
  const m = parseInt(mRaw, 10) || 0;
  if (isNaN(h)) return hhmm;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
};

export const describeTimeWindow = (after?: string, before?: string): string => {
  const a = after?.trim();
  const b = before?.trim();
  if (a && b) return ` departing between ${clockLabel(a)} and ${clockLabel(b)}`;
  if (a) return ` departing after ${clockLabel(a)}`;
  if (b) return ` departing before ${clockLabel(b)}`;
  return '';
};

const flightBullet = (f: Flight, withDate: boolean, withDest: boolean): ProseNode[] => {
  const dateBit = withDate ? ` · ${formatFlightDate(f.date)}` : '';
  const destBit = withDest ? ` · ${destLabel(f.dest_code)}` : '';
  const stopBit = f.stops === 0 ? 'direct' : `${plural(f.stops, 'stop')}`;
  return [
    { type: 'strong', text: `${f.airline_name} ${f.flight_number}` },
    {
      type: 'text',
      text: ` · ${airportLabel(f.origin_code)}${destBit}${dateBit} · ${f.departure_time}→${f.arrival_time} · ${f.duration_formatted} · ${stopBit} · `,
    },
    { type: 'strong', text: money(f.price_gbp) },
    { type: 'text', text: ' — ' },
    { type: 'link', text: `Book on ${f.airline_name}`, href: bookingHref(f) },
  ];
};

const flightRouteSentence = (f: Flight, withDate: boolean, withDest: boolean): ProseNode[] => [
  { type: 'text', text: "It's " },
  { type: 'flight', text: `${f.airline_name} ${f.flight_number}`, flight: f },
  {
    type: 'text',
    text:
      ` from ${airportLabel(f.origin_code)}${withDest ? ` to ${destLabel(f.dest_code)}` : ''}` +
      `${withDate ? ` on ${formatFlightDate(f.date)}` : ''}${stopsClause(f)}.`,
  },
];

const flightDetailSentence = (f: Flight): ProseNode[] => [
  {
    type: 'text',
    text: `Departs ${f.departure_time}, arrives ${f.arrival_time} (${f.duration_formatted}) — `,
  },
  { type: 'strong', text: money(f.price_gbp) },
  { type: 'text', text: ' — ' },
  { type: 'link', text: `Book on ${f.airline_name}`, href: bookingHref(f) },
];

const cheapestLine = (f: Flight): ProseNode[] => [
  { type: 'text', text: 'Cheapest: ' },
  { type: 'strong', text: f.airline_name },
  { type: 'text', text: ' at ' },
  { type: 'strong', text: money(f.price_gbp) },
  { type: 'text', text: '.' },
];

const buildFollowUpQuestion = (
  results: Flight[],
  intent: IntentJSON
): string | null => {
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let minDur = Infinity;
  let maxDur = -Infinity;
  let minCo2 = Infinity;
  let maxCo2 = -Infinity;
  let directs = 0;
  for (const f of results) {
    if (f.price_gbp < minPrice) minPrice = f.price_gbp;
    if (f.price_gbp > maxPrice) maxPrice = f.price_gbp;
    if (f.duration_mins < minDur) minDur = f.duration_mins;
    if (f.duration_mins > maxDur) maxDur = f.duration_mins;
    if (f.co2_kg < minCo2) minCo2 = f.co2_kg;
    if (f.co2_kg > maxCo2) maxCo2 = f.co2_kg;
    if (f.stops === 0) directs++;
  }
  const mixedStops = directs > 0 && directs < results.length;

  const singleDay = Boolean(
    intent.date || (intent.date_from && intent.date_from === intent.date_to)
  );
  const offers: string[] = [];

  if (results.length <= 2) {
    if (intent.stops === 0) offers.push('include flights with a stop');
    if (intent.max_price) offers.push('lift the price cap');
    offers.push(singleDay ? 'check the days either side' : 'widen the dates');
  } else {
    if (intent.stops == null && mixedStops) {
      offers.push('narrow it to direct flights only');
    }
    if (intent.max_price == null && maxPrice > minPrice * 1.3) {
      const mid = (minPrice + maxPrice) / 2;
      const step = mid < 100 ? 10 : mid < 300 ? 25 : 50;
      const cap = Math.round(mid / step) * step;
      if (cap > minPrice) offers.push(`filter to under £${cap}`);
    }
    if ((intent.sort_by || 'cheapest') !== 'fastest' && maxDur - minDur >= 20) {
      offers.push('sort them by fastest');
    }
    if (!intent.low_co2 && maxCo2 > minCo2 * 1.15) offers.push('show the lower-CO₂ options');
    if (singleDay) offers.push('compare nearby dates');
  }

  if (offers.length === 0) return null;
  const picked = offers.slice(0, 3);
  const list =
    picked.length === 1
      ? picked[0]
      : `${picked.slice(0, -1).join(', ')}, or ${picked[picked.length - 1]}`;

  // Deterministic opener rotation from query seed.
  const openers = ['Want me to', 'Would you like me to', 'Shall I'];
  const seed = `${intent.dest_code ?? ''}${intent.dest_city ?? ''}${intent.date ?? ''}${results.length}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  return `${openers[hash % openers.length]} ${list}?`;
};

const blocksToText = (blocks: ProseBlock[]): string =>
  blocks
    .map((b) =>
      b.kind === 'paragraph'
        ? nodesToMarkdown(b.nodes)
        : b.items.map((item) => `- ${nodesToMarkdown(item)}`).join('\n')
    )
    .join('\n\n');

const nodesToMarkdown = (nodes: ProseNode[]): string =>
  nodes
    .map((n) => (n.type === 'text' ? n.text : n.type === 'link' ? `${n.text} (${n.href})` : `**${n.text}**`))
    .join('');

/**
 * Round trip: labelled outbound/return tables (filter merges legs into one list).
 * Closing prices cheapest out + cheapest back. showAll raises the per-leg cap.
 */
const buildRoundTripAnswer = (
  results: Flight[],
  intent: IntentJSON,
  legs: LegGroups,
  showAll = false,
  skipPairLead = false
): ProseAnswer => {
  const destination = destinationLabel(legs, intent);
  const constraints = describeConstraints(intent);
  const perLeg = showAll ? SHOW_ALL_MAX_ROWS : TABLE_PREVIEW_ROWS;
  const outVisible = legs.outbound.slice(0, perLeg);
  const inVisible = legs.inbound.slice(0, perLeg);

  // Empty leg stated explicitly — blank table under a heading looks like a load failure.
  const missing =
    legs.outbound.length === 0
      ? 'outbound'
      : legs.inbound.length === 0
        ? 'return'
        : null;

  const lead = missing
    ? `I found ${plural(results.length, 'flight')}${constraints}, but nothing on the ${missing} leg — here is what there is:`
    : skipPairLead
      ? `Options on each leg${constraints}:`
      : `Here is the round trip${constraints} — ${plural(legs.outbound.length, 'outbound flight')} and ${plural(legs.inbound.length, 'return flight')}:`;

  // Verdict (bold total) before leg options; skipped when preface already said it.
  const pair = cheapestPair(legs);
  const blocks: ProseBlock[] = [];
  if (pair && !skipPairLead) {
    const destBit = destination ? ` to ${destination}` : '';
    blocks.push({
      kind: 'paragraph',
      nodes: [
        {
          type: 'strong',
          text: `Cheapest return${destBit}: ${money(pair.total)} total`,
        },
      ],
    });
    blocks.push({
      kind: 'bullets',
      items: [
        [
          { type: 'strong', text: 'Outbound: ' },
          {
            type: 'text',
            text: `${pair.outbound.airline_name} · ${money(pair.outbound.price_gbp)} · ${formatFlightDate(pair.outbound.date)}`,
          },
        ],
        [
          { type: 'strong', text: 'Return: ' },
          {
            type: 'text',
            text: `${pair.inbound.airline_name} · ${money(pair.inbound.price_gbp)} · ${formatFlightDate(pair.inbound.date)}`,
          },
        ],
      ],
    });
  }
  blocks.push({ kind: 'paragraph', nodes: [{ type: 'text', text: lead }] });

  const closing: ProseBlock[] = [];
  if (!missing) {
    closing.push({
      kind: 'paragraph',
      nodes: [
        {
          type: 'text',
          text: 'Legs below are sorted cheapest first. Want a different return day, or direct only?',
        },
      ],
    });
  }

  // Round-trip legs are on different days — always show the date column.
  const tableGroups: ProseTableGroup[] = [
    { label: outboundLabel(destination), flights: outVisible, available: legs.outbound.length },
    { label: returnLabel(destination), flights: inVisible, available: legs.inbound.length },
  ];

  return {
    blocks,
    closing,
    text: closing.length > 0 ? `${blocksToText(blocks)}\n\n${blocksToText(closing)}` : blocksToText(blocks),
    table: null,
    tableGroups,
    tableShowsDate: true,
    displayed: outVisible.length + inVisible.length,
    available: results.length,
  };
};

/** Full result table for explicit "show all" — skips first-answer preview shaping. */
const buildShowAllAnswer = (results: Flight[], intent: IntentJSON): ProseAnswer => {
  const visible = results.slice(0, SHOW_ALL_MAX_ROWS);
  const truncated = results.length > visible.length;
  const constraints = describeConstraints(intent);
  const cheapest = cheapestBy(results) as Flight;
  // Multi-day sets need a per-row date.
  const withDate = new Set(results.map((f) => f.date)).size > 1;

  const lead = truncated
    ? `Found ${plural(results.length, 'flight')}${constraints} — showing the first ${visible.length} of ${results.length}, sorted by ${intent.sort_by || 'cheapest'} first:`
    : `Found all ${plural(results.length, 'flight')}${constraints}, sorted by ${intent.sort_by || 'cheapest'} first:`;

  const blocks: ProseBlock[] = [{ kind: 'paragraph', nodes: [{ type: 'text', text: lead }] }];
  const closing: ProseBlock[] = [{ kind: 'paragraph', nodes: cheapestLine(cheapest) }];

  return {
    blocks,
    closing,
    text: `${blocksToText(blocks)}\n\n${blocksToText(closing)}`,
    table: visible,
    tableGroups: null,
    tableShowsDate: withDate,
    displayed: visible.length,
    available: results.length,
  };
};

export const buildProseAnswer = (
  results: Flight[],
  intent: IntentJSON,
  opts: ProseOptions = {}
): ProseAnswer => {
  // Two-way before showAll so "all options" stays labelled per leg.
  if (isTwoWayResult(intent) && results.length > 0) {
    return buildRoundTripAnswer(
      results,
      intent,
      splitLegs(results),
      Boolean(opts.showAll),
      Boolean(opts.skipPairLead)
    );
  }

  if (opts.showAll && results.length > 0) return buildShowAllAnswer(results, intent);

  // Full filtered set (no silent direct-only collapse).
  const shown = results;

  const count = shown.length;
  const stopWord = intent.stops === 0 ? 'direct ' : intent.stops === 1 ? '1-stop ' : '';
  const constraints = describeConstraints(intent);
  const dates = new Set(shown.map((f) => f.date));
  const withDate = dates.size > 1;
  const isBroad = !intent.dest_city && !intent.dest_code;

  const withDest = isBroad || new Set(shown.map((f) => f.dest_code)).size > 1;

  const cheapest = cheapestBy(shown) as Flight;
  // Name the true total even when the list below is a preview.
  const found = `Found ${plural(count, `${stopWord}flight`)}${constraints}`;
  const blocks: ProseBlock[] = [];

  const question = buildFollowUpQuestion(shown, intent);
  const askNodes: ProseNode[] = question ? [{ type: 'text', text: ` ${question}` }] : [];

  if (count === 1) {
    blocks.push({ kind: 'paragraph', nodes: [{ type: 'text', text: `${found}.` }] });
    blocks.push({ kind: 'paragraph', nodes: flightRouteSentence(shown[0], withDate, withDest) });
    blocks.push({
      kind: 'paragraph',
      nodes: [...flightDetailSentence(shown[0]), ...askNodes],
    });
    return {
      blocks,
      closing: [],
      text: blocksToText(blocks),
      table: null,
      tableGroups: null,
      tableShowsDate: withDate,
      displayed: 1,
      available: 1,
    };
  }

  const uniform = shown.every((f) => f.stops === 0) || shown.every((f) => f.stops > 0);
  const visible = Math.min(count, TABLE_PREVIEW_ROWS);

  if (!(uniform && count > TABLE_MIN_RESULTS)) {
    const lead =
      count > visible
        ? `${found}. Here are the first ${visible} of ${count}, sorted by ${intent.sort_by || 'cheapest'} first:`
        : `${found}:`;
    blocks.push({ kind: 'paragraph', nodes: [{ type: 'text', text: lead }] });
    blocks.push({
      kind: 'bullets',
      items: shown.slice(0, visible).map((f) => flightBullet(f, withDate, withDest)),
    });
    blocks.push({ kind: 'paragraph', nodes: [...cheapestLine(cheapest), ...askNodes] });
    return {
      blocks,
      closing: [],
      text: blocksToText(blocks),
      table: null,
      tableGroups: null,
      tableShowsDate: withDate,
      displayed: visible,
      available: count,
    };
  }

  let dearest = shown[0];
  for (const f of shown) if (f.price_gbp > dearest.price_gbp) dearest = f;
  const sortLabel = intent.sort_by || 'cheapest';

  blocks.push({
    kind: 'paragraph',
    nodes: [
      { type: 'text', text: `${found}, priced from ` },
      { type: 'strong', text: money(cheapest.price_gbp) },
      { type: 'text', text: ' to ' },
      { type: 'strong', text: money(dearest.price_gbp) },
      {
        type: 'text',
        text:
          count > visible
            ? `. Here are the first ${visible} of ${count}, sorted by ${sortLabel} first:`
            : `. Here they are, sorted by ${sortLabel} first:`,
      },
    ],
  });
  // Recommendation under the table.
  const closing: ProseBlock[] = [
    { kind: 'paragraph', nodes: [...cheapestLine(cheapest), ...askNodes] },
  ];

  return {
    blocks,
    closing,
    text: `${blocksToText(blocks)}\n\n${blocksToText(closing)}`,
    table: shown.slice(0, visible),
    tableGroups: null,
    tableShowsDate: withDate,
    displayed: visible,
    available: count,
  };
};
