/**
 * Golden fixtures: the five scripted study tasks (+ common paraphrases) must
 * produce equivalent FILTER intents across conversational-ui and generative-ui.
 *
 * Methodology note — cite as evidence of parity:
 *   "Verified via fixture tests that the five scripted tasks and common
 *    paraphrasings produce equivalent filter intents across interfaces."
 *
 * What this checks (instrument moments):
 *   - destination, dates / date window, stops, max_price, departure_after,
 *     weekend, direction, sort — the filters SEQ/SUS/custom items score against.
 * What this deliberately ignores:
 *   - layout / prose / carousel caps (presentation, not the measured filter).
 *   - free-form off-script exploration (documented limitation, not a bug chase).
 *
 * PROTOCOL RULE (testing script):
 *   Scripted task wording must always be fully dated (explicit day, or an
 *   explicit window like "next three months"). Undated city follow-ups during
 *   a task can hit the ask-vs-search-all path; dated scripts sidestep that for
 *   anything that matters for scoring. Task 5 (open explore, no city) is the
 *   exception — undated budget explore is intentional.
 *
 * Run from conversational-ui/ (needs its node_modules for tsx):
 *   npx tsx ../scripts/study-task-parity-check.mts
 */
import {
  firstMissingRequiredSlot,
  slotToIntent,
} from '../conversational-ui/src/lib/slots';
import { tryLocalSlot } from '../conversational-ui/src/lib/studyTasks';
import { getSearchAnchor as convAnchor } from '../conversational-ui/src/constants/prompts';
import {
  datesQuestionFor,
  needsDatesClarification,
  tryLocalIntent,
} from '../generative-ui/src/lib/intentBackstops';
import { getSearchAnchor as genAnchor } from '../generative-ui/src/constants/prompts';

/** Normalized filter core — presentation fields stripped. */
type FilterCore = {
  dest_city: string | null;
  date_from: string | null;
  date_to: string | null;
  direction: string;
  stops: number | null;
  max_price: number | null;
  departure_after: string | null;
  weekend: boolean;
  sort_by: string;
  /** True when the UI must ask for dates instead of searching. */
  needs_dates_ask: boolean;
};

const normCity = (c?: string | null): string | null => {
  const t = c?.trim();
  return t ? t.toLowerCase() : null;
};

const fromConv = (text: string): FilterCore | null => {
  const slot = tryLocalSlot(text, false);
  if (!slot) return null;
  const intent = slotToIntent(slot);
  const missing = firstMissingRequiredSlot(slot);
  let date_from = intent.date_from?.trim() || null;
  let date_to = intent.date_to?.trim() || null;
  return {
    dest_city: normCity(intent.dest_city),
    date_from,
    date_to,
    direction: intent.direction ?? 'outbound',
    stops: intent.stops ?? null,
    max_price: intent.max_price ?? null,
    departure_after: intent.departure_after?.trim() || null,
    weekend: Boolean(intent.weekend_only),
    sort_by: intent.sort_by ?? 'cheapest',
    needs_dates_ask: missing === 'dates',
  };
};

const fromGen = (text: string): FilterCore | null => {
  const intent = tryLocalIntent(text, false);
  if (!intent) return null;
  // Generative stores a single day on `date`; ranges on date_from/date_to.
  let date_from = intent.date_from?.trim() || intent.date?.trim() || null;
  let date_to = intent.date_to?.trim() || intent.date?.trim() || null;
  return {
    dest_city: normCity(intent.dest_city),
    date_from,
    date_to,
    direction: intent.direction ?? 'outbound',
    stops: intent.stops ?? null,
    max_price: intent.max_price ?? null,
    departure_after: intent.departure_after?.trim() || null,
    weekend: Boolean(intent.weekend),
    sort_by: intent.sort_by ?? 'cheapest',
    needs_dates_ask: needsDatesClarification(intent),
  };
};

const coreKey = (c: FilterCore): string =>
  JSON.stringify({
    dest_city: c.dest_city,
    date_from: c.date_from,
    date_to: c.date_to,
    direction: c.direction,
    stops: c.stops,
    max_price: c.max_price,
    departure_after: c.departure_after,
    weekend: c.weekend,
    sort_by: c.sort_by,
    needs_dates_ask: c.needs_dates_ask,
  });

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const assertParity = (label: string, text: string) => {
  const conv = fromConv(text);
  const gen = fromGen(text);
  check(`${label}: conversational local slot`, conv != null);
  check(`${label}: generative local intent`, gen != null);
  if (!conv || !gen) return;
  const same = coreKey(conv) === coreKey(gen);
  check(
    `${label}: filter cores match`,
    same,
    same ? '' : `\n    conv=${coreKey(conv)}\n    gen =${coreKey(gen)}`
  );
};

console.log('### protocol — search anchors agree');
check('getSearchAnchor equal across apps', convAnchor() === genAnchor(), `${convAnchor()} vs ${genAnchor()}`);

