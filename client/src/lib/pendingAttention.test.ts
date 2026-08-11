import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { pendingAttentionSummary } from "./pendingAttention";

const counts = (over: Partial<Parameters<typeof pendingAttentionSummary>[0]> = {}) => ({
  urgent: 0,
  waiting: 0,
  input: 0,
  insights: 0,
  incomplete: false,
  ...over,
});

describe("a complete read", () => {
  it("renders nothing when nothing is waiting", () => {
    expect(pendingAttentionSummary(counts())).toBeNull();
  });

  it("counts all three urgency categories", () => {
    const s = pendingAttentionSummary(counts({ urgent: 1, waiting: 2, input: 3 }));
    expect(s?.total).toBe(6);
    expect(s?.text).toBe("6 Items Need Your Attention");
  });

  it("agrees with itself about singular and plural", () => {
    expect(pendingAttentionSummary(counts({ waiting: 1 }))?.text).toBe("1 Item Needs Your Attention");
    expect(pendingAttentionSummary(counts({ waiting: 2 }))?.text).toBe("2 Items Need Your Attention");
  });

  it("names the urgency categories, and omits the tiers that are empty", () => {
    const s = pendingAttentionSummary(counts({ urgent: 2, input: 1, insights: 4 }));
    expect(s?.total).toBe(7);
    expect(s?.detail).toBe("2 urgent · 1 waiting on you · 4 insights");
    expect(s?.detail).not.toContain("needing your input");
  });

  it("orders the breakdown as urgent, waiting on you, then insights", () => {
    expect(
      pendingAttentionSummary(counts({ urgent: 2, input: 1, waiting: 3, insights: 4 }))?.detail,
    ).toBe("2 urgent · 4 waiting on you · 4 insights");
  });

  it("keeps an Insights-only state visible in the attention banner", () => {
    const s = pendingAttentionSummary(counts({ insights: 4 }));
    expect(s?.total).toBe(4);
    expect(s?.detail).toBe("4 insights");
  });

  it("reads urgent only when something urgent is in it", () => {
    expect(pendingAttentionSummary(counts({ urgent: 1 }))?.tone).toBe("urgent");
    expect(pendingAttentionSummary(counts({ waiting: 4 }))?.tone).toBe("normal");
    expect(pendingAttentionSummary(counts({ input: 4 }))?.tone).toBe("normal");
  });
});

describe("an incomplete read", () => {
  it("still reports a failed-read state without claiming an empty queue", () => {
    const s = pendingAttentionSummary(counts({ waiting: 3, incomplete: true }));
    expect(s?.text).toBe("At least 3 Items Need Your Attention");
  });

  it("says in the detail line that something couldn't be read", () => {
    const s = pendingAttentionSummary(counts({ urgent: 1, incomplete: true }));
    expect(s?.detail).toContain("1 urgent");
    expect(s?.detail).toMatch(/couldn't be read/);
  });

  it("still lets a known-urgent item colour the row", () => {
    /* A feed timing out does not make a material payment less material — but
       the wording, not the colour, is what carries the uncertainty. */
    const s = pendingAttentionSummary(counts({ urgent: 1, incomplete: true }));
    expect(s?.urgent).toBe(1);
    expect(s?.text.startsWith("At least")).toBe(true);
  });

  it("never hides itself when it found nothing, because zero is not a fact here", () => {
    const s = pendingAttentionSummary(counts({ incomplete: true }));
    expect(s).not.toBeNull();
    expect(s?.tone).toBe("unknown");
    expect(s?.text).toMatch(/couldn't check/i);
    /* An empty queue and an unreadable one must not produce the same sentence:
       one of them means "you're done" and the other means "nobody looked". */
    expect(s?.text).not.toBe(pendingAttentionSummary(counts({ waiting: 1 }))?.text);
  });

  it("says the zero-with-errors case is a connection problem, in those words", () => {
    expect(pendingAttentionSummary(counts({ incomplete: true }))?.detail).toMatch(/connection problem/i);
  });
});

describe("a read that hasn't answered yet", () => {
  /* The KPI cards beside this line resolve fast, so an empty space next to them
     reads as an answer. Both of the wrong answers are available here: silence
     (all-clear) and a subtotal that will change under the reader. */
  it("says it is still checking rather than rendering nothing", () => {
    const s = pendingAttentionSummary(counts({ loading: true }));
    expect(s).not.toBeNull();
    expect(s?.tone).toBe("loading");
    expect(s?.text).toMatch(/checking/i);
  });

  it("does not print a running subtotal", () => {
    const s = pendingAttentionSummary(counts({ urgent: 1, waiting: 2, loading: true }));
    expect(s?.text).not.toMatch(/\d/);
  });

  it("outranks the failure wording, because a slow read is not a broken one", () => {
    const s = pendingAttentionSummary(counts({ loading: true, incomplete: true }));
    expect(s?.tone).toBe("loading");
    expect(s?.text).not.toMatch(/couldn't check/i);
  });

  it("stops saying it once the reads land", () => {
    expect(pendingAttentionSummary(counts({ waiting: 1, loading: false }))?.tone).toBe("normal");
  });
});

describe("Overview wires the summary to every feed it depends on", () => {
  /* The page must pass `incomplete: true` when a read fails. Successful list
     reads are complete cursor walks and no longer contribute truncation flags. */
  const src = readFileSync("client/src/pages/HomePage.tsx", "utf8");
  const flag = src.slice(src.indexOf("const incompleteRead ="), src.indexOf("const pendingSummary"));

  for (const feed of [
    "liveNeedsReviewError",
    "liveProposalsError",
    "missingEvidence.isError",
    "decided.isError",
  ]) {
    it(`treats ${feed} as a reason to hedge`, () => {
      expect(flag).toContain(feed);
    });
  }

  /* Proof the slice above is the real expression and not an empty string that
     would make every assertion in this block pass for free. */
  it("is reading the actual expression", () => {
    expect(flag.length).toBeGreaterThan(40);
    expect(flag).toContain("||");
  });

  it("hands the count to the shared function instead of phrasing it inline", () => {
    expect(src).toContain("pendingAttentionSummary({");
  });

  it("uses Inbox's writable-decision rule before counting agent proposals", () => {
    expect(src).toContain('import { isDecidableProposal } from "@/lib/proposalCards";');
    expect(src).toContain("isNeedsReview(p) && isDecidableProposal(p)");
  });

  /* Silence during load is the same lie as silence during a failure, so every
     contributing read has to be able to hold the line back. */
  const loadingFlag = src.slice(src.indexOf("const stillReading ="), src.indexOf("const pendingSummary"));
  for (const feed of [
    "liveNeedsReviewLoading",
    "liveProposalsLoading",
    "missingEvidence.isLoading",
    "decided.isLoading",
  ]) {
    it(`waits for ${feed}`, () => {
      expect(loadingFlag).toContain(feed);
    });
  }
  it("is reading the actual loading expression", () => {
    expect(loadingFlag.length).toBeGreaterThan(40);
    expect(loadingFlag).toContain("||");
  });

  /* A payment intent proposed in this session is also in the durable queue once
     core has it. Counting both makes Overview say two where the Inbox says one,
     and the Inbox drops the durable copy on exactly this rule. */
  it("counts a session intent once, not once per source", () => {
    expect(src).toContain("!sessionIntentIds.has(p.id)");
    expect(src).toContain("durableNeedsReview.length");
    expect(src).not.toContain("waiting + pendingSessionIntents + liveNeedsReview.length");
  });
});
