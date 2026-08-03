import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* Overview and the Inbox drive every detail surface from ONE pager walking the
   rendered row list, so a modal that only understands the old single
   `pagerDisabled` flag silently mis-renders its arrows: at the first row it
   shows Previous as live when there is nothing behind it, and the click then
   no-ops. That is exactly how one of these five modals shipped wrong, and the
   failure is invisible to a type-check because the extra props are spread in.

   This pins the contract at the source: every surface the shared pager drives
   must ACCEPT per-direction state and must not derive its arrows from
   `pagerDisabled` alone. */

const PAGED_SURFACES = [
  "client/src/components/AgentProposalModal.tsx",
  "client/src/components/LiveInsightModal.tsx",
  "client/src/components/ReviewItems.tsx",
  "client/src/components/AuditRecordPopup.tsx",
  "client/src/components/ProposalDetail.tsx",
];

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("paged detail surfaces", () => {
  it.each(PAGED_SURFACES)("%s accepts per-direction pager state", (file) => {
    const src = read(file);
    expect(src).toMatch(/hasPrev\?: boolean/);
    expect(src).toMatch(/hasNext\?: boolean/);
  });

  it.each(PAGED_SURFACES)("%s never derives an arrow from pagerDisabled alone", (file) => {
    const src = read(file);
    // `hasPrev={!pagerDisabled}` is the bug: it reports "there is a previous
    // record" whenever the pager exists at all.
    expect(src).not.toMatch(/has(Prev|Next)=\{!?pagerDisabled\}/);
  });
});
