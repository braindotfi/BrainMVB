/**
 * Server-side message-content trim (defense-in-depth against oversized payloads).
 *
 * The /api/assistant/chat handler trims each message's content to
 * MESSAGE_CONTENT_LIMIT chars BEFORE the Zod schema validation runs.
 * Without the trim a crafted 9 000-char message would hit the schema's
 * max(8000) constraint and return a permanent invalid_messages 400 the
 * user cannot recover from.
 */
import { describe, it, expect } from "vitest";
import { trimMessageContents, MESSAGE_CONTENT_LIMIT } from "./messageTrim";

describe("trimMessageContents", () => {
  it("passes through a message whose content is within the limit unchanged", () => {
    const messages = [{ role: "user", content: "Hello" }];
    const result = trimMessageContents(messages);
    expect(result).toEqual(messages);
    // Verify it's the same object reference (no unnecessary allocation).
    expect(result[0]).toBe(messages[0]);
  });

  it("truncates a 9 000-char content to exactly MESSAGE_CONTENT_LIMIT", () => {
    const long = "x".repeat(9000);
    const result = trimMessageContents([{ role: "user", content: long }]);
    const trimmed = (result[0] as { content: string }).content;
    expect(trimmed.length).toBe(MESSAGE_CONTENT_LIMIT);
    expect(trimmed).toBe("x".repeat(MESSAGE_CONTENT_LIMIT));
  });

  it("preserves all other message fields alongside the trimmed content", () => {
    const result = trimMessageContents([
      { role: "assistant", content: "a".repeat(9000), extra: "preserved" },
    ]);
    const msg = result[0] as { role: string; extra: string; content: string };
    expect(msg.role).toBe("assistant");
    expect(msg.extra).toBe("preserved");
    expect(msg.content.length).toBe(MESSAGE_CONTENT_LIMIT);
  });

  it("handles multiple messages, trimming only the ones that exceed the limit", () => {
    const messages = [
      { role: "user", content: "short" },
      { role: "assistant", content: "b".repeat(9000) },
      { role: "user", content: "also short" },
    ];
    const result = trimMessageContents(messages);
    expect((result[0] as { content: string }).content).toBe("short");
    expect((result[1] as { content: string }).content.length).toBe(MESSAGE_CONTENT_LIMIT);
    expect((result[2] as { content: string }).content).toBe("also short");
  });

  it("passes through non-object items without throwing", () => {
    const raw = [null, undefined, 42, "raw string"] as unknown[];
    expect(trimMessageContents(raw)).toEqual([null, undefined, 42, "raw string"]);
  });

  it("leaves a message whose content is exactly at the limit untouched", () => {
    const exact = "y".repeat(MESSAGE_CONTENT_LIMIT);
    const msg = { role: "user", content: exact };
    const result = trimMessageContents([msg]);
    const out = result[0] as { content: string };
    expect(out.content.length).toBe(MESSAGE_CONTENT_LIMIT);
    // Exactly-at-limit content must be the same object reference (no copy).
    expect(result[0]).toBe(msg);
  });
});
