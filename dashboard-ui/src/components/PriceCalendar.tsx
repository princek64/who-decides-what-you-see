import React, { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

interface PriceCalendarProps {
  /** 'single' picks one date; 'range' picks depart + return in one calendar */
  mode?: 'single' | 'range';
  value: string; // YYYY-MM-DD (start date in range mode)
  endValue?: string; // range mode only
  onChange?: (date: string) => void;
  onRangeChange?: (start: string, end: string) => void;
  minDate: string;
  maxDate: string;
  // Lazily computed so the (163k-row) price scan only runs when the
  // calendar is actually opened.
  getPrices: () => Record<string, number>;
  /** Return-leg fares, shown while the return date is being picked */
  getEndPrices?: () => Record<string, number>;
  /** Per-day fares are route-specific, so they're only meaningful once a
   *  destination is chosen. When false, cells show the date only (no price)
   *  and a hint prompts the user to pick a destination. */
  pricesEnabled?: boolean;
  placeholder?: string;
  align?: 'start' | 'center' | 'end';
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function ymKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function formatDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const PriceCalendar: React.FC<PriceCalendarProps> = ({
  mode = 'single',
  value,
  endValue = '',
  onChange,
  onRangeChange,
  minDate,
  maxDate,
  getPrices,
  getEndPrices,
  pricesEnabled = true,
  placeholder = 'Select date',
  align = 'start',
}) => {
  const [open, setOpen] = useState(false);
  // Range selection phase: picking the depart date or the return date
  const [phase, setPhase] = useState<'start' | 'end'>('start');
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  // First-of-month being viewed
  const [viewYm, setViewYm] = useState<[number, number]>(() => {
    const src = value || minDate;
    const d = new Date(`${src}T00:00:00`);
    return isNaN(d.getTime()) ? [2026, 6] : [d.getFullYear(), d.getMonth()];
  });

  const startPrices = useMemo(
    () => (open && pricesEnabled ? getPrices() : {}),
    [open, pricesEnabled, getPrices]
  );
  const endPrices = useMemo(
    () => (open && pricesEnabled && mode === 'range' && getEndPrices ? getEndPrices() : {}),
    [open, pricesEnabled, mode, getEndPrices]
  );

  const pickingEnd = mode === 'range' && phase === 'end';
  const prices = pickingEnd ? endPrices : startPrices;

  // Cheap / typical / pricey terciles across the whole bookable range,
  // like Google Flights' green–grey–red fare shading.
  const [lowCut, highCut] = useMemo(() => {
    const vals = Object.entries(prices)
      .filter(([k]) => k >= minDate && k <= maxDate)
      .map(([, v]) => v)
      .sort((a, b) => a - b);
    if (vals.length < 8) return [Infinity, Infinity];
    return [vals[Math.floor(vals.length / 3)], vals[Math.floor((vals.length * 2) / 3)]];
  }, [prices, minDate, maxDate]);

  const [viewYear, viewMonth] = viewYm;
  const minYm = minDate.slice(0, 7);
  const maxYm = maxDate.slice(0, 7);
  const isRange = mode === 'range';

  // In range mode a second month is shown alongside (on md+ screens)
  const secondMonth = new Date(viewYear, viewMonth + 1, 1);
  const showSecond = isRange && ymKey(secondMonth.getFullYear(), secondMonth.getMonth()) <= maxYm;
  const lastVisibleYm = showSecond ? ymKey(secondMonth.getFullYear(), secondMonth.getMonth()) : ymKey(viewYear, viewMonth);

  const goMonth = (delta: number) => {
    setViewYm(([y, m]) => {
      const d = new Date(y, m + delta, 1);
      return [d.getFullYear(), d.getMonth()];
    });
  };

  const handlePick = (key: string) => {
    if (!isRange) {
      onChange?.(key);
      setOpen(false);
      return;
    }
    if (phase === 'start' || key < value) {
      // First click, or a click before the current start: (re)set the start
      onRangeChange?.(key, endValue && endValue >= key ? endValue : '');
      setPhase('end');
    } else {
      onRangeChange?.(value, key);
      setOpen(false);
    }
  };

  // When opening, restart the range flow and jump to the selected month
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setPhase('start');
      setHoverKey(null);
      const src = value || minDate;
      const d = new Date(`${src}T00:00:00`);
      if (!isNaN(d.getTime())) setViewYm([d.getFullYear(), d.getMonth()]);
    }
  };

  // Highlighted span: confirmed range, or live preview while hovering
  const rangeStart = isRange && value ? value : '';
  const rangeEnd = isRange
    ? endValue || (pickingEnd && hoverKey && hoverKey > value ? hoverKey : '')
    : '';

  const renderMonth = (year: number, month: number) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first

    return (
      <div className="flex-1 min-w-0">
        {isRange && (
          <div className="text-center text-sm font-semibold tracking-tight text-foreground mb-2">
            {MONTH_NAMES[month]} {year}
          </div>
        )}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((wd, i) => (
            <div key={i} className="text-center text-[10px] font-mono text-muted-foreground py-1">
              {wd}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const key = toKey(year, month, day);
            const inRange = key >= minDate && key <= maxDate;
            const price = prices[key];
            const isStart = isRange ? key === value : key === value;
            const isEnd = isRange && !!endValue && key === endValue;
            const inSelectedSpan =
              isRange && rangeStart && rangeEnd && key > rangeStart && key < rangeEnd;

            const level =
              price === undefined || !inRange
                ? 'none'
                : price <= lowCut
                  ? 'low'
                  : price >= highCut
                    ? 'high'
                    : 'mid';

            // Fare shading carries meaning, so it carries colour (Google Flights'
            // green–grey–red ramp): green = cheaper than most days, bare canvas =
            // typical, red = pricier. The value ramp alone (all-grey fills) was
            // too faint to read at a glance on the dark canvas.
            const cellClass = isStart || isEnd
              ? 'bg-primary text-primary-foreground'
              : !inRange
                ? 'text-muted-foreground/30 cursor-default'
                : inSelectedSpan
                  ? 'bg-secondary text-foreground hover:bg-secondary'
                  : !pricesEnabled
                    ? 'hover:bg-white/10 text-foreground'
                    : level === 'low'
                    ? 'bg-accent-green/15 hover:bg-accent-green/25 text-foreground ring-1 ring-inset ring-accent-green/30'
                    : level === 'high'
                      ? 'bg-accent-red/[0.07] hover:bg-accent-red/15 text-foreground/80'
                      : 'bg-white/[0.06] hover:bg-white/12 text-foreground';

            return (
              <button
                key={key}
                type="button"
                disabled={!inRange}
                onClick={() => handlePick(key)}
                onMouseEnter={() => setHoverKey(key)}
                className={`h-11 rounded-md flex flex-col items-center justify-center gap-0 text-xs transition-colors relative outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${cellClass}`}
              >
                <span className={`leading-none ${level === 'low' ? 'font-semibold' : 'font-medium'}`}>{day}</span>
                {inRange && price !== undefined && (
                  <span
                    className={`leading-none mt-0.5 text-[9px] font-mono tabular-nums ${
                      isStart || isEnd
                        ? 'text-primary-foreground/70'
                        : inSelectedSpan
                          ? 'text-foreground/70'
                          : level === 'low'
                            ? 'text-accent-green font-bold'
                            : level === 'high'
                              ? 'text-accent-red/80 font-medium'
                              : 'text-foreground/75 font-medium'
                    }`}
                  >
                    £{Math.round(price)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full bg-card border border-input h-10 px-3 rounded-md text-sm font-medium text-foreground flex items-center gap-2 hover:border-white/40 focus:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring transition-colors"
        >
          <CalendarIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          {isRange ? (
            <span className="truncate flex items-center gap-1.5 min-w-0">
              <span className={value ? 'font-mono tabular-nums' : 'text-muted-foreground'}>{value ? formatDisplay(value) : 'Departure'}</span>
              <span className="text-muted-foreground shrink-0">–</span>
              <span className={endValue ? 'font-mono tabular-nums' : 'text-muted-foreground'}>{endValue ? formatDisplay(endValue) : 'Return'}</span>
            </span>
          ) : value ? (
            <span className="truncate font-mono tabular-nums">{formatDisplay(value)}</span>
          ) : (
            <span className="text-muted-foreground truncate">{placeholder}</span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={align}
        collisionPadding={12}
        className={`${isRange ? 'w-[640px] max-w-[calc(100vw-24px)]' : 'w-[316px]'} p-3 bg-popover border border-border shadow-modal ring-0 gap-0`}
      >
        {/* Header: month nav + (range mode) selection phase hint */}
        <div className="relative flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => goMonth(-1)}
            disabled={ymKey(viewYear, viewMonth) <= minYm}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-border bg-transparent text-foreground hover:bg-secondary disabled:opacity-30 disabled:pointer-events-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {isRange ? (
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              {pickingEnd ? 'Select return date' : 'Select departure date'}
            </span>
          ) : (
            <span className="text-sm font-semibold tracking-tight text-foreground">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
          )}
          <button
            type="button"
            onClick={() => goMonth(1)}
            disabled={lastVisibleYm >= maxYm}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-border bg-transparent text-foreground hover:bg-secondary disabled:opacity-30 disabled:pointer-events-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* One month (single) or two months side by side (range) */}
        <div className="flex gap-4">
          {renderMonth(viewYear, viewMonth)}
          {showSecond && (
            <div className="hidden md:block flex-1 min-w-0">
              {renderMonth(secondMonth.getFullYear(), secondMonth.getMonth())}
            </div>
          )}
        </div>

        {/* Prices are route-specific: without a destination, prompt for one
            instead of showing a misleading fare shading legend. */}
        {!pricesEnabled ? (
          <div className="border-t border-border mt-3 pt-2.5 text-[11px] text-muted-foreground text-center">
            Select a destination to see prices for each day.
          </div>
        ) : (
          <div className="flex items-center justify-center flex-wrap gap-x-3 gap-y-1 border-t border-border mt-3 pt-2.5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-accent-green/25 ring-1 ring-inset ring-accent-green/50"></span>
              <span className="text-accent-green font-medium">Cheaper</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-white/[0.12] border border-border"></span>
              Typical
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-accent-red/20 ring-1 ring-inset ring-accent-red/40"></span>
              <span className="text-accent-red/90 font-medium">Pricier</span>
            </span>
            {isRange && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-primary"></span>
                Selected
              </span>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
