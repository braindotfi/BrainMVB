/**
 * #131 — enforce the design-token layer.
 *
 * #130 promoted the palette and the four radii to named tokens. This suite is
 * what stops the raw values creeping back in. It is a source scan, not a
 * runtime test: it reads the sources and fails on anything that bypasses a
 * token that already exists.
 *
 * Deliberately narrow — it enforces only what #131 resolved:
 *   1. no raw colour in a class string (hex, arbitrary property, or an opaque
 *      rgb()/rgba() spelling of the same thing)
 *   2. no raw 12/16/24/100px radius — those are rounded-row / -panel / -modal
 *      / -pill
 *   3. every brain-v1* / brand-* / doc-paper-* class names a real token
 *   4. index.css and tailwind.config.ts cannot drift apart, in either direction
 *
 * Every *other* raw px value (8px radii, spacing, font sizes) is a later pass
 * and is deliberately NOT ratcheted here: a partial rule that grows by accident
 * is worse than an explicit one.
 *
 * Legitimate exceptions, both encoded rather than trusted:
 *   - an alpha modifier or a partial-alpha rgba() whose BASE colour is already
 *     a token. Tailwind 3 cannot apply an alpha channel to a var() colour, so
 *     the raw value is the only spelling available. Allowed only for values
 *     that are already tokens, so a new colour cannot arrive behind a "/40".
 *   - doc-paper-* is a first-class token namespace, not app chrome. It models a
 *     printed-document facsimile and is intentionally outside brain-v1*.
 *
 * Note this scan covers class strings in .ts and .tsx under client/src. It does
 * NOT see inline style={{}} objects, which still hold raw hex and are a
 * separate pass — a green run here does not mean the app is hex-free.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const SRC = path.join(ROOT, "client", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const FILES = walk(SRC).sort();
const CSS = readFileSync(path.join(SRC, "index.css"), "utf8");
const TW = readFileSync(path.join(ROOT, "tailwind.config.ts"), "utf8");

/** Design tokens declared in index.css, as name -> lowercase hex. */
const TOKENS = new Map<string, string>();
for (const m of CSS.matchAll(
  /--((?:brain-v1|brand-|doc-paper-|shared-colors|brain)[a-z0-9-]*)\s*:\s*rgba?\((\d+),\s*(\d+),\s*(\d+)/g,
)) {
  const hex =
    "#" +
    [m[2], m[3], m[4]]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("");
  TOKENS.set(m[1], hex.toLowerCase());
}
const TOKEN_HEXES = new Set(TOKENS.values());

/** Radius tokens, as "12px" -> "rounded-row". */
const RADII = new Map<string, string>();
for (const m of CSS.matchAll(/--radius-([a-z]+)\s*:\s*(\d+px)/g)) {
  RADII.set(m[2], `rounded-${m[1]}`);
}

type Hit = { where: string; text: string };

/**
 * Scan whole file text, not line by line, so a class split across lines is
 * still seen. Comments are deliberately NOT stripped: a comment cannot contain
 * an arbitrary-value class without also being one worth flagging, and any
 * stripper naive enough to be worth writing also eats real code — `accept=
 * "image/*"` starts a block comment as far as a regex is concerned.
 */
function scan(re: RegExp, keep: (m: RegExpExecArray) => boolean): Hit[] {
  const hits: Hit[] = [];
  for (const f of FILES) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(re) as IterableIterator<RegExpExecArray>) {
      if (!keep(m)) continue;
      const line = src.slice(0, m.index).split("\n").length;
      hits.push({ where: `${path.relative(ROOT, f)}:${line}`, text: m[0] });
    }
  }
  return hits;
}

