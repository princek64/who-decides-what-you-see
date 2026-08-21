import type { IntentJSON } from '../hooks/useFlightFilter';
import { resolveDestCodes } from '../hooks/useFlightFilter';
import type { ChatMessage } from '../hooks/useGenChat';

/** How many superseded screens stay visible above the current one (0 = live only). */
export const MAX_HISTORY_SCREENS = 0;

const hasText = (v?: string): boolean => Boolean(v && v.trim());

const namesDestination = (intent: IntentJSON): boolean =>
  hasText(intent.dest_city) || hasText(intent.dest_code);

const namesDates = (intent: IntentJSON): boolean =>
  hasText(intent.date) || hasText(intent.date_from) || hasText(intent.date_to);

/** Destination as sorted airport codes so "Barcelona" and "BCN" match. */
const destinationKey = (intent: IntentJSON): string =>
  [...resolveDestCodes(intent)].sort().join(',');

const dateKey = (intent: IntentJSON): string =>
  [intent.date, intent.date_from, intent.date_to].map((d) => d?.trim() ?? '').join('|');

/**
 * Same dest+dates (or neither named) → refine in place; new dest/date → push history.
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
 * Refinement replaces the canvas screen (keeps id to avoid remount/scroll jump);
 * new dest/date appends.
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

/** Superseded screens above the current one, oldest first, capped at MAX_HISTORY_SCREENS. */
export const visibleHistory = (
  messages: ChatMessage[],
  currentScreenId: string | undefined
): ChatMessage[] =>
  messages
    .filter((m) => m.role === 'assistant' && m.id !== currentScreenId)
    .slice(-MAX_HISTORY_SCREENS);
