import { describe, it, expect } from "vitest";
import { inboxCompletenessNotice } from "./inboxCompleteness";

const base = {
  tab: "Unresolved" as const,
  proposalsTruncated: false,
  auditTruncated: false,
  unreachable: false,
};

describe("inboxCompletenessNotice", () => {
  it("says nothing when both feeds were read whole", () => {
    expect(inboxCompletenessNotice(base)).toBeNull();
    expect(inboxCompletenessNotice({ ...base, tab: "Resolved" })).toBeNull();
  });

  it("calls a capped proposals read a floor, and says records are missing", () => {
    const msg = inboxCompletenessNotice({ ...base, proposalsTruncated: true });
    expect(msg).toMatch(/floor/i);
    expect(msg).toMatch(/aren't shown/i);
  });

  /* The opposite direction, and the reason these are not one message: a capped
     audit read cannot hide work, it can only leave settled work on the list. */
  it("describes a capped audit read as an over-count, never as missing records", () => {
    const msg = inboxCompletenessNotice({ ...base, auditTruncated: true });
    expect(msg).toMatch(/already decided may still be listed/i);
    expect(msg).not.toMatch(/aren't shown|floor/i);
  });

  it("reports both caps when both are hit", () => {
    const msg = inboxCompletenessNotice({
      ...base,
      proposalsTruncated: true,
      auditTruncated: true,
    });
    expect(msg).toMatch(/floor/i);
    expect(msg).toMatch(/already decided/i);
  });

  /* Errors already lead with "couldn't load". A completeness hedge stacked
     underneath reads as a second, lesser problem and dilutes the first. */
  it("stays silent while a feed is unreachable", () => {
    expect(
      inboxCompletenessNotice({
        ...base,
        proposalsTruncated: true,
        auditTruncated: true,
        unreachable: true,
      }),
    ).toBeNull();
  });

  /* Resolved is audit-only. Letting the proposals cursor speak here would
     hedge a list that read is not part of. */
  it("ignores the proposals cap on the Resolved tab", () => {
    expect(
      inboxCompletenessNotice({ ...base, tab: "Resolved", proposalsTruncated: true }),
    ).toBeNull();
    expect(
      inboxCompletenessNotice({ ...base, tab: "Resolved", auditTruncated: true }),
    ).toMatch(/most recent decisions only/i);
  });
});
