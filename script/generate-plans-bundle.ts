import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
} from "docx";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const BRAND = "2E1065";
const ACCENT = "7C3AED";
const MUTED = "6B7280";
const BG = "F5F3FF";
const CODE_BG = "F3F4F6";
const BODY = "111827";
const MONO = "Courier New";

const PHASES: Array<{ file: string; phase: string; deps: string[] }> = [
  { file: "02-brain-core-foundation.md", phase: "Phase 1", deps: [] },
  { file: "03-auth-and-bff.md",          phase: "Phase 2", deps: ["Phase 1"] },
  { file: "04-raw-and-ledger.md",        phase: "Phase 3", deps: ["Phase 2"] },
  { file: "05-wiki-layer.md",            phase: "Phase 4", deps: ["Phase 3"] },
  { file: "06-policy-layer.md",          phase: "Phase 5", deps: ["Phase 2"] },
  { file: "07-agent-layer.md",           phase: "Phase 6", deps: ["Phase 5"] },
  { file: "08-audit-layer.md",           phase: "Phase 7", deps: ["Phase 6"] },
  { file: "09-cleanup-and-docs.md",      phase: "Phase 8", deps: ["Phase 4", "Phase 7"] },
];

interface PlanSection {
  heading: string;
  body: string[];
}
interface Plan {
  title: string;
  sections: PlanSection[];
}

function parsePlan(md: string): Plan {
  const lines = md.split("\n");
  let title = "";
  const sections: PlanSection[] = [];
  let current: PlanSection | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.startsWith("# ") && !title) {
      title = line.slice(2).trim();
      continue;
    }
    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      current = { heading: line.slice(3).trim(), body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) sections.push(current);
  return { title, sections };
}

function inlineRuns(text: string, baseOpts: { italics?: boolean; bold?: boolean; color?: string } = {}): TextRun[] {
  const runs: TextRun[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      runs.push(new TextRun({ text: text.slice(last, m.index), color: baseOpts.color ?? BODY, italics: baseOpts.italics, bold: baseOpts.bold }));
    }
    if (m[1] !== undefined) {
      runs.push(new TextRun({ text: m[1], font: MONO, size: 18, color: BRAND, shading: { type: ShadingType.CLEAR, color: "auto", fill: CODE_BG } }));
    } else if (m[2] !== undefined) {
      runs.push(new TextRun({ text: m[2], bold: true, color: baseOpts.color ?? BODY }));
    } else if (m[3] !== undefined) {
      runs.push(new TextRun({ text: m[3], italics: true, color: baseOpts.color ?? BODY }));
    }
    last = re.lastIndex;
  }
  if (last < text.length) {
    runs.push(new TextRun({ text: text.slice(last), color: baseOpts.color ?? BODY, italics: baseOpts.italics, bold: baseOpts.bold }));
  }
  return runs.length ? runs : [new TextRun({ text, color: baseOpts.color ?? BODY })];
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({ spacing: { after: 100 }, children: inlineRuns(text) });
}

function bulletParagraph(text: string, level = 0): Paragraph {
  return new Paragraph({ bullet: { level }, spacing: { after: 60 }, children: inlineRuns(text) });
}

function numberedParagraph(text: string, ref: string): Paragraph {
  return new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 80 }, children: inlineRuns(text) });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 100 },
    children: [new TextRun({ text, bold: true, color: ACCENT, size: 26, font: "Calibri" })],
  });
}

function phaseHeading(phase: string, title: string, deps: string[]): Paragraph[] {
  return [
    new Paragraph({
      pageBreakBefore: true,
      spacing: { after: 60 },
      children: [new TextRun({ text: phase.toUpperCase(), bold: true, color: ACCENT, size: 22, characterSpacing: 40 })],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: title, bold: true, color: BRAND, size: 40, font: "Calibri" })],
    }),
    new Paragraph({
      spacing: { before: 0, after: 240 },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: BG },
      border: { left: { style: BorderStyle.SINGLE, size: 24, color: ACCENT, space: 8 } },
      children: [
        new TextRun({ text: "Depends on: ", bold: true, color: BRAND, size: 18 }),
        new TextRun({ text: deps.length ? deps.join(", ") : "Nothing — start here", color: BRAND, size: 18 }),
      ],
    }),
  ];
}

