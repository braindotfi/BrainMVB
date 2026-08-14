import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchBrainRead,
  formatRateLimitDescription,
  isBrainReadCoolingDown,
  parseRetryAfterSeconds,
  parseRetrySecondsFromMessage,
  resetBrainRateLimitStateForTests,
  subscribeRateLimitReports,
} from "./rateLimit";

afterEach(() => {
  resetBrainRateLimitStateForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("rate-limit retry parsing", () => {
  it("reads numeric Retry-After seconds", () => {
    expect(parseRetryAfterSeconds("12")).toBe(12);
  });

  it("reads HTTP-date Retry-After values", () => {
    const now = Date.parse("2026-08-14T12:00:00.000Z");
    expect(parseRetryAfterSeconds("Fri, 14 Aug 2026 12:00:05 GMT", now)).toBe(5);
  });

  it("reads retry durations embedded in an error message", () => {
    expect(parseRetrySecondsFromMessage("Rate limit exceeded. Retry in 7 seconds.")).toBe(7);
  });

  it("formats the existing alert copy exactly when a duration is known", () => {
    expect(formatRateLimitDescription(1)).toBe("Rate limit exceeded. Retry in 1 second.");
    expect(formatRateLimitDescription(12)).toBe("Rate limit exceeded. Retry in 12 seconds.");
  });
});

describe("Brain read cooldown", () => {
  it("starts a cooldown from Retry-After and suppresses automatic reads until it expires", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("too many", { status: 429, headers: { "Retry-After": "12" } }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBrainRead("/api/brain/proposals?limit=100", "proposals")).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 12,
    });
    expect(isBrainReadCoolingDown("proposals")).toBe(true);

    await expect(fetchBrainRead("/api/brain/proposals?limit=100", "proposals")).rejects.toMatchObject({
      status: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(12_010);
    expect(isBrainReadCoolingDown("proposals")).toBe(false);

    await expect(fetchBrainRead("/api/brain/proposals?limit=100", "proposals")).resolves.toBeInstanceOf(Response);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("starts a cooldown from a retry duration in the response body", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("Rate limit exceeded. Retry in 6 seconds.", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBrainRead("/api/brain/ledger/counterparties", "counterparties")).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 6,
    });
    expect(isBrainReadCoolingDown("counterparties")).toBe(true);
  });

  it("reports 429 alerts without converting non-rate-limit errors", async () => {
    const events: unknown[] = [];
    const unsubscribe = subscribeRateLimitReports((event) => events.push(event));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("server failed", { status: 500 })));

    await expect(fetchBrainRead("/api/brain/proposals?limit=100", "proposals")).rejects.toThrow("500: server failed");
    expect(events).toEqual([]);
    unsubscribe();
  });
});
