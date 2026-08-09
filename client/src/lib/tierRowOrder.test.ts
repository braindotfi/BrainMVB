/**
 * The pager walks the row list; the sections draw it grouped by tier. When those
 * two orders came from different places, the Insight rows were drawn LAST but
 * built THIRD, so pressing Next from the first row on screen (an Urgent
 * proposal, last in the built array) could never reach them — the cash-flow
 * record was unreachable from the pager on Overview.
 *
 * These pin the shared ordering and the fact that Overview uses it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { orderRowsForDisplay } from "./tierRowOrder";
import { TIER_ORDER } from "./proposalTiers";
import type { RowTier } from "./decisionFilters";

const row = (id: string, tier: RowTier) => ({ id, tier });

describe("orderRowsForDisplay", () => {
  it("returns rows in the order the sections draw them", () => {
    const built = [
      row("payment", "waiting"),
      row("insight", "insight"),
      row("proposal", "urgent"),
    ];
    expect(orderRowsForDisplay(built).map((r) => r.id)).toEqual(["proposal", "payment", "insight"]);
  });

  it("keeps the built order within a tier, so sources stay grouped", () => {
    const built = [row("a", "waiting"), row("b", "waiting"), row("c", "urgent"), row("d", "waiting")];
    expect(orderRowsForDisplay(built).map((r) => r.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("drops rows no section renders rather than parking them at the end", () => {
    /* A pager entry for a row the user cannot see is the same bug pointing the
       other way, so the two lists have to agree on omissions too. */
    expect(TIER_ORDER).not.toContain("decided");
    const built = [row("settled", "decided"), row("live", "waiting")];
    expect(orderRowsForDisplay(built).map((r) => r.id)).toEqual(["live"]);
  });

  it("every insight row sorts after every actionable row", () => {
    const built = [row("i1", "insight"), row("u1", "urgent"), row("i2", "insight"), row("w1", "waiting")];
    const ordered = orderRowsForDisplay(built).map((r) => r.id);
    expect(ordered.indexOf("i1")).toBeGreaterThan(ordered.indexOf("u1"));
    expect(ordered.indexOf("i1")).toBeGreaterThan(ordered.indexOf("w1"));
    expect(ordered.indexOf("i2")).toBeGreaterThan(ordered.indexOf("i1"));
  });
});

describe("the Inbox builds its pager from the display order", () => {
  it("orders its rows through the shared helper", () => {
    const src = readFileSync("client/src/pages/InboxPage.tsx", "utf8");
    /* The Inbox's rows feed BOTH the sections and the unified pager, so
       ordering them at the source is what keeps the two in step. Overview no
       longer has rows or a pager — it renders a count and a link. */
    expect(src).toContain("orderRowsForDisplay(");
  });

  it("leaves Overview out of it, because Overview has no rows to order", () => {
    const src = readFileSync("client/src/pages/HomePage.tsx", "utf8");
    expect(src).not.toContain("orderRowsForDisplay");
  });
});
