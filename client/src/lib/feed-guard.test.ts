/**
 * A write-time guard for the fail-open read.
 *
 * Four consecutive pieces of work shipped the same defect: a `retry: false`
 * query consumed as `data?.things ?? []`, so an unreachable feed renders as an
 * empty one. Each time it was caught by review reasoning about it from scratch,
 * which is not a control — it is luck with a good reviewer attached.
 *
 * This pins it instead. The rule is narrow on purpose: it only looks at values
 * bound from a `useQuery` call in the same file, so the ~100 harmless `?? []`
 * defaults elsewhere in the client are not touched and the signal stays real.
 *
 * The allowlist is a RATCHET. It may shrink, never grow. A new violation fails
 * `npm test`, and fixing a listed file also requires deleting its entry, so the
 * list cannot quietly rot into a permanent exemption.
 *
 * Preferred fix for anything this flags: use `useFeed` from `lib/feed.ts`, which
 * makes the unavailable state impossible to skip. Surfacing `isError` by hand is
 * acceptable where a full conversion is disproportionate.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Known offenders, predating the guard. Each is a real false all-clear, not a
 * false positive — they are listed rather than fixed only to keep the guard's
 * introduction separable from the UI-copy decisions each fix needs.
 *
 * DO NOT ADD TO THIS LIST. Fix the read instead.
 */
const KNOWN_VIOLATIONS = new Set<string>([
  // Drill-down reached from a row that already rendered. Its activity list still
  // reads "no activity" when the feed is down. AccountDetailPopup was the same
  // shape and has been converted to useFeed — this one follows the same recipe.
  "client/src/components/TransactionDetailPopup.tsx",
  // Lesser variant: when this read fails the invoice popup simply does not open.
  // That is a visible failure — the click does nothing — rather than a reassuring
  // one, so it is a bug but not a false all-clear.
  "client/src/components/AgentProposalModal.tsx",
  // Decoration lookup: a missing invoice document costs a link, not a record.
  "client/src/lib/brainInvoiceDocument.ts",
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** Names bound from a `useQuery(...)` call: `const { data: x }` and `const q =`. */
function queryBindings(src: string): string[] {
  const names: string[] = [];
  for (const m of src.matchAll(/const\s*\{([^}]*)\}\s*=\s*useQuery/g)) {
    for (const part of m[1].split(",")) {
      const alias = part.includes(":") ? part.split(":")[1] : part;
      const name = alias.trim().replace(/\s.*$/, "");
      if (name === "data" || /^[A-Za-z_$][\w$]*$/.test(name)) names.push(name);
    }
  }
  for (const m of src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*useQuery/g)) names.push(m[1]);
  return names;
}

/** Does the file acknowledge that a read can fail at all? */
function handlesFailure(src: string): boolean {
  return /isError|unavailable|useFeed|isLoadingError|status\s*===\s*["']error["']/.test(src);
}

/** `acctData?.accounts ?? []` or `invoicesQuery.data?.invoices ?? []` on a query value. */
function coalescedQueryReads(src: string, bindings: readonly string[]): string[] {
  if (bindings.length === 0) return [];
  const names = bindings.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const re = new RegExp(`\\b(${names})(?:\\.data)?\\?\\.[\\w.?]+\\s*\\?\\?\\s*(?:\\[\\]|\\{\\})`, "g");
  return [...src.matchAll(re)].map((m) => m[0]);
}

function findViolations(): { file: string; samples: string[] }[] {
  const out: { file: string; samples: string[] }[] = [];
  for (const file of sourceFiles("client/src")) {
    const src = readFileSync(file, "utf8");
    if (!/retry:\s*false/.test(src)) continue;
    if (handlesFailure(src)) continue;
    const samples = coalescedQueryReads(src, queryBindings(src));
    if (samples.length > 0) out.push({ file, samples });
  }
  return out;
}

describe("feed reads must not fail open", () => {
  it("no new query read collapses 'unreachable' into 'empty'", () => {
    const offenders = findViolations().filter((v) => !KNOWN_VIOLATIONS.has(v.file));
    const detail = offenders
      .map((v) => `  ${v.file}\n    ${v.samples.slice(0, 3).join("\n    ")}`)
      .join("\n");
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `These reads use retry:false and default the result to []/{} without ever checking ` +
            `isError, so a failed request renders as an empty one:\n${detail}\n\n` +
            `Use useFeed() from lib/feed.ts, or surface isError and render a distinct ` +
            `"couldn't load" state. Do not add the file to KNOWN_VIOLATIONS.`,
    ).toEqual([]);
  });

  it("the allowlist only shrinks — fixed files must be removed from it", () => {
    const stillBroken = new Set(findViolations().map((v) => v.file));
    const stale = [...KNOWN_VIOLATIONS].filter((f) => !stillBroken.has(f));
    expect(
      stale,
      `No longer failing open, so delete from KNOWN_VIOLATIONS in this file:\n  ${stale.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the guard can actually see the pattern it claims to catch", () => {
    /* A guard that silently matches nothing is worse than no guard, because it
       reads as a passing control. This pins the detector against a known sample
       rather than trusting that the regex still works after an edit. */
    const sample = `
      const { data: acctData } = useQuery<X>({ queryKey: ["/k"], retry: false });
      const allAccounts = acctData?.accounts ?? [];
    `;
    expect(coalescedQueryReads(sample, queryBindings(sample))).toHaveLength(1);

    /* And that it does NOT fire on a row-level default, which is not a feed read. */
    const benign = `const flags = bill.metadata?.flags ?? [];`;
    expect(coalescedQueryReads(benign, queryBindings(benign))).toHaveLength(0);
  });
});
