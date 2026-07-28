import React from 'react';
import type { Flight } from '../hooks/useFlights';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Plane, Users, Leaf } from 'lucide-react';
import { getCityName } from '../lib/airportMap';
import { StatusLabel } from './StatusLabel';

interface FlightCardProps {
  flight: Flight;
  onSelect: (flight: Flight) => void;
  style?: React.CSSProperties;
}

export const FlightCard: React.FC<FlightCardProps> = ({ flight, onSelect, style }) => {
  const isCancelled = flight.flight_status === 'Cancelled';

  // "Wed 15 Jul" style date so users always know which day a card belongs to
  const formattedDate = (() => {
    const d = new Date(`${flight.date}T00:00:00`);
    return isNaN(d.getTime())
      ? flight.date
      : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  })();

  // Status is a quiet text label, not a filled pill: normal states (Scheduled /
  // On time) are grey with no colour; only the exceptions carry a coloured dot —
  // amber for Delayed, red for Cancelled (Google Flights-style restraint).
  const getStatusBadge = () => <StatusLabel status={flight.flight_status} />;

  // Demand badges stay monochrome; only "Filling Fast" earns an accent (amber),
  // matching the chat apps' compact card. The word "Demand" is dropped below sm
  // so the badge row fits a phone without truncating the cabin class.
  const demandSuffix = <span className="hidden sm:inline"> Demand</span>;
  const getDemandBadge = () => {
    switch (flight.demand_indicator) {
      case 'Low':
        return <Badge variant="outline" className="text-muted-foreground border-border">Low{demandSuffix}</Badge>;
      case 'Medium':
        return <Badge variant="outline" className="text-muted-foreground border-border">Med{demandSuffix}</Badge>;
      case 'High':
        return <Badge variant="outline" className="text-foreground border-border font-medium">High{demandSuffix}</Badge>;
      case 'Filling Fast':
        return <Badge variant="outline" className="text-accent-amber border-accent-amber/40 font-medium animate-pulse">Filling Fast</Badge>;
      default:
        return null;
    }
  };

  // Airline tier is metadata, not a semantic state — it stays monochrome.
  const getAirlineTierBadge = () => (
    <Badge className="bg-secondary text-muted-foreground border-none hover:bg-secondary">{flight.airline_tier}</Badge>
  );

  return (
    <div style={style} className="p-1.5 w-full box-border">
      <Card
        role="button"
        tabIndex={0}
        aria-label={`${flight.airline_name} ${flight.flight_number}, ${flight.origin_code} to ${flight.dest_code}, £${flight.price_gbp.toFixed(2)}`}
        onClick={() => onSelect(flight)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(flight);
          }
        }}
        className={`h-[168px] sm:h-[188px] w-full p-3 sm:p-4 flex flex-col justify-between rounded-lg hover:border-white/20 hover:shadow-card-md transition-all cursor-pointer select-none bg-card border border-border shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          isCancelled ? 'opacity-65 border-dashed bg-secondary/40' : ''
        }`}
      >
        {/* Top Line: Airline details, flight status, and aircraft. On mobile the
            metadata (tier, flight number, aircraft) is dropped so the airline
            name and date stay on one line inside the fixed card height. */}
        <div className="flex justify-between items-center gap-2 text-xs text-muted-foreground min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* Black line-art on transparent: `invert` renders it white so it
                is visible on the dark canvas */}
            <img src="/airline_4586958.png" className="w-4 h-4 object-contain shrink-0 invert" alt="" />
            <span className="font-medium text-foreground text-[13px] sm:text-sm truncate">{flight.airline_name}</span>
            <span className="hidden sm:contents">
              {getAirlineTierBadge()}
              <span className="text-muted-foreground/70">|</span>
              <span className="font-mono">{flight.flight_number}</span>
              <span className="text-muted-foreground/70">•</span>
              <span className="font-mono">{flight.aircraft_type}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono tabular-nums font-medium text-muted-foreground text-[11px] sm:text-xs">{formattedDate}</span>
            <Badge className="hidden sm:inline-flex bg-secondary text-muted-foreground border-transparent hover:bg-secondary text-[10px] font-medium">
              {flight.direction === 'outbound' ? 'Outbound' : 'Return'}
            </Badge>
            {getStatusBadge()}
          </div>
        </div>

        {/* Middle Section: Origin -> Destination, Times, Durations */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          {/* Times & Codes */}
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            {/* Departure */}
            <div className="text-left shrink-0">
              <div className={`text-lg sm:text-xl font-mono tabular-nums font-semibold tracking-tight text-foreground ${isCancelled ? 'line-through text-muted-foreground' : ''}`}>
                {flight.departure_time}
              </div>
              <div className="text-xs sm:text-sm font-mono font-medium text-foreground">{flight.origin_code}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground truncate max-w-[74px] sm:max-w-[120px]">{getCityName(flight.origin_code)}</div>
            </div>

            {/* Travel Line */}
            <div className="flex-1 flex flex-col items-center justify-center min-w-[44px] sm:min-w-[60px]">
              <span className="text-[10px] sm:text-xs text-muted-foreground font-mono tabular-nums font-medium">{flight.duration_formatted}</span>
              <div className="w-full flex items-center justify-center relative my-1">
                <div className="h-[1.5px] bg-border w-full"></div>
                <Plane className={`w-3.5 h-3.5 text-muted-foreground absolute bg-card px-0.5 ${isCancelled ? 'text-border' : ''}`} />
              </div>
              <span className="text-[10px] sm:text-xs font-medium text-muted-foreground">
                {flight.stops === 0 ? 'Direct' : `${flight.stops} Stop`}
              </span>
            </div>

            {/* Arrival */}
            <div className="text-left shrink-0">
              <div className={`text-lg sm:text-xl font-mono tabular-nums font-semibold tracking-tight text-foreground ${isCancelled ? 'line-through text-muted-foreground' : ''}`}>
                {flight.arrival_time}
              </div>
              <div className="text-xs sm:text-sm font-mono font-medium text-foreground">{flight.dest_code}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground truncate max-w-[74px] sm:max-w-[120px]">{getCityName(flight.dest_code)}</div>
            </div>
          </div>

          {/* Price display — fixed width + tabular figures so the fares line up
              vertically across every card in the list. The width is narrower on
              mobile, where a 4-figure fare would otherwise crush the arrival
              block and overlap it. */}
          <div className="w-[86px] sm:w-[128px] shrink-0 flex flex-col justify-center items-end pl-2 sm:pl-4 border-l border-border h-12">
            <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Price</div>
            <div className={`text-base sm:text-2xl font-mono font-semibold tracking-tight text-foreground tabular-nums ${isCancelled ? 'line-through text-muted-foreground' : ''}`}>
              £{flight.price_gbp.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Bottom Section: Details badges */}
        <div className="flex justify-between items-center gap-2 border-t border-border pt-2.5 sm:pt-3 text-[11px] sm:text-xs text-muted-foreground min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="bg-secondary px-1.5 sm:px-2 py-0.5 rounded text-foreground font-medium shrink-0">{flight.cabin_class}</span>
            <span className="flex items-center gap-1 shrink-0">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className={`font-mono tabular-nums ${flight.seats_remaining <= 5 ? 'text-accent-amber font-semibold' : ''}`}>
                {flight.seats_remaining} left
              </span>
            </span>
            <span className="flex items-center gap-1 text-accent-green font-mono tabular-nums shrink-0">
              <Leaf className="w-3.5 h-3.5 text-accent-green" />
              <span>{flight.co2_kg} kg<span className="hidden sm:inline"> CO2</span></span>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {getDemandBadge()}
            {flight.stops > 0 && flight.layover_details && (
              <span className="text-muted-foreground hidden sm:inline max-w-[150px] truncate">
                Via: {flight.layover_details.split(',')[0]}
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};
