import React, { useMemo, useState } from 'react';
import type { FilterState } from '../hooks/useFlights';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Slider } from './ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ChevronDown, SlidersHorizontal, RotateCcw, Leaf, Ban } from 'lucide-react';

interface FilterBarProps {
  filters: FilterState;
  uniqueAirlines: string[];
  airlinePrices: Record<string, number>;
  medianCo2: number;
  // Round trips get independent outbound/return time-of-day filters; one-way
  // searches only ever have an outbound leg, so they keep the single control.
  isRoundTrip: boolean;
  onFilterChange: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onReset: () => void;
}

// A single dropdown "chip" in the persistent filter row (Google Flights style):
// a pill trigger that opens a popover of controls. Active chips are filled with
// the foreground token (per DESIGN.md), inactive chips are ghost outlines.
const FilterChip: React.FC<{
  label: string;
  active?: boolean;
  children: React.ReactNode;
  contentClassName?: string;
}> = ({ label, active, children, contentClassName }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        className={`h-9 shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          active
            ? 'bg-foreground text-background border-foreground hover:bg-foreground/90'
            : 'bg-transparent text-foreground border-border hover:bg-secondary'
        }`}
      >
        {label}
        <ChevronDown className={`w-3.5 h-3.5 ${active ? 'text-background/70' : 'text-muted-foreground'}`} />
      </button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      className={`w-64 bg-popover border border-border shadow-modal p-3 text-left ${contentClassName ?? ''}`}
    >
      {children}
    </PopoverContent>
  </Popover>
);

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  uniqueAirlines,
  airlinePrices,
  medianCo2,
  isRoundTrip,
  onFilterChange,
  onReset,
}) => {
  const [showAllAirlines, setShowAllAirlines] = useState(false);

  const handleAirlineToggle = (airline: string, checked: boolean) => {
    const updated = checked
      ? [...filters.airlines, airline]
      : filters.airlines.filter((a) => a !== airline);
    onFilterChange('airlines', updated);
  };

  const displayedAirlines = showAllAirlines ? uniqueAirlines : uniqueAirlines.slice(0, 6);

  // Chip active states + labels reflecting the current selection
  const priceActive = filters.priceRange[0] > 0 || filters.priceRange[1] < 1500;
  const stopsLabel = filters.stops === 'all' ? 'Stops' : filters.stops === 'direct' ? 'Direct only' : '1 stop max';
  const airlinesLabel = filters.airlines.length > 0 ? `Airlines · ${filters.airlines.length}` : 'Airlines';

  const TIME_OPTIONS: { value: FilterState['departureTime']; label: string }[] = [
    { value: 'all', label: 'Any time' },
    { value: 'morning', label: 'Morning (06:00 – 11:59)' },
    { value: 'afternoon', label: 'Afternoon (12:00 – 17:59)' },
    { value: 'evening', label: 'Evening (18:00 – 23:59)' },
    { value: 'night', label: 'Night (00:00 – 05:59)' },
  ];
  const outboundTimeActive = filters.departureTime !== 'all';
  const returnTimeActive = isRoundTrip && filters.departureTimeReturn !== 'all';
  const timesActiveCount = (outboundTimeActive ? 1 : 0) + (returnTimeActive ? 1 : 0);
  const timesLabel = timesActiveCount === 0
    ? 'Times'
    : isRoundTrip
      ? `Times · ${timesActiveCount}`
      : `Times · ${TIME_OPTIONS.find((o) => o.value === filters.departureTime)?.label.split(' ')[0]}`;

  const moreActiveCount = useMemo(() => {
    let count = 0;
    if (filters.flexibility !== 'all') count++;
    if (filters.demandIndicator !== 'all') count++;
    if (filters.flightStatus !== 'all') count++;
    if (filters.lowCo2Only) count++;
    if (filters.includeCancelled) count++;
    return count;
  }, [filters]);

  const anyActive =
    priceActive ||
    filters.stops !== 'all' ||
    filters.airlines.length > 0 ||
    timesActiveCount > 0 ||
    moreActiveCount > 0;

  return (
    <div className="w-full">
      {/* Chips WRAP on a phone rather than scrolling sideways: a horizontal
          scroller left the last chip sliced at the screen edge, and a fade
          affordance is invisible on this near-black canvas. Desktop keeps the
          single Google-Flights-style row. */}
      <div className="w-full flex flex-wrap sm:flex-nowrap items-center gap-2 pb-1 sm:overflow-x-auto sm:scrollbar-thin">
      <span className="shrink-0 mr-0.5 text-muted-foreground">
        <SlidersHorizontal className="w-4 h-4" />
      </span>

      {/* Stops */}
      <FilterChip label={stopsLabel} active={filters.stops !== 'all'}>
        <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Stops</span>
        <div className="mt-2 grid grid-cols-3 border border-border rounded-md overflow-hidden bg-card text-xs">
          {(['all', 'direct', '1stop'] as const).map((stopOpt) => (
            <button
              key={stopOpt}
              type="button"
              onClick={() => onFilterChange('stops', stopOpt)}
              className={`py-2 font-medium transition-all border-r border-border last:border-r-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset relative focus-visible:z-10 ${
                filters.stops === stopOpt
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              {stopOpt === 'all' ? 'All' : stopOpt === 'direct' ? 'Direct' : '1 Stop'}
            </button>
          ))}
        </div>
      </FilterChip>

      {/* Airlines */}
      <FilterChip label={airlinesLabel} active={filters.airlines.length > 0}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Airlines</span>
          {filters.airlines.length > 0 && (
            <button
              type="button"
              onClick={() => onFilterChange('airlines', [])}
              className="text-[11px] font-medium text-link hover:text-link-deep"
            >
              Clear
            </button>
          )}
        </div>
        <div className="mt-2 max-h-56 overflow-y-auto flex flex-col gap-2.5 overscroll-contain">
          {uniqueAirlines.length === 0 ? (
            <span className="text-muted-foreground text-xs italic">No airlines found</span>
          ) : (
            displayedAirlines.map((airline) => {
              const isChecked = filters.airlines.includes(airline);
              const price = airlinePrices[airline];
              return (
                <div
                  key={airline}
                  className="flex items-center gap-2 text-xs w-full rounded px-1.5 -mx-1.5 py-1 hover:bg-secondary transition-colors"
                >
                  <Checkbox
                    id={`bar-airline-${airline}`}
                    checked={isChecked}
                    onCheckedChange={(checked) => handleAirlineToggle(airline, !!checked)}
                    className="border-border shrink-0"
                  />
                  <label
                    htmlFor={`bar-airline-${airline}`}
                    className="text-foreground font-medium cursor-pointer select-none truncate flex justify-between items-center gap-2 w-full"
                  >
                    <span className="truncate">{airline}</span>
                    {price !== undefined && (
                      <span className="text-muted-foreground font-mono text-[10px] shrink-0 tabular-nums text-right">
                        from £{price.toFixed(0)}
                      </span>
                    )}
                  </label>
                </div>
              );
            })
          )}
        </div>
        {uniqueAirlines.length > 6 && (
          <button
            type="button"
            onClick={() => setShowAllAirlines(!showAllAirlines)}
            className="text-left text-xs font-medium text-link hover:text-link-deep mt-2 self-start"
          >
            {showAllAirlines ? 'Show fewer airlines' : `Show all airlines (${uniqueAirlines.length})`}
          </button>
        )}
      </FilterChip>

      {/* Price */}
      <FilterChip label={priceActive ? `Up to £${filters.priceRange[1]}` : 'Price'} active={priceActive}>
        <div className="flex justify-between items-center text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          <span>Max Price</span>
          <span className="text-foreground font-semibold text-sm font-mono tabular-nums tracking-tight">£{filters.priceRange[1]}</span>
        </div>
        <Slider
          value={[filters.priceRange[1]]}
          max={1500}
          // £5 steps: £20 made common round budgets (£150, £250) unreachable —
          // the slider snapped to £140/£160 either side of them.
          step={5}
          onValueChange={(val) => onFilterChange('priceRange', [0, val[0]])}
          className="mt-3"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground font-mono tabular-nums mt-1">
          <span>£0</span>
          <span>£1,500</span>
        </div>
      </FilterChip>

      {/* Times — round trips get independent outbound/return controls so a
          search can target e.g. "morning outbound, evening return"; one-way
          searches only ever have an outbound leg, so they keep one list. */}
      <FilterChip label={timesLabel} active={timesActiveCount > 0} contentClassName={isRoundTrip ? 'w-72' : undefined}>
        {isRoundTrip ? (
          <div className="flex flex-col gap-3">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Outbound Departure</span>
              <div className="mt-2 flex flex-col gap-1">
                {TIME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onFilterChange('departureTime', opt.value)}
                    className={`text-left text-xs font-medium rounded-md px-2.5 py-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                      filters.departureTime === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Return Departure</span>
              <div className="mt-2 flex flex-col gap-1">
                {TIME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onFilterChange('departureTimeReturn', opt.value)}
                    className={`text-left text-xs font-medium rounded-md px-2.5 py-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                      filters.departureTimeReturn === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Departure Time</span>
            <div className="mt-2 flex flex-col gap-1">
              {TIME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onFilterChange('departureTime', opt.value)}
                  className={`text-left text-xs font-medium rounded-md px-2.5 py-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                    filters.departureTime === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-secondary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </FilterChip>

      {/* All (advanced) filters */}
      <FilterChip
        label={moreActiveCount > 0 ? `All filters · ${moreActiveCount}` : 'All filters'}
        active={moreActiveCount > 0}
        contentClassName="w-72"
      >
        <div className="flex flex-col gap-4">
          {/* Flexibility */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Flexibility Policy</span>
            <Select value={filters.flexibility} onValueChange={(val) => onFilterChange('flexibility', val as any)}>
              <SelectTrigger className="bg-transparent border-border h-9 font-medium text-foreground text-xs rounded-md">
                <SelectValue placeholder="Select Policy" />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border shadow-modal text-xs">
                <SelectItem value="all">All Policies</SelectItem>
                <SelectItem value="Non-refundable">Non-refundable</SelectItem>
                <SelectItem value="Changeable">Changeable for a fee</SelectItem>
                <SelectItem value="Fully flexible">Fully Flexible</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Demand */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Demand Level</span>
            <Select value={filters.demandIndicator} onValueChange={(val) => onFilterChange('demandIndicator', val as any)}>
              <SelectTrigger className="bg-transparent border-border h-9 font-medium text-foreground text-xs rounded-md">
                <SelectValue placeholder="Select Demand" />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border shadow-modal text-xs">
                <SelectItem value="all">All Demand Levels</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Filling Fast">Filling Fast</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Flight Status */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Flight Status</span>
            <Select value={filters.flightStatus} onValueChange={(val) => onFilterChange('flightStatus', val as any)}>
              <SelectTrigger className="bg-transparent border-border h-9 font-medium text-foreground text-xs rounded-md">
                <SelectValue placeholder="Select Status" />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border shadow-modal text-xs">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Scheduled">Scheduled</SelectItem>
                <SelectItem value="On time">On Time</SelectItem>
                <SelectItem value="Delayed">Delayed</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Toggles */}
          <div className="flex flex-col gap-3.5 border-t border-border pt-3.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex flex-col text-left">
                <span className="font-medium text-foreground flex items-center gap-1">
                  <Leaf className="w-3.5 h-3.5 text-accent-green" />
                  Low Emissions Only
                </span>
                <span className="text-[10px] text-muted-foreground">CO₂ ≤ median (<span className="font-mono tabular-nums">{medianCo2.toFixed(1)} kg</span>)</span>
              </div>
              <Checkbox
                id="bar-co2-toggle"
                checked={filters.lowCo2Only}
                onCheckedChange={(checked) => onFilterChange('lowCo2Only', !!checked)}
                className="border-border w-4 h-4"
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex flex-col text-left">
                <span className="font-medium text-foreground flex items-center gap-1">
                  <Ban className="w-3.5 h-3.5 text-muted-foreground" />
                  Show Cancelled Flights
                </span>
                <span className="text-[10px] text-muted-foreground">Include cancelled operations</span>
              </div>
              <Checkbox
                id="bar-cancelled-toggle"
                checked={filters.includeCancelled}
                onCheckedChange={(checked) => onFilterChange('includeCancelled', !!checked)}
                className="border-border w-4 h-4"
              />
            </div>
          </div>
        </div>
      </FilterChip>

      {anyActive && (
        <Button
          variant="ghost"
          onClick={onReset}
          className="shrink-0 h-9 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary gap-1.5 rounded-full px-3"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </Button>
      )}
      </div>
    </div>
  );
};
