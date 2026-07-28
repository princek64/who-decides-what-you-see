import type { Flight, IntentJSON } from '../hooks/useFlightFilter';
import { AIRPORT_TO_CITY } from './airportMap';
import { formatFlightDate } from './utils';
import { cheapestBy } from './insights';

/**
 * Prose answers for the conversational app.
 *
 * The chat thread states its answer in SENTENCES — the price/CO2/demand cards
 * belong to the dashboard ("Flight Explorer"), not to a messaging interface.
 * Up to PROSE_ONLY_MAX results are described in full prose; beyond that the
 * paragraph leads and a compact inline table carries the rest.
 *
 * Every figure quoted in a sentence is selected BY VALUE (cheapestBy), never by
 * array position, so re-sorting the results cannot change what "the cheapest"
 * refers to — same rule as ../lib/insights.
 */

/** A table is only ever used for MORE than this many flights — and only when
 *  they are all the same kind (all direct, or all with a stop). Anything else
 *  is bullets, which compare like with like. */
export const TABLE_MIN_RESULTS = 4;
/** Rows/bullets shown collapsed; expanding logs show_all_results. */
export const TABLE_PREVIEW_ROWS = 6;
/** Hard cap on rendered rows — the list is not virtualized. */
export const TABLE_MAX_ROWS = 100;

/** A line is a list of text runs: plain, bold, or a tappable flight mention
 *  (which is also bold — the airline name is the scannable part of a bullet). */
export type ProseNode =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'flight'; text: string; flight: Flight };

/** The answer is a short stack of blocks, so a multi-flight result reads as a
 *  scannable bullet list rather than one dense paragraph. */
export type ProseBlock =
  | { kind: 'paragraph'; nodes: ProseNode[] }
  | { kind: 'bullets'; items: ProseNode[][] };

export interface ProseAnswer {
  /** Rendered blocks (the answer itself). */
  blocks: ProseBlock[];
  /** Blocks that belong BELOW the table (the closing recommendation). Empty
   *  when there is no table. */
  closing: ProseBlock[];
  /** Plain-text (markdown) equivalent — copied, and what message.text holds. */
  text: string;
  /** Non-null only for a uniform set of more than TABLE_MIN_RESULTS flights. */
  table: Flight[] | null;
  /** Whether the table needs a Date column (results span several days). */
  tableShowsDate: boolean;
  /** How many flights the answer is displaying right now. */
  displayed: number;
  /** How many it could display (after the direct-only display rule). */
  available: number;
}

export interface ProseOptions {
  /** A comparison or cheapest-day answer must keep BOTH kinds of flight on the
   *  table — never hide the connecting ones behind the direct-only rule. */
  keepStops?: boolean;
  /** Expanded state of this message (the "Show all N" toggle). */
  expanded?: boolean;
}

// "London Gatwick" -> "Gatwick"; unknown codes fall back to the code itself.
const airportLabel = (code: string): string => {
  const full = AIRPORT_TO_CITY[code];
  if (!full) return code;
  return full.startsWith('London ') ? full.slice('London '.length) : full;
};

const money = (n: number) => `£${n.toFixed(2)}`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const stopsClause = (f: Flight): string =>
  f.stops === 0 ? '' : ` with ${plural(f.stops, 'stop')}`;

// The constraints the search actually applied, as a sentence fragment. Shared
// with useChat's zero-result reply so the wording of "what was filtered" is
// identical whether or not anything matched.
export const describeConstraints = (intent: IntentJSON): string => {
  const destination = intent.dest_city || intent.dest_code;
  const destInfo = destination ? ` to ${destination}` : '';
  const priceInfo = intent.max_price ? ` under £${intent.max_price}` : '';
  const timeInfo = describeTimeWindow(intent.departure_after, intent.departure_before);
  const weekendInfo = intent.weekend_only ? ' departing at the weekend' : '';
  let dateInfo = '';
  if (intent.date) {
    dateInfo = ` on ${formatFlightDate(intent.date)}`;
  } else if (intent.date_from && intent.date_to) {
    dateInfo =
      intent.date_from === intent.date_to
        ? ` on ${formatFlightDate(intent.date_from)}`
        : ` between ${formatFlightDate(intent.date_from)} and ${formatFlightDate(intent.date_to)}`;
  }
  return `${destInfo}${priceInfo}${timeInfo}${weekendInfo}${dateInfo}`;
};

// "18:00" -> "6pm", "09:30" -> "9:30am".
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

