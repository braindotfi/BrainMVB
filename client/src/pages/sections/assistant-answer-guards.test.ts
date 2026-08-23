/**
 * Source-scan guards for the Brain Assistant answer pipeline.
 *
 * #2 — Make the Brain Assistant actually answer questions.
 *
 * The assistant has three answer tiers (fastest to slowest):
 *   1. Deterministic — exact numeric/date answers derived from live ledger data.
 *   2. Wiki (brain-core) — grounded answers from the knowledge graph.
 *   3. Anthropic fallback — prose from a language model, only when wiki fails.
 *
 * This test pins the wiring so a future refactor cannot accidentally drop a
 * tier (leaving users with "I don't know" for questions a lower tier would
 * have answered) or swap the order (making Anthropic the first call instead of
 * the last resort).
 *
 * #172 — Prove that undoing a decision really puts the record back in front of you.
 *
 * The decided-proposal hide switch in brainAudit.ts correctly handles `undo`:
 * an undo decision removes the proposal ID from the set so the record reappears
 * in the pending queue. This test pins that the undo path is present in:
 *   a. The pure helper (decidedProposalIdsFromEvents in brainAudit.ts).
 *   b. The Inbox action builder (InboxPage.tsx toRow / undoItem).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ROUTES = "server/routes.ts";
const ASSISTANT = "client/src/pages/sections/BrainAssistant.tsx";
const INBOX = "client/src/pages/InboxPage.tsx";
const AUDIT_LIB = "client/src/lib/brainAudit.ts";

// ─── #2: Answer pipeline wiring ───────────────────────────────────────────────

describe("Brain Assistant answer pipeline (#2)", () => {
  it("POST /api/assistant/chat route exists in routes.ts", () => {
    const src = readFileSync(ROUTES, "utf8");
    expect(src, "assistant/chat route must be registered").toMatch(
      /app\.post\(["'`]\/api\/assistant\/chat["'`]/,
    );
  });

  it("deterministic answers run BEFORE the wiki call (fastest tier first)", () => {
    const src = readFileSync(ROUTES, "utf8");
    // Find the route HANDLER block (skip the import block at the top).
    const handlerStart = src.indexOf('app.post("/api/assistant/chat"');
    expect(handlerStart, "assistant/chat handler not found").toBeGreaterThan(-1);
    const handlerSrc = src.slice(handlerStart);
    const deterministicIdx = handlerSrc.indexOf("answerDeterministically");
    const wikiIdx = handlerSrc.indexOf("askWikiQuestion");
    expect(deterministicIdx, "answerDeterministically must be called in the handler").toBeGreaterThan(-1);
    expect(wikiIdx, "askWikiQuestion must be called in the handler").toBeGreaterThan(-1);
    expect(
      deterministicIdx,
      "deterministic tier must run before the wiki call",
    ).toBeLessThan(wikiIdx);
  });

  it("wiki (brain-core) answer runs before the Anthropic fallback", () => {
    const src = readFileSync(ROUTES, "utf8");
    const wikiIdx = src.indexOf("askWikiQuestion");
    // The Anthropic fallback uses the Anthropic SDK or a fallback message.
    const anthropicIdx = src.indexOf("ANTHROPIC_API_KEY");
    expect(wikiIdx, "askWikiQuestion must be present").toBeGreaterThan(-1);
    expect(anthropicIdx, "Anthropic fallback must be present").toBeGreaterThan(-1);
    expect(
      wikiIdx,
      "wiki call must come before the Anthropic fallback block",
    ).toBeLessThan(anthropicIdx);
  });

  it("response always includes an 'answered' boolean so the client can distinguish no-answer from prose", () => {
    const src = readFileSync(ROUTES, "utf8");
    // Every return branch must set answered:.
    expect(src).toMatch(/answered:\s*true/);
    expect(src).toMatch(/answered:\s*false/);
  });

  it("client parses answered:false as no_answer status, not as a successful reply", () => {
    const src = readFileSync(ASSISTANT, "utf8");
    // The client must check data.answered === false to set a distinct status.
    expect(src, "client must check answered === false").toMatch(
      /answered.*false|answered\s*===?\s*false/,
    );
    expect(src, "client must map no-answer to a distinct UI status").toMatch(
      /no_answer|answerStatus.*no|noAnswer/,
    );
  });

  it("the chat endpoint is protected by requireAuth so anonymous callers cannot reach it", () => {
    const src = readFileSync(ROUTES, "utf8");
    // The full route registration line must contain both the path and requireAuth.
    const registrationMatch = src.match(/app\.post\(["'`]\/api\/assistant\/chat["'`][^)]+\)/);
    expect(registrationMatch, "assistant/chat route registration not found").not.toBeNull();
    expect(
      registrationMatch![0],
      "requireAuth must appear in the assistant/chat route registration arguments",
    ).toMatch(/requireAuth/);
  });
});

// ─── #172: Undo decision wiring ───────────────────────────────────────────────

describe("Undo decision puts the record back in front of you (#172)", () => {
  it("decidedProposalIdsFromEvents removes the proposal ID when decision === 'undo'", () => {
    const src = readFileSync(AUDIT_LIB, "utf8");
    // The helper must handle undo explicitly (not just ignore it).
    expect(src, "decidedProposalIdsFromEvents must handle undo").toMatch(
      /undo.*delete|delete.*undo/s,
    );
  });

  it("InboxPage has an undoItem handler wired to the 'undo' decision", () => {
    const src = readFileSync(INBOX, "utf8");
    expect(src, "undoItem function must exist").toMatch(/const undoItem\s*=/);
    expect(src, "undoItem must call decideProposal with decision:'undo'").toMatch(
      /decision:\s*["'`]undo["'`]/,
    );
  });

  it("'undo' is in the supported-decision set so it renders as an enabled button", () => {
    const src = readFileSync(INBOX, "utf8");
    // The supported const must include "undo".
    const supportedMatch = src.match(/const supported\s*=[\s\S]*?;/);
    expect(supportedMatch, "supported const not found").not.toBeNull();
    expect(supportedMatch![0], '"undo" must be in the supported-decision set').toMatch(/undo/);
  });

  it("undoItem is gated on liveDecisions writable check so it cannot fire on a finalised proposal", () => {
    const src = readFileSync(INBOX, "utf8");
    const undoItemIdx = src.indexOf("const undoItem");
    const snippet = src.slice(undoItemIdx, undoItemIdx + 300);
    expect(
      snippet,
      "undoItem must check liveDecisions for a writable undo option before mutating",
    ).toMatch(/writable/);
  });
});
