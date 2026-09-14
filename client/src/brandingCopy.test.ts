import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const CLIENT_SOURCE = path.resolve(process.cwd(), "client/src");
const CUSTOMER_COPY_FILES = [
  "server/brain/client.ts",
  "server/brain/demoTenantDeletion.ts",
  "server/brain/deterministicAnswers.ts",
  "server/passwordResetEmail.ts",
  "server/routes.ts",
  "shared/cannedPrompts.ts",
].map((file) => path.resolve(process.cwd(), file));

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) return [];
    return [fullPath];
  });
}

function displayedOldBrandReferences(file: string): string[] {
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const failures: string[] = [];

  function visit(node: ts.Node): void {
    const isDisplayedText =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node);

    if (isDisplayedText && /\bBrain\b/.test(node.text)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      failures.push(`${path.relative(CLIENT_SOURCE, file)}:${line + 1}`);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return failures;
}

describe("RobotMoney display branding", () => {
  it("keeps the old Brain name out of displayed client copy", () => {
    const clientFiles = sourceFiles(CLIENT_SOURCE);
    const failures = [...clientFiles, ...CUSTOMER_COPY_FILES].flatMap(displayedOldBrandReferences);
    const html = fs.readFileSync(path.resolve(process.cwd(), "client/index.html"), "utf8");
    if (/\bBrain\b/.test(html)) failures.push("index.html");
    for (const file of clientFiles) {
      if (/BrainLogo_/.test(fs.readFileSync(file, "utf8"))) {
        failures.push(`${path.relative(CLIENT_SOURCE, file)}: legacy Brain logo asset`);
      }
    }

    expect(
      failures,
      [
        'Displayed copy still uses the old "Brain" name.',
        "Rename display text to RobotMoney; do not rename brain-core routes, identifiers, or comments.",
      ].join(" "),
    ).toEqual([]);
  });

  it("does not confuse internal brain-core references with displayed branding", () => {
    const internalExample = `
      // brain-core remains the protocol name
      const route = "/api/brain/policy";
      const brainRequestId = "brain_request_id";
    `;
    const sourceFile = ts.createSourceFile(
      "internal.ts",
      internalExample,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const displayedTokens: string[] = [];

    function visit(node: ts.Node): void {
      if (
        (ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isJsxText(node)) &&
        /\bBrain\b/.test(node.text)
      ) {
        displayedTokens.push(node.text);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    expect(displayedTokens).toEqual([]);
  });

  it("uses RobotMoney metadata and avoids the legacy Brain icon artwork", () => {
    const publicDirectory = path.resolve(process.cwd(), "client/public");
    const manifest = JSON.parse(
      fs.readFileSync(path.join(publicDirectory, "site.webmanifest"), "utf8"),
    ) as { name?: string; short_name?: string; icons?: Array<{ src?: string }> };

    expect(manifest.name).toBe("RobotMoney");
    expect(manifest.short_name).toBe("RobotMoney");

    const linkedIcons = [
      "favicon.ico",
      "favicon-96x96.png",
      "apple-touch-icon.png",
      ...(manifest.icons ?? []).map((icon) => icon.src?.replace(/^\//, "") ?? ""),
    ];
    const legacyBrainIcons = [
      "favicon_1781872341412.ico",
      "favicon-96x96_1781872341412.png",
      "apple-touch-icon_1781872341412.png",
    ].map((file) => fs.readFileSync(path.resolve(process.cwd(), "attached_assets", file)));

    for (const icon of linkedIcons) {
      const current = fs.readFileSync(path.join(publicDirectory, icon));
      expect(
        legacyBrainIcons.some((legacy) => current.equals(legacy)),
        `${icon} still contains the legacy Brain icon artwork`,
      ).toBe(false);
    }
  });
});