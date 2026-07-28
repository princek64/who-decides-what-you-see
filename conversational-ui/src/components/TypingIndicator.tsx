import React from 'react';
import { Check, Loader2 } from 'lucide-react';

interface TypingIndicatorProps {
  /** 'thinking' = parsing the request, 'searching' = querying the dataset. */
  phase: 'thinking' | 'searching';
}

/**
 * Search progress, the way ChatGPT/Perplexity show retrieval: the steps the
 * assistant is working through, in the thread, as quiet text. Results appear
 * only once the search step has actually run (see SEARCH_STEP_MS in useChat),
 * so the participant sees the search happen rather than results blinking in.
 */
export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ phase }) => {
  const steps: { key: string; label: string }[] = [
    { key: 'thinking', label: 'Understanding your request' },
    { key: 'searching', label: 'Searching flights' },
  ];
  const currentIndex = steps.findIndex((s) => s.key === phase);

  return (
    <div className="w-full py-3 animate-fade-in">
      <div className="flex flex-col gap-1.5">
        {steps.map((step, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          if (i > currentIndex) return null;
          return (
            <div
              key={step.key}
              className={`flex items-center gap-2 text-[13px] ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              {isDone ? (
                <Check className="w-3.5 h-3.5 text-accent-green shrink-0" />
              ) : (
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-muted-foreground" />
              )}
              <span className={isCurrent ? 'animate-pulse' : ''}>
                {step.label}
                {isCurrent ? '…' : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
