/**
 * Overview and the Inbox list the same live records. They are supposed to be
 * indistinguishable, and they were not: the same cash-flow record pilled grey
 * "Informational" on one screen and amber "Cash Forecasting" on the other, and
 * a payment awaiting approval showed its recorded reasoning on the Inbox but
 * the vendor and due date on Overview — because each page spelled its own
 * presentation out.
 *
 * The unit tests pin the shared rules; the source guards pin that both pages
 * still go through them, which is the part that actually rots.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ROW_TAG_AGENT,
  sessionIntentRow,
  queueIntentRow,
  liveProposalRow,
  insightRow,
  type RowFormatters,
} from "./recordRows";
import type { LiveInsight } from "./brainAgentSurfaces";
import type { ReviewItemType } from "@/components/ReviewItems";

/** Identity formatters: these tests are about wording, not currency. */
const fmt: RowFormatters = { format: (n) => `$${n}`, formatText: (t) => t };

const insight = (over: Partial<LiveInsight> = {}): LiveInsight => ({
  id: "cashflow-trailing",
  kind: "cashflow",
  itemKind: "detection",
  badge: "Cash Forecasting",
  title: "Trailing cash flow (USD)",
  subtitle: "Net $12,400.00 over 38 transactions",
  ...over,
});

const intent = (over: Partial<ReviewItemType> = {}): ReviewItemType => ({
  id: "int_1",
  title: "Pay Brightline Systems",
  vendor: "Brightline Systems",
  amount: "$4,200.00",
  due: "Due Aug 12",
  question: "Approve this payment?",
  description: "Invoice matched to a recurring contract.",
  who: "Brightline Systems",
  amountFull: "$4,200.00",
  dueBy: "Due Aug 12",
  from: "Operating",
  autoLabel: "Always approve invoices like this",
  ...over,
});

/* The Inbox is the ONLY page that lists live records. Overview used to render
   the same rows and is deliberately down to a count now — see the Overview
   guard at the bottom of this file, which fails if the rows come back. */
const PAGES = ["client/src/pages/InboxPage.tsx"];

describe("the row pill", () => {
  /* Non-compliance live records keep the shared agent badge. Compliance is the
     deliberate exception: its row badge states the finding severity. */
  it("is amber for non-compliance live records", () => {
    const pills = [
      sessionIntentRow(intent(), fmt).badge.className,
      queueIntentRow({ title: "t", severity: "danger" }, fmt).badge.className,
      liveProposalRow({ title: "t", text: "x" }, "Vendor Risk").badge.className,
      insightRow(insight(), fmt).badge.className,
    ];
    expect(new Set(pills)).toEqual(new Set([ROW_TAG_AGENT]));
    expect(ROW_TAG_AGENT).toContain("text-brain-v1light-orange");
  });

  it("uses a severity badge for compliance findings", () => {
    const row = liveProposalRow({ title: "Midmarket Co", text: "$18,600 · Policy violation" }, "Compliance", undefined, "high");
    expect(row.badge.label).toBe("High risk");
    expect(row.badge.srLabel).toBe("high risk");
    expect(row.badge.className).toContain("text-brain-v1pink-red");
  });

  it("names the agent, not the state of the record", () => {
    expect(insightRow(insight(), fmt).badge.label).toBe("Cash Forecasting");
    expect(liveProposalRow({ title: "t", text: "" }, "Vendor Risk").badge.label).toBe("Vendor Risk");
  });

  it("falls back to a neutral label when a record names no agent", () => {
    expect(insightRow(insight({ badge: "" }), fmt).badge.label).toBe("Detected");
  });

  /* Amber says "needs you" to anyone who sees colour; these rows carry the same
     fact as text for anyone who does not. */
  it("carries in text whatever the colour alone would say", () => {
    expect(insightRow(insight(), fmt).badge.srLabel).toBe("informational");
    expect(queueIntentRow({ title: "t", severity: "danger" }, fmt).badge.srLabel).toBe("high risk");
    expect(queueIntentRow({ title: "t", severity: "warning" }, fmt).badge.srLabel).toBe("elevated");
    expect(queueIntentRow({ title: "t" }, fmt).badge.srLabel).toBe("needs review");
  });
});