console.log('\n### protocol — scripted tasks are fully dated (except T5 explore)');
const SCRIPT_CANONICAL = {
  T1: 'Find the cheapest direct one-way flight from London to Barcelona on October 16, 2026.',
  T2: 'Find a one-way flight to Amsterdam on November 21, 2026 that leaves after 6pm and costs under £80.',
  T3: "You're flying to Rome on November 15, 2026. Compare a one-way direct flight with a one-way flight with one stop.",
  T4: 'Find the cheapest return trip to Paris for a weekend in the next three months.',
  T5: 'You have £150 and a free weekend, where could you go?',
} as const;

{
  const t1 = fromConv(SCRIPT_CANONICAL.T1)!;
  const t2 = fromConv(SCRIPT_CANONICAL.T2)!;
  const t3 = fromConv(SCRIPT_CANONICAL.T3)!;
  const t4 = fromConv(SCRIPT_CANONICAL.T4)!;
  const t5 = fromConv(SCRIPT_CANONICAL.T5)!;
  check('T1 script is dated', Boolean(t1.date_from) && !t1.needs_dates_ask);
  check('T2 script is dated', Boolean(t2.date_from) && !t2.needs_dates_ask);
  check('T3 script is dated', Boolean(t3.date_from) && !t3.needs_dates_ask);
  check(
    'T4 script has a window (not a single day)',
    Boolean(t4.date_from && t4.date_to && t4.date_from !== t4.date_to) && !t4.needs_dates_ask
  );
  check('T5 open explore needs no dates ask', !t5.needs_dates_ask && t5.dest_city == null);
}

console.log('\n### golden — five scripted tasks (canonical wording)');
for (const [id, text] of Object.entries(SCRIPT_CANONICAL)) {
  assertParity(id, text);
}

console.log('\n### golden — common paraphrases (still fully dated where city-named)');
const PARAPHRASES: Array<{ id: string; text: string }> = [
  {
    id: 'T1p',
    text: 'Cheapest direct one-way to Barcelona on 16 October 2026',
  },
  {
    id: 'T2p',
    text: 'One-way Amsterdam on 21 November 2026 after 6pm under £80',
  },
  {
    id: 'T3p',
    text: 'Compare direct vs one-stop one-way to Rome on November 15 2026',
  },
  {
    id: 'T4p',
    text: 'Cheapest weekend return to Paris in the next 3 months',
  },
  {
    id: 'T5p',
    text: 'I have £150 and a free weekend, where can I go?',
  },
];
for (const { id, text } of PARAPHRASES) {
  assertParity(id, text);
}

console.log('\n### undated city mid-task — both UIs must ASK (not search-all)');
const UNDATED: Array<{ id: string; text: string; dest: string }> = [
  {
    id: 'T2-undated',
    text: 'Find a one-way flight to Amsterdam that leaves after 6pm and costs under £80.',
    dest: 'amsterdam',
  },
  {
    id: 'T3-undated',
    text: 'Compare a one-way direct flight to Rome with a one-way flight with one stop.',
    dest: 'rome',
  },
  {
    id: 'bare-city',
    text: 'Flights to Barcelona',
    dest: 'barcelona',
  },
];
for (const { id, text, dest } of UNDATED) {
  const conv = fromConv(text);
  const gen = fromGen(text);
  check(`${id}: conversational asks for dates`, Boolean(conv?.needs_dates_ask));
  check(`${id}: generative asks for dates`, Boolean(gen?.needs_dates_ask));
  check(`${id}: dest preserved (conv)`, conv?.dest_city === dest, String(conv?.dest_city));
  check(`${id}: dest preserved (gen)`, gen?.dest_city === dest, String(gen?.dest_city));
  if (conv && gen) {
    // Dates empty on both; other filters still align.
    const stripDates = (c: FilterCore) =>
      coreKey({ ...c, date_from: null, date_to: null, needs_dates_ask: true });
    check(
      `${id}: undated filter cores match`,
      stripDates(conv) === stripDates(gen),
      stripDates(conv) === stripDates(gen)
        ? ''
        : `\n    conv=${stripDates(conv)}\n    gen =${stripDates(gen)}`
    );
  }
}

console.log('\n### undated ask wording (generative matches conversational one-way)');
{
  const intent = tryLocalIntent(
    'Find a one-way flight to Amsterdam that leaves after 6pm and costs under £80.',
    false
  )!;
  check('needsDatesClarification', needsDatesClarification(intent));
  check('dates question is Which dates?', datesQuestionFor(intent) === 'Which dates?');
}

console.log('\n### T5 explore stays undated-OK (no ask)');
{
  const conv = fromConv(SCRIPT_CANONICAL.T5)!;
  const gen = fromGen(SCRIPT_CANONICAL.T5)!;
  check('T5 conv no dates ask', !conv.needs_dates_ask);
  check('T5 gen no dates ask', !gen.needs_dates_ask);
  check('T5 both max_price 150', conv.max_price === 150 && gen.max_price === 150);
  check('T5 both weekend', conv.weekend && gen.weekend);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll study-task parity fixtures passed.');
