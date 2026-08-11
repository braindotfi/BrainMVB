/* ── record rows and count pills stay on one ramp ──────────────────────────────
   Every list in the app presents a record the same way: a 16px/20px medium title
   in #a8b9f4 with a 14px/16px medium subtext in #6c779d 4px under it, and a count
   badge beside the section heading. That agreement is invisible to behaviour
   tests — a row keeps working perfectly while its type quietly drifts a size or a
   leading away from every other row, and nobody notices until the two are seen
   side by side. These guards pin the places that had already drifted. */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = resolve(here, "..");
const read = (p: string) => readFileSync(resolve(here, p), "utf8");

function allTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) allTsx(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/* The geometry of the count badge next to a section heading. Matched token-wise
   rather than as one substring: Tailwind class order is arbitrary, so a copy that
   reshuffled these four would sail past a literal comparison while rendering the
   identical badge — exactly the duplicate this guard exists to catch. */
const PILL_TOKENS = ["min-w-[18px]", "px-[5px]", "py-[1px]", "rounded-[4px]"];

/* Look at one string literal at a time. Four tokens scattered across a whole file
   mean nothing; four tokens in a single className are a count pill. */
const STRING_LITERAL = /"[^"\n]*"|'[^'\n]*'|`[^`]*`/g;

function declaresPillGeometry(source: string): boolean {
  return (source.match(STRING_LITERAL) ?? []).some((lit) =>
    PILL_TOKENS.every((t) => lit.includes(t)),
  );
}

describe("the count pill is declared once", () => {
  /* FilterChipRow's counter is a different object: it lives *inside* a filter
     chip and takes the chip's own state colour as its fill, so it cannot render
     through a component that owns its palette. It is allowed to restate the
     geometry; nothing else is. */
  const ALLOWED = ["components/CountPill.tsx", "components/FilterChipRow.tsx"];

  it("no surface hand-rolls the pill geometry", () => {
    const offenders = allTsx(CLIENT_SRC)
      .filter((f) => declaresPillGeometry(readFileSync(f, "utf8")))
      .map((f) => relative(CLIENT_SRC, f).split("\\").join("/"))
      .filter((f) => !ALLOWED.includes(f));

    expect(
      offenders,
      `these files restate the count-pill geometry instead of using <CountPill>: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("the surfaces that show a count render it through the shared component", () => {
    // Each of these had its own copy of the markup before; the Audit Log had
    // drifted to a pill-shaped outline badge at a different size entirely.
    // Note: RulesPanel.tsx no longer directly renders CountPill — it passes
    // `count` to WidgetHeader (in LedgerWidgets.tsx), which renders CountPill.
    // LedgerWidgets.tsx remains on the list and covers that rendering path.
    const callSites = [
      "../components/LedgerWidgets.tsx",
      "../components/TierRowList.tsx",
      "../components/settings/AuditLogSection.tsx",
      "../pages/VendorsPanel.tsx",
    ];
    for (const f of callSites) {
      expect(read(f), `${f} must import the shared pill`).toContain(
        'from "@/components/CountPill"',
      );
      expect(read(f), `${f} must actually render it`).toMatch(/<CountPill[\s>]/);
    }
  });

  it("the pill keeps the Accounts-tab proportions", () => {
    const pill = read("../components/CountPill.tsx");
    expect(declaresPillGeometry(pill), "CountPill lost its own geometry").toBe(true);
    // 11px on 14px leading, dark text on a solid fill.
    expect(pill).toContain("text-[11px]");
    expect(pill).toContain("leading-[14px]");
    expect(pill).toContain("text-brain-v1highlight-dropdown-bg");
  });

  it("the pill still forwards a test id", () => {
    // Two E2E selectors (text-decision-count, badge-audit-count) used to live on
    // hand-rolled markup and now depend on this passthrough; dropping the prop
    // would break them somewhere far away from this component.
    expect(read("../components/CountPill.tsx")).toContain("data-testid={testId}");
  });
});

/* Pull out just the row markup so these assertions cannot be satisfied by some
   unrelated element elsewhere in a large file. */
function block(source: string, anchor: string, chars: number): string {
  const i = source.indexOf(anchor);
  expect(i, `anchor ${anchor} not found — the row was renamed or removed`).toBeGreaterThan(-1);
  return source.slice(i, i + chars);
}

describe("record rows sit on the shared type ramp", () => {
  it("an audit log row's subtext uses the 16px leading, not a looser one", () => {
    // 20 + 4 + 16 is what makes the text stack exactly 40px tall; an 18px
    // leading here made audit rows a hair taller than every other list.
    const row = block(read("../components/settings/AuditLogSection.tsx"), "data-testid={`row-audit-", 2200);
    expect(row).toContain("text-[14px] leading-[16px]");
    expect(row, "audit row subtext drifted off the ramp again").not.toContain("leading-[18px]");
  });

  it("a rule's problem report uses the medium record ramp, not two bold lines", () => {
    const row = block(read("../pages/RuleDetail.tsx"), "data-testid={`card-report-", 1100);
    // Title: medium 16/20. Subtext: regular 14/16 — it had been semibold 16/20,
    // which made the timestamp shout as loudly as the reason.
    expect(row).toContain("font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[16px]");
    expect(row).toContain("font-medium leading-[16px] text-brain-v1baby-blue-60 text-[14px]");
  });

  it("a source row separates its title and subtext by 4px", () => {
    const row = block(read("../components/settings/SourcesSection.tsx"), "flex-1 min-w-0 flex flex-col", 80);
    expect(row, "source rows had a tighter 2px gap than every other list").toContain("gap-[4px]");
  });
});
