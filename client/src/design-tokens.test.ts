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
