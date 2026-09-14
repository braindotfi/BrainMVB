import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { mapAuditEventToRecord, type BrainAuditEvent } from "./lib/brainAudit";
import {
  normalizeBrainProposalBranding,
  proposalDecisionErrorMessage,
  type BrainProposal,
} from "./lib/brainProposals";
import { parseAssistantResponse } from "./lib/assistantChat";
import { normalizeOverviewRecommendation } from "./lib/runtimeBranding";
import { buildWhySuggested } from "./lib/proposalCards";

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

  it("normalizes product-authored live audit copy without changing tenant or protocol fields", () => {
    const event: BrainAuditEvent = {
      id: "evt_Brain_protocol",
      action: "proposal.decided",
      event_type: "flagged",
      actor: "Brain Family Office",
      created_at: "2026-09-14T12:00:00.000Z",
      inputs: {
        proposal_id: "proposal_Brain_internal",
        decision: "approve",
        question: "Why did Brain Family Office approve this?",
      },
      outputs: {
        proposal_summary: {
          summary: "Brain recommends approval",
          recommended_remediation: "Let Brain monitor Brain Family Office",
        },
      },
    };

    const record = mapAuditEventToRecord(event, undefined);
    expect(record.summary).toBe("RobotMoney recommends approval");
    expect(record.lifecycle[0].note).toBe("Let RobotMoney monitor Brain Family Office");
    expect(record.actor).toBe("Brain Family Office");
    expect(record.id).toBe("evt_Brain_protocol");
    expect(record.linked[0]?.refId).toBe("proposal_Brain_internal");
    expect(event.inputs.question).toBe("Why did Brain Family Office approve this?");
  });

  it("normalizes product-authored proposal display fields but preserves business text and identifiers", () => {
    const proposal = {
      id: "proposal_Brain_internal",
      type: "vendor_risk",
      created_at: "2026-09-14T12:00:00.000Z",
      status: "pending",
      risk_band: "low",
      confidence: 0.8,
      mode: "propose",
      narrative: "Brain found a duplicate involving Brain Family Office",
      agent: { id: "agent_Brain_internal", kind: "vendor_risk", display_name: "Brain Risk Agent" },
      payment_intent_id: null,
      action_type: "brain_review",
      evidence: [{
        kind: "vendor",
        ref: "vendor_Brain_internal",
        resolvable: true,
        display: "Brain Family Office",
        facts: [{ label: "Memo", value: "Invoice from Brain Family Office" }],
      }],
      subject: { label: "Vendor", display: "Brain Family Office" },
      presentation: {
        headline: "Brain detected a duplicate",
        recommendation: "Ask Brain to review it",
        policy: { explanation: "Brain policy requires review" },
        key_facts: [{ label: "Brain finding", value: "Invoice from Brain Family Office" }],
      },
      details: {
        recommended_action: "Have Brain inspect the invoice",
        recommendedAction: "Ask Brain to review Brain Family Office",
        recommendation: "Brain should hold payment",
        document_excerpt: "Invoice from Brain Family Office",
        ranked_signals: [
          { detail: "Brain detected unusual timing for Brain Family Office" },
          { description: "Brain found a duplicate" },
          { reason: "Brain flagged the amount" },
          { explanation: "Brain recommends review" },
          { label: "Brain finding" },
        ],
      },
      policy: {
        trace: [{
          matched: true,
          checks: [{ key: "brain_policy_check", detail: "Brain policy flagged Brain Family Office", passed: true }],
        }],
      },
      key_facts: [{ label: "Brain finding", value: "Invoice from Brain Family Office" }],
      resolved_refs: { vendor_Brain_internal: "Brain Family Office" },
    } satisfies BrainProposal;

    const mapped = normalizeBrainProposalBranding(proposal);
    expect(mapped.narrative).toBe("RobotMoney found a duplicate involving Brain Family Office");
    expect(mapped.agent?.display_name).toBe("RobotMoney Risk Agent");
    expect(mapped.presentation?.headline).toBe("RobotMoney detected a duplicate");
    expect(mapped.presentation?.recommendation).toBe("Ask RobotMoney to review it");
    expect(mapped.presentation?.policy?.explanation).toBe("RobotMoney policy requires review");
    expect(mapped.details?.recommended_action).toBe("Have RobotMoney inspect the invoice");
    expect(mapped.details?.recommendedAction).toBe("Ask RobotMoney to review Brain Family Office");
    expect(mapped.details?.recommendation).toBe("RobotMoney should hold payment");
    expect(mapped.details?.document_excerpt).toBe("Invoice from Brain Family Office");
    expect(mapped.presentation?.key_facts?.[0]).toEqual({
      label: "RobotMoney finding",
      value: "Invoice from Brain Family Office",
    });
    expect(mapped.key_facts?.[0]?.value).toBe("Invoice from Brain Family Office");
    expect(mapped.subject?.display).toBe("Brain Family Office");
    expect(mapped.evidence[0]?.display).toBe("Brain Family Office");
    expect(mapped.evidence[0]?.facts?.[0]?.value).toBe("Invoice from Brain Family Office");
    expect(mapped.resolved_refs).toEqual({ vendor_Brain_internal: "Brain Family Office" });
    expect(mapped.id).toBe("proposal_Brain_internal");
    expect(mapped.action_type).toBe("brain_review");

    expect(buildWhySuggested(mapped.policy, mapped.details).map((reason) => reason.text)).toEqual([
      "RobotMoney policy flagged Brain Family Office.",
      "RobotMoney detected unusual timing for Brain Family Office.",
      "RobotMoney found a duplicate.",
      "RobotMoney flagged the amount.",
      "RobotMoney recommends review.",
    ]);
  });

  it("normalizes a live assistant reply without rewriting the user's request", async () => {
    const userText = "Brain Collections";
    const response = new Response(JSON.stringify({
      reply: "You asked about Brain Collections. Brain found two matching invoices.",
      answered: true,
      route: "/api/brain/wiki/question",
      request_id: "brain_request_id",
    }));

    const parsed = await parseAssistantResponse(response, [userText]);
    expect(parsed.reply).toBe("You asked about Brain Collections. RobotMoney found two matching invoices.");
    expect(parsed.data?.route).toBe("/api/brain/wiki/question");
    expect(parsed.data?.request_id).toBe("brain_request_id");
  });

  it("normalizes a live proposal decision error without changing its business context", () => {
    expect(proposalDecisionErrorMessage({
      error: { message: "Brain could not decide the Brain Payments proposal" },
    }, 503, ["Brain Payments"])).toBe(
      "RobotMoney could not decide the Brain Payments proposal",
    );
  });

  it("normalizes varied generated phrasing and assistant errors while preserving possessive business names", async () => {
    const generated = [
      "Brain analyzed your ledger",
      "Brain has found a match",
      "Brain suggests reviewing this",
      "Brain Found a duplicate",
      "Brain Detected unusual activity",
      "Brain Recommendation Engine",
      "Brain Collections Assistant",
      "Brain's recommendation mentions Brain's Bakery",
    ];
    const normalized = await Promise.all(
      generated.map(async (reply) =>
        (await parseAssistantResponse(new Response(JSON.stringify({ reply })))).reply,
      ),
    );
    expect(normalized).toEqual([
      "RobotMoney analyzed your ledger",
      "RobotMoney has found a match",
      "RobotMoney suggests reviewing this",
      "RobotMoney Found a duplicate",
      "RobotMoney Detected unusual activity",
      "RobotMoney Recommendation Engine",
      "RobotMoney Collections Assistant",
      "RobotMoney's recommendation mentions RobotMoney's Bakery",
    ]);
    expect(
      (await parseAssistantResponse(new Response(JSON.stringify({
        reply: "Brain's recommendation mentions Brain's Bakery",
      })), ["Brain's Bakery"])).reply,
    ).toBe("RobotMoney's recommendation mentions Brain's Bakery");

    const failed = await parseAssistantResponse(new Response(
      JSON.stringify({ error: "Brain service unavailable for Brain's Bakery" }),
      { status: 503 },
    ), ["Brain's Bakery"]);
    expect(failed.reply).toBe("RobotMoney service unavailable for Brain's Bakery");
  });

  it("normalizes the live Overview recommendation at its display boundary", () => {
    expect(normalizeOverviewRecommendation(
      "Brain spotted spending at Brain Family Office",
      ["Brain Family Office"],
    )).toBe(
      "RobotMoney spotted spending at Brain Family Office",
    );
    expect(normalizeOverviewRecommendation(
      "Brain Identified activity at Brain Collections",
      ["Brain Collections"],
    )).toBe("RobotMoney Identified activity at Brain Collections");
  });
});