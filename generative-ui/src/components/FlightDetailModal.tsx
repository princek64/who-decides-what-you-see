import React from 'react';
import type { Flight } from '../hooks/useFlightFilter';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Badge } from './ui/badge';
import { ShieldCheck, Briefcase, Utensils } from 'lucide-react';
import { getCityName } from '../lib/airportMap';
import { formatFlightDate } from '../lib/utils';

interface FlightDetailModalProps {
  flight: Flight | null;
  isOpen: boolean;
  onClose: () => void;
}

export const FlightDetailModal: React.FC<FlightDetailModalProps> = ({ flight, isOpen, onClose }) => {
  if (!flight) return null;

  const originCity = getCityName(flight.origin_code);
  const destCity = getCityName(flight.dest_code);

  const getDemandColor = (indicator: string) => {
    switch (indicator) {
      case 'Low': return 'text-muted-foreground bg-transparent border-border';
      case 'Medium': return 'text-muted-foreground bg-transparent border-border';
      case 'High': return 'text-foreground bg-transparent border-border font-medium';
      case 'Filling Fast': return 'text-accent-red bg-transparent border-accent-red/40 font-medium';
      default: return 'text-muted-foreground bg-transparent border-border';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6 bg-card rounded-lg shadow-none border border-border">
        <DialogHeader className="border-b border-border pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <DialogTitle className="text-xl font-heading font-semibold text-foreground flex items-center gap-2">
                <span>{flight.airline_name}</span>
                <span className="text-sm font-mono tabular-nums font-normal text-muted-foreground">({flight.flight_number})</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1 font-normal uppercase tracking-wider font-mono">
                Flight ID: {flight.flight_id} • Aircraft: {flight.aircraft_type}
              </DialogDescription>
            </div>
            <div className="flex gap-2">
              <Badge className="bg-foreground text-background border border-transparent font-medium capitalize rounded-full">
                {flight.direction}
              </Badge>
              <Badge className={`border rounded-full ${getDemandColor(flight.demand_indicator)}`}>
                {flight.demand_indicator} Demand
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {/* Layout Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
          {/* Column 1: Schedule & Route */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider font-mono flex items-center gap-1.5">
              {/* Black line-art on transparent: `invert` renders it white so it
                  is visible on the dark canvas (same fix as FlightSketchLogo) */}
              <img src="/gps_18222531.png" className="w-4 h-4 object-contain opacity-70 invert" alt="" />
              Route & Schedule
            </h3>

            <div className="bg-muted rounded-lg p-4 space-y-4">
              {/* Origin */}
              <div>
                <span className="text-[10px] font-mono font-medium text-muted-foreground uppercase">Departure</span>
                <div className="text-base font-mono tabular-nums font-semibold text-foreground">{flight.departure_time}</div>
                <div className="text-xs font-medium text-muted-foreground">
                  {originCity} ({flight.origin_code})
                </div>
                <div className="text-[10px] text-muted-foreground font-normal mt-0.5">
                  Terminal {flight.origin_terminal} • {formatFlightDate(flight.date)}
                </div>
              </div>

              {/* Arrow spacer */}
              <div className="flex items-center gap-2">
                <div className="h-[1px] bg-border flex-1"></div>
                <span className="text-[10px] font-mono tabular-nums font-medium text-muted-foreground bg-card px-2 py-0.5 border border-border rounded-full">
                  {flight.duration_formatted}
                </span>
                <div className="h-[1px] bg-border flex-1"></div>
              </div>

              {/* Destination */}
              <div>
                <span className="text-[10px] font-mono font-medium text-muted-foreground uppercase">Arrival</span>
                <div className="text-base font-mono tabular-nums font-semibold text-foreground">{flight.arrival_time}</div>
                <div className="text-xs font-medium text-muted-foreground">
                  {destCity} ({flight.dest_code})
                </div>
                <div className="text-[10px] text-muted-foreground font-normal mt-0.5">
                  Arrives: {formatFlightDate(flight.arrival_date)}
                </div>
              </div>

              {/* Stop info */}
              <div className="border-t border-border pt-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-normal text-muted-foreground">Total Stops:</span>
                  <span className="font-medium text-foreground">
                    {flight.stops === 0 ? 'Non-stop' : `${flight.stops} Stop`}
                  </span>
                </div>
                {flight.stops > 0 && (
                  <div className="mt-1 bg-card p-2 border border-border rounded-md text-[11px] text-muted-foreground">
                    Layover: {flight.layover_details}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Column 2: Pricing, Policies & Logistics */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider font-mono flex items-center gap-1.5">
              <img src="/boarding-pass_17210294.png" className="w-4 h-4 object-contain opacity-70 invert" alt="" />
              Pricing & Policies
            </h3>

            <div className="bg-muted rounded-lg p-4 space-y-3 text-xs">
              <div className="flex justify-between items-center gap-4 border-b border-border pb-2">
                <span className="font-normal text-muted-foreground">Cabin Class:</span>
                <Badge className="bg-card border border-border font-medium text-muted-foreground rounded-full shrink-0">
                  {flight.cabin_class}
                </Badge>
              </div>

              <div className="flex justify-between items-center gap-4 border-b border-border pb-2">
                <span className="font-normal text-muted-foreground">Ticket Price:</span>
                <span className="text-lg font-mono tabular-nums font-semibold text-foreground shrink-0">
                  £{flight.price_gbp.toFixed(2)} <span className="text-[10px] text-muted-foreground font-medium">GBP</span>
                </span>
              </div>

              <div className="flex justify-between items-center gap-4 border-b border-border pb-2">
                <span className="font-normal text-muted-foreground">Seats Remaining:</span>
                <span className={`font-medium font-mono tabular-nums shrink-0 ${flight.seats_remaining <= 5 ? 'text-accent-red' : 'text-muted-foreground'}`}>
                  {flight.seats_remaining} seats left
                </span>
              </div>

              <div className="flex justify-between items-start gap-4 border-b border-border pb-2">
                <span className="font-normal text-muted-foreground flex items-center gap-1 shrink-0 mt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
                  Flexibility:
                </span>
                <span className="font-medium text-muted-foreground text-right">
                  {flight.flexibility_policy}
                </span>
              </div>

              <div className="flex justify-between items-start gap-4 border-b border-border pb-2">
                <span className="font-normal text-muted-foreground flex items-center gap-1 shrink-0 mt-0.5">
                  <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                  Baggage Policy:
                </span>
                <span className="font-medium text-muted-foreground text-right">
                  {flight.baggage_policy}
                </span>
              </div>

              <div className="flex justify-between items-center gap-4">
                <span className="font-normal text-muted-foreground flex items-center gap-1 shrink-0">
                  <Utensils className="w-3.5 h-3.5 text-muted-foreground" />
                  In-flight Meal:
                </span>
                <span className="font-medium text-muted-foreground text-right">
                  {flight.meal}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Environmental Footprint */}
        <div className="mt-6 bg-muted border border-border rounded-lg p-4 text-xs flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-card border border-border rounded-full">
              <img src="/tour_16960244.png" className="w-5 h-5 object-contain invert" alt="" />
            </div>
            <div>
              <div className="font-semibold text-foreground">CO₂ Carbon Emissions</div>
              <div className="text-[11px] text-muted-foreground font-normal">Estimated greenhouse gas output for route</div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-lg font-mono tabular-nums font-semibold text-accent-green">{flight.co2_kg} kg</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
