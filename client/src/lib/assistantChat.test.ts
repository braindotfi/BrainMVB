import { describe, expect, it } from "vitest";
import {
  ASSISTANT_GENERIC_ERROR,
  CHAT_HISTORY_LIMIT,
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