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

/**
 * Layouts that do NOT render a flat list of individual flights, so a merged
 * round-trip result set cannot confuse the two legs inside them: the aggregate
 * views summarise across dates or destinations rather than listing rows, alert
 * is the zero-result state, and itinerary already presents an outbound/return
 * pair with each leg labelled.
 */
const LEG_SAFE_LAYOUTS = new Set(['calendar', 'destinations', 'map', 'trend', 'alert']);

interface GenResponseProps {
  message: ChatMessage;
  onToggleExpand: (messageId: string) => void;
  onSelectFlight: (flight: Flight) => void;
  /** Fresh follow-up query through the LLM (used by the zero-result alert) */
  onQuickReply?: (text: string) => void;
  /** Compose a refinement onto this view's intent (drill-in chips) */
  onRefine?: (patch: Partial<IntentJSON & { layout?: string }>, label: string) => void;
}

// The generative step: one dispatcher, twelve templates. The layout was
// chosen by the model, validated, and possibly overridden (alert / fallback)
// in useGenChat — by the time we're here it is always renderable.
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

  // A round trip handed to any list layout arrives as one price-sorted array
  // with both legs interleaved, and nothing in those layouts says which row
  // flies which way. Group and label the legs instead. The itinerary layout is
  // exempt only when it actually has a pair to show — its fallback is the flat
  // carousel, which has the same problem.
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
      // The proven conversational-UI presentation, reused wholesale
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
