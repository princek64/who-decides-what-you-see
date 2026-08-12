/**
 * Build the ChatGPT-style in-thread status line from the user's latest message.
 *
 * Keeps the query's own wording (destination, time, budget) so the fade line
 * reads as a live search, not a generic "Searching flights…".
 */
export const buildSearchingStatus = (query: string): string => {
  const cleaned = query.trim().replace(/\s+/g, ' ').replace(/[?.!]+$/g, '');
  if (!cleaned) return 'Searching flights';

  // Drop leading ask verbs so we don't get "Searching find a flight…".
  let body = cleaned.replace(
    /^(please\s+)?(find|search\s+for|search|show\s+me|show|get\s+me|get|look\s+for|looking\s+for)\s+/i,
    ''
  );

  // Normalise common shapes toward ChatGPT's "Searching … flights …" line.
  body = body
    .replace(/^a\s+flight\b/i, 'flights')
    .replace(/^the\s+cheapest\s+flights?\b/i, 'the cheapest flights')
    .replace(/^cheapest\s+flights?\b/i, 'cheapest flights');

  if (/^to\s+/i.test(body)) {
    return `Searching flights ${body}`;
  }
  return `Searching ${body}`;
};
