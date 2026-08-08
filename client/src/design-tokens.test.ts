/**
 * #131 — enforce the design-token layer.
 *
 * #130 promoted the palette and the four radii to named tokens. This suite is
 * what stops the raw values creeping back in. It is a source scan, not a
 * runtime test: it reads the .tsx sources and fails on anything that bypasses
 * a token that already exists.
 *
 * Deliberately narrow — it enforces only what #131 resolved:
 *   1. no raw hex in a class string (zero tolerance)
 *   2. no raw 12/16/24/100px radius (zero tolerance — these are rounded-row /
 *      -panel / -modal / -pill)
 *   3. every brain-v1* / brand-* / doc-paper-* class refers to a real token
 *   4. index.css and tailwind.config.ts do not drift apart
 *
 * Every *other* raw px value (8px radii, spacing, font sizes) is #133's
 * problem and is deliberately NOT ratcheted here — a partial rule that grows
 * by accident is worse than an explicit one.
 *
 * Two exceptions are legitimate and encoded below:
 *   - `[#hex]/NN` where #hex IS a defined token. Tailwind 3 cannot apply an
 *     alpha modifier to a CSS-var colour, so the raw value is the only way to
 *     write it. Allowed *only* for values that are already tokens, so a new
 *     colour cannot sneak in behind a `/40`.
 *   - doc-paper-* is a first-class token namespace, not app chrome. It models
 *     a printed document facsimile and is intentionally outside brain-v1*.
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
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const FILES = walk(SRC).sort();
const rel = (p: string) => path.relative(ROOT, p);

/** Every design token declared in index.css, as name -> lowercase hex. */
function declaredTokens(): Map<string, string> {
  const css = readFileSync(path.join(SRC, "index.css"), "utf8");
  const out = new Map<string, string>();
  const re =
    /--((?:brain-v1|brand-|doc-paper-|shared-colors|brain)[a-z0-9-]*)\s*:\s*rgba?\((\d+),\s*(\d+),\s*(\d+)/g;
  for (const m of css.matchAll(re)) {
    const hex =
      "#" +
      [m[2], m[3], m[4]]
        .map((n) => Number(n).toString(16).padStart(2, "0"))
        .join("");
    out.set(m[1], hex.toLowerCase());
  }
  return out;
}

/** Radius tokens, as "12px" -> "rounded-row". */
function radiusTokens(): Map<string, string> {
  const css = readFileSync(path.join(SRC, "index.css"), "utf8");
  const out = new Map<string, string>();
  for (const m of css.matchAll(/--radius-([a-z]+)\s*:\s*(\d+px)/g)) {
    out.set(m[2], `rounded-${m[1]}`);
  }
  return out;
}

const TOKENS = declaredTokens();
const TOKEN_HEXES = new Set(TOKENS.values());
const RADII = radiusTokens();

/** Strip // and /* *​/ comments so prose examples never trip the scan. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "");
}

type Hit = { where: string; text: string };

function scan(re: RegExp, keep: (m: RegExpMatchArray) => boolean): Hit[] {
  const hits: Hit[] = [];
  for (const f of FILES) {
    const lines = stripComments(readFileSync(f, "utf8")).split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(re)) {
        if (keep(m)) hits.push({ where: `${rel(f)}:${i + 1}`, text: m[0] });
      }
    });
  }
  return hits;
}

const HEX_RE = /\[(#[0-9a-fA-F]{3,8})\](\/\d+)?/g;
const RADIUS_RE = /\brounded(?:-[a-z]{1,2})?-\[(\d+px)\]/g;
const TOKEN_CLASS_RE =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|divide|placeholder|caret|accent)-((?:brain-v1|brand-|doc-paper-|shared-colors)[a-z0-9-]*?)(?=[\s"'`}\\]|\/\d|$)/g;

function expand(hex: string): string {
  const h = hex.slice(1).toLowerCase();
  return h.length === 3
    ? "#" + [...h].map((c) => c + c).join("")
    : "#" + h.slice(0, 6);
}

describe("#131 design tokens are enforced, not just available", () => {
  it("finds sources to scan", () => {
    expect(FILES.length).toBeGreaterThan(50);
    expect(TOKENS.size).toBeGreaterThan(30);
    expect(RADII.size).toBe(4);
  });

  it("no raw hex colour in a class string", () => {
    // A bare [#hex] always fails. [#hex]/NN is allowed only when the value is
    // already a token — see the alpha-modifier note at the top of this file.
    const bad = scan(HEX_RE, (m) =>
      m[2] ? !TOKEN_HEXES.has(expand(m[1])) : true,
    );
    expect(
      bad.map((h) => `${h.where}  ${h.text}`),
      "raw hex must use a design token — see docs/design-token-mapping-131.md",
    ).toEqual([]);
  });

  it("the alpha-modifier escape hatch stays limited to the known value", () => {
    // Pins the exception itself: Tailwind 3 can't put an alpha modifier on a
    // var() colour, and brain-v1purple at 40% is the only place we need it.
    const used = new Set(
      scan(HEX_RE, (m) => Boolean(m[2])).map((h) => expand(h.text.split("]")[0].slice(1))),
    );
    expect([...used].sort()).toEqual(["#7631ee"]);
  });

  it("no raw 12/16/24/100px radius — those are named", () => {
    const bad = scan(RADIUS_RE, (m) => RADII.has(m[1]));
    expect(
      bad.map((h) => `${h.where}  ${h.text} -> use ${RADII.get(h.text.match(/\d+px/)![0])}`),
      "these radii are tokens",
    ).toEqual([]);
  });

  it("every token class refers to a token that exists", () => {
    // Tailwind silently drops an unknown class, so a typo renders nothing at
    // all. That failure is invisible in review — this makes it loud.
    const bad = scan(TOKEN_CLASS_RE, (m) => !TOKENS.has(m[1]));
    expect(bad.map((h) => `${h.where}  ${h.text}`)).toEqual([]);
  });

  it("index.css and tailwind.config.ts agree", () => {
    const tw = readFileSync(path.join(ROOT, "tailwind.config.ts"), "utf8");
    const registered = new Set(
      [...tw.matchAll(/"?([a-zA-Z0-9-]+)"?:\s*"var\(--([a-z0-9-]+)\)"/g)].map(
        (m) => m[2],
      ),
    );
    const missing = [...TOKENS.keys()].filter((t) => !registered.has(t));
    expect(missing, "declared in index.css but unusable as a class").toEqual([]);
  });
});
