import React from 'react';
import type { ChatMessage } from '../hooks/useGenChat';
import type { Flight, IntentJSON } from '../hooks/useFlightFilter';
import { searchStartDate } from '../hooks/useFlightFilter';
import { GenResponse } from './GenResponse';
import { Plane, CreditCard, Leaf, RefreshCw, AlertTriangle, Calendar, MapPin } from 'lucide-react';
import { getCityName } from '../lib/airportMap';
import { DATA_MAX } from '../constants/prompts';

// "5 Aug 2026" — concise, no weekday, for the assumed-dates range badge.
const formatRangeDate = (date: string): string =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// The window an undated search actually covers: today through the last day in
// the dataset. Derived from searchStartDate(), the same function the filter
// bounds on, so the badge can never advertise a range the search did not use.
// Called at render rather than module load so a tab left open overnight does
// not keep quoting yesterday.
const assumedDatesLabel = (): string =>
  `${formatRangeDate(searchStartDate())} – ${formatRangeDate(DATA_MAX)}`;

type RefinePatch = Partial<IntentJSON & { layout?: string }>;

interface GenScreenProps {
  /** The user query this screen answers — shown as the breadcrumb tag */
  query: string;
  message: ChatMessage;
  onToggleExpand: (messageId: string) => void;
  onSelectFlight: (flight: Flight) => void;
  /** Present only while idle: sends a fresh follow-up query (via the LLM) */
  onQuickReply?: (text: string) => void;
  /** Present only while idle: composes a refinement onto THIS view's intent */
  onRefine?: (patch: RefinePatch, label: string) => void;
  /** Present only while idle: re-runs the last query */
  onRetry?: () => void;
}

// Contextual refinements, derived from what the last search did NOT constrain.
// Each carries a structured patch so the click composes onto the current view's
// intent (prior slots persist); the label is logged like a typed message.
const buildFollowUps = (message: ChatMessage): { label: string; patch: RefinePatch }[] => {
  if (!message.flights || message.flights.length === 0) return [];
  const intent = message.intent || {};
  const chips: { label: string; patch: RefinePatch }[] = [];
  // The comparison template exists to show direct AND 1-stop side by side, so a
  // "direct only" refinement would empty the 1-stop column and defeat it — omit
  // that chip while this view is a comparison.
  const isComparison = (message.layout ?? intent.layout) === 'comparison';
  if (intent.stops == null && !isComparison) chips.push({ label: 'Only show direct flights', patch: { stops: 0 } });
  if (intent.max_price == null) chips.push({ label: 'Only flights under £100', patch: { max_price: 100 } });
  if ((intent.sort_by || 'cheapest') !== 'fastest') chips.push({ label: 'Sort them by fastest', patch: { sort_by: 'fastest' } });
  if (!intent.low_co2) chips.push({ label: 'Prefer lower CO₂ options', patch: { low_co2: true } });
  return chips.slice(0, 3);
};

// Each layout claims its own footprint on the canvas — this is the visible
// difference between "the AI rebuilt the screen" and "a chat column".
const LAYOUT_WIDTHS: Record<string, string> = {
  highlight: 'max-w-2xl',
  comparison: 'max-w-5xl',
  calendar: 'max-w-6xl',
  trend: 'max-w-4xl',
  destinations: 'max-w-6xl',
  map: 'max-w-[1400px]',
  itinerary: 'max-w-3xl',
  budget: 'max-w-4xl',
  ranked: 'max-w-3xl',
  multileg: 'max-w-3xl',
  alert: 'max-w-2xl',
  grid: 'max-w-6xl',
};

