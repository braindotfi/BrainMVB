import { describe, it, expect } from "vitest";
import { selectMoneyPathIntentIds } from "./brainQueue";

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

  it("caps the fan-out so a large page can't issue unbounded detail fetches", () => {
    const page = Array.from({ length: 100 }, (_, i) => ({ payment_intent_id: `pi_${i}` }));
    expect(selectMoneyPathIntentIds(page, 25)).toHaveLength(25);
  });

  it("returns nothing for an all-non-financial page", () => {
    expect(selectMoneyPathIntentIds([{ payment_intent_id: null }])).toEqual([]);
  });
});
