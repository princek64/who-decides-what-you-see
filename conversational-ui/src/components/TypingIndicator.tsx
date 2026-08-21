import React from 'react';
import { Globe } from 'lucide-react';

interface TypingIndicatorProps {
  /** ChatGPT-style status: "Searching London to Amsterdam flights…" */
  label: string;
}

/** In-thread search status — one fading line; held briefly so local searches stay readable. */
export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ label }) => {
  const text = label.trim() || 'Searching flights';

  return (
    <div className="w-full py-3 animate-fade-in" role="status" aria-live="polite">
      <div className="flex items-start gap-2.5 min-w-0">
        <Globe
          className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground"
          aria-hidden
        />
        <p className="searching-fade text-sm leading-relaxed min-w-0 truncate" title={text}>
          {text}
        </p>
      </div>
    </div>
  );
};
