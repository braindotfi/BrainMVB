import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  mayBePayable,
  payableLookup,
  unresolvedCitationNote,
  UNRESOLVED_CITATION_LABEL,
  type PayableLookup,
} from "./assistantCitations";
import { fetchAllPages } from "./brainPagination";
import { normalizeObligation, type RawObligation } from "./brainObligations";

const here = dirname(fileURLToPath(import.meta.url));
const code = (p: string) => readFileSync(resolve(here, p), "utf8");

/**
 * The defect: the assistant cites a payable, the user taps it, and nothing that
 * resembles the record opens — just a card repeating the id back. Not because the
 * payable does not exist, but because it sat on the second page of a list read that
 * stops after ~20 rows and says nothing about it. On the 6-obligation demo tenant
 * every citation resolves, so the surface looks correct right up until a tenant has
 * enough bills to matter.
 */

describe("payableLookup", () => {
  const complete = { complete: true };
  const partial = { complete: false };

  it("opens the record whenever the read is holding it", () => {
    for (const read of [complete, partial, null]) {
      expect(payableLookup({ held: true, read, failed: false })).toBe("held");
    }
    // Even a failed read that somehow still has the row is a hit, not a hole.
    expect(payableLookup({ held: true, read: complete, failed: true })).toBe("held");
  });

  it("only calls a record absent once the cursor walk reached the end", () => {
    expect(payableLookup({ held: false, read: complete, failed: false })).toBe("absent");
  });

  it("a short walk is not evidence of absence", () => {
    /* The whole bug in one assertion: a capped read that never followed its cursor
       has not looked at the record's page, so the miss says nothing. */
    expect(payableLookup({ held: false, read: partial, failed: false })).toBe("unavailable");
  });

  it("separates a read that has not come back from one that failed", () => {
    expect(payableLookup({ held: false, read: null, failed: false })).toBe("pending");
    expect(payableLookup({ held: false, read: null, failed: true })).toBe("unavailable");
    // A failure outranks a stale successful page still sitting in the cache.
    expect(payableLookup({ held: false, read: complete, failed: true })).toBe("unavailable");
  });
});

