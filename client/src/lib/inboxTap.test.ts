/**
 * Regression guard for the settled-row tap bug: tapping an already-actioned
 * (approved / rejected / acknowledged / auto-approved) record in the Inbox
 * once navigated to `/audit-log?record=…`, swapping the whole page for the old
 * six-tab Audit Log. The fix opens the record popup in place.
 *
 * The browser walkthrough (scripts/qa-inbox-settled-record.mjs) proves the
 * rendered behavior but needs a chromium path and a live session cookie, so it
 * won't run in CI. These tests pin the same contract at the unit level:
 *
 *  1. inboxTapTarget() — the pure routing decision InboxPage.openItem now
 *     delegates to — sends a settled record to the in-place "audit-popup"
 *     surface, and every pending kind to its own modal. No outcome is a
 *     navigation: the target type has no route/href/navigate variant at all.
 *  2. A source-level tripwire: InboxPage must keep routing taps through
 *     inboxTapTarget and must not reinstate a `navigate(...audit-log...)`
 *     call. AuditLogPage is still a live route, so the compiler alone would
 *     not catch someone wiring it back in.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { inboxTapTarget } from "./inboxTap";

const settledRecord = { id: "rec-1", eventType: "approved" } as const;

describe("inboxTapTarget — settled rows open in place", () => {
  it("a settled audit record opens the audit popup, never a navigation", () => {
    const target = inboxTapTarget({ record: settledRecord });
    expect(target).toEqual({ surface: "audit-popup", record: settledRecord });
    /* Belt-and-braces: no tap outcome may smuggle in a route. */
    expect(Object.keys(target)).not.toContain("href");
    expect(Object.keys(target)).not.toContain("route");
    expect(JSON.stringify(target)).not.toContain("audit-log");
  });

  it("every settled event type takes the same in-place path", () => {
    for (const eventType of ["approved", "rejected", "auto_approved", "acknowledged"]) {
      const record = { id: `rec-${eventType}`, eventType };
      expect(inboxTapTarget({ record }).surface).toBe("audit-popup");
    }
  });
});

describe("inboxTapTarget — pending rows keep their modals", () => {
  it("a pending live agent proposal opens the agent proposal modal", () => {
    const proposal = { id: "prop-1", status: "needs_review" };
    expect(inboxTapTarget({ liveAgentProposal: proposal })).toEqual({
      surface: "agent-proposal-modal",
      proposal,
    });
  });

  it("a §6 intent opens the intent modal", () => {
    const intent = { intentId: "int-1" };
    expect(inboxTapTarget({ intent })).toEqual({ surface: "intent-modal", intent });
  });

  it("an insight opens the insight modal", () => {
    const insight = { id: "ins-1" };
    expect(inboxTapTarget({ insight })).toEqual({ surface: "insight-modal", insight });
  });

  it("a pending proposal opens the proposal sheet, live flag preserved", () => {
    const proposal = { id: "p-1" };
    expect(inboxTapTarget({ proposal, proposalIsLive: true })).toEqual({
      surface: "proposal-sheet",
      proposal,
      isLive: true,
    });
    expect(inboxTapTarget({ proposal })).toEqual({
      surface: "proposal-sheet",
      proposal,
      isLive: false,
    });
  });

  it("payload precedence: a proposal payload wins over a record payload", () => {
    /* Exactly one payload should be set per row; if that invariant ever slips,
       a decidable proposal must still win over settled history. */
    const proposal = { id: "p-2" };
    const target = inboxTapTarget({ proposal, record: settledRecord });
    expect(target.surface).toBe("proposal-sheet");
  });

  it("an empty item is a no-op, not a navigation", () => {
    expect(inboxTapTarget({})).toEqual({ surface: "none" });
  });
});

describe("InboxPage source tripwire", () => {
  const src = readFileSync(
    path.resolve(import.meta.dirname, "..", "pages", "InboxPage.tsx"),
    "utf8",
  );

  it("openItem routes through inboxTapTarget", () => {
    expect(src).toMatch(/const openItem = [\s\S]*?inboxTapTarget\(/);
  });

  it("never navigates to the old Audit Log page", () => {
    /* The deep-link effects legitimately navigate("/inbox", …); what must never
       come back is a navigation whose destination is /audit-log. Match any
       navigate call carrying an audit-log destination, template or literal. */
    const calls = src.match(/navigate\(\s*[`"'][^`"']*[`"']/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).not.toContain("audit-log");
  });

  it("the settled-record branch opens the popup in place", () => {
    expect(src).toContain('case "audit-popup"');
    expect(src).toMatch(/case "audit-popup":[\s\S]{0,200}setActiveRecord\(target\.record\)/);
  });
});
