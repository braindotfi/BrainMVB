export const ASSISTANT_GENERIC_ERROR =
  "Something went wrong reaching the assistant. Please try again.";

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

  // Prefer a human-readable server reply for known operational failures, then
  // a specific error/message when one is available. Never invent a preview
  // answer for a failed or malformed response.
  const detail =
    reply ||
    stringField(data, "message") ||
    (stringField(data, "error") &&
    !["assistant_failed", "invalid_messages"].includes(stringField(data, "error"))
      ? stringField(data, "error")
      : "");

  return {
    data,
    reply: detail || ASSISTANT_GENERIC_ERROR,
    answerError: true,
  };
}