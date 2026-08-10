import React from 'react';
import type { ChatMessage } from '../hooks/useGenChat';
import { getCityName } from '../lib/airportMap';
import { ChevronDown, ChevronUp, History } from 'lucide-react';

/**
 * A superseded screen, collapsed to one line.
 *
 * The canvas renders a single generated screen, so until now a new query simply
 * replaced the previous one and it was gone — testing participants wanted to
 * refer back to what they had just been looking at while reading the new
 * results. This row keeps that screen reachable in one click without letting it
 * compete with the current answer for space.
 */

/** "easyJet · London → Barcelona · £32.18" — enough to recognise the screen. */
const summarise = (message: ChatMessage): string | null => {
  const top = message.flights?.[0];
  if (!top) {
    // A screen with no flights (too broad, off-topic, unknown city) still has
    // its answer sentence, which is the only thing there is to recognise it by.
    const text = message.text?.trim();
    return text ? text : null;
  }
  const route = `${getCityName(top.origin_code)} → ${getCityName(top.dest_code)}`;
  return `${top.airline_name} · ${route} · £${top.price_gbp.toFixed(2)}`;
};

export const ScreenHistoryRow: React.FC<{
  message: ChatMessage;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ message, isExpanded, onToggle }) => {
  const summary = summarise(message);
  const label = message.query?.trim() || 'Previous search';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      className="w-full flex items-center gap-3 px-4 py-2.5 bg-card border border-border rounded-lg hover:border-white/20 transition-colors text-left"
    >
      <History className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground truncate">{label}</div>
        {summary && (
          <div className="text-[11px] text-muted-foreground truncate mt-0.5">{summary}</div>
        )}
      </div>
      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {isExpanded ? (
          <>
            Collapse
            <ChevronUp className="w-3.5 h-3.5" />
          </>
        ) : (
          <>
            Expand
            <ChevronDown className="w-3.5 h-3.5" />
          </>
        )}
      </span>
    </button>
  );
};
