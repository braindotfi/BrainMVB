import { describe, it, expect, vi } from "vitest";
import { pagerState, stepPager, type PagerEntry } from "./unifiedPager";

/* The bug these pin: Overview and the Inbox render ONE list assembled from
   several sources, and each source used to own its own pager. Paging therefore
   stopped at the edge of whichever source the open record came from, even though
   more rows were visible directly below it. Every test here is written against a
   MIXED list for that reason — a list of one kind cannot catch the regression. */

const opened: string[] = [];
const entry = (id: string): PagerEntry => ({ id, open: () => opened.push(id) });
/* Ids deliberately carry different source prefixes: these are rows from four
   different queues that open four different modals. */
const mixed = [entry("intent-1"), entry("review-2"), entry("insight-3"), entry("proposal-4")];

describe("pagerState", () => {
  it("locates the open row within the whole rendered list", () => {
    const state = pagerState(mixed, "insight-3");
    expect(state.index).toBe(2);
    expect(state.total).toBe(4);
    expect(state.position).toBe("Record 3 of 4");
  });

  it("offers Next across a source boundary", () => {
    // "intent-1" is the only row of its kind; a per-source pager would say there
    // is nowhere to go, which is exactly the reported bug.
    expect(pagerState(mixed, "intent-1").hasNext).toBe(true);
  });

  it("disables only the direction that has run out", () => {
    const first = pagerState(mixed, "intent-1");
    expect(first.hasPrev).toBe(false);
    expect(first.hasNext).toBe(true);

    const last = pagerState(mixed, "proposal-4");
    expect(last.hasPrev).toBe(true);
    expect(last.hasNext).toBe(false);
  });

  it("reports no pager when nothing is open", () => {
    const state = pagerState(mixed, null);
    expect(state.index).toBe(-1);
    expect(state.canPage).toBe(false);
    expect(state.position).toBeNull();
  });

  it("reports no pager for an open record the list no longer contains", () => {
    // A decided record can drop off the filtered list while its popup is still
    // up. Paging from a stale index would step onto a row the user cannot see.
    const state = pagerState(mixed, "review-99");
    expect(state.index).toBe(-1);
    expect(state.canPage).toBe(false);
  });

  it("gives a lone row no pager at all", () => {
    const state = pagerState([entry("only-1")], "only-1");
    expect(state.hasPrev).toBe(false);
    expect(state.hasNext).toBe(false);
    expect(state.canPage).toBe(false);
  });
});

describe("stepPager", () => {
  it("closes the open surface BEFORE opening the neighbour", () => {
    // The neighbour may be a different modal; leaving the old one mounted would
    // stack two dialogs.
    const order: string[] = [];
    const entries = [
      { id: "a", open: () => order.push("open:a") },
      { id: "b", open: () => order.push("open:b") },
    ];
    stepPager(entries, "a", 1, () => order.push("close"));
    expect(order).toEqual(["close", "open:b"]);
  });

  it("steps forward and backward through mixed sources", () => {
    opened.length = 0;
    stepPager(mixed, "review-2", 1, () => {});
    stepPager(mixed, "review-2", -1, () => {});
    expect(opened).toEqual(["insight-3", "intent-1"]);
  });

  it("does not wrap past either end", () => {
    // A position readout of "Record 4 of 4" must not have a working Next.
    const close = vi.fn();
    opened.length = 0;
    stepPager(mixed, "proposal-4", 1, close);
    stepPager(mixed, "intent-1", -1, close);
    expect(opened).toEqual([]);
    expect(close).not.toHaveBeenCalled();
  });

  it("does nothing when the open record left the list", () => {
    const close = vi.fn();
    opened.length = 0;
    stepPager(mixed, "gone-9", 1, close);
    expect(opened).toEqual([]);
    expect(close).not.toHaveBeenCalled();
  });
});
