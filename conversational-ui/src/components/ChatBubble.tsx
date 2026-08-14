import React, { useState } from 'react';
import type { ChatMessage } from '../hooks/useChat';
import type { IntentJSON } from '../hooks/useFlightFilter';
import { FlightProse } from './FlightProse';
import { AlertTriangle, Copy, Check, RefreshCw, ChevronDown } from 'lucide-react';
import { LONDON_CODES, londonAirportLabel } from '../lib/slots';

interface ChatBubbleProps {
  message: ChatMessage;
  /** Hide prior flight tables while a clarifying slot question is active. */
  suppressResults?: boolean;
  /** Present only on a retryable system notice (rate limit / 5xx): re-sends the
   *  message the failure swallowed. Assistant answers have no retry — see the
   *  footer comment below. */
  onRetry?: () => void;
  /** Present only on the latest assistant results: re-search from a chosen
   *  London airport ('' = all London airports). */
  onPickOrigin?: (originCode: string) => void;
  /** Present only on the latest "I only fly from London" reply. */
  onSearchLondon?: () => void;
}

// Origin is never asked (the dataset is London-only). The assumption is stated
// as a small grey "what I understood" line ABOVE the answer — a clarification,
// not a control. The origin is the one tappable word in it, because changing
// departure airport re-runs the search.
const AssumptionLine: React.FC<{
  intent?: IntentJSON;
  onPickOrigin?: (originCode: string) => void;
  /** When the answer shows a preview of a larger set. */
  shownOfTotal?: { shown: number; total: number } | null;
  /** Compare / keep-stops: both stop types are in the answer. */
  showingStops?: boolean;
  /** Directs-only preview while connecting flights exist. */
  hidStops?: boolean;
  /** Eastern Europe region filter applied. */
  regionLabel?: string | null;
}> = ({ intent, onPickOrigin, shownOfTotal, showingStops, hidStops, regionLabel }) => {
  const [open, setOpen] = useState(false);
  const originCode = intent?.origin_code?.trim();
  const originLabel = originCode ? londonAirportLabel(originCode) : 'all London airports';
  const cabinLabel = intent?.cabin_class?.trim() || 'Economy';

  const extras: string[] = [];
  if (regionLabel) extras.push(regionLabel);
  if (showingStops) extras.push('showing direct and 1-stop');
  else if (hidStops) extras.push('directs only — ask to include stops');
  if (shownOfTotal && shownOfTotal.total > shownOfTotal.shown) {
    extras.push(`showing ${shownOfTotal.shown} of ${shownOfTotal.total}`);
  }

  return (
    <div className="relative flex items-center flex-wrap gap-1 mb-1.5 text-[11px] text-muted-foreground">
      <span>Searching {cabinLabel.toLowerCase()} flights from</span>
      {onPickOrigin ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          title="Change departure airport"
          className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
        >
          {originLabel}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      ) : (
        <span>{originLabel}</span>
      )}

      {open && onPickOrigin && (
        <>
          {/* click-away layer */}
          <button
            type="button"
            aria-label="Close airport picker"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            className="absolute top-5 left-24 z-20 w-56 bg-popover border border-border rounded-lg p-1 max-h-56 overflow-y-auto"
          >
            {LONDON_CODES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => {
                  onPickOrigin(code);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 text-left rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
              >
                <span className="font-mono font-semibold text-foreground">{code}</span>
                <span className="text-muted-foreground">{londonAirportLabel(code)}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onPickOrigin('');
                setOpen(false);
              }}
              className="w-full text-left rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted border-t border-border mt-1 pt-2 transition-colors"
            >
              All London airports
            </button>
          </div>
        </>
      )}
      {extras.length > 0 && (
        <span className="w-full basis-full mt-0.5 text-[10px] text-muted-foreground/90">
          {extras.join(' · ')}
        </span>
      )}
    </div>
  );
};

// Plain assistant replies (baggage answers, zero-result notes) may carry the
// same **bold** the prose answers use, so they get the same emphasis instead of
// literal asterisks.
const renderInlineBold = (text: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );

/**
 * Insight / plain-text blocks: blank lines separate sections; consecutive
 * "- " lines become a bullet list so compare / cheapest-when insights scan.
 */
