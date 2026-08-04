import { describe, expect, it } from "vitest";
import { ASSISTANT_GENERIC_ERROR, parseAssistantResponse } from "./assistantChat";

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
});