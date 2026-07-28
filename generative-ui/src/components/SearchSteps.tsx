import React from 'react';
import { Check, Loader2 } from 'lucide-react';

interface SearchStepsProps {
  /** 'thinking' = parsing the request, 'searching' = querying the dataset. */
  phase: 'thinking' | 'searching';
  /** Compact single-line form, for the sticky pill over an existing screen. */
  compact?: boolean;
}

const STEPS: { key: string; label: string }[] = [
  { key: 'thinking', label: 'Understanding your request' },
  { key: 'searching', label: 'Searching flights' },
];

/**
 * The steps the app is working through, shown before the generated screen
 * appears (see SEARCH_STEP_MS in useGenChat) so the participant sees the
 * search happen rather than a layout blinking in. Same steps and wording as
 * TypingIndicator in the conversational app — only the layout is generated
 * differently between the two conditions, not the search itself.
 */
export const SearchSteps: React.FC<SearchStepsProps> = ({ phase, compact = false }) => {
  const currentIndex = STEPS.findIndex((s) => s.key === phase);

  if (compact) {
    const step = STEPS[currentIndex] ?? STEPS[0];
    return (
      <span className="text-xs font-mono text-muted-foreground truncate animate-pulse">
        {step.label}…
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 animate-fade-in">
      {STEPS.map((step, i) => {
        if (i > currentIndex) return null;
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
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
  );
};
