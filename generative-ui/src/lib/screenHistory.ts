import type { IntentJSON } from '../hooks/useFlightFilter';
import { resolveDestCodes } from '../hooks/useFlightFilter';
import type { ChatMessage } from '../hooks/useGenChat';

/**
 * How many superseded screens stay visible above the current one. Two is the
 * brief: enough to refer back to what you just came from, few enough that the
 * collapsed rows never become a scrolling list of their own. Anything older is
 * dropped from the canvas (it stays in `messages` and in the session log).
 */
export const MAX_HISTORY_SCREENS = 2;

const hasText = (v?: string): boolean => Boolean(v && v.trim());

const namesDestination = (intent: IntentJSON): boolean =>
  hasText(intent.dest_city) || hasText(intent.dest_code);

const namesDates = (intent: IntentJSON): boolean =>
  hasText(intent.date) || hasText(intent.date_from) || hasText(intent.date_to);

/**
 * Destination as the SET OF AIRPORT CODES it resolves to, so "Barcelona" and
 * "BCN" are recognised as the same place. Comparing the raw strings would read
 * a city/code swap between two turns as a new destination and split one search
 * across two screens.
 */
const destinationKey = (intent: IntentJSON): string =>
  [...resolveDestCodes(intent)].sort().join(',');

const dateKey = (intent: IntentJSON): string =>
  [intent.date, intent.date_from, intent.date_to].map((d) => d?.trim() ?? '').join('|');

/**
 * True when the incoming screen REFINES the one on canvas rather than replacing
 * it — same destination, same dates, only the narrowing/ordering changed. Those
 * turns update the current screen in place and leave the history untouched;
 * only a new destination or a new date pushes the current screen into history.
 *
 * A turn that names neither a destination nor a date ("show me only direct
 * flights", "sort by fastest", the refine chips) is a refinement by definition:
 * it cannot be a new destination or date query, so it never pushes history —
 * this also covers the case where the model answers a follow-up without
 * echoing back the destination it is still working on.
 */
export const isInPlaceRefinement = (
  previous: IntentJSON | undefined,
  next: IntentJSON
): boolean => {
  if (!previous) return false;
  if (!namesDestination(next) && !namesDates(next)) return true;
  return destinationKey(previous) === destinationKey(next) && dateKey(previous) === dateKey(next);
};

/** Index of the newest rendered screen in a message list, or -1. */
const lastScreenIndex = (messages: ChatMessage[]): number =>
  messages.reduce((found, m, i) => (m.role === 'assistant' && m.intent ? i : found), -1);

/**
 * Land a freshly built screen in the message list.
 *
 * A refinement of what is already on canvas REPLACES that screen rather than
 * stacking a near-duplicate behind it: appending would push a screen into
 * history that the user never navigated away from, so two clicks of "sort by
 * fastest" would bury the original search under its own variations. A new
 * destination or date appends, and the screen it replaces becomes the top of
 * the history stack.
 *
 * The replacement keeps the previous screen's id, so React reconciles it as the
 * same screen updating instead of remounting — which is also what stops the
 * canvas jumping back to the top on an in-place refinement.
 */
export const placeScreen = (messages: ChatMessage[], screen: ChatMessage): ChatMessage[] => {
  const index = lastScreenIndex(messages);
  if (index === -1 || !isInPlaceRefinement(messages[index].intent, screen.intent ?? {})) {
    return [...messages, screen];
  }
  const next = [...messages];
  next[index] = { ...screen, id: messages[index].id };
  return next;
};

/**
 * The superseded screens to show above the current one, oldest first and capped
 * at MAX_HISTORY_SCREENS. Everything still in the list is a screen the user
 * genuinely navigated away from (refinements replaced theirs rather than
 * appending), so this is a straight window over the tail.
 */
export const visibleHistory = (
  messages: ChatMessage[],
  currentScreenId: string | undefined
): ChatMessage[] =>
  messages
    .filter((m) => m.role === 'assistant' && m.id !== currentScreenId)
    .slice(-MAX_HISTORY_SCREENS);
