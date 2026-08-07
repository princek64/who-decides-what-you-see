import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { useChat } from '../hooks/useChat';
import { useTypewriterPlaceholder } from '../hooks/useTypewriterPlaceholder';
import { ChatBubble } from './ChatBubble';
import { TypingIndicator } from './TypingIndicator';
import { Button } from './ui/button';
import { PlaneTakeoff, Search, ChevronDown, Trash2 } from 'lucide-react';
import { FlightSketchLogo } from './FlightSketchLogo';

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
    messages,
    sendMessage,
    refineOrigin,
    searchFromLondon,
    clearConversation,
  } = useChat();

  const [inputText, setInputText] = useState('');
  const [isComposerFocused, setIsComposerFocused] = useState(false);

  // Animated placeholder runs only while the composer is empty, unfocused,
  // and not mid-search — a focused-or-typed-in input is "normal," not a demo.
  const typewriterActive = inputText === '' && !isComposerFocused && !isLoading;
  const { text: typedExample, showCaret } = useTypewriterPlaceholder({
    examples: SEARCH_EXAMPLES,
    active: typewriterActive,
  });

  const [showScrollDown, setShowScrollDown] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageRefs = useRef(new Map<string, HTMLDivElement>());

  // ─── Anchored scrolling (ChatGPT pattern) ────────────────────────────────
  // A new turn does NOT scroll to the bottom of the feed: the new user query is
  // pulled to the TOP of the viewport and the previous answer scrolls away, so
  // each exchange starts on a clean screen. Once the answer arrives it is read
  // from its first line — either straight under the query (when the whole
  // exchange fits) or from the answer's own top when it doesn't.
  //
  // That is only possible if there is something to scroll INTO, hence the
  // spacer below the thread: it is exactly the gap needed to lift the anchor to
  // the top, and collapses to 0 once the conversation is tall enough on its own.
  const SCROLL_PAD = 16;
  const [spacer, setSpacer] = useState(0);
  const spacerRef = useRef(0);

  const lastMessage = messages[messages.length - 1];
  const lastUserId = [...messages].reverse().find((m) => m.role === 'user')?.id;

  // Which element the viewport should start at, and how much filler that needs.
  const measureAnchor = () => {
    const container = chatContainerRef.current;
    const thread = threadRef.current;
    const end = bottomRef.current;
    if (!container || !thread || !end || !lastUserId) return null;
    const userEl = messageRefs.current.get(lastUserId);
    if (!userEl) return null;

    const topOf = (el: HTMLElement) => el.offsetTop - thread.offsetTop;
    // Height of the CONVERSATION only. Measured from the zero-height marker
    // that sits between the last turn and the spacer, never from the thread's
    // own scrollHeight: that includes the spacer, so the spacer would feed its
    // own next value, the two would chase each other every commit, and the
    // re-render storm cancelled the scroll before any frame could run it.
    const contentHeight = topOf(end);
    const room = container.clientHeight - SCROLL_PAD;

    // Anchor on the query; fall back to the reply when the exchange is taller
    // than one screen, so the answer is still read from its first line.
    let anchorEl: HTMLElement = userEl;
    if (contentHeight - topOf(userEl) > room) {
      const replyEl =
        lastMessage && lastMessage.role !== 'user'
          ? messageRefs.current.get(lastMessage.id)
          : undefined;
      if (replyEl) anchorEl = replyEl;
    }
    return { anchorEl, needed: Math.max(0, room - (contentHeight - topOf(anchorEl))) };
  };

  // Size the spacer first (layout), then scroll to the anchor.
  useLayoutEffect(() => {
    const measured = measureAnchor();
    if (!measured) return;
    // Sub-pixel differences must not trigger another commit.
    if (Math.abs(measured.needed - spacerRef.current) > 1) {
      spacerRef.current = measured.needed;
      setSpacer(measured.needed);
    }
  }, [messages, isLoading]);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const measured = measureAnchor();
    if (!measured) return;
    // Runs straight away rather than inside requestAnimationFrame: a background
    // tab never fires animation frames, so a deferred scroll would simply never
    // happen. The spacer is already applied by the layout effect above, so the
    // geometry read here is final.
    // Rect-based, so container padding and nested offsetParents cannot skew it.
    const delta =
      measured.anchorEl.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      SCROLL_PAD;
    if (Math.abs(delta) < 1) return;
    container.scrollTo({
      top: Math.max(0, container.scrollTop + delta),
      // A hidden tab never animates a smooth scroll, so the thread would still
      // be at the old position when the participant switches back. Jump there
      // instead; only a visible tab gets the animation.
      behavior: document.hidden ? 'auto' : 'smooth',
    });
  }, [messages, isLoading, spacer]);

  // Focus the composer once the app is ready (and keep focus after sending)
  useEffect(() => {
    if (!csvLoading) textareaRef.current?.focus();
  }, [csvLoading]);

  // Grow the composer with its content, capped at ~5 lines
  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  };

  const handleScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    // The spacer is empty room, not unread conversation — don't count it, or the
    // floater would sit there permanently after every anchored scroll.
    setShowScrollDown(el.scrollHeight - spacerRef.current - el.scrollTop - el.clientHeight > 300);
  };

  const submitMessage = () => {
    if (!inputText.trim() || isLoading) return;
    sendMessage(inputText.trim());
    setInputText('');
    requestAnimationFrame(() => {
      resizeTextarea();
      textareaRef.current?.focus();
    });
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    submitMessage();
  };

  // Enter sends; Shift+Enter inserts a newline (ChatGPT/Claude convention)
  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  };

  // The newest assistant message is the one whose origin picker stays live
  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;
  const lastUserText = [...messages].reverse().find((m) => m.role === 'user')?.text;
  // A rate-limit notice is only actionable while it is the newest thing said.
  const lastMessageId = messages[messages.length - 1]?.id;

  const composer = (
    <form onSubmit={handleSend} className="flex gap-2 items-end w-full">
      {messages.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={clearConversation}
          disabled={isLoading}
          title="Clear conversation"
          className="rounded-full border-border bg-transparent hover:bg-muted text-muted-foreground hover:text-accent-red disabled:opacity-40 transition-colors w-11 h-11 shrink-0"
        >
          <Trash2 className="w-4.5 h-4.5" />
        </Button>
      )}

      {/* Composer pill: auto-growing textarea with the send button inside —
          same border/pill treatment, leading icon, and vertical rhythm as
          generative-ui's search bar. min-h-12 (not h-12) gives it the exact
          same resting height while still letting it grow for multi-line
          messages; the textarea itself carries no padding of its own so
          there is only one source of vertical spacing, same as generative-ui's
          input. */}
      <div className="flex-1 flex items-center gap-2 bg-white/[0.02] border border-white/15 rounded-full pl-4 pr-1.5 min-h-12 hover:border-white/25 focus-within:border-white/30 focus-within:ring-2 focus-within:ring-ring/40 transition-colors min-w-0">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="relative flex-1 min-w-0 flex items-center">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              resizeTextarea();
            }}
            onKeyDown={handleComposerKeyDown}
            onFocus={() => setIsComposerFocused(true)}
            onBlur={() => setIsComposerFocused(false)}
            rows={1}
            placeholder={
              typewriterActive
                ? ''
                : isLoading
                  ? loadingPhase === 'searching'
                    ? 'Searching flights… (you can keep typing)'
                    : 'Thinking… (you can keep typing)'
                  : 'Ask me anything about flights…'
            }
            aria-label="Message Flight Assistant"
            className="w-full resize-none bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground max-h-[132px]"
          />
          {/* Animated demo placeholder — purely decorative (aria-hidden), so
              it never reaches screen readers or steals focus/typing from the
              real textarea underneath. */}
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
          title="Send message"
          className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 hover:bg-foreground/90 active:bg-foreground/80 disabled:bg-muted disabled:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <PlaneTakeoff className="w-4.5 h-4.5" />
        </button>
      </div>
    </form>
  );

  const disclaimer = (
    <p className="text-center text-[11px] text-muted-foreground select-none">
      Flight Assistant can make mistakes — check flight details before booking.
    </p>
  );

  return (
    <div className="flex flex-col h-screen bg-background font-sans text-foreground">

      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-6 h-14 bg-background border-b border-border">
        <button
          type="button"
          onClick={() => messages.length > 0 && !isLoading && clearConversation()}
          disabled={messages.length === 0 || isLoading}
          aria-label={messages.length > 0 ? 'New chat' : 'Flight Assistant'}
          className={`flex items-center gap-2.5 rounded-full -mx-1.5 px-1.5 py-1 transition-colors ${messages.length > 0 && !isLoading ? 'hover:bg-muted cursor-pointer' : 'cursor-default'}`}
        >
          <div className="text-foreground flex items-center justify-center">
            <FlightSketchLogo size={22} />
          </div>
          <div className="text-left">
            <h1 className="text-base font-heading font-medium text-foreground tracking-tight leading-tight">Flight Assistant</h1>
          </div>
        </button>
      </header>

      {/* CSV Database Loading Screen */}
      {csvLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-background p-6">
          <div className="w-24 h-24 rounded-full border border-dashed border-border flex items-center justify-center overflow-hidden bg-muted relative">
            <FlightSketchLogo size={36} className="text-foreground animate-flight-takeoff" />
          </div>
          <div className="mt-4 text-sm font-mono text-muted-foreground animate-pulse">launching flight assistant…</div>
        </div>
      ) : (
        <div className={messages.length === 0
          ? "flex-1 flex flex-col items-center justify-center p-6 max-w-2xl mx-auto w-full animate-fade-in"
          : "flex-1 flex flex-col min-h-0"
        }>

          {/* 1. Empty state: headline above the centred composer. Or the
                 message feed once the thread has started. */}
          {messages.length === 0 ? (
            <div className="text-center mb-8 w-full">
              <h2 className="text-3xl md:text-4xl font-heading font-semibold text-foreground tracking-tight">
                Where do you want to go?
              </h2>
            </div>
          ) : (
            <div className="relative flex-1 min-h-0 w-full">
              <div
                ref={chatContainerRef}
                onScroll={handleScroll}
                className="h-full overflow-y-auto px-4 py-4 md:px-8 w-full"
              >
                {/* One continuous thread: turns are separated by their own
                    padding, never by cards or dividers. */}
                <div ref={threadRef} className="max-w-4xl mx-auto">
                  {messages.map((message) => {
                    const isLastAssistant = message.id === lastAssistantId;
                    return (
                      <div
                        key={message.id}
                        ref={(el) => {
                          if (el) messageRefs.current.set(message.id, el);
                          else messageRefs.current.delete(message.id);
                        }}
                        className="scroll-mt-4"
                      >
                      <ChatBubble
                        message={message}
                        onRetry={
                          message.role === 'system' &&
                          message.id === lastMessageId &&
                          !isLoading &&
                          lastUserText
                            ? () => sendMessage(lastUserText)
                            : undefined
                        }
                        onPickOrigin={
                          isLastAssistant && !isLoading && message.slot
                            ? (code) => refineOrigin(message.slot!, code)
                            : undefined
                        }
                        onSearchLondon={
                          isLastAssistant && !isLoading && message.offerLondon && message.slot
                            ? () => searchFromLondon(message.slot!)
                            : undefined
                        }
                      />
                      </div>
                    );
                  })}
                  {isLoading && <TypingIndicator phase={loadingPhase} />}
                  <div ref={bottomRef} />
                  {/* Room to lift the newest turn to the top of the viewport */}
                  <div aria-hidden style={{ height: spacer }} />
                </div>
              </div>

              {/* Scroll-to-bottom floater (ChatGPT-style) */}
              {showScrollDown && (
                <button
                  type="button"
                  onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  title="Scroll to latest"
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground hover:border-white/20 flex items-center justify-center z-10 transition-colors"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* 2. Reused Form Input Container */}
          <div className={messages.length === 0
            ? "w-full"
            : "bg-background border-t border-border p-4 pb-3 sticky bottom-0 z-10 w-full"
          }>
            <div className={messages.length === 0
              ? "w-full flex flex-col"
              : "max-w-4xl mx-auto flex flex-col gap-2 w-full"
            }>
              {composer}

              {messages.length === 0 ? <div className="mt-6">{disclaimer}</div> : disclaimer}
            </div>
          </div>

        </div>
      )}

      {/* No flight detail dialog: everything the answer knows is already in the
          text, so a flight in the thread is not clickable. */}
    </div>
  );
};
