/**
 * Overview and the Inbox list the same live insight records. They are supposed
 * to be indistinguishable, and they were not: Overview pilled the cash-flow
 * record grey "Informational" while the Inbox pilled the same record amber
 * "Cash Forecasting", because each page spelled its own presentation out.
 *
 * The unit tests pin the shared rules; the source guards pin that both pages
 * still go through them, which is the part that actually rots.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { insightRowBadge, insightRowDetail, INSIGHT_ROW_TAG_CLASS } from "./insightRow";
import type { LiveInsight } from "./brainAgentSurfaces";

const insight = (over: Partial<LiveInsight> = {}): LiveInsight => ({
  id: "cashflow-trailing",
  kind: "cashflow",
  itemKind: "detection",
  badge: "Cash Forecasting",
  title: "Trailing cash flow (USD)",
  subtitle: "Net $12,400.00 over 38 transactions",
  ...over,
});

const PAGES = ["client/src/pages/HomePage.tsx", "client/src/pages/InboxPage.tsx"];

describe("insightRowBadge", () => {
  it("pills the agent that raised the record, like every other decision row", () => {
    expect(insightRowBadge(insight()).label).toBe("Cash Forecasting");
  });

  it("never uses the amber needs-you palette — there is nothing to action", () => {
    const badge = insightRowBadge(insight());
    expect(badge.className).toBe(INSIGHT_ROW_TAG_CLASS);
    expect(badge.className).not.toMatch(/ff9500|4a2300/);
  });

  it("carries 'informational' as text, since only the colour says so", () => {
    expect(insightRowBadge(insight()).srLabel).toBe("informational");
  });

  it("falls back to a neutral word rather than an empty pill", () => {
    expect(insightRowBadge(insight({ badge: "" })).label).toBe("Detected");
  });
});

describe("insightRowDetail", () => {
  it("is the record's own subtitle", () => {
    expect(insightRowDetail(insight())).toBe("Net $12,400.00 over 38 transactions");
  });

  it("never promotes the reasoning into the row", () => {
    /* One page used to show "Why: …" here and the other the subtitle, which is
       how the same record came to read two different ways. The reasoning has a
       home: the card's "Why Brain Suggested This". */
    const detail = insightRowDetail(insight({ explanation: "Cash flow is trending negative." }));
    expect(detail).not.toMatch(/trending negative/);
  });

  it("says something rather than nothing when a record has no subtitle", () => {
    expect(insightRowDetail(insight({ subtitle: undefined }))).toBeTruthy();
  });
});

describe("both surfaces render insight rows through the shared helper", () => {
  for (const page of PAGES) {
    it(`${page} uses insightRowBadge and insightRowDetail`, () => {
      const src = readFileSync(page, "utf8");
      expect(src).toContain("insightRowBadge(");
      expect(src).toContain("insightRowDetail(");
    });

    it(`${page} does not hand-roll an insight pill`, () => {
      const src = readFileSync(page, "utf8");
      /* The literal that the two pages disagreed on. If it reappears next to an
         insight row, the drift is back. */
      expect(src).not.toContain("INSIGHT_PILL_LABEL");
    });
  }
});
