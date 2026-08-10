/**
 * Previous/Next walks one list that mixes five different dialog components, so
 * a step from a proposal to a ledger insight really does unmount one dialog and
 * mount another. Left alone, that replays the entrance animation and the one
 * record that happens to be a different component appears to be thrown up as a
 * new card while its neighbours just swap their contents.
 *
 * These pin the rule (a stepped-into card does not animate in) and pin that
 * every paged surface still routes through it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cardTransitionClasses } from "./cardTransition";

/** Every surface Previous/Next can land on. */
const PAGED_SURFACES = [
  "client/src/components/ReviewItems.tsx",
  "client/src/components/ProposalDetail.tsx",
  "client/src/components/AgentProposalModal.tsx",
  "client/src/components/LiveInsightModal.tsx",
  "client/src/components/AuditRecordPopup.tsx",
];

/* Only the Inbox opens paged surfaces now. Overview has no detail modals at
   all, so there is no pager for it to quiet — asserting the pager wiring there
   would have been asserting on dead code. */
const PAGES = ["client/src/pages/InboxPage.tsx"];

describe("cardTransitionClasses", () => {
  it("animates a card the user opened themselves", () => {
    const { card, overlay } = cardTransitionClasses(false);
    expect(card).toContain("data-[state=open]:animate-in");
    expect(card).toContain("data-[state=open]:zoom-in-95");
    expect(overlay).toContain("data-[state=open]:animate-in");
  });

  it("does not animate a card that was paged into", () => {
    const { card, overlay } = cardTransitionClasses(true);
    expect(card).not.toContain("data-[state=open]");
    expect(overlay).not.toContain("data-[state=open]");
  });

  /* The outgoing card fading under the incoming one is what makes a step read
     as one card changing rather than as a cut. */
  it("keeps the exit animation either way", () => {
    for (const suppressed of [true, false]) {
      const { card, overlay } = cardTransitionClasses(suppressed);
      expect(card).toContain("data-[state=closed]:animate-out");
      expect(overlay).toContain("data-[state=closed]:animate-out");
    }
  });
});

describe("every paged surface routes through it", () => {
  for (const file of PAGED_SURFACES) {
    it(`${file} takes its dialog animation from the shared hook`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("useCardTransition(open, pagerStep)");
      /* A surface that spells the animation out again is a surface the pager
         cannot quiet — extra props on a spread are dropped in silence, so this
         is the only thing that catches it. */
      expect(src).not.toContain("data-[state=open]:animate-in");
    });
  }

  for (const page of PAGES) {
    it(`${page} tells the surfaces when an open is a pager step`, () => {
      const src = readFileSync(page, "utf8");
      expect(src).toContain("pagerStep: steppedViaPager");
      expect(src).toContain("setSteppedViaPager(true)");
      /* Without the reset, the next hand-opened card would also open silently.
         It has to key off whether a SURFACE is open: approving, acknowledging
         or following a link out of a card closes it without always clearing the
         open row id, so a reset watching that id can miss and stay stuck. */
      expect(src).toContain("if (!anySurfaceOpen) setSteppedViaPager(false);");
    });
  }
});

describe("card action areas", () => {
  /* The frames close every record card with a full-width rule above its
     buttons. Each surface draws its own action row, so nothing but this stops
     one of them from losing the line. */
  const WITH_ACTIONS = [
    "client/src/components/ReviewItems.tsx",
    "client/src/components/ProposalDetail.tsx",
    "client/src/components/AgentProposalModal.tsx",
    "client/src/components/LiveInsightModal.tsx",
  ];
  for (const file of WITH_ACTIONS) {
    it(`${file} separates its buttons from the card body`, () => {
      expect(readFileSync(file, "utf8")).toContain("<CardActions");
    });
  }

  it("the action footer rule reaches both edges and gives 24px to the buttons", () => {
    const src = readFileSync("client/src/components/ProposalCardParts.tsx", "utf8");
    const decl = src.slice(src.indexOf("export const CardActions"));
    /* -mx-[24px] makes the border-t span the full card width past the 24px
       padding; pt-[24px] gives exactly 24px from that line to the buttons. */
    expect(decl).toContain("-mx-[24px]");
    expect(decl).toContain("pt-[24px]");
    expect(decl).toContain("border-t");
  });
});

describe("Overview opens no paged surface", () => {
  /* A modal returning to Overview brings the pager back with it, and the pager
     is what re-creates the second copy of the queue. */
  it("mounts none of the paged surfaces", () => {
    const src = readFileSync("client/src/pages/HomePage.tsx", "utf8");
    for (const surface of ["<ReviewModal", "<ProposalDetail", "<LiveProposalModal", "<LiveInsightModal", "<AuditRecordPopup"]) {
      expect(src).not.toContain(surface);
    }
  });

  /* The same probe finds four of these on the page that does open them, so a
     clean Overview is not just a mis-spelled search. */
  it("is looking for surface tags that a page with modals really contains", () => {
    const inbox = readFileSync("client/src/pages/InboxPage.tsx", "utf8");
    const found = ["<ReviewModal", "<ProposalDetail", "<LiveProposalModal", "<LiveInsightModal", "<AuditRecordPopup"]
      .filter((surface) => inbox.includes(surface));
    expect(found.length).toBeGreaterThanOrEqual(4);
  });
});
