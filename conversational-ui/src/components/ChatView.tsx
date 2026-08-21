import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { useChat } from '../hooks/useChat';
import { useTypewriterPlaceholder } from '../hooks/useTypewriterPlaceholder';
import { ChatBubble } from './ChatBubble';
import { TypingIndicator } from './TypingIndicator';
import { Button } from './ui/button';
import { PlaneTakeoff, Search, ChevronDown, Trash2 } from 'lucide-react';
import { FlightSketchLogo } from './FlightSketchLogo';
import { buildSearchingStatus } from '../lib/searchingStatus';

// Stable module-level — inline array as hook prop would restart the animation each render.
const SEARCH_EXAMPLES = [
  'Cheapest direct one-way to Barcelona on 16 October 2026',
  'Compare direct vs one-stop to Lisbon on 15 November 2026',
  '£150 and a free weekend — where could I go in Eastern Europe?',
  'Cheapest weekend return to Paris in the next three months',
] as const;

export const ChatView: React.FC = () => {
  const {
    csvLoading,
    isLoading,
    messages,
    sendMessage,
    refineOrigin,
    searchFromLondon,
    clearConversation,
  } = useChat();

  const [inputText, setInputText] = useState('');
  const [isComposerFocused, setIsComposerFocused] = useState(false);

  // Animated placeholder only while empty, unfocused, and not mid-search.
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

  // Anchored scroll: new user query to top of viewport; spacer fills the gap.
  const SCROLL_PAD = 16;
  const [spacer, setSpacer] = useState(0);
  const spacerRef = useRef(0);

  const lastMessage = messages[messages.length - 1];
  const lastUserId = [...messages].reverse().find((m) => m.role === 'user')?.id;

  const measureAnchor = () => {
    const container = chatContainerRef.current;
    const thread = threadRef.current;
    const end = bottomRef.current;
    if (!container || !thread || !end || !lastUserId) return null;
    const userEl = messageRefs.current.get(lastUserId);
    if (!userEl) return null;

    const topOf = (el: HTMLElement) => el.offsetTop - thread.offsetTop;
    // Content height from zero-height marker — never thread.scrollHeight (includes spacer).
    const contentHeight = topOf(end);
    const room = container.clientHeight - SCROLL_PAD;

    // Anchor on query; fall back to reply when the exchange is taller than one screen.
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

  // Size spacer first (layout), then scroll to anchor.
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
    // Immediate scroll (not rAF): background tabs never fire animation frames.
    // Rect-based so padding / nested offsetParents cannot skew it.
    const delta =
      measured.anchorEl.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      SCROLL_PAD;
    if (Math.abs(delta) < 1) return;
    container.scrollTo({
      top: Math.max(0, container.scrollTop + delta),
      // Hidden tab never animates smooth scroll — jump so position is correct on return.
      behavior: document.hidden ? 'auto' : 'smooth',
    });
  }, [messages, isLoading, spacer]);

  useEffect(() => {
    if (!csvLoading) textareaRef.current?.focus();
  }, [csvLoading]);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  };

  const handleScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    // Spacer is empty room — exclude it or the floater stays permanently.
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

  // Enter sends; Shift+Enter inserts a newline
  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  };

  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;
  const lastUserText = [...messages].reverse().find((m) => m.role === 'user')?.text;
  const searchingLabel = buildSearchingStatus(lastUserText ?? '');
  // Rate-limit notice is only actionable while it is the newest message.
  const lastMessageId = messages[messages.length - 1]?.id;
  // Hide prior result tables while asking for a slot.
  const suppressStaleResults = Boolean(
    [...messages].reverse().find((m) => m.role === 'assistant' && m.awaitingSlot)
  );

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

      {/* Composer pill: auto-growing textarea; match generative-ui search bar rhythm. */}
      <div className="flex-1 flex items-center gap-2 bg-white/[0.02] border border-input rounded-full pl-4 pr-1.5 min-h-12 hover:border-white/40 focus-within:border-white/45 focus-within:ring-2 focus-within:ring-ring/40 transition-colors min-w-0">
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
                  ? 'Searching… (you can keep typing)'
                  : 'Ask me anything about flights…'
            }
            aria-label="Message Flight Assistant"
            className="w-full resize-none bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground max-h-[132px]"
          />
          {/* Decorative demo placeholder (aria-hidden) — does not steal focus. */}
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
                        suppressResults={suppressStaleResults && !message.awaitingSlot}
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
                  {isLoading && <TypingIndicator label={searchingLabel} />}
                  <div ref={bottomRef} />
                  {/* Room to lift the newest turn to the top of the viewport */}
                  <div aria-hidden style={{ height: spacer }} />
                </div>
              </div>

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

    </div>
  );
};
