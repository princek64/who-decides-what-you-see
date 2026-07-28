/**
 * Offline check that the assistant's own closing offers are ACTIONABLE
 * (no Groq calls).
 *
 * The answer now ends with "Want me to narrow it to direct flights only,
 * include flights with a stop, …?" — if the participant types that back and the
 * slot pipeline ignores it, they get a byte-identical answer, which is exactly
 * what happened before the wording backstops existed. Each case pairs the
 * user's wording with the slot the 8B model actually returns for it (an empty
 * slot: it names no destination, no dates, no flags) and asserts the resolved
 * slot changed the search.
 */
import { applyWordingBackstops, resolveTurnSlot, slotToIntent } from '../src/lib/slots';
import type { SlotJSON } from '../src/lib/slots';

const emptySlot = (): SlotJSON => ({}) as SlotJSON;

const prevDirect: SlotJSON = {
  destination: 'Barcelona',
  date_from: '2026-08-03',
  date_to: '2026-08-03',
  direct_only: true,
  sort: 'cheapest',
} as SlotJSON;

const prevOpen: SlotJSON = {
  destination: 'Amsterdam',
  date_from: '2026-08-05',
  date_to: '2026-08-05',
  sort: 'cheapest',
} as SlotJSON;

interface Case {
  name: string;
  prev: SlotJSON;
  text: string;
  /** What the model returns on its own for this wording. */
  parsed: SlotJSON;
  check: (slot: SlotJSON) => string | null;
}

const cases: Case[] = [
  {
    name: '"include flights with a stop" drops the direct-only constraint',
    prev: prevDirect,
    text: 'yes, include flights with a stop',
    parsed: emptySlot(),
    check: (s) =>
      s.direct_only == null ? null : `direct_only stayed ${String(s.direct_only)}`,
  },
  {
    name: '"allow a stopover" also drops it',
    prev: prevDirect,
    text: 'allow a stopover please',
    parsed: emptySlot(),
    check: (s) =>
      s.direct_only == null ? null : `direct_only stayed ${String(s.direct_only)}`,
  },
  {
    name: '"narrow it to direct flights only" applies it',
    prev: prevOpen,
    text: 'narrow it to direct flights only',
    parsed: emptySlot(),
    check: (s) => (s.direct_only === true ? null : `direct_only = ${String(s.direct_only)}`),
  },
  {
    name: '"only direct please" applies it',
    prev: prevOpen,
    text: 'only direct please',
    parsed: emptySlot(),
    check: (s) => (s.direct_only === true ? null : `direct_only = ${String(s.direct_only)}`),
  },
  {
    name: '"show the lower-CO₂ options" sets low_co2',
    prev: prevOpen,
    text: 'show the lower-CO₂ options',
    parsed: emptySlot(),
    check: (s) => (s.low_co2 === true ? null : 'low_co2 not set'),
  },
  {
    name: 'a comparison is NOT turned into a direct-only search',
    prev: prevOpen,
    text: 'compare a direct flight with one that has a stop',
    parsed: emptySlot(),
    check: (s) =>
      s.direct_only == null ? null : `direct_only = ${String(s.direct_only)} on a comparison`,
  },
  {
    name: 'carryover still works for everything else',
    prev: prevDirect,
    text: 'yes, include flights with a stop',
    parsed: emptySlot(),
    check: (s) =>
      s.destination === 'Barcelona' && s.date_from === '2026-08-03'
        ? null
        : 'destination/date were not carried',
  },
];

let failures = 0;
for (const c of cases) {
  const parsed = applyWordingBackstops({ ...c.parsed }, c.text);
  const resolved = resolveTurnSlot(c.prev, parsed, c.text);
  const problem = c.check(resolved);
  const intent = slotToIntent(resolved);
  console.log(
    `${problem ? 'FAIL' : 'ok  '}  ${c.name}` +
      `\n        stops=${String(intent.stops)} low_co2=${String(intent.low_co2)} dest=${String(intent.dest_city)}` +
      (problem ? `\n        -> ${problem}` : '')
  );
  if (problem) failures++;
}

console.log(failures === 0 ? '\nAll follow-up parse checks passed.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
