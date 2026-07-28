import React from 'react';
import { Button } from './ui/button';
import type { SortType } from '../hooks/useFlights';
import { ArrowUpDown, Clock, Sun, Moon } from 'lucide-react';

interface SortBarProps {
  sortType: SortType;
  onChange: (sort: SortType) => void;
}

export const SortBar: React.FC<SortBarProps> = ({ sortType, onChange }) => {
  // `mobile: false` hides the option below sm — the departure-time sorts cost a
  // whole extra button row on a phone. Sort-type names and values are unchanged,
  // so the logged sort_change payloads stay identical.
  const options: { value: SortType; label: string; icon: React.ReactNode; mobile: boolean }[] = [
    { value: 'cheapest', label: 'Cheapest First', icon: <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />, mobile: true },
    { value: 'fastest', label: 'Fastest First', icon: <Clock className="w-3.5 h-3.5 mr-1.5" />, mobile: true },
    { value: 'earliest', label: 'Earliest Dep.', icon: <Sun className="w-3.5 h-3.5 mr-1.5" />, mobile: false },
    { value: 'latest', label: 'Latest Dep.', icon: <Moon className="w-3.5 h-3.5 mr-1.5" />, mobile: false },
  ];

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-border pb-3 mb-2">
      <span className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">Sort Results By:</span>
      <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
        {options.map((opt) => {
          const isActive = sortType === opt.value;
          return (
            <Button
              key={opt.value}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              onClick={() => onChange(opt.value)}
              className={`text-xs h-8 flex-1 sm:flex-initial font-medium rounded-md transition-all ${
                // A hidden sort stays reachable if it is somehow active
                opt.mobile || isActive ? 'inline-flex' : 'hidden sm:inline-flex'
              } ${
                isActive
                  ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  : 'text-muted-foreground border-border bg-transparent hover:bg-secondary hover:text-foreground'
              }`}
            >
              {opt.icon}
              {opt.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
};