// One flight as a scannable bullet: airline (bold, tappable) — times — price
// (bold). Everything a participant compares on is in the same position on every
// line, which a running paragraph cannot give them.
//
//   **easyJet U21022** from Gatwick — departs 18:55, arrives 21:22 (2h 27m) — **£40.95**
const flightBullet = (f: Flight, withDate: boolean): ProseNode[] => {
  const dateBit = withDate ? ` on ${formatFlightDate(f.date)}` : '';
  return [
    { type: 'flight', text: `${f.airline_name} ${f.flight_number}`, flight: f },
    {
      type: 'text',
      text:
        ` from ${airportLabel(f.origin_code)}${dateBit} — ` +
        `departs ${f.departure_time}, arrives ${f.arrival_time}` +
        `${stopsClause(f)} (${f.duration_formatted}) — `,
    },
    { type: 'strong', text: money(f.price_gbp) },
  ];
};

// The single-result case reads better as a sentence than as a one-item list.
const flightSentence = (f: Flight, withDate: boolean): ProseNode[] => [
  { type: 'text', text: "It's " },
  { type: 'flight', text: `${f.airline_name} ${f.flight_number}`, flight: f },
  {
    type: 'text',
    text:
      ` from ${airportLabel(f.origin_code)}${withDate ? ` on ${formatFlightDate(f.date)}` : ''}, ` +
      `departing ${f.departure_time} and arriving ${f.arrival_time}` +
      `${stopsClause(f)} (${f.duration_formatted}), at `,
  },
  { type: 'strong', text: money(f.price_gbp) },
  { type: 'text', text: '.' },
];

// "The cheapest option is **easyJet** at **£40.95**." — closes the answer with
// the recommendation, chosen by price (cheapestBy), never by list position.
const cheapestLine = (f: Flight): ProseNode[] => [
  { type: 'text', text: 'The cheapest option is ' },
  { type: 'flight', text: f.airline_name, flight: f },
  { type: 'text', text: ' at ' },
  { type: 'strong', text: money(f.price_gbp) },
  { type: 'text', text: '.' },
];

/**
 * The closing follow-up question, replacing the old refinement chips.
 *
 * The offers are derived from THIS result set: only refinements that would
 * actually change something are named (no "sort by fastest" when every flight
 * takes the same time, no budget filter when the prices barely differ, no
 * direct-only when there is nothing but direct flights). A tight result set is
 * offered ways to WIDEN instead, since narrowing further would empty it.
 *
 * The opener rotates, but deterministically — the same search always produces
 * the same sentence, so a session log can be replayed exactly.
 */
