import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
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
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const BRAND = "2E1065";
const ACCENT = "7C3AED";
const MUTED = "6B7280";
const BG = "F5F3FF";

const h = (text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel], color = BRAND) =>
  new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, color })],
  });

const p = (text: string, opts: { bold?: boolean; italics?: boolean; color?: string } = {}) =>
  new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, ...opts })],
  });

const bullet = (text: string, level = 0) =>
  new Paragraph({
    bullet: { level },
    spacing: { after: 60 },
    children: [new TextRun({ text })],
  });

const numbered = (text: string, level = 0) =>
  new Paragraph({
    numbering: { reference: "phase-steps", level },
    spacing: { after: 60 },
    children: [new TextRun({ text })],
  });

const code = (text: string) =>
  new Paragraph({
    spacing: { after: 80 },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: "F3F4F6" },
    children: [new TextRun({ text, font: "Courier New", size: 18 })],
  });

const callout = (text: string) =>
  new Paragraph({
    spacing: { before: 120, after: 120 },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: BG },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: ACCENT, space: 8 } },
    children: [new TextRun({ text, italics: true, color: BRAND })],
  });

const cell = (text: string, opts: { bold?: boolean; bg?: string; width?: number } = {}) =>
  new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.bg ? { type: ShadingType.CLEAR, color: "auto", fill: opts.bg } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: opts.bold,
            color: opts.bold ? "FFFFFF" : "111827",
            size: 18,
          }),
        ],
      }),
    ],
  });

const table = (headers: string[], rows: string[][], widths?: number[]) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((t, i) =>
          cell(t, { bold: true, bg: BRAND, width: widths?.[i] }),
        ),
      }),
      ...rows.map(
        (r, ri) =>
          new TableRow({
            children: r.map((t, ci) =>
              cell(t, { bg: ri % 2 === 0 ? "FFFFFF" : "F9FAFB", width: widths?.[ci] }),
            ),
          }),
      ),
    ],
  });

const spacer = () => new Paragraph({ spacing: { after: 200 }, children: [] });

