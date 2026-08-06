import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Flight } from "../hooks/useFlightFilter"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Dummy booking URL — this is a research prototype, not a real booking flow;
// the link only needs to show that clicking through to book is the next step.
export function bookingHref(f: Flight): string {
  return `https://www.${f.airline_name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.example/book/${f.flight_id}`
}

// Single source of truth for human-format dates shown to the user. Weekday is
// included so flexible-date searches ("cheapest weekend") are answerable by
// reading the date alone ("Tue 14 Jul", never "2026-07-14"). Falls back to the
// raw string if it isn't a parseable ISO date. Mirrors conversational-ui.
export function formatFlightDate(date: string | null | undefined): string {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  return isNaN(d.getTime())
    ? date
    : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
