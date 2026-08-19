import { afterEach, describe, expect, it, vi } from "vitest";
import { withBrainBaseUrl } from "./baseUrl";
import { listAuditEvents } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /audit/events contract", () => {
  it("requests the documented time-window shape and accepts its events-only response", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      requests.push(new URL(input));
      return new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    const result = await withBrainBaseUrl(
      "https://api.brain.test/v1",
      () => listAuditEvents("member-token", {
        limit: 200,
        since: "2026-07-01T00:00:00.000Z",
        until: "2026-07-31T23:59:59.999Z",
      }),
    );

    expect(result).toEqual({ events: [] });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.pathname).toBe("/v1/audit/events");
    expect(Object.fromEntries(requests[0]!.searchParams)).toEqual({
      limit: "200",
      since: "2026-07-01T00:00:00.000Z",
      until: "2026-07-31T23:59:59.999Z",
    });
    expect(requests[0]!.searchParams.has("cursor")).toBe(false);
  });
});