/* ── Render one section's body lines ── */
function renderSectionBody(heading: string, body: string[], stepRef: string): Paragraph[] {
  const out: Paragraph[] = [];
  let buffer: string[] = [];

  const flushParagraph = () => {
    if (buffer.length) {
      out.push(bodyParagraph(buffer.join(" ")));
      buffer = [];
    }
  };

  const isStepsSection = /^Steps$/i.test(heading);

  for (const raw of body) {
    const line = raw.trim();
    if (!line) { flushParagraph(); continue; }

    // Numbered step like "1. **Title** — body"
    const numMatch = isStepsSection && line.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      flushParagraph();
      out.push(numberedParagraph(numMatch[2], stepRef));
      continue;
    }
    // Continuation of a numbered step (indented 3+ spaces)
    if (isStepsSection && raw.match(/^   \S/) && out.length) {
      const last = out[out.length - 1];
      // Append as a soft continuation line
      out.push(new Paragraph({
        indent: { left: 720 },
        spacing: { after: 80 },
        children: inlineRuns(line, { color: MUTED }),
      }));
      continue;
    }
    // Bullet
    const bulletMatch = line.match(/^-\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      out.push(bulletParagraph(bulletMatch[1]));
      continue;
    }
    // Indented bullet continuation (2-space indent)
    if (raw.match(/^  \S/) && out.length) {
      const last = out[out.length - 1];
      // Append as continuation under the previous bullet
      out.push(new Paragraph({
        indent: { left: 720 },
        spacing: { after: 60 },
        children: inlineRuns(line, { color: MUTED }),
      }));
      continue;
    }
    buffer.push(line);
  }
  flushParagraph();
  return out;
}

/* ── Build phase block ── */
function renderPhase(phase: { phase: string; file: string; deps: string[] }): Paragraph[] {
  const md = readFileSync(join(".local/tasks", phase.file), "utf8");
  const plan = parsePlan(md);
  const stepRef = `steps-${phase.phase.toLowerCase().replace(/\s+/g, "-")}`;

  const out: Paragraph[] = [];
  out.push(...phaseHeading(phase.phase, plan.title, phase.deps));

  for (const sec of plan.sections) {
    out.push(sectionHeading(sec.heading));
    out.push(...renderSectionBody(sec.heading, sec.body, stepRef));
  }
  return out;
}

/* ── Cover + ToC + appendix ── */
function buildCover(plans: Array<{ phase: string; title: string }>): Paragraph[] {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return [
    new Paragraph({ spacing: { before: 2400, after: 0 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "BRAIN FINANCE", bold: true, color: ACCENT, size: 26, characterSpacing: 80 })] }),
    new Paragraph({ spacing: { before: 240, after: 0 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Migration Plans", bold: true, color: BRAND, size: 64, font: "Calibri" })] }),
    new Paragraph({ spacing: { before: 120, after: 0 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Replit Web App → brain-core Protocol", color: BRAND, size: 32, italics: true })] }),
    new Paragraph({ spacing: { before: 600, after: 240 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: today, color: MUTED, size: 22 })] }),
    new Paragraph({ spacing: { before: 1200, after: 120 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "FOR DEVELOPER REVIEW", bold: true, color: ACCENT, size: 18, characterSpacing: 60 })] }),
    new Paragraph({ spacing: { before: 0, after: 0 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Tactical companion to Brain-Migration-Handoff.docx", color: MUTED, size: 18, italics: true })] }),
  ];
}

function buildToc(plans: Array<{ phase: string; title: string }>): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(new Paragraph({
    pageBreakBefore: true,
    spacing: { after: 240 },
    children: [new TextRun({ text: "Table of Contents", bold: true, color: BRAND, size: 40, font: "Calibri" })],
  }));
  out.push(new Paragraph({ spacing: { after: 240 }, children: [new TextRun({
    text: "Eight phases, executed in dependency order. Each phase keeps the app deployable at the end.",
    italics: true, color: MUTED, size: 22,
  })] }));

  // Cover & Scope
  out.push(tocRow("Scope & How to Use This Document", ""));
  for (const p of plans) {
    out.push(tocRow(`${p.phase} — ${p.title}`, ""));
  }
  out.push(tocRow("Appendix A — Dependency Map", ""));
  return out;
}

function tocRow(label: string, _page: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    tabStops: [{ type: "right" as any, position: 9000, leader: "dot" as any }],
    children: [
      new TextRun({ text: label, color: BODY, size: 22 }),
    ],
  });
}

function buildScopeSection(): Paragraph[] {
  return [
    new Paragraph({ pageBreakBefore: true, spacing: { after: 240 },
      children: [new TextRun({ text: "Scope & How to Use This Document", bold: true, color: BRAND, size: 36, font: "Calibri" })] }),

    bodyParagraph("This document compiles the eight tactical migration phases for moving the Brain Finance Replit web app onto the brain-core protocol. It is the developer-facing companion to the strategic handoff brief (`Brain-Migration-Handoff.docx`)."),

    sectionHeading("What's in here"),
    bulletParagraph("One section per phase, in dependency order."),
    bulletParagraph("Each section includes: What & Why, Done looks like (acceptance criteria), Out of scope, Steps (numbered), and Relevant files."),
    bulletParagraph("A dependency map at the end shows which phases can run in parallel."),

    sectionHeading("What's not in here"),
    bulletParagraph("Architecture overview — see the strategic handoff brief."),
    bulletParagraph("API endpoint reference — see Appendix A of the handoff brief and the brain-core OpenAPI spec."),
    bulletParagraph("Code-level implementation guidance — kept intentionally light so the developer can choose patterns."),

    sectionHeading("Reading order"),
    bodyParagraph("Read Phase 1 first. Phases 2 through 8 reference one another via the Depends on banner at the top of each section. Phases 4 and 5 can be worked on in parallel once Phase 2 is merged; everything else is serial."),

    sectionHeading("What stays vs what goes"),
    bulletParagraph("KEPT: Crossmint embedded wallet (signer / owner of BrainSmartAccount), Wirex BaaS adapter (provisioning + webhook publisher to /v1/raw/ingest), the entire React + Vite frontend, wagmi + viem + RainbowKit + SIWE."),
    bulletParagraph("REMOVED: server/policyEngine.ts, server/contractService.ts, server/insightsService.ts, the four bespoke .sol contracts in contracts/, and the Hardhat workspace."),
    bulletParagraph("RESHAPED: server/wirex.ts becomes a thin provisioning + webhook adapter; server/routes.ts becomes a thin BFF/proxy."),
  ];
}