export const GenScreen: React.FC<GenScreenProps> = ({
  query,
  message,
  onToggleExpand,
  onSelectFlight,
  onQuickReply,
  onRefine,
  onRetry,
}) => {
  const isSystem = message.role === 'system';
  const layout = message.layout ?? 'grid';
  const hasGenContent =
    !isSystem && (layout === 'alert' || (message.flights && message.flights.length > 0));
  const followUps = onRefine && !isSystem ? buildFollowUps(message) : [];

  // Live stats shown only under the plain grid layout (other layouts carry
  // their own summaries). Plain loop: spread args crash on huge result sets.
  const getStatsSummary = () => {
    if (layout !== 'grid' || !hasGenContent) return null;
    const flights = message.flights;
    if (!flights || flights.length === 0) return null;

    let cheapest = Infinity;
    let totalCo2 = 0;
    for (const f of flights) {
      if (f.price_gbp < cheapest) cheapest = f.price_gbp;
      totalCo2 += f.co2_kg;
    }

    return {
      total: flights.length,
      cheapest,
      avgCo2: totalCo2 / flights.length,
    };
  };

  const stats = getStatsSummary();

  // Date assumption: when the query named no date, the search spanned the whole
  // dataset window. State that explicitly (mirrors how the origin is assumed to
  // be London) so the user knows what range produced these results.
  const intent = message.intent ?? {};
  const noDates = !intent.date?.trim() && !intent.date_from?.trim() && !intent.date_to?.trim();
  const showDateAssumption = hasGenContent && layout !== 'alert' && noDates;

  // Origin assumption: this dataset only departs London, so every result rests
  // on that assumption — state it on EVERY layout rather than leaving the user
  // to infer it from airport codes. On the destinations grid there are no codes
  // shown at all, so without this the origin was entirely invisible.
  const showOriginAssumption = hasGenContent && layout !== 'alert';
  const originLabel = intent.origin_code?.trim()
    ? `${getCityName(intent.origin_code.trim())} (${intent.origin_code.trim().toUpperCase()})`
    : 'all London airports';

  return (
    <div className="w-full px-4 md:px-8 py-6">
      {isSystem ? (
        /* Connection/system errors take over the canvas as a centered notice */
        <div className="max-w-md mx-auto mt-10 bg-card border border-border rounded-lg p-5 flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-accent-amber shrink-0 mt-0.5" />
          <div className="text-left">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono">Just a moment</h4>
            <p className="text-xs text-muted-foreground font-normal mt-1 leading-relaxed">{message.text}</p>
            {/* Re-sends the same query, so the participant never has to retype
                a task query the rate limiter swallowed. */}
            {message.retryable && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-foreground border border-border hover:border-white/20 rounded-full py-1.5 px-3.5 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Try again
              </button>
            )}
          </div>
        </div>
      ) : hasGenContent ? (
        /* The generative area, at the width this layout wants */
        <div className={`mx-auto w-full ${LAYOUT_WIDTHS[layout] ?? 'max-w-6xl'}`}>
          {/* Query header — mono eyebrow + the user's words as the headline,
              with the AI's one-line summary as a subtitle. */}
          <div className="mb-6">
            <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground mb-2">Query</div>
            {query && (
              <h1 className="text-3xl md:text-4xl font-heading font-semibold text-foreground tracking-tight text-balance">
                {query}
              </h1>
            )}
            {message.text && (
              <p className="mt-2 text-sm md:text-base text-muted-foreground leading-relaxed">{message.text}</p>
            )}
            {(showOriginAssumption || showDateAssumption) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {showOriginAssumption && (
                  <span
                    className="inline-flex items-center gap-1.5 bg-muted border border-border rounded-full px-3 py-1 text-[11px] font-medium text-muted-foreground"
                    title="This search only covers flights departing London"
                  >
                    <MapPin className="w-3 h-3" />
                    Searching from {originLabel}
                  </span>
                )}
                {showDateAssumption && (
                  <span
                    className="inline-flex items-center gap-1.5 bg-muted border border-border rounded-full px-3 py-1 text-[11px] font-medium text-muted-foreground"
                    title="No dates given — searched every date from today onwards"
                  >
                    <Calendar className="w-3 h-3" />
                    Assumed dates: any, {assumedDatesLabel()}
                  </span>
                )}
              </div>
            )}
          </div>

          <GenResponse
            message={message}
            onToggleExpand={onToggleExpand}
            onSelectFlight={onSelectFlight}
            onQuickReply={onQuickReply}
            onRefine={onRefine}
          />

          {/* Stats strip (grid layout only) */}
          {stats && (
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="inline-flex items-center gap-1.5 bg-muted border border-border rounded-full px-3.5 py-1.5 text-xs font-medium text-foreground">
                <Plane className="w-3 h-3 text-muted-foreground" />
                <span className="font-mono tabular-nums">{stats.total}</span> flight{stats.total === 1 ? '' : 's'}
              </span>
              <span className="inline-flex items-center gap-1.5 bg-muted border border-border rounded-full px-3.5 py-1.5 text-xs font-medium text-foreground">
                <CreditCard className="w-3 h-3 text-muted-foreground" />
                <span className="font-mono tabular-nums">from £{stats.cheapest.toFixed(2)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 bg-muted border border-border rounded-full px-3.5 py-1.5 text-xs font-medium text-accent-green">
                <Leaf className="w-3 h-3 text-accent-green" />
                <span className="font-mono tabular-nums">avg {stats.avgCo2.toFixed(1)} kg CO₂</span>
              </span>
            </div>
          )}
        </div>
      ) : (
        /* Text-only guidance (too broad / off-topic / unknown destination) */
        <div className="max-w-xl mx-auto mt-10">
          <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground mb-2">Query</div>
          {query && <h1 className="text-2xl md:text-3xl font-heading font-semibold text-foreground tracking-tight mb-3">{query}</h1>}
          <p className="text-base text-muted-foreground leading-relaxed">{message.text}</p>
        </div>
      )}

      {/* Refine chips — part of the generated screen, not chat suggestions */}
      {followUps.length > 0 && (
        <div className={`mx-auto w-full ${LAYOUT_WIDTHS[layout] ?? 'max-w-6xl'} mt-8 pt-5 border-t border-border`}>
          <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground mb-2.5">
            Refine this view
          </div>
          <div className="flex flex-wrap gap-2">
            {followUps.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => onRefine?.(chip.patch, chip.label)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground border border-border hover:border-white/20 rounded-full py-2 px-4 transition-colors"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Screen meta: which template rendered + regenerate */}
      {!isSystem && (
        <div className={`mx-auto w-full ${LAYOUT_WIDTHS[layout] ?? 'max-w-6xl'} mt-6 flex items-center gap-3 text-[10px] font-mono text-muted-foreground/60 select-none`}>
          {hasGenContent && <span>[{layout}]</span>}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              title="Regenerate this view"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              regenerate
            </button>
          )}
        </div>
      )}
    </div>
  );
};
