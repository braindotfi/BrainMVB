import { describe, expect, it } from "vitest";
import {
  ASSISTANT_GENERIC_ERROR,
  CHAT_HISTORY_LIMIT,
  MESSAGE_CONTENT_LIMIT,
  buildChatPayload,
  filterPayloadMessages,
  parseAssistantResponse,
  trimChatHistory,
} from "./assistantChat";

describe("parseAssistantResponse", () => {
  it("rejects a successful response with no reply instead of using preview copy", async () => {
    const result = await parseAssistantResponse(
      new Response(JSON.stringify({ answered: true }), { status: 200 }),
    );

    expect(result.answerError).toBe(true);
    expect(result.reply).toBe(ASSISTANT_GENERIC_ERROR);
    expect(result.reply).not.toContain("Live answers are coming soon");
  });

  it("turns auth expiry into an honest session error", async () => {
    const result = await parseAssistantResponse(
      new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 }),
    );

    expect(result.answerError).toBe(true);
    expect(result.reply).toBe("Your session expired. Please sign in again.");
  });

  it("preserves a human-readable server error when one is supplied", async () => {
    const result = await parseAssistantResponse(
      new Response(
        JSON.stringify({
          error: "assistant_failed",
          reply: "The assistant is temporarily unavailable.",
        }),
        { status: 500 },
      ),
    );

    expect(result.reply).toBe("The assistant is temporarily unavailable.");
    expect(result.answerError).toBe(true);
  });

  // Regression: invalid_messages must never show the generic "try again" copy —
  // retrying with the same history will never succeed, so the message must be
  // actionable and direct the user to start a new conversation.
  it("shows an actionable message for invalid_messages, not the generic retry copy", async () => {
    const result = await parseAssistantResponse(
      new Response(JSON.stringify({ error: "invalid_messages" }), { status: 400 }),
    );

    expect(result.answerError).toBe(true);
    expect(result.reply).not.toBe(ASSISTANT_GENERIC_ERROR);
    // Must mention starting a new conversation — retrying is pointless.
    expect(result.reply.toLowerCase()).toMatch(/new/);
    expect(result.reply.toLowerCase()).not.toMatch(/try again/);
  });
});

describe("buildChatPayload", () => {
  it("maps role and text to role and content", () => {
    const msgs = [
      { role: "user" as const, text: "Hello" },
      { role: "assistant" as const, text: "Hi there" },
    ];
    const payload = buildChatPayload(msgs);
    expect(payload).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]);
  });

  // Regression: a single assistant reply exceeding 8 000 chars would be stored
  // in session history and sent back verbatim on the next request, triggering
  // the same permanent invalid_messages 400 the history-trim fix targeted.
  it("truncates a 9 000-char message to exactly MESSAGE_CONTENT_LIMIT chars", () => {
    const longText = "a".repeat(9000);
    const payload = buildChatPayload([{ role: "assistant" as const, text: longText }]);
    expect(payload[0].content).toHaveLength(MESSAGE_CONTENT_LIMIT);
  });

  it("does not truncate a message that is exactly MESSAGE_CONTENT_LIMIT chars", () => {
    const exactText = "b".repeat(MESSAGE_CONTENT_LIMIT);
    const payload = buildChatPayload([{ role: "user" as const, text: exactText }]);
    expect(payload[0].content).toHaveLength(MESSAGE_CONTENT_LIMIT);
  });

  it("does not truncate a message shorter than MESSAGE_CONTENT_LIMIT", () => {
    const shortText = "hello world";
    const payload = buildChatPayload([{ role: "user" as const, text: shortText }]);
    expect(payload[0].content).toBe(shortText);
  });

  it("also trims the array to CHAT_HISTORY_LIMIT items", () => {
    const msgs = Array.from({ length: 60 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      text: `message ${i}`,
    }));
    const payload = buildChatPayload(msgs);
    expect(payload).toHaveLength(CHAT_HISTORY_LIMIT);
    // Most recent CHAT_HISTORY_LIMIT messages must be kept.
    expect(payload[payload.length - 1].content).toBe("message 59");
  });
});

describe("filterPayloadMessages", () => {
  it("returns the original array reference when no notes are present", () => {
    const msgs = [
      { role: "user" as const, text: "Hello" },
      { role: "assistant" as const, text: "Hi" },
    ];
    expect(filterPayloadMessages(msgs)).toBe(msgs);
  });

  it("strips isContextNote messages so they never reach the wire payload", () => {
    const NOTE_TEXT =
      "Earlier messages were not sent — start a new conversation for full context";
    const msgs = [
      { role: "user" as const, text: "First message" },
      { role: "assistant" as const, text: NOTE_TEXT, isContextNote: true },
      { role: "user" as const, text: "Follow-up question" },
    ];
    const filtered = filterPayloadMessages(msgs);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((m) => !m.isContextNote)).toBe(true);
    // Verify the note text is absent from the wire payload produced downstream.
    const payload = buildChatPayload(filtered);
    expect(payload.some((m) => m.content === NOTE_TEXT)).toBe(false);
  });

  it("strips multiple notes from different sends in the same session", () => {
    const msgs = [
      { role: "user" as const, text: "Message 1" },
      { role: "assistant" as const, text: "Note 1", isContextNote: true },
      { role: "user" as const, text: "Message 2" },
      { role: "assistant" as const, text: "Reply" },
      { role: "assistant" as const, text: "Note 2", isContextNote: true },
      { role: "user" as const, text: "Message 3" },
    ];
    const filtered = filterPayloadMessages(msgs);
    expect(filtered).toHaveLength(4);
    expect(filtered.every((m) => !m.isContextNote)).toBe(true);
  });

  it("returns an empty array unchanged when the input is empty", () => {
    expect(filterPayloadMessages([])).toEqual([]);
  });
});

describe("trimChatHistory", () => {
  it("returns the original array reference when it is under the limit", () => {
    const msgs = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    expect(trimChatHistory(msgs)).toBe(msgs);
  });

  it("returns the original array reference when it is exactly at the limit", () => {
    const msgs = Array.from({ length: CHAT_HISTORY_LIMIT }, (_, i) => ({ id: i }));
    expect(trimChatHistory(msgs)).toBe(msgs);
  });

  it("trims an oversized history to the most recent CHAT_HISTORY_LIMIT messages", () => {
    const msgs = Array.from({ length: 60 }, (_, i) => ({ id: i }));
    const trimmed = trimChatHistory(msgs);
    expect(trimmed).toHaveLength(CHAT_HISTORY_LIMIT);
    // Oldest kept message should be index (60 - CHAT_HISTORY_LIMIT).
    expect((trimmed[0] as { id: number }).id).toBe(60 - CHAT_HISTORY_LIMIT);
    // Newest message must be the last item.
    expect((trimmed[trimmed.length - 1] as { id: number }).id).toBe(59);
  });

  // Regression: a session accumulating past 25 user+assistant exchange pairs
  // (51 messages total including the new user turn) hit the server's max(50)
  // Zod constraint. trimChatHistory must prevent this from ever reaching the wire.
  it("guarantees the result is always under the server max(50) limit", () => {
    // Simulate 26 completed exchanges (52 messages) plus a new user message = 53.
    const msgs = Array.from({ length: 53 }, (_, i) => ({ id: i }));
    const trimmed = trimChatHistory(msgs);
    expect(trimmed.length).toBeLessThanOrEqual(50);
    // CHAT_HISTORY_LIMIT itself must be under 50.
    expect(CHAT_HISTORY_LIMIT).toBeLessThan(50);
  });
});