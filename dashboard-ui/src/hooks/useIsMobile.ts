import { useEffect, useState } from 'react';

// Tailwind's `sm` breakpoint. The virtualized results list needs an EXACT row
// height per row type, so the mobile card layouts (which are shorter than the
// desktop ones) have to be known in JS, not just in CSS.
const MOBILE_QUERY = '(max-width: 639px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(MOBILE_QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
