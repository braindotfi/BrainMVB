/**
 * Source-scan guards for API key edge cases.
 *
 * #258 — Rate-limited key rotation shows a clear retry message.
 *   sendKeyApiError maps 429/rate_limited → { error: "rate_limited", message }
 *   with a specific retry hint. The client surfaces this through the rotate
 *   mutation's error handler, not as an unhandled crash.
 *
 * #259 — Key API "not yet enabled" message when brain-core's key service is off.
 *   route_not_found from brain-core → 503 keys_api_unavailable with an honest
 *   "isn't enabled yet" message. The client shows "Keys API not yet enabled"
 *   instead of a generic error or blank state.
 *
 * #260 — Broken issue-key response is caught before it passes bad data through.
 *   issuedPlaintext() extracts the plaintext from various upstream field names.
 *   If both issued.key and plaintext are absent/malformed the handler must
 *   return 502, never 201 with undefined data.
 *
 * #261 — Rotating an already-rotated key gives a clear "not found" error.
 *   api_key_not_found (404 from brain-core) → 404 with a friendly message.
 *   The client rotate mutation shows this, not an unhandled exception.
 *
 * #262 — Issuing a live key without a production tenant is cleanly blocked.
 *   environment === "live" + !platformServiceConfigured() || !identity
 *   → 403 live_not_available before the upstream call is attempted.
 *
 * #263 — Malformed issue-key body is rejected at the door.
 *   createKeySchema.safeParse() validates name/environment/scopes before
 *   the handler reaches brain-core → 400 invalid_request with zod details.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ROUTES = "server/routes.ts";
const DEVELOPERS = "client/src/components/settings/DevelopersSection.tsx";

// ─── #258: Rate-limited rotation shows clear retry message ───────────────────

describe("Rate-limited key rotation shows a retry message, not a crash (#258)", () => {
  it("sendKeyApiError maps 429 / rate_limited → { error: 'rate_limited' } response", () => {
    const src = readFileSync(ROUTES, "utf8");
    const sendErrIdx = src.indexOf("function sendKeyApiError");
    expect(sendErrIdx, "sendKeyApiError not found").toBeGreaterThan(-1);
    // rate_limited is at ~711 chars into sendKeyApiError (after route_not_found
    // and api_key_not_found branches), so window must exceed that.
    const block = src.slice(sendErrIdx, sendErrIdx + 900);
    expect(block, "must handle rate_limited code").toMatch(/rate_limited/);
    expect(block, "must return 429").toMatch(/429/);
  });

  it("the rate-limit message tells the user to try again shortly", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "rate-limit message must contain retry hint").toMatch(
      /Try again shortly|try again/i,
    );
  });

  it("the rotate mutation's error handler surfaces the message (not swallows it)", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    // rotateMut must have an error/catch path that shows the error message.
    const rotateMutIdx = src.indexOf("rotateMut");
    expect(rotateMutIdx, "rotateMut not found").toBeGreaterThan(-1);
    const block = src.slice(rotateMutIdx, rotateMutIdx + 800);
    expect(
      block,
      "rotate mutation must surface errors to the user (alert.error or toast)",
    ).toMatch(/alert\.error|toast/);
  });
});

// ─── #259: Key service off → honest "not yet enabled" message ────────────────

describe("Key service off shows 'not yet enabled', not a generic error (#259)", () => {
  it("sendKeyApiError maps route_not_found → 503 keys_api_unavailable", () => {
    const src = readFileSync(ROUTES, "utf8");
    const sendErrIdx = src.indexOf("function sendKeyApiError");
    const block = src.slice(sendErrIdx, sendErrIdx + 600);
    expect(block, "must handle route_not_found brain error code").toMatch(/route_not_found/);
    expect(block, "must return 503").toMatch(/503/);
    expect(block, "must use keys_api_unavailable error code").toMatch(/keys_api_unavailable/);
  });

  it("the 503 message says the service isn't enabled yet (not a generic failure)", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "503 message must say 'isn't enabled yet' or equivalent").toMatch(
      /isn't enabled yet|not.*enabled yet/i,
    );
  });

  it("the client recognises keys_api_unavailable and shows 'Keys API not yet enabled'", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    expect(src, "client must detect keys_api_unavailable").toMatch(
      /isKeysApiUnavailable|keys_api_unavailable/,
    );
    expect(src, "client must show 'not yet enabled' to the user").toMatch(
      /not yet enabled|Keys API not yet enabled/i,
    );
  });

  it("retry is suppressed when the key service is unavailable (no pointless retries)", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    // retry: (count, err) => !isKeysApiUnavailable(err) && count < N
    expect(src, "retry must be suppressed for isKeysApiUnavailable errors").toMatch(
      /!isKeysApiUnavailable/,
    );
  });
});

// ─── #260: Broken issue-key response caught before passing bad data ───────────

describe("Broken issue-key response returns 502, not 201 with broken data (#260)", () => {
  it("issuedPlaintext helper exists to extract the one-time plaintext", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "issuedPlaintext must be defined").toMatch(/function issuedPlaintext|issuedPlaintext\s*=/);
  });

  it("the issue handler checks both issued.key and plaintext before returning 201", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    const block = src.slice(routeIdx, routeIdx + 1500);
    expect(block, "must check !issued.key").toMatch(/!issued\.key/);
    expect(block, "must check !plaintext").toMatch(/!plaintext/);
  });

  it("if the shape check fails, the handler returns 502 (not 201 with undefined fields)", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    const block = src.slice(routeIdx, routeIdx + 1500);
    expect(block, "must return 502 on bad shape").toMatch(/502/);
    expect(block, "must not return 201 when shape is invalid").not.toMatch(
      /\.status\(201\)[^}]*issuedPlaintext/,
    );
  });

  it("a console.error names the handler so engineers know which endpoint produced the bad shape", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    const block = src.slice(routeIdx, routeIdx + 1500);
    expect(block, "console.error must be called on bad issue-key shape").toMatch(/console\.error/);
  });
});

// ─── #261: Already-rotated key → clear "not found" error ─────────────────────

describe("Already-rotated key returns a clear 'not found' error (#261)", () => {
  it("sendKeyApiError maps api_key_not_found / 404 → 404 response", () => {
    const src = readFileSync(ROUTES, "utf8");
    const sendErrIdx = src.indexOf("function sendKeyApiError");
    const block = src.slice(sendErrIdx, sendErrIdx + 600);
    expect(block, "must handle api_key_not_found").toMatch(/api_key_not_found/);
    expect(block, "must return status 404").toMatch(/\.status\(404\)/);
  });

  it("the 404 message explains the key may have been rotated or revoked", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "404 message must mention rotated or revoked").toMatch(
      /rotated or revoked|already rotated/i,
    );
  });

  it("the rotate mutation's error handler shows a friendly message for api_key_not_found", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    expect(src, "client must handle api_key_not_found in the rotate error path").toMatch(
      /api_key_not_found/,
    );
    const notFoundIdx = src.indexOf("api_key_not_found");
    const window = src.slice(notFoundIdx, notFoundIdx + 400);
    expect(
      window,
      "must show a friendly message, not an unhandled throw",
    ).toMatch(/alert\.error|toast|already rotated|no longer exists/i);
  });
});

// ─── #262: Live key without production tenant blocked with 403 ────────────────

describe("Live key request without production tenant returns 403, not a brain-core error (#262)", () => {
  it("the issue handler checks 'live' environment before calling brain-core", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    const block = src.slice(routeIdx, routeIdx + 1200);
    expect(block, "must check environment === 'live'").toMatch(/environment.*live|live.*environment/);
    expect(block, "must check platformServiceConfigured").toMatch(/platformServiceConfigured/);
  });

  it("the live-key gate returns 403 live_not_available (not 500 or a brain error)", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "403 live_not_available must be in the route handler").toMatch(
      /403.*live_not_available|live_not_available.*403/s,
    );
  });

  it("the gate fires before requireBrainMemberSession so brain-core is never called", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    const block = src.slice(routeIdx, routeIdx + 1200);
    const liveGateIdx = block.indexOf("live_not_available");
    const sessionIdx = block.indexOf("requireBrainMemberSession");
    expect(liveGateIdx, "live gate not found").toBeGreaterThan(-1);
    expect(sessionIdx, "requireBrainMemberSession not found").toBeGreaterThan(-1);
    expect(
      liveGateIdx,
      "live gate must fire before the brain session call",
    ).toBeLessThan(sessionIdx);
  });

  it("the client shows a 'request access' path for live keys, not a crash", () => {
    const src = readFileSync(DEVELOPERS, "utf8");
    expect(src, "client must handle live_not_available gracefully").toMatch(
      /live_not_available|live.*access|Request access|production tenant/i,
    );
  });
});

// ─── #263: Malformed issue-key body rejected at the door ─────────────────────

describe("Malformed issue-key body is rejected with 400 before reaching brain-core (#263)", () => {
  it("createKeySchema validates name, environment, and scopes", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "createKeySchema must validate name").toMatch(/name.*z\.string|z\.string.*name/);
    expect(src, "createKeySchema must validate environment enum").toMatch(
      /environment.*z\.enum|z\.enum.*environment/,
    );
    expect(src, "createKeySchema must validate scopes array").toMatch(
      /scopes.*z\.array|z\.array.*scopes/,
    );
  });

  it("the parse result is checked before any other handler logic runs", () => {
    const src = readFileSync(ROUTES, "utf8");
    const routeIdx = src.indexOf('app.post("/api/developers/keys"');
    const block = src.slice(routeIdx, routeIdx + 500);
    expect(block, "schema parse must happen at the top of the handler").toMatch(
      /safeParse.*req\.body|req\.body.*safeParse/,
    );
    expect(block, "must return 400 on parse failure").toMatch(/400.*invalid_request|invalid_request.*400/s);
  });

  it("the 400 response includes zod validation details so callers know what to fix", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "400 response must include parsed error details").toMatch(
      /details.*parsed\.error|parsed\.error.*details/,
    );
  });

  it("environment must be 'sandbox' or 'live' — any other value is rejected", () => {
    const src = readFileSync(ROUTES, "utf8");
    const schemaIdx = src.indexOf("createKeySchema");
    const block = src.slice(schemaIdx, schemaIdx + 400);
    expect(block, "environment must be a z.enum of sandbox and live").toMatch(
      /z\.enum\(.*sandbox.*live|z\.enum\(.*live.*sandbox/s,
    );
  });

  it("scopes must have at least one entry — an empty array is rejected", () => {
    const src = readFileSync(ROUTES, "utf8");
    const schemaIdx = src.indexOf("createKeySchema");
    const block = src.slice(schemaIdx, schemaIdx + 400);
    expect(block, "scopes must require at least 1 item").toMatch(/\.min\(1\)/);
  });
});
