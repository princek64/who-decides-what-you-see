import React from 'react';
import type { Flight } from '../hooks/useFlights';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Badge } from './ui/badge';
import { getCityName } from '../lib/airportMap';
import { Leaf, PlaneTakeoff, PlaneLanding, Users, ShieldCheck, Briefcase, Utensils } from 'lucide-react';

interface FlightDetailModalProps {
  /** One flight (one-way) or [outbound, return] for a round trip */
  flights: Flight[] | null;
  adults: number;
  isOpen: boolean;
  onClose: () => void;
}

const formatLegDate = (dateStr: string) => {
  const d = new Date(`${dateStr}T00:00:00`);
  return isNaN(d.getTime())
    ? dateStr
    : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

// Normal states stay quiet; only the exceptions carry an accent — amber for
// Delayed, red for Cancelled. Mirrors StatusLabel's restraint in the results list.
const getStatusBadge = (status: Flight['flight_status']) => {
  switch (status) {
    case 'On time':
      return <Badge className="bg-secondary text-muted-foreground border-transparent">On Time</Badge>;
    case 'Delayed':
      return <Badge className="bg-transparent text-accent-amber border-accent-amber/40">Delayed</Badge>;
    case 'Cancelled':
      return <Badge className="bg-transparent text-accent-red border-accent-red/40">Cancelled</Badge>;
    default:
      return <Badge className="bg-secondary text-muted-foreground border-transparent">Scheduled</Badge>;
  }
};

const getDemandColor = (indicator: string) => {
  switch (indicator) {
    case 'Low': return 'text-muted-foreground bg-transparent border-border';
    case 'Medium': return 'text-muted-foreground bg-transparent border-border';
    case 'High': return 'text-foreground bg-transparent border-border font-medium';
    case 'Filling Fast': return 'text-accent-amber bg-transparent border-accent-amber/40 font-medium animate-pulse';
    default: return 'text-muted-foreground bg-transparent border-border';
  }
};

const Field: React.FC<{ label: string; value: React.ReactNode; wide?: boolean }> = ({ label, value, wide }) => (
  <div className={`flex flex-col min-w-0 ${wide ? 'col-span-2 sm:col-span-3' : ''}`}>
    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">{label}</span>
    <span className="text-xs font-medium text-foreground">{value}</span>
  </div>
);

// layover_details is "CODE, City, Country, duration" (e.g. "FRA, Frankfurt,
// Germany, 2h 32m") — the city segment is what belongs in the route line.
const getStopCity = (flight: Flight): string | null => {
  if (flight.stops <= 0 || !flight.layover_details) return null;
  const city = flight.layover_details.split(',')[1]?.trim();
  return city || null;
};

const LegSection: React.FC<{ flight: Flight; leg: 'outbound' | 'return' | 'single' }> = ({ flight, leg }) => {
  const isCancelled = flight.flight_status === 'Cancelled';
  const stopCity = getStopCity(flight);
  return (
    <div className={`border border-border rounded-lg overflow-hidden bg-card ${isCancelled ? 'opacity-75' : ''}`}>
      {/* Leg header */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-secondary border-b border-border">
        {leg === 'return' ? (
          <PlaneLanding className="w-4 h-4 text-foreground shrink-0" />
        ) : (
          <PlaneTakeoff className="w-4 h-4 text-foreground shrink-0" />
        )}
        <span className="text-sm font-semibold tracking-tight text-foreground">
          {leg === 'single' ? 'Flight' : leg === 'outbound' ? 'Outbound' : 'Return'}
        </span>
        <span className="text-xs text-muted-foreground">
          {getCityName(flight.origin_code)} ({flight.origin_code})
          {stopCity && ` → ${stopCity}`}
          {' '}→ {getCityName(flight.dest_code)} ({flight.dest_code}) · {formatLegDate(flight.date)}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[11px] font-mono text-muted-foreground">{flight.flight_number}</span>
          {getStatusBadge(flight.flight_status)}
        </span>
      </div>

      {/* Leg details */}
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-3.5">
        <Field
          label="Departure"
          value={
            <>
              <span className={`text-sm font-semibold tracking-tight ${isCancelled ? 'line-through' : ''}`}>{flight.departure_time}</span>
              {' '}· {flight.origin_code} · Terminal {flight.origin_terminal}
            </>
          }
        />
        <Field
          label="Arrival"
          value={
            <>
              <span className={`text-sm font-semibold tracking-tight ${isCancelled ? 'line-through' : ''}`}>{flight.arrival_time}</span>
              {' '}· {flight.dest_code} · {formatLegDate(flight.arrival_date)}
            </>
          }
        />
        <Field
          label="Duration"
          value={`${flight.duration_formatted} · ${flight.stops === 0 ? 'Direct' : `${flight.stops} Stop`}`}
        />
        <Field label="Airline" value={`${flight.airline_name} (${flight.airline_tier})`} />
        <Field label="Aircraft" value={<span className="font-mono">{flight.aircraft_type}</span>} />
        <Field label="Cabin Class" value={flight.cabin_class} />
        <Field
          label="Baggage"
          value={<span className="flex items-center gap-1"><Briefcase className="w-3 h-3 text-muted-foreground shrink-0" />{flight.baggage_policy}</span>}
        />
        <Field
          label="Meal"
          value={<span className="flex items-center gap-1"><Utensils className="w-3 h-3 text-muted-foreground shrink-0" />{flight.meal}</span>}
        />
        <Field
          label="Flexibility"
          value={<span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-muted-foreground shrink-0" />{flight.flexibility_policy}</span>}
        />
        <Field
          label="Seats Left"
          value={
            <span className={`flex items-center gap-1 font-mono tabular-nums ${flight.seats_remaining <= 5 ? 'text-accent-amber font-semibold' : ''}`}>
              <Users className="w-3 h-3 text-muted-foreground shrink-0" />
              {flight.seats_remaining} seats
            </span>
          }
        />
        <Field
          label="Demand"
          value={
            <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-medium ${getDemandColor(flight.demand_indicator)}`}>
              {flight.demand_indicator}
            </span>
          }
        />
        <Field
          label="CO₂ Emissions"
          value={
            <span className="flex items-center gap-1 text-accent-green font-mono tabular-nums">
              <Leaf className="w-3 h-3 shrink-0" />
              {flight.co2_kg} kg
            </span>
          }
        />
        {flight.stops > 0 && flight.layover_details && (
          <Field wide label="Layover" value={<span className="text-muted-foreground">{flight.layover_details}</span>} />
        )}
      </div>

      {/* Leg fare */}
      <div className="flex justify-between items-center px-4 py-2.5 border-t border-border bg-background text-xs">
        <span className="text-muted-foreground">Fare per adult</span>
        <span className={`text-sm font-semibold tracking-tight text-foreground ${isCancelled ? 'line-through text-muted-foreground' : ''}`}>
          £{flight.price_gbp.toFixed(2)}
        </span>
      </div>
    </div>
  );
};

// Centered dialog showing the full details of a one-way flight, or both
// legs of a round-trip itinerary together, with a trip-total fare summary.
export const FlightDetailModal: React.FC<FlightDetailModalProps> = ({ flights, adults, isOpen, onClose }) => {
  if (!flights || flights.length === 0) return null;

  const isRoundTrip = flights.length === 2;
  const [outbound, inbound] = flights;
  const farePerAdult = flights.reduce((sum, f) => sum + f.price_gbp, 0);
  const total = farePerAdult * adults;

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto p-6 bg-card rounded-xl border border-border shadow-modal gap-0">
        <DialogHeader className="pb-4 text-left">
          <DialogTitle className="text-xl font-semibold tracking-tight text-foreground">
            {getCityName(outbound.origin_code)} {isRoundTrip ? '⇄' : '→'} {getCityName(outbound.dest_code)}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
            {isRoundTrip ? 'Round trip' : 'One-way'} · {adults} adult{adults === 1 ? '' : 's'} · {flights.map((f) => f.flight_id).join(' + ')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <LegSection flight={outbound} leg={isRoundTrip ? 'outbound' : 'single'} />
          {isRoundTrip && <LegSection flight={inbound} leg="return" />}

          {/* Trip total — the page's single inverted "look here" surface */}
          <div className="bg-muted border border-border rounded-lg px-5 py-4 flex flex-wrap justify-between items-center gap-3">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground tracking-tight">Trip total</span>
              <span className="text-[11px] text-muted-foreground">
                {isRoundTrip ? 'Both flights' : 'One flight'} · £{farePerAdult.toFixed(2)} per adult × {adults} adult{adults === 1 ? '' : 's'}
              </span>
            </div>
            <span className="text-2xl font-semibold tracking-tight text-foreground">£{total.toFixed(2)}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
