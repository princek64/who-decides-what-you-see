import React, { useRef, useEffect, useState } from 'react';
import { useGenChat } from '../hooks/useGenChat';
import { useSessionLogger } from '../hooks/useSessionLogger';
import { useTypewriterPlaceholder } from '../hooks/useTypewriterPlaceholder';
import { GenScreen } from './GenScreen';
import { ScreenHistoryRow } from './ScreenHistoryRow';
import { visibleHistory } from '../lib/screenHistory';
import { FlightDetailModal } from './FlightDetailModal';
import type { Flight } from '../hooks/useFlightFilter';
import { Button } from './ui/button';
import { AlertTriangle, PlaneTakeoff, Search, Trash2, X } from 'lucide-react';
import { FlightSketchLogo } from './FlightSketchLogo';
import { SearchSteps } from './SearchSteps';

// Stable module-level reference — an inline array literal as the hook's
// `examples` prop would recreate on every render and restart the animation.
const SEARCH_EXAMPLES = [
  'Cheapest flight to Barcelona',
  'Weekend trip to Amsterdam under £150',
  'Compare direct vs connecting flights',
] as const;

export const ChatView: React.FC = () => {
  const {
    csvLoading,
    isLoading,
    loadingPhase,
    error,
    dismissError,
    messages,
    sendMessage,
    refineView,
    clearConversation,
    toggleExpandMessage,
  } = useGenChat();

  const { logCardClick } = useSessionLogger();

  const [inputText, setInputText] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Animated placeholder runs only while the search bar is empty, unfocused,
  // and not mid-search — a focused-or-typed-in input is "normal," not a demo.
  const typewriterActive = inputText === '' && !isSearchFocused && !isLoading;
  const { text: typedExample, showCaret } = useTypewriterPlaceholder({
    examples: SEARCH_EXAMPLES,
    active: typewriterActive,
  });

  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The canvas shows the latest assistant/system response in full, with the
  // user query that produced it. Screens it superseded are not thrown away:
  // the most recent MAX_HISTORY_SCREENS of them sit above it as collapsed
  // one-line rows the participant can re-open. Anything older stays in
  // `messages` (and in the session log) but leaves the canvas.
  let screenMessage = null;
  let screenQuery = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') {
      screenMessage = messages[i];
      // Screens carry their own query; the backward scan is the fallback for
      // anything recorded before that (and for system messages, which have no
      // query of their own).
      screenQuery = messages[i].query ?? '';
      if (!screenQuery) {
        for (let j = i - 1; j >= 0; j--) {
          if (messages[j].role === 'user') {
            screenQuery = messages[j].text;
            break;
          }
        }
      }
      break;
    }
  }
  const lastUserText = [...messages].reverse().find((m) => m.role === 'user')?.text;

  // Refinements replace the screen they refine (see applyIntent), so every
  // assistant message still in the list is a screen the user actually
  // navigated away from — no filtering for near-duplicates is needed here.
  const historyScreens =
    screenMessage?.role === 'assistant' ? visibleHistory(messages, screenMessage.id) : [];

  // Which collapsed screen, if any, is currently opened back up. Only one at a
  // time: two full screens plus the current one is the clutter this replaced.
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // Each rebuilt screen starts at the top of the canvas
  useEffect(() => {
    canvasRef.current?.scrollTo({ top: 0 });
  }, [screenMessage?.id]);

  // Focus the search bar once the app is ready (and keep focus after sending)
  useEffect(() => {
    if (!csvLoading) inputRef.current?.focus();
  }, [csvLoading]);

  // Starting over clears the history stack too — leaving a previous search's
  // row on a blank canvas would outlive the search it belongs to.
  const startNewSearch = () => {
    setExpandedHistoryId(null);
    clearConversation();
  };

  const submitMessage = () => {
    if (!inputText.trim() || isLoading) return;
    sendMessage(inputText.trim());
    setInputText('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    submitMessage();
  };

  const handleSelectFlight = (flight: Flight) => {
    logCardClick(flight.flight_id);
    setSelectedFlight(flight);
    setIsModalOpen(true);
  };

  const searchBar = (
    <form onSubmit={handleSend} className="flex gap-2 items-center w-full">
      {messages.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={startNewSearch}
          disabled={isLoading}
          title="Start a new search"
          className="rounded-full border-border bg-transparent hover:bg-muted text-muted-foreground hover:text-accent-red disabled:opacity-40 transition-colors w-11 h-11 shrink-0"
        >
          <Trash2 className="w-4.5 h-4.5" />
        </Button>
      )}

      {/* Search pill: single-line query input, not a chat composer */}
      <div className="flex-1 flex items-center gap-2 bg-white/[0.02] border border-white/15 rounded-full pl-4 pr-1.5 h-12 hover:border-white/25 focus-within:border-white/30 focus-within:ring-2 focus-within:ring-ring/40 transition-colors min-w-0">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            placeholder={
              typewriterActive
                ? ''
                : isLoading
                  ? loadingPhase === 'searching'
                    ? 'Searching flights…'
                    : 'Understanding your request…'
                  : "Describe what you're looking for"
            }
            aria-label="Describe the flights you're looking for"
            className="w-full bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
          />
          {/* Animated demo placeholder — purely decorative (aria-hidden), so
              it never reaches screen readers or steals focus/typing from the
              real input underneath. */}
          {typewriterActive && (
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-center text-sm text-muted-foreground pointer-events-none select-none truncate"
            >
              Search for... {typedExample}
              {showCaret && <span className="animate-caret-blink">▋</span>}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading || !inputText.trim()}
          title="Search"
          className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 hover:bg-foreground/90 active:bg-foreground/80 disabled:bg-muted disabled:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <PlaneTakeoff className="w-4.5 h-4.5" />
        </button>
      </div>
    </form>
  );

  const disclaimer = (
    <p className="text-center text-[11px] text-muted-foreground select-none">
      Flight Explorer can make mistakes — check flight details before booking.
    </p>
  );

  return (
    <div className="flex flex-col h-screen bg-background font-sans text-foreground">

      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-6 h-14 bg-background border-b border-border">
        <button
          type="button"
          onClick={() => messages.length > 0 && !isLoading && startNewSearch()}
          disabled={messages.length === 0 || isLoading}
          aria-label={messages.length > 0 ? 'Start a new search' : 'Flight Explorer'}
          className={`flex items-center gap-2.5 rounded-full -mx-1.5 px-1.5 py-1 transition-colors ${messages.length > 0 && !isLoading ? 'hover:bg-muted cursor-pointer' : 'cursor-default'}`}
        >
          <div className="text-foreground flex items-center justify-center">
            <FlightSketchLogo size={22} />
          </div>
          <div className="text-left">
            <h1 className="text-base font-heading font-medium text-foreground tracking-tight leading-tight">Flight Explorer</h1>
          </div>
        </button>
      </header>

      {/* CSV Database Loading Screen */}
      {csvLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-background p-6">
          <div className="w-24 h-24 rounded-full border border-dashed border-border flex items-center justify-center overflow-hidden bg-muted relative">
            <FlightSketchLogo size={36} className="text-foreground animate-flight-takeoff" />
          </div>
          <div className="mt-4 text-sm font-mono text-muted-foreground animate-pulse">launching flight explorer…</div>
        </div>
      ) : messages.length === 0 ? (

        /* ── Empty state: a search page, not a chat greeting ── */
        <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-2xl mx-auto w-full animate-fade-in">
          <div className="text-center space-y-2 mb-8 w-full">
            <h2 className="text-3xl md:text-4xl font-heading font-semibold text-foreground tracking-tight">Where do you want to go?</h2>
            <p className="text-sm text-muted-foreground">Describe a trip and the screen builds itself around the answer.</p>
          </div>

          <div className="w-full flex flex-col">
            {searchBar}

            <div className="mt-6">{disclaimer}</div>
          </div>
        </div>
      ) : (

        /* ── Active state: one full-canvas generated screen at a time ── */
        <div className="flex-1 flex flex-col min-h-0">
          <div ref={canvasRef} className="relative flex-1 min-h-0 overflow-y-auto">

            {/* Rate limit / service error: a banner ABOVE the generated screen,
                which stays exactly as it was. Replacing the canvas with an
                error card would throw away the layout the participant is
                mid-task on. */}
            {error && !isLoading && screenMessage?.role !== 'system' && (
              <div className="sticky top-6 z-20 flex justify-center px-4 animate-fade-in">
                <div className="bg-card border border-border rounded-lg px-4 py-3 flex gap-3 items-start max-w-xl w-full">
                  <AlertTriangle className="w-4 h-4 text-accent-amber shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1">{error}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    {lastUserText && (
                      <button
                        type="button"
                        onClick={() => {
                          dismissError();
                          sendMessage(lastUserText);
                        }}
                        className="text-[11px] font-medium text-foreground border border-border hover:border-white/20 rounded-full py-1 px-3 transition-colors"
                      >
                        Try again
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={dismissError}
                      aria-label="Dismiss"
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* While regenerating, the old screen dims underneath a status pill */}
            {isLoading && screenMessage && (
              <div className="sticky top-6 z-10 flex justify-center px-4 pointer-events-none">
                <div className="bg-card border border-border rounded-full px-5 py-2.5 flex items-center gap-2.5 max-w-full min-w-0">
                  <FlightSketchLogo size={14} className="text-foreground animate-pulse shrink-0" />
                  <SearchSteps phase={loadingPhase} compact />
                </div>
              </div>
            )}

            {/* Superseded screens, newest nearest the current one. Collapsed to
                a row each; expanding one renders it in full above the current
                answer, without its refine/regenerate controls — it is there to
                be read back, not to be worked on in place of the live screen. */}
            {historyScreens.length > 0 && (
              <div className="mx-auto w-full max-w-6xl px-4 md:px-8 pt-6 space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
                  Earlier in this search
                </div>
                {historyScreens.map((past) => (
                  <div key={past.id} className="space-y-2">
                    <ScreenHistoryRow
                      message={past}
                      isExpanded={expandedHistoryId === past.id}
                      onToggle={() =>
                        setExpandedHistoryId((current) => (current === past.id ? null : past.id))
                      }
                    />
                    {expandedHistoryId === past.id && (
                      <div className="border border-border rounded-lg overflow-hidden">
                        <GenScreen
                          query={past.query ?? ''}
                          message={past}
                          onToggleExpand={toggleExpandMessage}
                          onSelectFlight={handleSelectFlight}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {screenMessage ? (
              <div
                key={screenMessage.id}
                className={`animate-screen-in transition-opacity duration-300 ${isLoading ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}
              >
                <GenScreen
                  query={screenQuery}
                  message={screenMessage}
                  onToggleExpand={toggleExpandMessage}
                  onSelectFlight={handleSelectFlight}
                  onQuickReply={!isLoading ? sendMessage : undefined}
                  onRefine={
                    !isLoading && screenMessage
                      ? (patch, label) => refineView(screenMessage, patch, label)
                      : undefined
                  }
                  onRetry={
                    !isLoading && lastUserText
                      ? () => sendMessage(lastUserText)
                      : undefined
                  }
                />
              </div>
            ) : (
              /* First query in flight: nothing to replace yet */
              isLoading && (
                <div className="h-full flex flex-col items-center justify-center p-6 animate-fade-in">
                  <div className="w-24 h-24 rounded-full border border-dashed border-border flex items-center justify-center overflow-hidden bg-muted relative">
                    <FlightSketchLogo size={36} className="text-foreground animate-flight-takeoff" />
                  </div>
                  {lastUserText && (
                    <div className="mt-4 inline-flex items-center gap-2 bg-muted border border-border rounded-full px-4 py-1.5 max-w-full min-w-0">
                      <Search className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] font-mono text-muted-foreground truncate">{lastUserText}</span>
                    </div>
                  )}
                  <div className="mt-4">
                    <SearchSteps phase={loadingPhase} />
                  </div>
                </div>
              )
            )}
          </div>

          {/* Bottom search bar */}
          <div className="bg-background border-t border-border p-4 pb-3 z-10 w-full">
            <div className="max-w-3xl mx-auto flex flex-col gap-2 w-full">
              {searchBar}
              {disclaimer}
            </div>
          </div>
        </div>
      )}

      {/* Flight Detail Dialog Modal */}
      <FlightDetailModal
        flight={selectedFlight}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