const renderFormattedBlocks = (text: string, className = '') => {
  const sections = text.split(/\n\n+/).filter((s) => s.trim());
  return sections.map((section, i) => {
    const lines = section.split('\n').map((l) => l.trim()).filter(Boolean);
    const allBullets = lines.length > 0 && lines.every((l) => /^[-•]\s+/.test(l));
    if (allBullets) {
      return (
        <ul
          key={i}
          className={`mt-2 space-y-1.5 text-sm leading-relaxed text-foreground ${className}`}
        >
          {lines.map((line, j) => (
            <li key={j} className="flex gap-2">
              <span aria-hidden className="text-muted-foreground select-none">
                •
              </span>
              <span>{renderInlineBold(line.replace(/^[-•]\s+/, ''))}</span>
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p
        key={i}
        className={`text-sm leading-relaxed text-foreground ${i === 0 ? '' : 'mt-2.5'} ${className}`}
      >
        {renderInlineBold(section.replace(/\n/g, ' '))}
      </p>
    );
  });
};

// Refinement is offered in WORDS now: buildProseAnswer ends the answer with a
// follow-up question ("Want me to narrow it to direct flights only, …?"), and
// the participant answers it by typing. There are no suggestion chips — the
// answer is conversation, not a control panel.

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  suppressResults = false,
  onRetry,
  onPickOrigin,
  onSearchLondon,
}) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions/insecure context) — ignore
    }
  };

  const hasResults =
    !isUser &&
    !suppressResults &&
    !!message.flights &&
    message.flights.length > 0;

  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // System notices (rate limit / API failure) stay quiet inline text, not a card.
  if (isSystem) {
    return (
      <div className="w-full py-3 animate-fade-in-down">
        <div className="flex gap-2 items-start text-[13px] text-muted-foreground">
          <AlertTriangle className="w-4 h-4 text-accent-amber shrink-0 mt-0.5" />
          <div>
            <p className="leading-relaxed">{message.text}</p>
            {/* Re-sends the same message, so the participant never has to retype
                a task query the rate limiter swallowed. */}
            {message.retryable && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // User turn: a bubble on the right, like ChatGPT.
  if (isUser) {
    return (
      <div className="group flex justify-end w-full py-2 animate-fade-in">
        <div className="max-w-[80%] flex flex-col items-end">
          <div className="bg-muted text-foreground rounded-2xl rounded-tr-sm py-2.5 px-4 text-sm leading-relaxed whitespace-pre-wrap text-left">
            {message.text}
          </div>
          <span className="mt-1 text-[10px] text-muted-foreground font-mono tabular-nums opacity-0 group-hover:opacity-100 transition-opacity select-none">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    );
  }

  // Assistant turn: plain prose on the left. No avatar, no bubble, no card —
  // the response is text in the thread (ChatGPT / Perplexity pattern).
  return (
    <div className="group w-full py-3 animate-fade-in">
      {hasResults ? (
        <>
          {/* "What I understood" note, stated before the answer */}
          <AssumptionLine
            intent={message.intent}
            onPickOrigin={onPickOrigin}
            shownOfTotal={
              message.flights && message.flights.length > 6 && !message.showAll
                ? { shown: 6, total: message.flights.length }
                : message.showAll && message.flights
                  ? { shown: message.flights.length, total: message.flights.length }
                  : null
            }
            showingStops={Boolean(message.slot?.compare || message.slot?.keep_stops)}
            hidStops={Boolean(
              !message.slot?.compare &&
                !message.slot?.keep_stops &&
                !message.slot?.cheapest_when &&
                message.flights &&
                message.flights.some((f) => f.stops === 0) &&
                message.flights.some((f) => f.stops > 0) &&
                message.intent?.stops == null
            )}
            regionLabel={
              message.intent?.dest_region === 'eastern_europe'
                ? 'Eastern Europe only'
                : null
            }
          />
          {/* Comparison / cheapest-day insight, stated before the answer.
              Verdict + why + option bullets (see insights.ts). */}
          {message.preface && (
            <div className="mb-3">{renderFormattedBlocks(message.preface)}</div>
          )}
          <FlightProse
            flights={message.flights!}
            intent={message.intent || {}}
            keepStops={Boolean(
              message.slot?.compare || message.slot?.cheapest_when || message.slot?.keep_stops
            )}
            showAll={Boolean(message.showAll)}
          />
        </>
      ) : (
        <div className="text-sm leading-relaxed text-foreground">
          {renderFormattedBlocks(message.text)}
        </div>
      )}

      {/* "I only fly from London" offer — search from London instead */}
      {message.offerLondon && onSearchLondon && (
        <button
          type="button"
          onClick={onSearchLondon}
          className="mt-2 text-[12px] text-muted-foreground hover:text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground transition-colors"
        >
          Search from London instead
        </button>
      )}

      {/* Footer: timestamp + hover-reveal copy. There is no regenerate action —
          re-running a turn would append a second answer to the same question,
          which reads as a duplicate in the thread and in the session log. */}
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground select-none">
        <span className="font-mono tabular-nums">{formatTime(message.timestamp)}</span>
        <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={handleCopy}
            title={copied ? 'Copied' : 'Copy message'}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-accent-green" /> : <Copy className="w-3 h-3" />}
          </button>
        </span>
      </div>
    </div>
  );
};