describe("unresolvedCitationNote", () => {
  it("explains itself for every state where nobody could look", () => {
    for (const state of ["pending", "unavailable"] as PayableLookup[]) {
      const note = unresolvedCitationNote(state);
      expect(note, `${state} must say why the record did not open`).toBeTruthy();
      expect(note).toMatch(/couldn't be looked up/);
    }
  });

  it("says nothing when the lookup gave a real answer", () => {
    /* `absent` is a fact — the walk finished and the record is not a payable. Noting
       that would turn every ordinary evidence card into a warning. */
    expect(unresolvedCitationNote("absent")).toBeNull();
    expect(unresolvedCitationNote("held")).toBeNull();
  });

  it("words 'still loading' and 'could not be read' differently", () => {
    /* One is fixed by waiting and the other is not, so they must not read alike. */
    expect(unresolvedCitationNote("pending")).not.toBe(unresolvedCitationNote("unavailable"));
    expect(unresolvedCitationNote("pending")).toMatch(/Still reading/);
  });

  it("never guesses what the record is or how much is missing", () => {
    // Nobody read it — naming a kind or a count would be invented.
    for (const state of ["pending", "unavailable"] as PayableLookup[]) {
      expect(unresolvedCitationNote(state)).not.toMatch(/\d/);
    }
    expect(UNRESOLVED_CITATION_LABEL).toMatch(/[Cc]ouldn't open/);
  });
});

describe("mayBePayable", () => {
  it("rules out only the kinds this surface resolves for itself", () => {
    for (const kind of ["account", "transaction", "invoice", "counterparty", "member"]) {
      expect(mayBePayable(kind), `${kind} has its own lookup`).toBe(false);
    }
  });

  it("treats an unlabelled or oddly-labelled citation as a possible payable", () => {
    /* brain-core names these four different ways and sometimes not at all, so a label
       it does not recognise must not be used to rule a payable out. */
    for (const kind of ["obligation", "payable", "liability", "bill", "", null, undefined]) {
      expect(mayBePayable(kind), `${String(kind)} could still be a payable`).toBe(true);
    }
  });
});

/* ── the read itself ─────────────────────────────────────────────────────────── */

/** A page of obligations as brain-core sends them, with an optional cursor. */
function page(ids: string[], next: string | null): Response {
  const obligations: RawObligation[] = ids.map((id) => ({
    id,
    type: "bill",
    counterparty_id: "cp_1",
    amount_due: "4800.00000000",
    currency: "USD",
    due_date: "2026-10-01",
    status: "upcoming",
  }));
  return {
    ok: true,
    status: 200,
    statusText: "",
    json: async () => ({ obligations, next_cursor: next }),
    text: async () => "",
  } as unknown as Response;
}

/** The map the citation handler resolves against, built the way the assistant builds it. */
async function obligationMap(fetchImpl: typeof fetch) {
  const read = await fetchAllPages<RawObligation>(
    "/api/brain/ledger/obligations",
    "obligations",
    { fetchImpl },
  );
  const byId = new Map(
    read.rows
      .filter((o): o is RawObligation => !!o)
      .map(normalizeObligation)
      .map((o) => [o.id, o] as const),
  );
  return { byId, read };
}

describe("resolving a citation against the obligations feed", () => {
  const FIRST_PAGE = Array.from({ length: 20 }, (_, i) => `obl_page1_${i}`);
  const SECOND_PAGE = ["obl_page2_a", "obl_cited", "obl_page2_c"];

  it("opens a payable that sits past the first page", async () => {
    let calls = 0;
    const fetchImpl = (async (url: string) => {
      calls += 1;
      return String(url).includes("cursor=") ? page(SECOND_PAGE, null) : page(FIRST_PAGE, "p2");
    }) as unknown as typeof fetch;

    const { byId, read } = await obligationMap(fetchImpl);

    expect(calls, "the walk must follow the cursor, not stop at page one").toBe(2);
    expect(byId.size).toBe(FIRST_PAGE.length + SECOND_PAGE.length);
    expect(payableLookup({ held: byId.has("obl_cited"), read, failed: false })).toBe("held");
    // And the record it opens is the real one, not a stub built from the id.
    expect(byId.get("obl_cited")?.amount_due).toBe("4800.00000000");
    expect(byId.get("obl_cited")?.kind).toBe("bill");
  });

  it("without the walk, that same citation looks like a record that does not exist", async () => {
    /* The pre-fix behaviour, pinned so the regression is recognisable: one page, the
       cited row missing, and nothing on the response saying a page was withheld. */
    const onePage = page(FIRST_PAGE, null);
    const byId = new Map(
      ((await onePage.json()).obligations as RawObligation[])
        .map(normalizeObligation)
        .map((o) => [o.id, o] as const),
    );
    expect(byId.has("obl_cited")).toBe(false);
  });

  it("a cut-short walk reports itself, so the miss is not read as an absence", async () => {
    // A server that keeps handing back a cursor: rows arrive, the end never does.
    const fetchImpl = (async () => page(["obl_x"], "always-more")) as unknown as typeof fetch;
    const { byId, read } = await obligationMap(fetchImpl);

    expect(read.complete).toBe(false);
    expect(payableLookup({ held: byId.has("obl_cited"), read, failed: false })).toBe("unavailable");
    expect(unresolvedCitationNote("unavailable")).toBeTruthy();
  });

  it("an exactly-capped page with no cursor field is not trusted as the whole list", async () => {
    /* brain-core's silent cap: 20 rows, no `next_cursor` on the payload at all. The
       walk cannot follow anything, but it must not claim it saw everything either. */
    const body = { obligations: FIRST_PAGE.map((id) => ({ id })) };
    const fetchImpl = (async () =>
      ({ ok: true, status: 200, json: async () => body, text: async () => "" }) as unknown as Response) as unknown as typeof fetch;

    const { byId, read } = await obligationMap(fetchImpl);
    expect(read.complete).toBe(false);
    expect(payableLookup({ held: byId.has("obl_cited"), read, failed: false })).toBe("unavailable");
  });
});

/* ── wiring ──────────────────────────────────────────────────────────────────── */

describe("the assistant wires its citations to the paged read", () => {
  const ASSISTANT = code("../pages/sections/BrainAssistant.tsx");

  it("reads obligations through the shared cursor walk, not a one-page query", () => {
    expect(ASSISTANT).toContain(
      'usePagedLedgerRead<RawObligation>("/api/brain/ledger/obligations", "obligations")',
    );
    expect(
      ASSISTANT,
      "a bare useQuery on the endpoint reads page one and never follows the cursor",
    ).not.toMatch(/queryKey:\s*\["\/api\/brain\/ledger\/obligations"\]/);
    expect(ASSISTANT).not.toContain("fetchObligations(");
  });

  it("judges an unresolved citation through payableLookup, never a bare map miss", () => {
    expect(ASSISTANT).toContain("payableLookup({");
    expect(ASSISTANT).toContain("mayBePayable(resolvedType)");
    expect(ASSISTANT).toContain("unresolvedCitationNote(payableState)");
    // The honest branch must be reached BEFORE the plain evidence card, or an
    // unreadable page still renders as a confident "nothing more to see here".
    const unresolved = ASSISTANT.indexOf("} else if (unresolvedNote) {");
    const plainCard = ASSISTANT.indexOf('label: resolvedType ?? s.entityType ?? "Grounded record"');
    expect(unresolved, "unresolved-citation branch not found").toBeGreaterThan(-1);
    expect(plainCard, "plain evidence-card branch not found").toBeGreaterThan(-1);
    expect(unresolved).toBeLessThan(plainCard);
  });

  it("carries the note onto the card the user actually sees", () => {
    expect(ASSISTANT).toContain("note: unresolvedNote");
    const popup = code("../components/LiveEvidenceRecordPopup.tsx");
    expect(popup).toContain("evidence.note");
    expect(popup).toContain('testId="live-evidence-unresolved-note"');
    // Above the facts: the id must not be the first thing read as the whole story.
    expect(popup.indexOf("evidence.note")).toBeLessThan(popup.indexOf("evidence.facts.length > 0"));
    expect(code("./proposalCards.ts")).toMatch(/note\?:\s*string/);
  });
});
