import React from 'react';
import type { ChatMessage } from '../hooks/useGenChat';
import { getCityName } from '../lib/airportMap';
import { ChevronDown, ChevronUp, History } from 'lucide-react';

/** Collapsed previous screen — one-click expand without competing with the current answer. */

/** "easyJet · London → Barcelona · £32.18" — enough to recognise the screen. */
const summarise = (message: ChatMessage): string | null => {
  const top = message.flights?.[0];
  if (!top) {
    // No-flight screens: fall back to the answer sentence for recognition.
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