const buildFollowUpQuestion = (
  results: Flight[],
  intent: IntentJSON,
  hidStops: boolean
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
  // The model expresses "on 3 August" as either a single date or a one-day
  // range; both are a single day to the user, so offer the neighbouring days
  // rather than "widen the dates".
  const singleDay = Boolean(
    intent.date || (intent.date_from && intent.date_from === intent.date_to)
  );
  const offers: string[] = [];

  // Connecting flights the answer is deliberately not showing are the first
  // thing to offer — the participant cannot ask for what they cannot see.
  if (hidStops) offers.push('include the ones with a stop');

  if (results.length <= 2) {
    // Too few to narrow — offer the ways out instead.
    if (intent.stops === 0) offers.push('include flights with a stop');
    if (intent.max_price) offers.push('lift the price cap');
    offers.push(singleDay ? 'check the days either side' : 'widen the dates');
  } else {
    if (!hidStops && intent.stops == null && mixedStops) {
      offers.push('narrow it to direct flights only');
    }
    if (intent.max_price == null && maxPrice > minPrice * 1.3) {
      // A cap that actually cuts the set: midway between cheapest and dearest,
      // rounded to a figure a person would say out loud.
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

  // Deterministic rotation: same query, same opener; different queries vary.
  const openers = ['Want me to', 'Would you like me to', 'Shall I'];
  const seed = `${intent.dest_code ?? ''}${intent.dest_city ?? ''}${intent.date ?? ''}${results.length}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  return `${openers[hash % openers.length]} ${list}?`;
};

// Markdown rendering of the blocks: bold stays `**bold**` and bullets stay
// `- `, so the copy button yields the same shape the thread shows.
const blocksToText = (blocks: ProseBlock[]): string =>
  blocks
    .map((b) =>
      b.kind === 'paragraph'
        ? nodesToMarkdown(b.nodes)
        : b.items.map((item) => `- ${nodesToMarkdown(item)}`).join('\n')
    )
    .join('\n\n');

const nodesToMarkdown = (nodes: ProseNode[]): string =>
  nodes.map((n) => (n.type === 'text' ? n.text : `**${n.text}**`)).join('');

/**
 * Build the prose answer for a non-empty result set.
 *
 * Two presentation rules decide the shape:
 *
 *  1. A set that MIXES direct and connecting flights is shown as direct flights
 *     only. Putting a 4h 34m one-stop next to a 2h 27m direct in the same list
 *     invites a comparison the user never asked for; the connecting ones are
 *     one sentence away (the closing question offers them). A comparison or a
 *     cheapest-day answer sets keepStops, because there BOTH kinds are the
 *     point. This is display only — `results` (and every logged figure that
 *     depends on it) is untouched.
 *  2. A table is used only for a UNIFORM set of more than TABLE_MIN_RESULTS
 *     flights, where every row really is like-for-like. Everything else is
 *     bullets.
 */
export const buildProseAnswer = (
  results: Flight[],
  intent: IntentJSON,
  opts: ProseOptions = {}
): ProseAnswer => {
  const directs = results.filter((f) => f.stops === 0);
  const mixed = directs.length > 0 && directs.length < results.length;
  // Only hide stops when the user has not pinned the stop count themselves.
  const hidStops = mixed && intent.stops == null && !opts.keepStops;
  const shown = hidStops ? directs : results;

  const count = shown.length;
  const stopWord = intent.stops === 0 || hidStops ? 'direct ' : intent.stops === 1 ? '1-stop ' : '';
  const constraints = describeConstraints(intent);
  const dates = new Set(shown.map((f) => f.date));
  // With a single searched date the lead sentence already names it; only repeat
  // it per flight when the results actually span several days.
  const withDate = dates.size > 1;

  // Everything quoted is picked from the flights actually on screen, so the
  // "cheapest" named at the end is never one the answer is hiding.
  const cheapest = cheapestBy(shown) as Flight;
  const found = hidStops
    ? `Of the ${plural(results.length, 'flight')}${constraints}, ${count} ${count === 1 ? 'is' : 'are'} direct`
    : `I found ${plural(count, `${stopWord}flight`)}${constraints}`;
  const blocks: ProseBlock[] = [];

  // The answer ends by offering the next move in words, as part of the same
  // sentence flow — the old refinement chips are gone, so this is what tells
  // the participant what the assistant can still do for them.
  const question = buildFollowUpQuestion(shown, intent, hidStops);
  const askNodes: ProseNode[] = question ? [{ type: 'text', text: ` ${question}` }] : [];

  if (count === 1) {
    blocks.push({
      kind: 'paragraph',
      nodes: [
        { type: 'text', text: `${found}. ` },
        ...flightSentence(shown[0], withDate),
        ...askNodes,
      ],
    });
    return {
      blocks,
      closing: [],
      text: blocksToText(blocks),
      table: null,
      tableShowsDate: withDate,
      displayed: 1,
      available: 1,
    };
  }

  const uniform = shown.every((f) => f.stops === 0) || shown.every((f) => f.stops > 0);
  const visible = opts.expanded
    ? Math.min(count, TABLE_MAX_ROWS)
    : Math.min(count, TABLE_PREVIEW_ROWS);

  if (!(uniform && count > TABLE_MIN_RESULTS)) {
    // Bullets: a mixed set, or a uniform set short enough to read as a list.
    const lead =
      count > visible
        ? `${found}. Here are the first ${visible}, sorted by ${intent.sort_by || 'cheapest'} first:`
        : `${found}:`;
    blocks.push({ kind: 'paragraph', nodes: [{ type: 'text', text: lead }] });
    blocks.push({
      kind: 'bullets',
      items: shown.slice(0, visible).map((f) => flightBullet(f, withDate)),
    });
    blocks.push({ kind: 'paragraph', nodes: [...cheapestLine(cheapest), ...askNodes] });
    return {
      blocks,
      closing: [],
      text: blocksToText(blocks),
      table: null,
      tableShowsDate: withDate,
      displayed: visible,
      available: count,
    };
  }

  // A uniform set too long to list: the table carries the comparison, and the
  // paragraphs around it stay short and end on the same recommendation.
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
        text: `. Here ${count > visible ? `are the first ${visible}` : 'they are'}, sorted by ${sortLabel} first:`,
      },
    ],
  });
  // The recommendation goes UNDER the table, where the reader lands.
  const closing: ProseBlock[] = [
    { kind: 'paragraph', nodes: [...cheapestLine(cheapest), ...askNodes] },
  ];

  return {
    blocks,
    closing,
    text: `${blocksToText(blocks)}\n\n${blocksToText(closing)}`,
    table: shown.slice(0, visible),
    tableShowsDate: withDate,
    displayed: visible,
    available: count,
  };
};