const doc = new Document({
  creator: "Brain Finance",
  title: "Brain Finance — Migration Handoff: Replit Web App → brain-core Protocol",
  description: "Developer handoff for migrating the Replit backend onto brain-core",
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22 } },
    },
  },
  numbering: {
    config: [
      {
        reference: "phase-steps",
        levels: [
          {
            level: 0,
            format: "decimal",
            text: "%1.",
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 360, hanging: 240 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {},
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: "Brain Finance — Confidential  |  Page ", color: MUTED, size: 18 }),
                new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 18 }),
                new TextRun({ text: " / ", color: MUTED, size: 18 }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], color: MUTED, size: 18 }),
              ],
            }),
          ],
        }),
      },
      children: [
        // ───── Cover ─────
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 2400, after: 200 },
          children: [new TextRun({ text: "Brain Finance", bold: true, color: BRAND, size: 56 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 800 },
          children: [
            new TextRun({
              text: "Migration Handoff: Replit Web App → brain-core Protocol",
              color: ACCENT,
              size: 32,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: "Prepared for the engineering team", color: MUTED, size: 22 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: `Document version 1.0 — April 2026`, color: MUTED, size: 22 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "Source repos: BrainMVB (this Replit) · brain-core (github.com/braindotfi/brain-core)",
              color: MUTED,
              size: 20,
            }),
          ],
        }),
        new Paragraph({ pageBreakBefore: true, children: [] }),

        // ───── 1. Executive Summary ─────
        h("1. Executive Summary", HeadingLevel.HEADING_1),
        p(
          "This document is the engineering handoff for migrating the BrainMVB Replit project off its bespoke backend and onto the brain-core protocol. The Replit project becomes the web client, a thin Backend-for-Frontend (BFF), and the home of our two provisioning adapters (Crossmint for embedded wallets, Wirex for bank/card/stablecoin). brain-core becomes the system of record: the six-layer protocol that normalizes, governs, and audits everything those adapters create.",
        ),
        p(
          "After migration, every account the user sees, every recommendation, every approval request, and every executed payment is sourced from brain-core. Crossmint and Wirex remain in place — they create the actual financial instruments — but they no longer own state inside this repo. They publish into brain-core's Raw layer, and brain-core derives the canonical Ledger from there.",
        ),
        callout(
          "Net result: real cards, real bank accounts, real stablecoin balances (Crossmint + Wirex) plus tamper-evident provenance, deterministic policy, and on-chain Merkle-anchored audit (brain-core). No regression in functionality; substantial gain in trust posture.",
        ),

        // ───── 2. Six-layer architecture ─────
        h("2. The Six-Layer brain-core Architecture", HeadingLevel.HEADING_1),
        p(
          "brain-core organizes the system into six layers. Each layer has a clear contract, owns its own database schema, and exposes a typed HTTP API. Cross-layer reads always go through the owning service.",
        ),
        spacer(),
        table(
          ["#", "Layer", "Purpose", "What lives here"],
          [
            ["1", "Raw", "Immutable source evidence. Append-only.", "Plaid, NetSuite, Gmail, EVM chains, manual uploads, Crossmint events, Wirex events. Every byte ingested is hashed and kept verbatim."],
            ["2", "Ledger", "Machine-readable financial truth. 11 normalized entities.", "account, counterparty, transaction, obligation, policy, agent (the six in brain-core today) plus 5 more on the internal roadmap (open question — see §7)."],
            ["3", "Wiki", "Human-readable derived pages + grounded Q&A.", "Derived narratives, semantic search, /v1/wiki/question with provenance + confidence on every answer."],
            ["4", "Policy", "Deterministic permission + approval logic.", "Versioned rule DSL, EIP-712 signed policies, evaluate / simulate endpoints, on-chain hash in BrainPolicyRegistry."],
            ["5", "Agent", "Proposal + action orchestration. (Formerly \"Execution\".)", "Three MVP agents (reconciliation, payment, anomaly), MCP server for external agents, ERC-4337 BrainSmartAccount with session keys, BrainMCPAgentRegistry on-chain attestations."],
            ["6", "Audit", "Tamper-evident proof of what happened and why.", "Append-only Merkle-chained log, hourly anchor on Base L2 via BrainAuditAnchor, public verification endpoint."],
          ],
          [4, 14, 28, 54],
        ),

        // ───── 3. Provisioning vs system of record ─────
        h("3. Provisioning vs. System of Record", HeadingLevel.HEADING_1),
        p(
          "This is the most important conceptual point in the document, because it explains what stays and what goes.",
        ),
        p(
          "Crossmint and Wirex solve a different problem from brain-core. They are provisioning adapters: they actually create the user's accounts. Crossmint mints the embedded EOA. Wirex opens the FDIC bank account, issues the debit card, and holds the stablecoin balance. brain-core does not (and will not) do any of those things.",
        ),
        p(
          "brain-core is the system of record + governance layer. It ingests events from anywhere — including Crossmint and Wirex — normalizes them into the Ledger, derives the Wiki, governs them through Policy, lets Agents act on them, and audits everything in a Merkle-anchored log.",
        ),
        h("Signup flow after migration", HeadingLevel.HEADING_2, ACCENT),
        numbered("User clicks \"Continue with Demo - Fresh User\". Crossmint provisions the embedded EOA (unchanged from today)."),
        numbered("BFF calls Wirex BaaS to open the bank account, issue the debit card, and create the stablecoin wallet (unchanged from today)."),
        numbered("For each newly-provisioned account, the BFF posts one Raw artifact to POST /v1/raw/ingest with the Wirex/Crossmint payload attached and an idempotency key derived from the provider event id."),
        numbered("brain-core derives three Ledger account entities: kind: onchain (Crossmint stablecoin), kind: bank_checking (Wirex bank), kind: card (Wirex debit card). One Audit event per derivation."),
        numbered("From this point on, every Wirex webhook (or polled event if webhooks aren't enabled on the account) and every Crossmint on-chain event gets POSTed to /v1/raw/ingest the same way and lands as Ledger transaction entities."),
        numbered("The Crossmint EOA is registered as the owner / a session-key holder of the user's BrainSmartAccount, so it can sign user-ops the Agent layer proposes."),
        spacer(),
        callout(
          "Wirex does not need to know brain-core exists. /v1/raw/ingest is a generic ingestion endpoint — anyone with the right JWT can call it. Our BFF is the \"Wirex adapter.\" Same for Crossmint.",
        ),

        // ───── 4. File-by-file mapping ─────
        h("4. File-by-File Mapping", HeadingLevel.HEADING_1),
        p("How each file in BrainMVB maps onto brain-core. \"Reshape\" means the file stays but its job shrinks dramatically."),
        spacer(),
        table(
          ["BrainMVB file", "Action", "Replaced by / new role"],
          [
            ["server/wirex.ts", "Reshape", "Provisioning adapter. Calls Wirex for account creation, listens to webhooks (or polls), publishes every event to POST /v1/raw/ingest with source_type=api_partner, provider=wirex."],
            ["client/src/lib/crossmint*", "Reshape", "Provisioning adapter + signer. Creates the embedded EOA at signup; the EOA becomes owner / session-key holder of BrainSmartAccount."],
            ["server/policyEngine.ts", "Delete", "Replaced by /v1/policy/{tenant}/evaluate, /sign, /compose, /simulate. EIP-712 signing handled in the Policy service, on-chain hash in BrainPolicyRegistry.sol."],
            ["server/contractService.ts", "Delete", "Replaced by /v1/execution/* + BrainSmartAccount.sol. This repo no longer talks to Base directly."],
            ["server/insightsService.ts", "Delete", "Replaced by POST /v1/wiki/question. The daily Anthropic cron and the hard-coded mock context go with it."],
            ["server/storage.ts (most)", "Reduce", "Strip down to whatever the BFF still owns (session/CSRF). Drop CRUD for agents, marketplaceListings, agentMemory, agentTransactions, notifications."],
            ["shared/schema.ts (most)", "Reduce", "Same: collapse business tables; rely on brain-core schemas. Keep types only for what the BFF still serializes locally."],
            ["server/routes.ts", "Reshape", "Slim to a thin BFF. Owns auth/SIWE, the demo onboarding orchestration, the Wirex adapter endpoints, and a /api/brain/* passthrough that forwards to brain-core with the user's JWT."],
            ["server/index.ts, server/vite.ts, server/static.ts", "Keep", "Express + Vite host. Unchanged."],
            ["server/db.ts", "Keep / drop", "Keep only if a small local table is still needed for session/CSRF state. Otherwise delete."],
            ["client/**", "Keep", "Entire web app stays. Pages get rewired to call brain-core via the typed client."],
            ["attached_assets/, client/public/figmaAssets/, client/public/fonts/", "Keep", "All design assets unchanged."],
            ["tailwind.config.ts, vite.config.ts, components.json", "Keep", "Build config unchanged."],
            ["contracts/contracts/BrainAccount.sol", "Delete", "Superseded by brain-core/contracts/BrainSmartAccount.sol (single ERC-4337 with session keys + policy guard)."],
            ["contracts/contracts/BrainAccountFactory.sol", "Delete", "Not needed; BrainSmartAccount uses standard 4337 deployment."],
            ["contracts/contracts/AgentRegistry.sol", "Delete", "Superseded by brain-core/contracts/BrainMCPAgentRegistry.sol."],
            ["contracts/contracts/PolicyValidator.sol", "Delete", "Superseded by brain-core/contracts/BrainPolicyRegistry.sol."],
            ["contracts/abis/, scripts/, test/, hardhat.config.ts", "Delete", "Foundry replaces Hardhat. brain-core owns contract tests."],
            ["replit.md", "Update", "Reflect new architecture: web client + BFF + provisioning adapters here, protocol in brain-core."],
          ],
          [22, 10, 68],
        ),

        // ───── 5. Recommendations ─────
        h("5. Recommendations", HeadingLevel.HEADING_1),
        h("5.1 Delete outright", HeadingLevel.HEADING_2, ACCENT),
        bullet("server/policyEngine.ts — bespoke JSON rules + ECDSA signing"),
        bullet("server/contractService.ts — viem direct calls + custom factory wiring"),
        bullet("server/insightsService.ts — Claude cron over a mock context"),
        bullet("Entire contracts/ directory: 4 .sol files, ABIs, Hardhat config, deploy script, tests"),
        bullet("Business tables in shared/schema.ts: agents, marketplaceListings, agentMemory, agentTransactions, notifications"),
        bullet("Corresponding IStorage methods in server/storage.ts"),
        bullet("Anthropic SDK and Hardhat-related packages from package.json"),

        h("5.2 Reshape (do not delete)", HeadingLevel.HEADING_2, ACCENT),
        bullet("server/wirex.ts — becomes a Wirex provisioning + webhook adapter that publishes to /v1/raw/ingest"),
        bullet("Crossmint client — keeps provisioning the embedded EOA at signup; the EOA is registered as owner / session-key holder of BrainSmartAccount"),
        bullet("server/routes.ts — slim to BFF: auth, demo onboarding orchestration, Wirex adapter endpoints, and /api/brain/* passthrough"),
        bullet("client/src/lib/queryClient.ts — wrap the generated brain-core typed client; inject JWT, request id, idempotency key"),

        h("5.3 Keep entirely", HeadingLevel.HEADING_2, ACCENT),
        bullet("Everything under client/ — the entire UI, pages, hooks, components"),
        bullet("All assets: attached_assets/, client/public/figmaAssets/, client/public/fonts/"),
        bullet("Build + framework config: tailwind, vite, components.json, tsconfig"),
        bullet("Express + Vite host: server/index.ts, server/vite.ts, server/static.ts"),
        bullet("viem, wagmi, RainbowKit, siwe — still needed for Crossmint signing flows and BaseScan deep links"),

        h("5.4 Pure gain (new capability brain-core gives us)", HeadingLevel.HEADING_2, ACCENT),
        bullet("Tamper-evident audit log with hourly Merkle anchoring on Base L2 (BrainAuditAnchor)"),
        bullet("Bitemporal Wiki — provenance + confidence on every fact, evidence path on every answer"),
        bullet("ERC-4337 session keys with policy fingerprint matching → no more bespoke factory + validator"),
        bullet("MCP server for third-party agents to plug into Brain"),
        bullet("Plaid + NetSuite + Gmail + EVM ingestion adapters out of the box"),
        bullet("Tenant isolation via Postgres row-level security, idempotency middleware, JWT revocation, request tracing"),

        // ───── 6. Phased migration plan ─────
        h("6. Phased Migration Plan", HeadingLevel.HEADING_1),
        p(
          "Eight phases, each independently shippable. The app stays running throughout: a page is only switched to a brain-core-backed data source once the corresponding endpoint has been verified end-to-end. Phase numbers correspond to the project tasks in BrainMVB (Tasks #2 through #9).",
        ),

        // Phase 1
        h("Phase 1 — Brain-core Foundation Setup (Task #2)", HeadingLevel.HEADING_2, ACCENT),
        p("Goal: brain-core runs locally; contracts are on Base Sepolia; this Replit project has a typed client and a dev tenant."),
        p("Acceptance criteria:", { bold: true }),
        bullet("./scripts/dev-up.sh in brain-core boots Postgres+pgvector, Redis, LocalStack, all six TS services + Python agents service, all healthy"),
        bullet("Four contracts (BrainAuditAnchor, BrainPolicyRegistry, BrainSmartAccount, BrainMCPAgentRegistry) deployed to Base Sepolia; addresses recorded in client/src/config/brain.ts"),
        bullet("client/src/lib/brainApi.ts generated from Brain_API_Specification.yaml"),
        bullet("BRAIN_API_BASE_URL, BRAIN_DEV_TENANT_ID, BRAIN_DEV_JWT stored as Replit secrets"),
        bullet("Smoke test in script/ hits /v1/wiki/schema with the dev JWT and asserts the six MVP entity kinds come back"),

        // Phase 2
        h("Phase 2 — Auth & BFF Migration (Task #3)", HeadingLevel.HEADING_2, ACCENT),
        p("Goal: switch authentication to brain-core's JWT model and slim the Replit Express server to a thin BFF."),
        p("Acceptance criteria:", { bold: true }),
        bullet("Both demo buttons authenticate against brain-core: \"Existing User\" maps to seeded dev tenant, \"Fresh User\" to a freshly-created tenant"),
        bullet("useAuth exposes { user, tenantId, scopes, jwt } and refreshes tokens automatically (15-min access, rotating refresh)"),
        bullet("All client API calls flow through client/src/lib/brainApi.ts"),
        bullet("server/routes.ts retains only: /api/config, SIWE/Crossmint nonce exchange, demo onboarding, Wirex adapter endpoints, /api/brain/* proxy"),
        bullet("Existing pages still render with current data (proxy passes through to brain-core for migrated pages, otherwise to remaining Replit endpoints)"),

        // Phase 3
        h("Phase 3 — Raw & Ledger Migration (Task #4)", HeadingLevel.HEADING_2, ACCENT),
        p("Goal: provisioning stack publishes into brain-core's Raw layer; Ledger becomes the source of account + transaction data."),
        p("Acceptance criteria:", { bold: true }),
        bullet("\"Fresh User\" demo provisions Crossmint EOA + Wirex bank/card/stablecoin (unchanged); BFF posts one Raw artifact per new account"),
        bullet("HomePage Accounts widget shows three Ledger account entities derived from those artifacts (kind: onchain, bank_checking, card)"),
        bullet("Wirex transaction webhooks (or polling fallback) POST every event to /v1/raw/ingest with idempotency key from Wirex event id"),
        bullet("Crossmint on-chain events posted the same way"),
        bullet("server/wirex.ts kept and reshaped: only provisioning + webhook + forwarder responsibilities"),
        bullet("Plaid Link for external banks goes through /v1/raw/ingest with source_type: \"plaid\""),
        bullet("Source-type tagging documented: until brain-core adds wirex and crossmint enum values, tag artifacts as api_partner with provider in payload metadata; follow-up filed with brain-core team"),

        // Phase 4
        h("Phase 4 — Wiki Layer Migration (Task #5)", HeadingLevel.HEADING_2, ACCENT),
        p("Goal: home-page recommendations + actions + ad-hoc Q&A sourced from Wiki."),
        p("Acceptance criteria:", { bold: true }),
        bullet("HomePage Recommendations widget renders entries returned by Wiki search/derivation"),
        bullet("HomePage Actions widget renders pending obligations and Ledger-derived prompts via Wiki"),
        bullet("\"Ask Brain\" affordance posts to /v1/wiki/question and renders the answer plus an evidence path back to Raw artifacts"),
        bullet("server/insightsService.ts deleted; daily setInterval cron gone; no Anthropic SDK use in this repo"),
        bullet("Account/transaction detail panels read from /v1/wiki/entity/{id} and display provenance + confidence"),

        // Phase 5
        h("Phase 5 — Policy Layer Migration (Task #6)", HeadingLevel.HEADING_2, ACCENT),
        p("Goal: Rules + Review pages backed by the Policy service."),
        p("Acceptance criteria:", { bold: true }),
        bullet("Rules page lists active policy + version history via /v1/policy/{tenant}/versions"),
        bullet("Editing a rule produces a compose payload, the user signs (EIP-712), the policy is registered via /sign"),
        bullet("Review page lists items returned by /v1/policy/.../evaluate (or /v1/execution/* once Phase 6 is in)"),
        bullet("\"What would have happened on date X\" affordance hits /v1/policy/.../simulate"),
        bullet("server/policyEngine.ts deleted; POLICY_SIGNER_PRIVATE_KEY no longer in this repo"),

        // Phase 6
        h("Phase 6 — Agent Layer Migration (Task #7)", HeadingLevel.HEADING_2, ACCENT),
        p("Goal: marketplace + agent flows backed by /v1/execution/*; bespoke contracts retired; Crossmint stays as signer."),
        p("Acceptance criteria:", { bold: true }),
        bullet("Marketplace page reads from /v1/execution/agents; new agents register via /v1/execution/agents/register and produce a BrainMCPAgentRegistry attestation"),
        bullet("Agent detail page shows scope, on-chain registration record, MCP endpoint URL, recent proposals"),
        bullet("Outbound payments: /v1/execution/propose → policy evaluate → /v1/execution/execute via BrainSmartAccount session-key path"),
        bullet("Crossmint EOA registered as owner / session-key holder of the user's BrainSmartAccount"),
        bullet("server/contractService.ts deleted; viem direct calls + deployer key + CONTRACT_MODE=demo gone"),
        bullet("Our four .sol files deleted; brain-core's three on-chain contracts are the source of truth"),
        bullet("MCP endpoint URL surfaced on the agent detail page"),

        // Phase 7
        h("Phase 7 — Audit Layer Integration (Task #8)", HeadingLevel.HEADING_2, ACCENT),
        p("Goal: net-new Audit page surfacing the brain-core audit log + on-chain anchors."),
        p("Acceptance criteria:", { bold: true }),
        bullet("New Audit page in side nav, lists events from /v1/audit/events with filter controls"),
        bullet("Detail view per event shows canonical hash, prev-hash chain, on-chain anchor"),
        bullet("Header strip shows latest anchor (Merkle root + Base L2 block + tx) with BaseScan deep link"),
        bullet("\"Verify inclusion\" affordance calls /v1/audit/verify (or executes inclusion proof client-side via BrainAuditAnchor.verifyInclusion) and shows pass/fail"),
        bullet("Export button triggers /v1/audit/export, polls until JSONL download URL is ready"),

        // Phase 8
        h("Phase 8 — Final Cleanup & Documentation (Task #9)", HeadingLevel.HEADING_2, ACCENT),
        p("Goal: dead code removed; replit.md tells the new story."),
        p("Acceptance criteria:", { bold: true }),
        bullet("contracts/ directory deleted entirely"),
        bullet("server/policyEngine.ts, server/contractService.ts, server/insightsService.ts deleted"),
        bullet("server/wirex.ts kept (now slim adapter); Crossmint client kept (still provisioning + signing)"),
        bullet("shared/schema.ts trimmed; agents/marketplaceListings/agentMemory/agentTransactions/notifications removed"),
        bullet("server/storage.ts trimmed accordingly"),
        bullet("package.json: hardhat, @nomicfoundation/*, @anthropic-ai/sdk removed; viem/wagmi/RainbowKit/siwe/Crossmint kept"),
        bullet("replit.md rewritten to document web-client + BFF + provisioning-adapters architecture and link to brain-core docs"),
        bullet("npm run dev boots cleanly; full smoke pass through both demo buttons works"),

        // ───── 7. Open questions ─────
        h("7. Open Questions for the brain-core Team", HeadingLevel.HEADING_1),
        bullet("Ledger entity count: brain-core's schemas/index.ts currently registers 6 entity kinds (account, counterparty, transaction, obligation, policy, agent). The internal architecture refers to 11. What are the additional 5, and which milestone delivers them? Phase 3 (Raw & Ledger) needs the schemas before any UI surfaces a kind that isn't account/transaction/counterparty/obligation/policy/agent."),
        bullet("Source-type enum: please add wirex and crossmint as recognized source_type values on POST /v1/raw/ingest so audit reports group cleanly. Until then we tag as api_partner with provider in payload metadata."),
        bullet("Wirex adapter ownership: are you planning a first-party Wirex adapter inside services/raw/, or is the BFF the long-term home for that adapter?"),
        bullet("Crossmint as BrainSmartAccount owner: confirm the recommended pattern — owner = Crossmint EOA, with scoped session keys for routine actions — vs. session-key only with another root owner."),
        bullet("Webhook security: what HMAC signature scheme does /v1/raw/webhooks/{provider} expect for non-listed providers (Wirex)? We will need the shared-secret rotation story."),

        // ───── Appendix A ─────
        h("Appendix A — brain-core Endpoint Surface", HeadingLevel.HEADING_1),
        p("Source: Brain_API_Specification.yaml on the main branch of brain-core. Thirty endpoints across the five HTTP-exposed layers (the Ledger is read through Wiki)."),
        spacer(),
        table(
          ["Layer", "Endpoint"],
          [
            ["Raw", "POST /raw/ingest"],
            ["Raw", "POST /raw/webhooks/{provider}"],
            ["Raw", "DELETE /raw/{raw_id}"],
            ["Raw", "GET /raw/{raw_id}/parsed"],
            ["Wiki", "GET /wiki/entity/{entity_id}"],
            ["Wiki", "GET /wiki/entity/{entity_id}/evidence"],
            ["Wiki", "GET /wiki/entity/{entity_id}/history"],
            ["Wiki", "GET /wiki/search"],
            ["Wiki", "POST /wiki/question"],
            ["Wiki", "POST /wiki/annotate"],
            ["Wiki", "GET /wiki/schema"],
            ["Policy", "GET /policy/{tenant_id}"],
            ["Policy", "GET /policy/{tenant_id}/versions"],
            ["Policy", "POST /policy/{tenant_id}/compose"],
            ["Policy", "POST /policy/{tenant_id}/sign"],
            ["Policy", "POST /policy/{tenant_id}/evaluate"],
            ["Policy", "POST /policy/{tenant_id}/simulate"],
            ["Agent", "POST /execution/propose"],
            ["Agent", "POST /execution/execute"],
            ["Agent", "GET /execution/{execution_id}"],
            ["Agent", "POST /execution/approve"],
            ["Agent", "POST /execution/escalate"],
            ["Agent", "GET /execution/agents"],
            ["Agent", "POST /execution/agents/register"],
            ["Agent", "GET /execution/agents/{agent_id}"],
            ["Audit", "GET /audit/events"],
            ["Audit", "GET /audit/event/{event_id}"],
            ["Audit", "POST /audit/export"],
            ["Audit", "GET /audit/anchor/latest"],
            ["Audit", "POST /audit/verify"],
          ],
          [12, 88],
        ),

        // ───── Appendix B ─────
        h("Appendix B — Quick-Reference Cheat Sheet", HeadingLevel.HEADING_1),
        h("brain-core contracts on Base", HeadingLevel.HEADING_2, ACCENT),
        bullet("BrainAuditAnchor — Merkle root anchoring (no equivalent in BrainMVB today)"),
        bullet("BrainPolicyRegistry — on-chain policy hash + signers (replaces our PolicyValidator.sol)"),
        bullet("BrainSmartAccount — ERC-4337 with revocable session keys (replaces our BrainAccount + BrainAccountFactory)"),
        bullet("BrainMCPAgentRegistry — on-chain attestation of which agents can read / contribute / propose (replaces our AgentRegistry.sol)"),
        h("brain-core engineering invariants", HeadingLevel.HEADING_2, ACCENT),
        bullet("Provenance on everything — every Wiki row carries provenance + confidence + evidence pointer. No exceptions."),
        bullet("Tenant isolation at the storage layer — Postgres row-level security on every table, per-tenant Azure Blob path prefix"),
        bullet("Idempotency by default on writes — every write endpoint accepts an idempotency key or derives one from content"),
        bullet("Audit everything — every API call, policy evaluation, agent action, and state transition produces an audit event"),
        h("JWT shape (for the BFF)", HeadingLevel.HEADING_2, ACCENT),
        code("{"),
        code("  \"iss\": \"https://auth.brain.fi\","),
        code("  \"sub\": \"user_01HQ7K3...\","),
        code("  \"tenant_id\": \"tnt_01HQ7K3...\","),
        code("  \"principal_type\": \"user\" | \"agent\" | \"api_partner\","),
        code("  \"scopes\": [\"raw:write\", \"wiki:read\", \"policy:sign\", ...],"),
        code("  \"exp\": 1745000000,"),
        code("  \"jti\": \"token_01HQ7K3...\""),
        code("}"),
        p("15-minute access tokens, rotating refresh tokens, revoked jti cached in Redis."),
      ],
    },
  ],
});

(async () => {
  const buffer = await Packer.toBuffer(doc);
  mkdirSync("deliverables", { recursive: true });
  const out = join("deliverables", "Brain-Migration-Handoff.docx");
  writeFileSync(out, buffer);
  console.log("wrote", out, buffer.length, "bytes");
})();
