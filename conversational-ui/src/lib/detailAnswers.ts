import type { Flight } from '../hooks/useFlightFilter';
import { getCityName } from './airportMap';
import { formatFlightDate } from './utils';

/**
 * Detail answers for flights already on screen (CSV columns) — no Groq.
 * Out-of-scope topics stay on the model's off_topic path.
 */

/** Every attribute the chat can answer about a flight already shown. */
export type DetailField =
  | 'baggage'
  | 'aircraft'
  | 'cabin'
  | 'seats'
  | 'demand'
  | 'co2'
  | 'flexibility'
  | 'times'
  | 'duration'
  | 'stops'
  | 'price'
  | 'airline'
  | 'airport';

// First match wins — specific patterns (baggage, refunds) before looser ones.
const FIELD_PATTERNS: [DetailField, RegExp][] = [
  [
    'baggage',
    /\b(?:baggage|luggage|suitcase|suitcases)\b|\b(?:hand|cabin|carry[- ]?on|checked|hold|extra)\s+(?:bag|bags|luggage)\b|\b(?:bag|bags)\b.*\b(?:include[ds]?|allow\w*|free|cost|extra|policy)\b|\b(?:include[ds]?|allow\w*)\b.*\b(?:bag|bags)\b/i,
  ],
  ['aircraft', /\b(?:aircraft|plane|airbus|boeing|jet type|what (?:plane|aircraft))\b/i],
  [
    'flexibility',
    /\b(?:refund\w*|non[- ]?refundable|flexible|flexibility|change\w*\s+(?:it|the|my)?\s*(?:flight|booking|ticket)|cancel\w*)\b/i,
  ],
  ['co2', /\b(?:co2|co₂|carbon|emissions?|footprint|greenest)\b/i],
  ['seats', /\b(?:seats?\s+(?:left|remaining|available)|how many seats|availability)\b/i],
  ['demand', /\b(?:demand|busy|selling out|filling (?:up|fast)|popular)\b/i],
  ['cabin', /\b(?:cabin|economy|premium economy|business class|what class|which class)\b/i],
  ['stops', /\b(?:stops?|stopover|layover|connect\w*|change planes|via)\b/i],
  ['duration', /\b(?:how long|duration|flight time|journey time|takes?\b.*\bhours?)\b/i],
  [
    'times',
    /\b(?:what time|departure time|arrival time|when does|when do|depart\w*\b.*\?|arriv\w*\b.*\?|land)\b/i,
  ],
  ['airport', /\b(?:which airport|what airport|terminal|from where|depart from)\b/i],
  ['price', /\b(?:how much|price|cost|fare)\b/i],
  ['airline', /\b(?:which airline|what airline|who (?:is )?(?:flies|operates)|operated by)\b/i],
];

/** The field a message is asking about, or null when it is not a detail question. */
export const detectDetailField = (text: string): DetailField | null => {
  for (const [field, pattern] of FIELD_PATTERNS) if (pattern.test(text)) return field;
  return null;
};

/** Kept for baggage-specific call sites and tests. */
export const isBaggageQuestion = (text: string): boolean => detectDetailField(text) === 'baggage';

const money = (n: number) => `£${n.toFixed(2)}`;

const airportLabel = (code: string): string => {
  const full = getCityName(code) || code;
  return full.startsWith('London ') ? full.slice('London '.length) : full;
};

const describeBaggage = (policy: string): string => {
  const p = (policy || '').trim();
  if (/^cabin bag only$/i.test(p)) return 'a cabin bag only — no checked bag included';
  const m = /^(\d+)x\s*(\d+)kg checked bag included$/i.exec(p);
  if (m) {
    const bags = parseInt(m[1], 10);
    return `a cabin bag plus ${bags} checked bag${bags === 1 ? '' : 's'} up to ${m[2]}kg${bags === 1 ? '' : ' each'}`;
  }
  return p.toLowerCase();
};

const describeStops = (f: Flight): string => {
  if (f.stops === 0) return 'flies direct — no stops';
  const via = f.layover_details?.trim();
  return `has ${f.stops} stop${f.stops === 1 ? '' : 's'}${via ? ` (${via})` : ''}`;
};

// Clause after "**easyJet U21022** ".
const RENDERERS: Record<DetailField, (f: Flight) => string> = {
  baggage: (f) => `includes ${describeBaggage(f.baggage_policy)}`,
  aircraft: (f) => `is operated by ${f.aircraft_type || 'an unlisted aircraft'}`,
  cabin: (f) => {
    const cabin = f.cabin_class || 'Economy';
    return `is ${/^[aeiou]/i.test(cabin) ? 'an' : 'a'} ${cabin} fare`;
  },
  seats: (f) =>
    `has ${f.seats_remaining} seat${f.seats_remaining === 1 ? '' : 's'} left${f.demand_indicator ? ` (${f.demand_indicator.toLowerCase()} demand)` : ''}`,
  demand: (f) =>
    `is showing ${f.demand_indicator ? f.demand_indicator.toLowerCase() : 'unknown'} demand, with ${f.seats_remaining} seat${f.seats_remaining === 1 ? '' : 's'} left`,
  co2: (f) => `emits ${f.co2_kg.toFixed(1)} kg CO₂ per passenger`,
  flexibility: (f) => `is ${(f.flexibility_policy || 'Non-refundable').toLowerCase()}`,
  times: (f) =>
    `departs ${f.departure_time} on ${formatFlightDate(f.date)} and arrives ${f.arrival_time}`,
  duration: (f) => `takes ${f.duration_formatted}`,
  stops: (f) => describeStops(f),
  price: (f) => `costs ${money(f.price_gbp)}`,
  airline: (f) => `is flown by ${f.airline_name}`,
  airport: (f) =>
    `leaves from ${airportLabel(f.origin_code)} (${f.origin_code})${f.origin_terminal ? `, Terminal ${f.origin_terminal}` : ''} and lands at ${airportLabel(f.dest_code)} (${f.dest_code})`,
};

