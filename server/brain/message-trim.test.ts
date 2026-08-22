/**
 * Server-side message trim utilities (defense-in-depth against oversized payloads).
 *
 * The /api/assistant/chat handler trims both the history array and per-message
 * content BEFORE the Zod schema validation runs so crafted or buggy clients
 * cannot trigger a permanent invalid_messages 400 the user cannot recover from.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trimMessageContents, MESSAGE_CONTENT_LIMIT, trimMessageHistory, MESSAGE_HISTORY_LIMIT } from "./messageTrim";

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

  describe("console.warn logging", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it("emits a structured warn when a message is trimmed", () => {
      const oversized = "z".repeat(9000);
      trimMessageContents([{ role: "user", content: oversized }]);

      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith("message content trimmed", {
        originalLength: 9000,
        trimmedTo: MESSAGE_CONTENT_LIMIT,
        messageIndex: 0,
      });
    });

    it("includes the correct messageIndex when a later message is trimmed", () => {
      trimMessageContents([
        { role: "user", content: "short" },
        { role: "assistant", content: "a".repeat(9000) },
      ]);

      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith("message content trimmed", {
        originalLength: 9000,
        trimmedTo: MESSAGE_CONTENT_LIMIT,
        messageIndex: 1,
      });
    });

    it("does not emit a warn when all messages are within the limit", () => {
      trimMessageContents([
        { role: "user", content: "short" },
        { role: "assistant", content: "also fine" },
      ]);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("does not emit a warn when content is exactly at the limit", () => {
      trimMessageContents([{ role: "user", content: "y".repeat(MESSAGE_CONTENT_LIMIT) }]);

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});

describe("trimMessageHistory", () => {
  it("passes through an array within the limit unchanged (same reference)", () => {
    const messages = Array.from({ length: MESSAGE_HISTORY_LIMIT }, (_, i) => ({
      role: "user",
      content: `msg ${i}`,
    }));
    const result = trimMessageHistory(messages);
    expect(result).toBe(messages);
  });

  it("trims a 60-message array to the last MESSAGE_HISTORY_LIMIT items", () => {
    const messages = Array.from({ length: 60 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i}`,
    }));
    const result = trimMessageHistory(messages);
    expect(result.length).toBe(MESSAGE_HISTORY_LIMIT);
    // The result must be the tail, not the head.
    expect((result[0] as { content: string }).content).toBe("message 10");
    expect((result[result.length - 1] as { content: string }).content).toBe("message 59");
  });

  it("preserves all items when the array is exactly at the limit", () => {
    const messages = Array.from({ length: MESSAGE_HISTORY_LIMIT }, (_, i) => ({
      role: "user",
      content: `msg ${i}`,
    }));
    const result = trimMessageHistory(messages);
    expect(result.length).toBe(MESSAGE_HISTORY_LIMIT);
    expect(result).toBe(messages);
  });

  it("returns a single-item array unchanged", () => {
    const messages = [{ role: "user", content: "hello" }];
    const result = trimMessageHistory(messages);
    expect(result).toBe(messages);
  });
});
