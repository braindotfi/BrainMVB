import { describe, it, expect } from "vitest";
import { selectMoneyPathIntentIds, isAutoCleared, type BrainPaymentIntent } from "./brainQueue";

/**
 * Provenance of a cleared payment. These pin the fix for the bug where the
 * Inbox told an operator a payment they had personally approved was "Approved
 * automatically — no human approval was required", because `approved` is the
 * terminal status of both the human and the automatic path.
 */
describe("isAutoCleared", () => {
  const intent = (over: Partial<BrainPaymentIntent>): BrainPaymentIntent => ({
    id: "pi_1",
    action_type: "ach_outbound",
    destination_counterparty_id: "cp_1",
    amount: "19400.00000000",
    currency: "USD",
    status: "approved",
    created_at: "2026-08-08T21:42:55.617Z",
    approval_ids: [],
    ...over,
  });

  it("treats a cleared intent with no approval record as automatic", () => {
    expect(isAutoCleared(intent({ status: "approved", approval_ids: [] }))).toBe(true);
    expect(isAutoCleared(intent({ status: "proposed", approval_ids: [] }))).toBe(true);
  });

  it("never calls a HUMAN-approved payment automatic (the reported bug)", () => {
    // Reproduced live: propose -> policy allow -> pending_approval -> a person
    // approves -> status "approved" WITH an appr_ record.
    expect(isAutoCleared(intent({ status: "approved", approval_ids: ["appr_01KZHNA124"] }))).toBe(
      false,
    );
  });

  it("fails closed when the approval field is missing or not an array", () => {
    // Absent evidence is unknown provenance, never proof that nobody approved.
    expect(isAutoCleared(intent({ approval_ids: undefined }))).toBe(false);
    expect(isAutoCleared(intent({ approval_ids: null }))).toBe(false);
    expect(isAutoCleared(intent({ approval_ids: "appr_1" as unknown as string[] }))).toBe(false);
  });

  it("excludes statuses that are not a clearance", () => {
    // core's real initial state for a proposed payment — it is awaiting a human.
    expect(isAutoCleared(intent({ status: "pending_approval" }))).toBe(false);
    expect(isAutoCleared(intent({ status: "executed" }))).toBe(false);
    expect(isAutoCleared(intent({ status: "rejected" }))).toBe(false);
  });
});

/**
 * The PaymentIntent queue's list source. brain-core has NO tenant-scoped
 * `GET /actions` (it 404s `route_not_found`); the money-path rows live on
 * `GET /v1/proposals`, a UNION ALL of the proposals table and
 * ledger_payment_intents, where a non-null payment_intent_id marks the latter.
 * These pin the selector that turns that page into the ids to fan out on.
 */
describe("selectMoneyPathIntentIds", () => {
  it("keeps only money-path rows, returning the intent id (not the proposal id)", () => {
    expect(
      selectMoneyPathIntentIds([
        { payment_intent_id: "pi_1" },
        { payment_intent_id: null },
        { payment_intent_id: "pi_2" },
      ]),
    ).toEqual(["pi_1", "pi_2"]);
  });

  it("de-duplicates repeated intent ids", () => {
    expect(
      selectMoneyPathIntentIds([{ payment_intent_id: "pi_1" }, { payment_intent_id: "pi_1" }]),
    ).toEqual(["pi_1"]);
  });

  it("keeps every money-path id from a large complete feed", () => {
    const page = Array.from({ length: 100 }, (_, i) => ({ payment_intent_id: `pi_${i}` }));
    expect(selectMoneyPathIntentIds(page)).toHaveLength(100);
  });

  it("returns nothing for an all-non-financial page", () => {
    expect(selectMoneyPathIntentIds([{ payment_intent_id: null }])).toEqual([]);
  });
});

/**
 * The Inbox is a shared work queue, so a decision made elsewhere must stop being
 * actionable here without a manual reload. The app's global defaults are infinite
 * stale time / no interval / no focus refetch, so every query has to opt in.
 *
 * Focus refetch only, by design: no interval. The detail queries fan out one
 * request per pending intent, so an interval would multiply by the row count on
 * every tick, whereas a focus refetch is one bounded burst when the operator
 * returns to the tab — which is exactly when they are about to act on what they see.
 */
describe("the review queues refresh when the operator comes back to the tab", () => {
  const src = (): string => require("fs").readFileSync("client/src/lib/brainQueue.ts", "utf8");

  it("opts every query in this file into the focus refetch", () => {
    /* Counting rather than naming each site: the two hooks hold three queries
       apiece and a seventh added later must not quietly inherit the frozen
       default. Every query already carries `retry: false`, so that is the
       reliable per-query marker to count against. */
    const code = src();
    const queries = code.match(/retry: false/g)?.length ?? 0;
    const focused = code.match(/refetchOnWindowFocus: true/g)?.length ?? 0;
    expect(queries).toBeGreaterThan(0);
    expect(focused).toBe(queries);
  });

  it("refreshes the detail fan-out, not just the list", () => {
    /* The half that actually fixes the bug. selectMoneyPathIntentIds filters on
       `payment_intent_id` alone, so an approved intent keeps its id on the list;
       only the detail record's `status` drops it. A list-only refresh returns the
       same ids and re-renders the same stale details. */
    const code = src();
    const marker = "queryKey: [`/api/brain/payment-intents/${id}?expand=agent`]";
    const starts: number[] = [];
    for (let i = code.indexOf(marker); i !== -1; i = code.indexOf(marker, i + 1)) starts.push(i);
    // One fan-out per hook: the review queue and the auto-approved queue.
    expect(starts).toHaveLength(2);
    for (const start of starts) {
      // Each query object ends at the arrow-function close that follows it.
      const block = code.slice(start, code.indexOf("})),", start));
      expect(block).toContain("refetchOnWindowFocus: true");
    }
  });

  it("stays interval-free so the fan-out cannot multiply on a timer", () => {
    expect(src()).not.toContain("refetchInterval");
  });
});