describe("the second line", () => {
  it("prefers the recorded reasoning over a bare descriptor", () => {
    const row = queueIntentRow(
      { title: "t", amount: 4200, rowSubtitle: "Brightline Systems", rationale: "Matched to a recurring contract." },
      fmt,
    );
    expect(row.subtitle).toBe("$4200 · Why: Matched to a recurring contract.");
  });

  it("falls back to the descriptor when nothing was recorded", () => {
    const row = queueIntentRow({ title: "t", amount: 4200, rowSubtitle: "Brightline Systems" }, fmt);
    expect(row.subtitle).toBe("$4200 · Brightline Systems");
  });

  it("keeps a due label as the row's trailing note", () => {
    expect(queueIntentRow({ title: "t", dueLabel: "Due Aug 12" }, fmt).note).toBe("Due Aug 12");
    expect(sessionIntentRow(intent(), fmt).note).toBe("Due Aug 12");
  });

  it("omits the amount rather than printing an empty separator", () => {
    expect(queueIntentRow({ title: "t", rowSubtitle: "Brightline Systems" }, fmt).subtitle).toBe("Brightline Systems");
    expect(queueIntentRow({ title: "t" }, fmt).subtitle).toBeUndefined();
  });

  /* The reasoning lives on the card as "Why Brain Suggested This". Promoting it
     into the row on one screen only is exactly how the two drifted apart. */
  it("leaves an insight's explanation on the card, not in the row", () => {
    const row = insightRow(insight({ explanation: "Cash flow is trending negative." }), fmt);
    expect(row.subtitle).toBe("Net $12,400.00 over 38 transactions");
  });

  it("still says something when an insight carries no subtitle", () => {
    expect(insightRow(insight({ subtitle: undefined }), fmt).subtitle).toBeTruthy();
  });
});

describe("amounts", () => {
  it("converts every figure it prints through the tenant's formatters", () => {
    const loud: RowFormatters = { format: (n) => `EUR${n}`, formatText: (t) => `[${t}]` };
    const row = queueIntentRow({ title: "Pay 4200", amount: 4200, rationale: "over $1,000" }, loud);
    expect(row.title).toBe("[Pay 4200]");
    expect(row.subtitle).toBe("EUR4200 · Why: [over $1,000]");
  });

  /* buildProposalHeaderCopy has already converted this copy. Running it through
     formatText again would convert the converted figures a second time. */
  it("passes live proposal copy through untouched", () => {
    const row = liveProposalRow({ title: "Pay €3.800,00", text: "Due in 3 days" }, "Payments");
    expect(row.title).toBe("Pay €3.800,00");
    expect(row.subtitle).toBe("Due in 3 days");
  });
});

describe("the record pages go through the shared presenters", () => {
  for (const page of PAGES) {
    it(`${page} builds its live rows from recordRows`, () => {
      const src = readFileSync(page, "utf8");
      for (const fn of ["sessionIntentRow(", "queueIntentRow(", "liveProposalRow(", "insightRow("]) {
        expect(src).toContain(fn);
      }
    });

    /* A page that hardcodes the amber token again is a page that can drift from
       the other one the next time the pill changes. */
    it(`${page} does not spell the row pill out for itself`, () => {
      const src = readFileSync(page, "utf8");
      const ownPill = src.match(/const TAG_NEEDS_YOU\s*=/g) ?? [];
      const usedForLiveRows = src.match(/tagClass: TAG_NEEDS_YOU/g) ?? [];
      expect(ownPill.length + usedForLiveRows.length).toBe(0);
    });
  }
});

describe("Overview does not list records", () => {
  /* The whole point of the Overview/Inbox split: one screen counts, the other
     one works the queue. A row presenter reappearing on Overview means the
     duplication is back, and no rendering test would call that a failure — both
     screens would simply show the same list again. */
  it("builds no live rows of its own", () => {
    const src = readFileSync("client/src/pages/HomePage.tsx", "utf8");
    for (const fn of ["sessionIntentRow(", "queueIntentRow(", "liveProposalRow(", "insightRow("]) {
      expect(src).not.toContain(fn);
    }
  });

  /* Proof the check above can fail: the presenters it looks for are real names
     the Inbox does use, so a passing Overview is a fact about Overview. */
  it("is checking for presenter names that exist in a page that has rows", () => {
    const inbox = readFileSync("client/src/pages/InboxPage.tsx", "utf8");
    for (const fn of ["sessionIntentRow(", "queueIntentRow(", "liveProposalRow(", "insightRow("]) {
      expect(inbox).toContain(fn);
    }
  });
});
