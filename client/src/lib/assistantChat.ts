export const ASSISTANT_GENERIC_ERROR =
  "Something went wrong reaching the assistant. Please try again.";

/**
 * Maximum number of messages sent to the server per /api/assistant/chat request.
 * The server's Zod schema caps the array at 50; we trim to 40 to stay comfortably
 * under that limit. Older context is dropped — the wiki/question primary path uses
 * only the latest user message anyway, and the Anthropic fallback benefits from
 * recent context far more than a distant exchange.
 */
export const CHAT_HISTORY_LIMIT = 40;

/**
 * Trim a conversation history array so it never exceeds CHAT_HISTORY_LIMIT items.
 * Always keeps the most recent messages. Returns the original array reference when
 * no trimming is needed (avoids an unnecessary allocation on every send).
 */
export function trimChatHistory<T>(messages: T[]): T[] {
  return messages.length > CHAT_HISTORY_LIMIT
    ? messages.slice(-CHAT_HISTORY_LIMIT)
    : messages;
}

/**
 * Maximum number of characters allowed per message by the server's Zod schema.
 * A single assistant reply that exceeds this limit would be stored in session
 * history and sent back verbatim on the next request, hitting the same permanent
 * 400. Content is truncated here, before the wire payload is built.
 */
export const MESSAGE_CONTENT_LIMIT = 8000;

/** One message in the shape the /api/assistant/chat server schema expects. */
export interface WireMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Strip synthetic context-note messages (isContextNote: true) from a session
 * messages array before building the wire payload. Notes are UI-only: they must
 * never be sent to the server, must not count toward the CHAT_HISTORY_LIMIT
 * budget, and must not be visible to the assistant as conversation turns.
 *
 * Returns the original array reference when no notes are present (avoids an
 * unnecessary allocation on every send in the common case).
 */
export function filterPayloadMessages<T extends { isContextNote?: boolean }>(
  messages: T[],
): T[] {
  return messages.some((m) => m.isContextNote)
    ? messages.filter((m) => !m.isContextNote)
    : messages;
}

/**
 * Build the wire payload for a /api/assistant/chat request from raw session
 * messages. Applies both guards the server schema enforces:
 *   1. Array trimmed to the most recent CHAT_HISTORY_LIMIT items (max(50) constraint).
 *   2. Each message's content capped to MESSAGE_CONTENT_LIMIT chars (max(8000) constraint).
 *
 * Doing both here keeps the call-site simple and makes the invariants testable
 * without mounting the full component.
 *
 * Call filterPayloadMessages() on the input before passing it here so that
 * synthetic context notes are excluded from the budget and the request body.
 */
export function buildChatPayload(
  messages: Array<{ role: "user" | "assistant"; text: string }>,
): WireMessage[] {
  return trimChatHistory(messages).map((m) => ({
    role: m.role,
    content:
      m.text.length > MESSAGE_CONTENT_LIMIT
        ? m.text.slice(0, MESSAGE_CONTENT_LIMIT)
        : m.text,
  }));
}

type AssistantPayload = Record<string, unknown>;

function asPayload(value: unknown): AssistantPayload | null {
  return value && typeof value === "object" ? (value as AssistantPayload) : null;
}

function stringField(payload: AssistantPayload | null, key: string): string {
  const value = payload?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Read the Assistant response without ever treating a missing reply as a
 * successful answer. The server may intentionally return a human-readable
 * reply alongside an error status, but a malformed successful response is
 * still an operational error.
 */
export async function parseAssistantResponse(res: Response): Promise<{
  data: AssistantPayload | null;
  reply: string;
  answerError: boolean;
}> {
  const data = asPayload(await res.json().catch(() => null));
  const reply = stringField(data, "reply");

  if (res.ok && reply) {
    return {
      data,
      reply,
      answerError: data?.answerError === true,
    };
  }

  if (res.status === 401 || stringField(data, "error") === "Not authenticated") {
    return {
      data,
      reply: "Your session expired. Please sign in again.",
      answerError: true,
    };
  }

  // A conversation history that exceeds the server's message-count or
  // content-length limits arrives as invalid_messages. Retrying with the same
  // history will always fail, so "try again" is actively misleading — tell the
  // user to start a new conversation instead.
  if (stringField(data, "error") === "invalid_messages") {
    return {
      data,
      reply: "This conversation has gotten too long. Please start a new one to continue.",
      answerError: true,
    };
  }

  // Prefer a human-readable server reply for known operational failures, then
  // a specific error/message when one is available. Never invent a preview
  // answer for a failed or malformed response.
  const detail =
    reply ||
    stringField(data, "message") ||
    (stringField(data, "error") && stringField(data, "error") !== "assistant_failed"
      ? stringField(data, "error")
      : "");

  return {
    data,
    reply: detail || ASSISTANT_GENERIC_ERROR,
    answerError: true,
  };
}