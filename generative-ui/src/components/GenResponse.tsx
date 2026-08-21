import React from 'react';
import type { ChatMessage } from '../hooks/useGenChat';
import type { Flight, IntentJSON } from '../hooks/useFlightFilter';
import { FlightCarousel } from './FlightCarousel';
import { HighlightView } from './layouts/HighlightView';
import { ComparisonView } from './layouts/ComparisonView';
import { CalendarView } from './layouts/CalendarView';
import { TrendView } from './layouts/TrendView';
import { DestinationGridView } from './layouts/DestinationGridView';
import { MapView } from './layouts/MapView';
import { ItineraryView } from './layouts/ItineraryView';
import { BudgetView } from './layouts/BudgetView';
import { RankedView } from './layouts/RankedView';
import { AlertView } from './layouts/AlertView';
import { MultiLegView } from './layouts/MultiLegView';
import { ReturnGroupedView } from './layouts/ReturnGroupedView';
import { isTwoWayResult } from '../lib/returnGroups';

/** Layouts that don't show a flat flight list (no interleaved round-trip confusion). */
const LEG_SAFE_LAYOUTS = new Set(['calendar', 'destinations', 'map', 'trend', 'alert']);

interface GenResponseProps {
  message: ChatMessage;
  onToggleExpand: (messageId: string) => void;
  onSelectFlight: (flight: Flight) => void;
  /** Fresh follow-up via LLM (zero-result alert) */
  onQuickReply?: (text: string) => void;
  /** Refine onto this view's intent (drill-in chips) */
  onRefine?: (patch: Partial<IntentJSON & { layout?: string }>, label: string) => void;
}

export const GenResponse: React.FC<GenResponseProps> = ({
  message,
  onToggleExpand,
  onSelectFlight,
  onQuickReply,
  onRefine,
}) => {
  const flights = message.flights ?? [];
  const intent = message.intent ?? {};
  const layout = message.layout ?? 'grid';

  // Round-trip list layouts interleave legs — group/label unless itinerary has a pair.
  const isRoundTrip = isTwoWayResult(intent) && flights.length > 0;
  const hasLabelledPair = layout === 'itinerary' && Boolean(message.itinerary);
  if (isRoundTrip && !LEG_SAFE_LAYOUTS.has(layout) && !hasLabelledPair) {
    return (
      <ReturnGroupedView flights={flights} intent={intent} onSelectFlight={onSelectFlight} />
    );
  }

  switch (layout) {
    case 'highlight':
      return <HighlightView flights={flights} onSelectFlight={onSelectFlight} />;
    case 'comparison':
      return <ComparisonView flights={flights} onSelectFlight={onSelectFlight} />;
    case 'calendar':
      return <CalendarView flights={flights} intent={intent} onRefine={onRefine} />;
    case 'trend':
      return <TrendView flights={flights} onSelectFlight={onSelectFlight} />;
    case 'destinations':
      return <DestinationGridView flights={flights} intent={intent} onRefine={onRefine} />;
    case 'map':
      return <MapView flights={flights} intent={intent} onRefine={onRefine} />;
    case 'itinerary':
      return message.itinerary ? (
        <ItineraryView pair={message.itinerary} onSelectFlight={onSelectFlight} />
      ) : (
        <FlightCarousel
          flights={flights}
          isExpanded={!!message.isExpanded}
          onToggleExpand={() => onToggleExpand(message.id)}
          onSelectFlight={onSelectFlight}
        />
      );
    case 'budget':
      return <BudgetView flights={flights} intent={intent} onSelectFlight={onSelectFlight} />;
    case 'ranked':
      return <RankedView flights={flights} onSelectFlight={onSelectFlight} />;
    case 'multileg':
      return <MultiLegView flights={flights} onSelectFlight={onSelectFlight} />;
    case 'alert':
      return (
        <AlertView
          intent={intent}
          alternatives={message.alternatives}
          onSelectFlight={onSelectFlight}
          onQuickReply={onQuickReply}
        />
      );
    case 'grid':
    default:
      return (
        <FlightCarousel
          flights={flights}
          isExpanded={!!message.isExpanded}
          onToggleExpand={() => onToggleExpand(message.id)}
          onSelectFlight={onSelectFlight}
        />
      );
  }
};