function buildAppendix(plans: typeof PHASES): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(new Paragraph({ pageBreakBefore: true, spacing: { after: 240 },
    children: [new TextRun({ text: "Appendix A — Dependency Map", bold: true, color: BRAND, size: 36, font: "Calibri" })] }));

  out.push(bodyParagraph("Read top-to-bottom for execution order. Items at the same indent level can be worked on in parallel."));

  // ASCII-style dependency tree
  const treeLines = [
    "Phase 1 — Brain-core Foundation Setup",
    "  └─ Phase 2 — Auth & BFF Migration",
    "       ├─ Phase 3 — Raw & Ledger Migration",
    "       │     └─ Phase 4 — Wiki Layer Migration",
    "       └─ Phase 5 — Policy Layer Migration",
    "             └─ Phase 6 — Agent Layer Migration",
    "                   └─ Phase 7 — Audit Layer Integration",
    "",
    "Phase 8 — Final Cleanup & Documentation",
    "  Depends on: Phase 4 (Wiki) and Phase 7 (Audit)",
  ];
  for (const ln of treeLines) {
    out.push(new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: ln || " ", font: MONO, size: 20, color: BRAND })],
    }));
  }

  out.push(sectionHeading("Parallelizable work"));
  out.push(bulletParagraph("Phase 3 (Raw & Ledger) and Phase 5 (Policy) can be developed in parallel after Phase 2 merges."));
  out.push(bulletParagraph("Phase 4 (Wiki) and Phase 6 (Agent) can be developed in parallel once Phases 3 and 5 are merged respectively."));
  out.push(bulletParagraph("Phase 8 must be last — it deletes code that earlier phases temporarily depended on."));

  out.push(sectionHeading("Open questions to confirm before starting"));
  out.push(bulletParagraph("Ledger entity kinds: brain-core's public schema lists 6 (account, counterparty, transaction, obligation, policy, agent). The strategic brief references 11. Confirm with the brain-core team before Phase 3."));
  out.push(bulletParagraph("Source-type enum: brain-core does not yet have `wirex` or `crossmint` source-type values. Phase 3 tags artifacts as `api_partner` with provider metadata until the enum lands."));
  out.push(bulletParagraph("BrainSmartAccount session-key derivation: confirm whether the Crossmint EOA registers as owner directly, or whether brain-core mints a session key signed by the EOA. Phase 6 assumes the latter."));

  return out;
}

/* ── Build doc ── */
const numberingConfig = PHASES.map(p => ({
  reference: `steps-${p.phase.toLowerCase().replace(/\s+/g, "-")}`,
  levels: [{
    level: 0,
    format: "decimal" as const,
    text: "%1.",
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720, hanging: 360 } } },
  }],
}));

const planSummaries = PHASES.map(p => {
  const md = readFileSync(join(".local/tasks", p.file), "utf8");
  return { phase: p.phase, title: parsePlan(md).title };
});

const children: any[] = [];
children.push(...buildCover(planSummaries));
children.push(...buildToc(planSummaries));
children.push(...buildScopeSection());
for (const phase of PHASES) {
  children.push(...renderPhase(phase));
}
children.push(...buildAppendix(PHASES));

const doc = new Document({
  creator: "Brain Finance",
  title: "Brain Finance — Migration Plans (Replit → brain-core)",
  description: "Tactical, per-phase migration plans for developer review",
  styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
  numbering: { config: numberingConfig },
  sections: [{
    properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
    headers: {},
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Brain Finance · Migration Plans · ", color: MUTED, size: 18 }),
            new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 18 }),
            new TextRun({ text: " / ", color: MUTED, size: 18 }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], color: MUTED, size: 18 }),
          ],
        })],
      }),
    },
    children,
  }],
});

mkdirSync("deliverables", { recursive: true });
const outPath = join("deliverables", "Brain-Migration-Plans.docx");
Packer.toBuffer(doc).then(buf => {
  writeFileSync(outPath, buf);
  console.log(`Wrote ${outPath} (${buf.length} bytes)`);
});
