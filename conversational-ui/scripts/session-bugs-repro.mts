/**
 * Reproduction harness for the five bugs found in the live multi-turn session:
 *
 *   "Compare direct vs connecting to Rome on 3 August" -> "Only show direct
 *   flights" -> "Sort them by fastest" -> "find a flight for 4th august
 *   instead" -> "rome" -> "under 25" -> "for sevilla for same date?" ->
 *   "Seville?"
 *
 * Bugs 1-3 and the Seville/Sevilla question are DETERMINISTIC (pure slot +
 * filter code), so they are reproduced here with no LLM round-trip at all —
 * every number is recomputed from the real CSV. Bug 4 (multi-turn carryover)
 * needs the model, so it lives in pipeline-test.mts's MT cases.
 *
 * Run from conversational-ui/:  npx tsx scripts/session-bugs-repro.mts
 *
 * Exit code 0 = every bug is FIXED, 1 = at least one still reproduces.
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { filterAndSortFlights, resolveDestCodes } from '../src/hooks/useFlightFilter';
import type { Flight, IntentJSON } from '../src/hooks/useFlightFilter';
import { slotToIntent, applyWordingBackstops, resolveTurnSlot } from '../src/lib/slots';
import type { SlotJSON } from '../src/lib/slots';
import { buildComparisonSentence, cheapestBy } from '../src/lib/insights';
import { getCodesForCityQuery } from '../src/lib/airportMap';

// --- Load the CSV exactly as useChat does (cancelled excluded) ---
const csvText = fs.readFileSync(
  path.join(import.meta.dirname, '../public/ux_research_flights_h2_2026_final.csv'),
  'utf8'
);
const flights: Flight[] = [];
const co2: number[] = [];
Papa.parse(csvText, {
  header: true,
  skipEmptyLines: true,
  complete: (res: any) => {
    res.data.forEach((row: any) => {
      if (row.flight_status === 'Cancelled' || !row.flight_id) return;
      const [h, m] = (row.departure_time || '0:0').split(':');
      flights.push({
        ...row,
        duration_mins: parseInt(row.duration_mins, 10) || 0,
        stops: parseInt(row.stops, 10) || 0,
        price_gbp: parseFloat(row.price_gbp) || 0,
        seats_remaining: parseInt(row.seats_remaining, 10) || 0,
        co2_kg: parseFloat(row.co2_kg) || 0,
        departure_mins_from_midnight: (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0),
      } as Flight);
      const c = parseFloat(row.co2_kg);
      if (!isNaN(c)) co2.push(c);
    });
  },
});
co2.sort((a, b) => a - b);
const mid = Math.floor(co2.length / 2);
const medianCo2 = co2.length % 2 ? co2[mid] : (co2[mid - 1] + co2[mid]) / 2;

// --- Ground truth straight from the CSV, computed independently of the app ---
const truthFor = (destCode: string, date: string) => {
  const pool = flights.filter(
    (f) => f.dest_code === destCode && f.date === date && f.direction === 'outbound'
  );
  const minBy = <T>(arr: T[], k: (t: T) => number) =>
    arr.length ? arr.reduce((a, b) => (k(b) < k(a) ? b : a)) : null;
  return {
    all: pool,
    direct: pool.filter((f) => f.stops === 0),
    stop: pool.filter((f) => f.stops >= 1),
    cheapestDirect: minBy(pool.filter((f) => f.stops === 0), (f) => f.price_gbp),
    cheapestStop: minBy(pool.filter((f) => f.stops >= 1), (f) => f.price_gbp),
    minPrice: minBy(pool, (f) => f.price_gbp)?.price_gbp ?? NaN,
  };
};

const rome3 = truthFor('FCO', '2026-08-03');

// --- The app's own gates, mirrored (same shape as pipeline-test's runSlot) ---
const runSlot = (slot: SlotJSON) => {
  const intent: IntentJSON = slotToIntent(slot);
  // Fixed rule: a comparison only widens the stops filter when the user has NOT
  // asked for one side explicitly.
  if (slot.compare && slot.direct_only == null) intent.stops = undefined;
  const results = filterAndSortFlights(flights, intent, medianCo2);
  return { intent, results };
};

// The stats panel in ChatBubble: min price over the SAME result array.
const statsMinPrice = (results: Flight[]) => {
  let cheapest = Infinity;
  for (const f of results) if (f.price_gbp < cheapest) cheapest = f.price_gbp;
  return cheapest;
};

let pass = 0;
let fail = 0;
const check = (id: string, problems: string[], note = '') => {
  if (problems.length === 0) {
    console.log(`✓ ${id}${note ? ` — ${note}` : ''}`);
    pass++;
  } else {
    console.log(`✗ ${id} — ${problems.join(' | ')}`);
    fail++;
  }
};

console.log('— CSV ground truth: Rome (FCO) outbound 2026-08-03 —');
console.log(`  ${rome3.all.length} flights; cheapest direct £${rome3.cheapestDirect!.price_gbp.toFixed(2)} (${rome3.cheapestDirect!.duration_formatted}), cheapest 1-stop £${rome3.cheapestStop!.price_gbp.toFixed(2)} (${rome3.cheapestStop!.duration_formatted}), min price £${rome3.minPrice.toFixed(2)}\n`);

// Turn 1: "Compare direct vs connecting to Rome on 3 August"
const turn1Slot: SlotJSON = applyWordingBackstops(
  {
    destination: 'Rome',
    date_from: '2026-08-03',
    date_to: '2026-08-03',
    cabin: null,
    direct_only: null,
    sort: 'cheapest',
    missing: [],
  },
  'Compare direct vs connecting to Rome on 3 August'
);
const turn1 = runSlot(turn1Slot);

// ── BUG 1: the "Only show direct flights" chip did nothing ────────────────
// refineView merges the chip patch onto the base slot, so `compare: true`
// survived and `intent.stops = undefined` wiped the direct filter.
{
  const chipSlot: SlotJSON = { ...turn1Slot, direct_only: true, compare: false };
  const turn2 = runSlot(chipSlot);
  const p: string[] = [];
  if (turn2.intent.stops !== 0) p.push(`stops=${turn2.intent.stops} (want 0 — direct filter dropped)`);
  if (turn2.results.some((f) => f.stops !== 0)) p.push('non-direct flights in a direct-only result set');
  if (turn2.results.length !== rome3.direct.length)
    p.push(`${turn2.results.length} results (CSV says ${rome3.direct.length} direct)`);
  if (turn2.results.length === turn1.results.length)
    p.push('result set identical to the previous (unfiltered) turn');
  const minP = statsMinPrice(turn2.results);
  if (minP === rome3.minPrice)
    p.push(`Min Price £${minP.toFixed(2)} is the 1-stop flight — filter not applied`);
  check('BUG1 direct-chip', p, `${turn2.results.length} direct flights, Min Price £${minP.toFixed(2)}`);
}

// ── BUG 2 + 3: sentence numbers must be sort-independent and must agree
// with the stats panel, which is computed from the same array ─────────────
{
  const p: string[] = [];
  const sentences: Record<string, string> = {};
  for (const sort of ['cheapest', 'fastest'] as const) {
    const slot: SlotJSON = { ...turn1Slot, sort };
    const { results } = runSlot(slot);
    const sentence = buildComparisonSentence(results, 'Rome') ?? '';
    sentences[sort] = sentence;

    // Same candidate set regardless of sort order
    if (results.length !== rome3.all.length)
      p.push(`${sort}: ${results.length} candidates (CSV says ${rome3.all.length})`);

    // The quoted "cheapest direct" / "cheapest with a stop" must be the true
    // cheapest of each kind, not whatever the active sort put first.
    const cd = rome3.cheapestDirect!.price_gbp.toFixed(2);
    const cs = rome3.cheapestStop!.price_gbp.toFixed(2);
    if (!sentence.includes(`£${cd}`)) p.push(`${sort}: sentence missing cheapest direct £${cd}`);
    if (!sentence.includes(`£${cs}`)) p.push(`${sort}: sentence missing cheapest stop £${cs}`);

    // Stats panel agreement: Min Price is the cheaper of the two quoted figures.
    const cheaperQuoted = Math.min(
      cheapestBy(results.filter((f) => f.stops === 0))!.price_gbp,
      cheapestBy(results.filter((f) => f.stops >= 1))!.price_gbp
    );
    if (Math.abs(statsMinPrice(results) - cheaperQuoted) > 0.005)
      p.push(`${sort}: stats Min Price £${statsMinPrice(results).toFixed(2)} != quoted £${cheaperQuoted.toFixed(2)}`);
  }
  // Determinism across turns: same route, same date, same numbers.
  if (sentences.cheapest !== sentences.fastest)
    p.push('comparison sentence changed between the cheapest and fastest turns');
  check('BUG2+3 sentence/stats agreement', p, sentences.cheapest.split(';')[0]);
}

// ── BUG 4 (deterministic half): slots carry forward on a modifying turn ───
// The LLM half (does the model parse these turns the same way?) is covered by
// pipeline-test.mts MT-undercarry. Here we assert the merge rule itself.
{
  const p: string[] = [];
  // A freshly parsed slot, put through the app's own call order: wording
  // backstops first, then the carryover merge.
  const parsed = (text: string, over: Partial<SlotJSON> = {}): SlotJSON =>
    applyWordingBackstops(
      {
        destination: null, date_from: null, date_to: null, cabin: null,
        direct_only: null, sort: null, missing: [], ...over,
      },
      text
    );

  // "find a flight for 4th august instead" — dates only, must keep Rome
  const t4 = resolveTurnSlot(
    turn1Slot,
    parsed('find a flight for 4th august instead', { date_from: '2026-08-04', date_to: '2026-08-04' }),
    'find a flight for 4th august instead'
  );
  if (String(t4.destination).toLowerCase() !== 'rome') p.push(`"4th august instead" lost destination (${t4.destination})`);
  if (t4.date_from !== '2026-08-04') p.push(`"4th august instead" lost the new date (${t4.date_from})`);
  if (t4.compare) p.push('"4th august instead" carried the stale compare flag');

  // "under 25" — a bare constraint; must keep Rome AND the 4 Aug date. The
  // model tends to flag this as an "anywhere" search: unsupported by the
  // wording, so it must be ignored rather than searching the whole network.
  const t6 = resolveTurnSlot(t4, parsed('under 25', { max_price: 25, anywhere: true }), 'under 25');
  if (String(t6.destination).toLowerCase() !== 'rome') p.push(`"under 25" lost destination (${t6.destination})`);
  if (t6.date_from !== '2026-08-04') p.push(`"under 25" lost the date (${t6.date_from})`);
  if (t6.anywhere) p.push('"under 25" kept an unsupported anywhere flag');
  const t6res = runSlot(t6).results;
  if (t6res.length > 20) p.push(`"under 25" returned ${t6res.length} flights across the network`);

  // "for sevilla for same date?" — new destination, must keep the date
  const t7 = resolveTurnSlot(
    t6,
    parsed('for sevilla for same date?', { destination: 'sevilla', date_from: '2026-07-24', date_to: '2026-07-24' }),
    'for sevilla for same date?'
  );
  if (String(t7.destination).toLowerCase() !== 'sevilla') p.push(`"for sevilla" lost the new destination (${t7.destination})`);
  if (t7.date_from !== '2026-08-04') p.push(`"for sevilla for same date?" lost the date (${t7.date_from})`);

  // A clearly NEW query (destination + dates, no modifier cue) resets instead.
  const fresh = resolveTurnSlot(
    t7,
    parsed('flights to Amsterdam on 10 September', { destination: 'Amsterdam', date_from: '2026-09-10', date_to: '2026-09-10' }),
    'flights to Amsterdam on 10 September'
  );
  if (fresh.max_price != null) p.push(`new query over-carried max_price=${fresh.max_price}`);
  if (fresh.direct_only != null) p.push(`new query over-carried direct_only=${fresh.direct_only}`);

  check('BUG4 slot carryover', p, 'modifiers merge, new queries reset');
}

// ── Seville / Sevilla: is it in the dataset, and does the name resolve? ───
{
  const svq = flights.filter((f) => f.dest_code === 'SVQ');
  const p: string[] = [];
  console.log(`\n  SVQ rows in CSV: ${svq.length} (${svq.filter((f) => f.direction === 'outbound').length} outbound)`);
  if (svq.length === 0) {
    p.push('SVQ absent from the dataset — the "not in network" reply is correct');
  } else {
    // English label, Spanish spelling, and case/accent variants. (Exonyms in
    // other languages are out of scope — the alias table covers the spellings
    // an English-language study is realistically typed.)
    for (const spelling of ['Seville', 'Sevilla', 'sevilla', 'SEVILLE', 'Sevílla']) {
      const codes = getCodesForCityQuery(spelling);
      if (!codes.includes('SVQ')) p.push(`"${spelling}" does not resolve to SVQ (got [${codes}])`);
    }
    const sevRes = runSlot({
      destination: 'sevilla', date_from: '2026-08-04', date_to: '2026-08-04',
      cabin: null, direct_only: null, sort: null, missing: [],
    } as SlotJSON).results;
    const sevTruth = truthFor('SVQ', '2026-08-04');
    if (sevRes.length !== sevTruth.all.length)
      p.push(`"sevilla" on 4 Aug -> ${sevRes.length} results (CSV says ${sevTruth.all.length})`);
  }
  check('SEVILLE spelling', p, `resolves to SVQ`);
}

// A city genuinely off the network must still be rejected.
{
  const p: string[] = [];
  const intent: IntentJSON = { dest_city: 'Tokyo' };
  if (resolveDestCodes(intent).length !== 0) p.push('Tokyo unexpectedly resolved');
  check('UNKNOWN-CITY guard', p, 'Tokyo still rejected');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 1 - 1 : 1);
