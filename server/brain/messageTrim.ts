/**
 * Per-message content limit: mirrors the Zod max(8000) constraint in the
 * /api/assistant/chat handler. Defined here so the trim utility and its tests
 * share a single source of truth.
 */
export const MESSAGE_CONTENT_LIMIT = 8000;

/**
 * History depth limit: mirrors the Zod max(50) constraint on the messages
 * array in the /api/assistant/chat handler.
 */
export const MESSAGE_HISTORY_LIMIT = 50;
/**
 * Trim each message's `content` field to MESSAGE_CONTENT_LIMIT characters.
 *
 * Called server-side BEFORE Zod validation so a crafted or buggy client that
 * skips the client-side cap is silently truncated rather than receiving a
 * permanent invalid_messages 400 the user cannot recover from.
 *
 * Operates on the raw (unvalidated) array so it is safe to call with anything
 * the client sends; non-object items are passed through unchanged.
 */
export function trimMessageContents(messages: unknown[]): unknown[] {
  return messages.map((m, messageIndex) => {
    if (m && typeof m === "object") {
      const msg = m as Record<string, unknown>;
      if (typeof msg.content === "string" && msg.content.length > MESSAGE_CONTENT_LIMIT) {
        console.warn("message content trimmed", {
          originalLength: msg.content.length,
          trimmedTo: MESSAGE_CONTENT_LIMIT,
          messageIndex,
        });
        return { ...msg, content: msg.content.slice(0, MESSAGE_CONTENT_LIMIT) };
      }
    }
    return m;
  });
}

/**
 * Trim the messages array to the most recent MESSAGE_HISTORY_LIMIT items.
 *
 * Called server-side BEFORE Zod validation so a crafted or buggy client that
 * skips client-side history pruning is silently truncated rather than receiving
 * a permanent invalid_messages 400 the user cannot recover from.
 */
export function trimMessageHistory(messages: unknown[]): unknown[] {
  if (messages.length <= MESSAGE_HISTORY_LIMIT) {
    return messages;
  }
  return messages.slice(messages.length - MESSAGE_HISTORY_LIMIT);
}
