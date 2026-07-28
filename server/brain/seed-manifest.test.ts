import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SEED_FILES } from "./seed";
import { CATEGORY_ORDER } from "@/lib/sourceCategories";

/**
 * The demo seed manifest is the only place where document categories are chosen
 * server-side, and the Add Source badges group real documents by exactly that field.
 * When the two vocabularies drift, seeded documents silently stop showing up under
 * their category - which is the bug these tests exist to prevent.
 */
describe("demo seed manifest", () => {
  it("uses only categories the Add Source picker knows", () => {
    for (const f of SEED_FILES) {
      expect(CATEGORY_ORDER, `${f.filename} has an unknown category "${f.category}"`).toContain(f.category);
    }
  });

  it("ships a bundled asset for every manifest entry", () => {
    for (const f of SEED_FILES) {
      expect(existsSync(join(process.cwd(), "server", "assets", "demo-seed", f.filename)), f.filename).toBe(true);
    }
  });

  it("only uses source types brain-core recognises", () => {
    for (const f of SEED_FILES) {
      expect(["pdf_upload", "csv_upload"]).toContain(f.sourceType);
    }
  });

  it("covers more than one source category so the demo has a broad footprint", () => {
    const categories = new Set(SEED_FILES.map((f) => f.category));
    expect(categories.size).toBeGreaterThanOrEqual(4);
  });
});