const HEX_RE = /\[(#[0-9a-fA-F]{3,8})\](\/[\d.]+)?/g;
const PROP_HEX_RE = /\[[a-zA-Z-]+:\s*(#[0-9a-fA-F]{3,8})\]/g;
const FUNC_RE = /\[(rgba?)\(([^)]*)\)\](\/[\d.]+)?/g;
const RADIUS_RE = /\brounded(?:-[a-z]{1,2})?-\[(\d+px)\]/g;
const TOKEN_CLASS_RE =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|divide|placeholder|caret|accent)-((?:brain-v1|brand-|doc-paper-|shared-colors)[a-z0-9-]*?)(?=[\s"'`}\\]|\/[\d.]|$)/g;

function expand(hex: string): string {
  const h = hex.slice(1).toLowerCase();
  return h.length === 3
    ? "#" + [...h].map((c) => c + c).join("")
    : "#" + h.slice(0, 6);
}

/** rgb()/rgba() channels -> [hex, alpha]. */
function parseFunc(args: string): { hex: string; alpha: number } | null {
  const parts = args.split(",").map((s) => s.trim());
  if (parts.length < 3) return null;
  const [r, g, b] = parts.slice(0, 3).map(Number);
  if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
  const alpha = parts.length > 3 ? Number(parts[3]) : 1;
  const hex =
    "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
  return { hex, alpha: Number.isFinite(alpha) ? alpha : 1 };
}

describe("#131 design tokens are enforced, not just available", () => {
  it("finds the sources, tokens and radii it claims to check", () => {
    expect(FILES.length).toBeGreaterThan(50);
    expect(FILES.some((f) => f.endsWith(".ts"))).toBe(true);
    expect(TOKENS.size).toBeGreaterThan(40);
    expect(RADII.size).toBe(4);
  });

  it("no raw hex colour in a class string", () => {
    const bad = scan(HEX_RE, (m) =>
      m[2] ? !TOKEN_HEXES.has(expand(m[1])) : true,
    );
    expect(
      bad.map((h) => `${h.where}  ${h.text}`),
      "raw hex must use a design token — see docs/design-token-mapping-131.md",
    ).toEqual([]);
  });

  it("no raw hex hidden in an arbitrary property", () => {
    // e.g. an arbitrary `color:` property is still a raw colour.
    const bad = scan(PROP_HEX_RE, () => true);
    expect(bad.map((h) => `${h.where}  ${h.text}`)).toEqual([]);
  });

  it("no opaque rgb()/rgba() standing in for a hex", () => {
    // Closes the obvious way around the hex rule. Partial alpha is legitimate
    // (Tailwind 3 can't alpha a var() colour) but only over a token colour.
    const bad = scan(FUNC_RE, (m) => {
      const p = parseFunc(m[2]);
      if (!p) return true;
      if (p.alpha >= 1) return true; // fully opaque -> should be a token
      return !TOKEN_HEXES.has(p.hex); // translucent -> base must be a token
    });
    expect(
      bad.map((h) => `${h.where}  ${h.text}`),
      "opaque colours must be tokens; translucent ones must be built on one",
    ).toEqual([]);
  });

  it("the alpha escape hatch stays limited to the known value", () => {
    const used = new Set(
      scan(HEX_RE, (m) => Boolean(m[2])).map((h) =>
        expand(h.text.slice(1, h.text.indexOf("]"))),
      ),
    );
    expect([...used].sort()).toEqual(["#7631ee"]);
  });

  it("no raw 12/16/24/100px radius — those are named", () => {
    const bad = scan(RADIUS_RE, (m) => RADII.has(m[1]));
    expect(
      bad.map(
        (h) => `${h.where}  ${h.text} -> use ${RADII.get(h.text.match(/\d+px/)![0])}`,
      ),
      "these radii are tokens",
    ).toEqual([]);
  });

  it("every token class refers to a token that exists", () => {
    // Tailwind silently drops an unknown class, so a typo renders nothing at
    // all. That failure is invisible in review — this makes it loud.
    const bad = scan(TOKEN_CLASS_RE, (m) => !TOKENS.has(m[1]));
    expect(bad.map((h) => `${h.where}  ${h.text}`)).toEqual([]);
  });

  it("index.css and tailwind.config.ts agree in both directions", () => {
    const registered = new Set(
      [...TW.matchAll(/"?[a-zA-Z0-9-]+"?:\s*"var\(--([a-z0-9-]+)\)"/g)].map(
        (m) => m[1],
      ),
    );
    const declared = new Set([
      ...TOKENS.keys(),
      ...[...CSS.matchAll(/--(radius-[a-z]+)\s*:/g)].map((m) => m[1]),
    ]);

    expect(
      [...declared].filter((t) => !registered.has(t)).sort(),
      "declared in index.css but unusable as a class",
    ).toEqual([]);
    expect(
      [...registered].filter(
        (t) =>
          (t.startsWith("brain") ||
            t.startsWith("brand-") ||
            t.startsWith("doc-paper-") ||
            t.startsWith("radius-")) &&
          !declared.has(t),
      ).sort(),
      "registered in tailwind.config.ts but never declared — resolves to nothing",
    ).toEqual([]);
  });

  it("all four named radii are registered as utilities", () => {
    for (const name of RADII.values()) {
      const key = name.replace("rounded-", "");
      expect(TW, `${name} is not wired up`).toContain(
        `${key}: "var(--radius-${key})"`,
      );
    }
  });
});

/* ------------------------------------------------------------------------ *
 * #134 — `#414965` is a border colour, not a text colour.
 *
 * The #131 suite above asks "is this a token?". It cannot ask "is this token
 * allowed in this role?", so both spellings of this bug pass it: the named
 * `text-brain-v1baby-blue-30` class is a perfectly valid token reference, and
 * the raw hex lives in inline style={{}} objects, which #131 documents itself
 * as not reading (see the header note).
 *
 * `#414965` on the `#0a0c10` card surface is 2.2:1 — under the 3:1 floor even
 * for large text. `#6c779d` is 4.4:1 and is the muted-copy colour; `#a8b9f4`
 * is for copy that has to be read. Borders, strokes, focus rings and badge
 * fills keep `#414965`: that is the job the token exists for.
 *
 * This is a RATCHET, not a clean-slate rule. #134 converted the Settings
 * cluster; the rest of the app still holds 72 text uses and converting them is
 * a separate, visible restyle. So the remaining sites are frozen below as
 * per-file counts. A new one fails the build; removing one fails the build
 * until the baseline is lowered to match. The count can only go down.
 *
 * Per-file counts rather than file:line because line numbers churn on every
 * unrelated edit. The trade is that removing one site and adding another in
 * the same file nets out invisibly — accepted deliberately, and the reason the
 * Settings cluster is additionally pinned at zero by name below.
 * ------------------------------------------------------------------------ */

/** Files #134 converted. These must stay clean, not merely not-grow. */
const SETTINGS_CLUSTER = [
  "components/settings/figma/SecuritySection.tsx",
  "components/settings/figma/LegalSection.tsx",
  "components/settings/figma/NotificationsSection.tsx",
  "components/settings/figma/AccountSection.tsx",
  "components/settings/figma/TeamSection.tsx",
  "components/settings/AuditLogSection.tsx",
  "components/settings/SourcesSection.tsx",
  "components/settings/DevelopersSection.tsx",
  "components/CashFlowTab.tsx",
  "components/AddGoalModal.tsx",
  "pages/SettingsPage.tsx",
  "pages/CompanySetupPage.tsx",
];

/** Text uses of the named class still awaiting conversion. Only ever shrinks. */
const NAMED_TEXT_BASELINE: Record<string, number> = {
  "components/AddAccountModal.tsx": 9,
  "components/AnchorStatus.tsx": 2,
  "components/AuditRecordPopup.tsx": 4,
  "components/ContactUpdateModal.tsx": 1,
  "components/DocumentViewerPopup.tsx": 14,
  "components/LiveEvidenceRecordPopup.tsx": 1,
  "components/LiveInsightModal.tsx": 1,
  "components/MemberDetailPopup.tsx": 2,
  "components/ProposalDetail.tsx": 7,
  "components/ReviewItems.tsx": 1,
  "components/SecurityModals.tsx": 1,
  "components/ShareModal.tsx": 4,
  "pages/FinancesPage.tsx": 1,
  "pages/HomePage.tsx": 3,
  "pages/InboxPage.tsx": 1,
  "pages/SignupPage.tsx": 9,
  "pages/sections/BrainAssistant.tsx": 5,
  "pages/sections/NavigationMenuSection.tsx": 3,
};

/** Raw-hex inline text colours still awaiting conversion. Only ever shrinks. */
const RAW_TEXT_BASELINE: Record<string, number> = {
  "components/FilterChipRow.tsx": 1,
  "components/PayablesTab.tsx": 1,
  "components/ReceivablesTab.tsx": 1,
};

const NAMED_TEXT_RE = /text-brain-v1baby-blue-30(?![\w-])/g;

/**
 * Line indices that sit inside a comment.
 *
 * Tracked per line rather than by stripping, because #131's header records why
 * a naive stripper is unsafe here: `accept="image/*"` opens a block comment as
 * far as a regex is concerned. A block comment is only recognised when `/*` or
 * `{/*` opens the line, which a mid-line string literal never does.
 */
function commentLines(src: string): Set<number> {
  const out = new Set<number>();
  let open = false;
  src.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (open) {
      out.add(i);
      if (line.includes("*/")) open = false;
      return;
    }
    if (line.startsWith("//") || line.startsWith("*")) {
      out.add(i);
      return;
    }
    if (line.startsWith("/*") || line.startsWith("{/*")) {
      out.add(i);
      if (!line.includes("*/")) open = true;
    }
  });
  return out;
}

/**
 * Whether a raw `#414965` is painting text.
 *
 * Decided by the nearest preceding marker: a CSS `color:` property means text,
 * while `stroke` / `background` / `borderColor` / a ring colour / a `dot:` fill
 * / a `color=` JSX prop (which the chevron icons use for their stroke) do not.
 * No marker at all is treated as text — that is the `const text = …` shape, and
 * failing toward "this is text" is the safe direction for a contrast rule.
 *
 * `\bcolor\s*:` deliberately will not match inside `backgroundColor:`.
 */
const TEXT_MARKER_RE = /\bcolor\s*:/g;
const NON_TEXT_MARKER_RE =
  /(--tw-ring-color|background(?:Color)?|borderColor|border|stroke|fill|ring|dot|color\s*=)/g;

function paintsText(window: string): boolean {
  const last = (re: RegExp) => {
    let idx = -1;
    for (const m of window.matchAll(re)) idx = m.index ?? idx;
    return idx;
  };
  const nonText = last(NON_TEXT_MARKER_RE);
  const text = last(TEXT_MARKER_RE);
  if (nonText === -1 && text === -1) return true;
  return text > nonText;
}

/**
 * App source only. This file names both spellings dozens of times in its own
 * rules and fixtures; counting itself would make the ratchet self-referential.
 */
const APP_FILES = FILES.filter((f) => !/\.test\.tsx?$/.test(f));

function countPerFile(pick: (src: string, rel: string) => number) {
  const out: Record<string, number> = {};
  for (const f of APP_FILES) {
    const rel = path.relative(SRC, f).split(path.sep).join("/");
    const n = pick(readFileSync(f, "utf8"), rel);
    if (n > 0) out[rel] = n;
  }
  return out;
}

const namedTextUses = () =>
  countPerFile((src) => (src.match(NAMED_TEXT_RE) ?? []).length);

const rawTextUses = () =>
  countPerFile((src) => {
    const comments = commentLines(src);
    let n = 0;
    for (const m of src.matchAll(/#414965/g)) {
      const at = m.index ?? 0;
      const line = src.slice(0, at).split("\n").length - 1;
      if (comments.has(line)) continue;
      if (paintsText(src.slice(Math.max(0, at - 240), at))) n += 1;
    }
    return n;
  });

describe("#134 baby-blue-30 is a border colour, never text", () => {
  it("classifies the raw-hex sites it is asked to judge", () => {
    // Guards the heuristic itself: if the marker logic breaks, every other
    // assertion here goes quietly green instead of failing.
    expect(paintsText('style={{ color: ')).toBe(true);
    expect(paintsText('const text = active ? "#ff9500" : ')).toBe(true);
    expect(paintsText('<path stroke=')).toBe(false);
    expect(paintsText('<ChevronRight color=')).toBe(false);
    expect(paintsText('style={{ background: ')).toBe(false);
    expect(paintsText("backgroundColor: p.isNew ? p.placeholder ? ")).toBe(false);
    expect(paintsText('borderColor: "#1d2132", color: "#a8b9f4", ["--tw-ring-color" as string]: ')).toBe(false);
    // Nearest marker wins, not first.
    expect(paintsText('{ background: "#0c0f14", color: ')).toBe(true);
    expect(paintsText('{ color: "#6c779d", dot: ')).toBe(false);
  });

  it("the Settings cluster #134 converted stays clean", () => {
    const named = namedTextUses();
    const raw = rawTextUses();
    const dirty = SETTINGS_CLUSTER.filter((f) => named[f] || raw[f]).map(
      (f) => `${f}  named:${named[f] ?? 0} raw:${raw[f] ?? 0}`,
    );
    expect(
      dirty,
      "#414965 is back as a text colour in Settings — use #6c779d, or #a8b9f4 if it is copy that has to be read",
    ).toEqual([]);
  });

  it("no new text use of the named class anywhere", () => {
    expect(
      namedTextUses(),
      "text-brain-v1baby-blue-30 is a 2.2:1 contrast failure. Use text-brain-v1baby-blue-60. " +
        "If you removed one, lower the count in NAMED_TEXT_BASELINE — never raise it.",
    ).toEqual(NAMED_TEXT_BASELINE);
  });

  it("no new raw #414965 painting text anywhere", () => {
    expect(
      rawTextUses(),
      'A raw "#414965" is being used as a text colour. Use "#6c779d". ' +
        "If you removed one, lower the count in RAW_TEXT_BASELINE — never raise it.",
    ).toEqual(RAW_TEXT_BASELINE);
  });
});
