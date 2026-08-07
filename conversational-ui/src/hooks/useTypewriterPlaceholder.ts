import { useEffect, useRef, useState } from 'react';

const TYPE_MS_MIN = 40;
const TYPE_MS_MAX = 60;
const ERASE_MS = 25;
const HOLD_MS = 2000;
const GAP_MS = 500;

interface UseTypewriterPlaceholderOptions {
  /** Static list — must be a stable reference (module-level constant), not an
   *  inline array literal, or the effect below restarts every render. */
  examples: readonly string[];
  /** Only animates while true (e.g. input empty, unfocused, not loading). */
  active: boolean;
}

/** Types each example forward, holds, erases it, then moves to the next —
 *  looping from the first example every time `active` turns on. Respects
 *  prefers-reduced-motion by showing each example as static text instead of
 *  animating the reveal. */
export function useTypewriterPlaceholder({ examples, active }: UseTypewriterPlaceholderOptions) {
  const [text, setText] = useState('');
  const [showCaret, setShowCaret] = useState(false);
  const reducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (!active || examples.length === 0) {
      setText('');
      setShowCaret(false);
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    let exampleIndex = 0;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timeoutId = setTimeout(resolve, ms);
      });

    const run = async () => {
      setShowCaret(true);
      while (!cancelled) {
        const example = examples[exampleIndex % examples.length];

        if (reducedMotion.current) {
          setText(example);
          await wait(HOLD_MS);
        } else {
          for (let i = 1; i <= example.length; i++) {
            if (cancelled) return;
            setText(example.slice(0, i));
            await wait(TYPE_MS_MIN + Math.random() * (TYPE_MS_MAX - TYPE_MS_MIN));
          }
          if (cancelled) return;
          await wait(HOLD_MS);
          for (let i = example.length - 1; i >= 0; i--) {
            if (cancelled) return;
            setText(example.slice(0, i));
            await wait(ERASE_MS);
          }
        }
        if (cancelled) return;
        await wait(GAP_MS);
        exampleIndex++;
      }
    };

    run();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      setShowCaret(false);
    };
  }, [active, examples]);

  return { text, showCaret };
}