// Plural subject needs plural leading verb ("All 3 … include", not "includes").
const PLURAL_VERBS: Record<string, string> = {
  includes: 'include',
  is: 'are',
  has: 'have',
  emits: 'emit',
  departs: 'depart',
  takes: 'take',
  flies: 'fly',
  costs: 'cost',
  leaves: 'leave',
};

const pluralise = (clause: string): string => {
  const [first, ...rest] = clause.split(' ');
  return [PLURAL_VERBS[first] ?? first, ...rest].join(' ');
};

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const pickBy = (pool: Flight[], better: (a: Flight, b: Flight) => boolean): Flight => {
  let best = pool[0];
  for (const f of pool) if (better(f, best)) best = f;
  return best;
};

/**
 * Which flights the question is about (wording + optional detail_target).
 * Superlatives resolve by value, never list position.
 */
export const resolveTargets = (text: string, pool: Flight[], hint?: string | null): Flight[] => {
  const haystack = normalise(`${text} ${hint ?? ''}`);

  const byNumber = pool.filter((f) => f.flight_number && haystack.includes(normalise(f.flight_number)));
  if (byNumber.length > 0) return byNumber;

  const byAirline = pool.filter((f) => f.airline_name && haystack.includes(normalise(f.airline_name)));
  if (byAirline.length > 0) return byAirline;

  if (/\b(?:cheapest|cheaper|lowest price|best price)\b/i.test(`${text} ${hint ?? ''}`)) {
    return [pickBy(pool, (a, b) => a.price_gbp < b.price_gbp)];
  }
  if (/\b(?:fastest|quickest|shortest)\b/i.test(`${text} ${hint ?? ''}`)) {
    return [pickBy(pool, (a, b) => a.duration_mins < b.duration_mins)];
  }
  if (/\b(?:greenest|lowest co2|lowest co₂|least carbon)\b/i.test(`${text} ${hint ?? ''}`)) {
    return [pickBy(pool, (a, b) => a.co2_kg < b.co2_kg)];
  }
  if (/\b(?:dearest|most expensive|priciest)\b/i.test(`${text} ${hint ?? ''}`)) {
    return [pickBy(pool, (a, b) => a.price_gbp > b.price_gbp)];
  }
  return [];
};

/**
 * Detail reply for on-screen flights, or null when nothing to answer.
 * `field` / `targetHint` come from the model when it classified the message.
 */
export const buildDetailAnswer = (
  text: string,
  pool: Flight[],
  field?: DetailField | null,
  targetHint?: string | null
): string | null => {
  if (pool.length === 0) return null;
  const attribute = field ?? detectDetailField(text);
  if (!attribute) return null;
  const render = RENDERERS[attribute];

  const targets = resolveTargets(text, pool, targetHint);
  if (targets.length > 0) {
    const lines = targets
      .slice(0, 4)
      .map((f) => `**${f.airline_name} ${f.flight_number}** ${render(f)}.`);
    const extra =
      targets.length > 4
        ? ` (${targets.length - 4} more in that set — ask about one by flight number.)`
        : '';
    return lines.join(' ') + extra;
  }

  // Shared answer once; otherwise list differences.
  const rendered = pool.map((f) => render(f));
  const unique = [...new Set(rendered)];
  if (unique.length === 1) {
    return pool.length === 1
      ? `That flight ${unique[0]}.`
      : `All ${pool.length} of those flights ${pluralise(unique[0])}.`;
  }
  const lines = pool
    .slice(0, 4)
    .map((f) => `**${f.airline_name} ${f.flight_number}** ${render(f)}.`);
  const extra =
    pool.length > 4
      ? ` (Those are the first 4 of ${pool.length} — ask about one by flight number.)`
      : '';
  return lines.join(' ') + extra;
};

/** Baggage-only entry point for existing call sites and tests. */
export const buildBaggageAnswer = (text: string, pool: Flight[]): string | null =>
  buildDetailAnswer(text, pool, 'baggage');

/** Detail asked with nothing on screen to attach it to. */
export const DETAIL_NO_CONTEXT =
  "I can answer that for any flight I've found — search for a route first (say, \"flights to Barcelona on 3 August\") and then ask me about one of them.";

/** Back-compat alias. */
export const BAGGAGE_NO_CONTEXT = DETAIL_NO_CONTEXT;
