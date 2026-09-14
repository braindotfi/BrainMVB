// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { useEffect, type ReactNode } from "react";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { AppAlertProvider, useAppAlert } from "./AppAlert";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  document.body.innerHTML = "";
});

function mount(ui: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(ui);
  });
}

function DoubleRateLimitAlert() {
  const alert = useAppAlert();
  useEffect(() => {
    alert.error("System Usage Error", "Rate limit exceeded. Retry in 1 second.", 5_000, "brain-rate-limit");
    alert.error("System Usage Error", "Rate limit exceeded. Retry in 12 seconds.", 5_000, "brain-rate-limit");
  }, [alert]);
  return null;
}

const VARIANTS = ["info", "error", "success", "approved", "postponed", "rejected"] as const;

function AllVariants() {
  const alert = useAppAlert();
  useEffect(() => {
    for (const v of VARIANTS) alert[v](`${v} title`, `${v} description`, 0);
  }, [alert]);
  return null;
}

describe("AppAlert variant discs", () => {
  /* A global sweep once replaced the info variant's designed disc with a
     hand-drawn inline SVG, matching this file by asset name even though the
     glyph here is a variant disc rather than an inline hint. Nothing failed:
     the toast simply stopped matching its five siblings. Assert the treatment
     is uniform, so the next sweep that singles one out has to say so. */
  it("renders every variant as its designed image asset, not an inline glyph", () => {
    mount(
      <AppAlertProvider>
        <AllVariants />
      </AppAlertProvider>,
    );

    const seen = new Set<string>();
    for (const variant of VARIANTS) {
      const card = document.body.querySelector(`[data-testid="alert-${variant}"]`);
      expect(card, `no card rendered for "${variant}"`).not.toBeNull();

      expect(
        card!.querySelector("svg"),
        `the "${variant}" disc is an inline SVG; every variant should use its designed asset`,
      ).toBeNull();

      const img = card!.querySelector("img");
      expect(img, `the "${variant}" disc is missing its image`).not.toBeNull();
      const src = img!.getAttribute("src") ?? "";
      expect(src, `the "${variant}" disc has no src`).not.toBe("");
      seen.add(src);
    }

    // Six variants must not collapse onto one shared asset.
    expect(seen.size, "variants are sharing a disc asset").toBeGreaterThan(1);
  });
});

describe("AppAlert is the only notifier", () => {
  /* The app shipped two toast systems for a long time: this one, and the
     scaffolded shadcn `useToast`/`<Toaster>` pair, which rendered an undesigned
     white card. Both were mounted in the bottom-right corner, so which one a
     user saw depended on nothing but the hook a call site imported — and the
     designed surface looked like it had randomly regressed. The scaffolded
     trio is deleted; this keeps it deleted. */
  const SECOND_NOTIFIER =
    /from\s+["'](?:@\/hooks\/use-toast|@\/components\/ui\/toaster|@\/components\/ui\/toast)["']/;

  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) sourceFiles(full, out);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it("no module imports a second, undesigned toast system", () => {
    /* `import.meta.url` is not a file:// URL under vitest's transform, so
       resolve from the project root instead. */
    const root = join(process.cwd(), "client", "src");
    const files = sourceFiles(root);

    // Guard the guard: if the walk finds nothing, it is not proving anything.
    expect(files.length, `source walk found no files under ${root}`).toBeGreaterThan(50);

    const offenders = files.filter((f) => SECOND_NOTIFIER.test(readFileSync(f, "utf8")));

    expect(
      offenders.map((f) => f.slice(root.length)),
      "these modules import a second notifier; route them through useAppAlert instead",
    ).toEqual([]);
  });
});

describe("AppAlert keyed dedupe", () => {
  it("updates one visible alert instead of stacking simultaneous rate-limit alerts", () => {
    mount(
      <AppAlertProvider>
        <DoubleRateLimitAlert />
      </AppAlertProvider>,
    );

    const alerts = document.body.querySelectorAll('[data-testid="alert-error"]');
    expect(alerts).toHaveLength(1);
    expect(document.body.textContent).toContain("System Usage Error");
    expect(document.body.textContent).toContain("Rate limit exceeded. Retry in 12 seconds.");
    expect(document.body.textContent).not.toContain("Rate limit exceeded. Retry in 1 second.");
  });
});
