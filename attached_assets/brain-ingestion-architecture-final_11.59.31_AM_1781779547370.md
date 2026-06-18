# Brain Data Ingestion Architecture

## Recommendation, Final

This is the consolidated recommendation after reviewing two external proposals against the actual `brain-core` repository. It adopts the stronger external design where that design beat my earlier draft, keeps the two elements my draft contributed, applies three amendments, and grounds the whole thing in the existing code as a migration rather than a rewrite.

Repository: `github.com/braindotfi/brain-core`. Scope: US-incorporated, US firm customers.

---

## 1. Recommendation in one paragraph

Build Brain as a governed, source-agnostic ingestion platform where Plaid is one connector, not the center. Reads land as immutable evidence, normalize into rich versioned domain records, resolve and reconcile across sources, and then project down to the compact Ledger and Wiki surfaces Brain reasons over. Writes are separate, gated, and receipted. Each observation carries its provenance and the action gate refuses to act on low-trust data; the MVP uses the existing provenance enum for this, with a multidimensional evidence model as a deferred target. This is the target architecture. Most of its first two phases are refactors of components that already exist in `brain-core` (the §6 gate, the CI invariant, the `providerAuthenticatedOnly` trust boundary, the Ledger and Wiki layers, the obligation model), not greenfield builds. The single largest net-new piece is an authenticated pull and sync modality with per-resource checkpoints and a credential vault, because the current code ingests only through signed webhooks and generic caller push.

---

## 2. What changed from my earlier draft, and why

I revised four positions after review. Recording them so the reasoning is explicit.

- Evidence is multidimensional, not a single ordered enum. My earlier `ProvenanceTier` conflated how a fact was delivered, how it was extracted, whether the source is authoritative, and whether it was corroborated. These are independent and belong recorded separately. That is the target. For the MVP, however, the existing `Provenance` enum plus the confidence ceiling and the corroboration promotion already give a working, comparable trust tier, so the MVP uses that and grows the multidimensional model one dimension at a time only when a gate policy needs it (sections 14 and 15). Do not rewrite the working trust path for elegance.
- The action gate evaluates evidence requirements, not a minimum provenance tier. Real controls read like "post only if bank and accounting agree, data is under 24 hours old, and value is below threshold," which a single trust score cannot express. That is the target. For the MVP the gate simply reads the provenance enum and refuses to act on low-trust data; the requirement-based policies arrive with the deferred dimensions.
- Sync uses per-resource, per-object-type checkpoints, not one cursor per connection. A single accounting connection carries invoices, bills, accounts, and journals, each with its own cadence. One connection cursor loses or re-pulls data on partial failure.
- Keep rich domain records and project to Ledger and Wiki. Flattening journal lines, tax lots, payroll deductions, and corporate actions into four entities destroys structure that the OaaS outcomes (close-the-books, tax optimization) depend on.

Retained from my draft: the read-source versus write-rail separation, and the linkage between ingestion evidence and the §6 action gate.

---

## 3. Core principles

- Connectors report observations. The platform preserves and interprets them. Brain reconciles evidence, derives conclusions, and acts only through separately gated write rails.
- Organize by ingestion method and capability, not by a list of named vendors. Name connector types by provider, never by category.
- Trust derives from a verified source, not from a string the caller chose. This is already enforced by `providerAuthenticatedOnly`.
- Connectors never write directly to canonical stores, search indexes, vector indexes, or model context.
- Raw evidence is immutable and replayable. Canonical writes must never depend on being able to fetch the source again.
- Intake is dumb and uniform; interpretation is smart and replaceable. The raw layer treats every payload as opaque bytes wrapped in one envelope and never parses at intake, so a source the system has never seen still lands safely. Understanding is a separate, versioned, replayable parser keyed by `source_schema`. This is what makes the layer source-agnostic and is the primary acquisition lever. The concrete mechanism is specified in Appendix B, which Claude Code should read before building the raw layer.

---

## 4. Layered architecture

Five planes.

1. Connection control plane. Connector catalog and versions, connection registry, consent and scopes, credential vault, sync orchestrator, freshness and health. Owns integration state, not financial records.
2. Connector data plane. Isolated connector workers with narrow temporary credential access, a webhook and upload and stream gateway, a durable ingestion log, immutable raw evidence storage, and a quarantine and dead-letter queue.
3. Processing and understanding. Validation, domain normalization, entity resolution, cross-source reconciliation, evidence and authority evaluation.
4. Brain data platform. Rich canonical domain stores, the Ledger and Wiki projections, historical analytics, rebuildable search and vector projections, and the rules, models, and agents.
5. Governed actions. The action policy gate, write rails, and execution receipts. Receipts return through the ingestion log so Brain observes the effects of its own actions.

---

## 5. Read sources versus write rails

Many systems both supply data and accept actions. These responsibilities stay separate.

A read source retrieves authorized data, produces immutable evidence, normalizes observations, and causes no external side effects. It is governed by consent, tenant authorization, purpose limitation, and sensitive-data policy, but not by the action gate.

A write rail posts journal entries, sends payments, creates or updates invoices, files returns, or executes trades. It requires an explicit action policy decision and produces a durable receipt.

A QuickBooks integration therefore contains a `quickbooks` read connector and a separately authorized `erp` write rail. Never one bidirectional component.

---

## 6. Connector descriptor

Describe each independent dimension explicitly rather than overloading one enum. Treat this descriptor as provisional until three diverse connectors validate it (see amendments).

```typescript
interface ConnectorDescriptor {
  connectorType: string;        // provider-named: 'plaid', 'quickbooks', 'gusto_finch'
  version: string;
  category: SourceCategory;     // catalog grouping only

  delivery: Array<"webhook" | "poll" | "cursor" | "snapshot" | "file" | "stream">;
  origin: "provider" | "aggregator" | "customer" | "agent" | "public";
  format: Array<"structured" | "document" | "image" | "chain_event">;
  authentication: Array<"oauth2" | "api_key" | "signature" | "service_account" | "none">;

  capabilities: {
    discovery: boolean; backfill: boolean; incremental: boolean;
    webhooks: boolean; refresh: boolean; updates: boolean; deletes: boolean;
  };

  objectTypes: string[];
  parserVersions: string[];
  expectedFreshness?: string;
}
```

---

## 7. Connector lifecycle

```typescript
interface BrainConnector {
  authorize(input: AuthorizationInput): Promise<AuthorizationResult>;
  discover(connection: Connection): Promise<AvailableResource[]>;
  backfill(request: BackfillRequest): Promise<SyncResult>;
  sync(request: SyncRequest): Promise<SyncResult>;
  refresh?(request: RefreshRequest): Promise<void>;
  handleWebhook?(event: ProviderWebhook): Promise<WebhookResult>;
  revoke(connection: Connection): Promise<void>;
  health(connection: Connection): Promise<ConnectionHealth>;
}
```

Connectors run in isolated workers with narrow, temporary credential access and may write only to the ingestion boundary.

---

## 8. Ingestion methods

Reusable delivery patterns. A single source may combine several (a tax PDF arriving by authorized email is a document, delivered by push, from a customer-authorized mailbox, extracted by a model).

1. Signed provider webhook. Push of data or a change notification.
2. Authenticated incremental pull. Deltas via cursors, tokens, timestamps, or change feeds.
3. Periodic snapshot. Full state retrieved, changes computed safely.
4. File and document ingestion. Upload, email, cloud storage, SFTP, provider export.
5. Customer push. Customer systems submit structured data through a governed API or stream.
6. Public and on-chain ingestion. Registries, market feeds, blockchains.
7. Human-declared input. Users and advisors enter facts, corrections, valuations.
8. Agent-derived input. Brain writes separately identified inferences back into the evidence system.

Webhooks normally schedule a synchronization rather than being treated as the complete authoritative record.

---

## 9. Standard ingestion envelope

Every accepted artifact is wrapped in a versioned envelope that preserves the full source chain and three distinct timestamps.

```json
{
  "event_id": "evt_uuid",
  "tenant_id": "tenant_uuid",
  "subject_id": "subject_uuid",
  "connection_id": "connection_uuid",
  "connector_type": "quickbooks",
  "connector_version": "3.2.0",
  "original_source": "quickbooks",
  "intermediaries": [],
  "source_resource_id": "company_abc",
  "object_type": "invoice",
  "external_id": "invoice_123",
  "operation": "upsert",
  "source_schema": "quickbooks.invoice.v4",
  "effective_at": "2026-05-31T00:00:00Z",
  "observed_at": "2026-06-07T08:00:00Z",
  "ingested_at": "2026-06-07T08:00:02Z",
  "source_version": "provider_sync_token_3",
  "idempotency_key": "connection:resource:object:version",
  "consent_reference": "consent_uuid",
  "raw_record_uri": "object://raw/tenant/connection/event.json",
  "content_hash": "sha256:...",
  "payload": {}
}
```

`effective_at` is when the fact applied in the real world, `observed_at` is when the source exposed it, `ingested_at` is when Brain durably received it. This separation is required because financial data is corrected retroactively. The `original_source` and `intermediaries` fields keep the chain visible, for example Chase to Plaid to the Brain connector to a normalizer version, so Brain can always answer who originally asserted a fact versus who transmitted it.

---

## 10. Sync partitioning

A single cursor per connection is insufficient. Use independently committed sync partitions.

```typescript
interface SyncPartition {
  connectionId: string;
  resourceId: string;
  objectType: string;
  partitionKey?: string;
  checkpointType: "cursor" | "page_token" | "watermark" | "snapshot";
  committedCheckpoint: unknown;
  pendingRunId?: string;
  lastSuccessfulSyncAt?: string;
  backfillStatus?: "not_started" | "running" | "complete" | "failed";
}
```

A sync run reads the committed checkpoint, retrieves one bounded batch, durably commits raw artifacts and ingestion events, records a batch manifest, then advances the checkpoint atomically with the manifest, and repeats until the provider signals completion. Never advance a checkpoint before raw data is durably committed.

---

## 11. Processing layers

- Raw. Immutable source artifacts and request context.
- Validated. Passed structural schema checks, signature checks, file safety, size limits, required-field rules, and tenant and connection ownership. Failures go to quarantine without blocking unrelated data.
- Canonical. Versioned domain records that preserve source meaning.
- Resolved. Linked to Brain identities (person, organization, account, merchant, institution, security, contract). Resolution supports uncertainty and reversible decisions. Do not silently merge on a weak match.
- Reconciled. Observations grouped into the same real-world economic event, conflicts preserved rather than overwritten.
- Derived. Classifications, calculations, forecasts, recommendations. Each derived record retains input evidence references, rule or model version, creation time, confidence, applicable period, and any user confirmation.

---

## 12. Canonical domain model and projections

Keep rich, versioned domain schemas, then project to the compact Ledger and Wiki surfaces Brain reasons over. Do not flatten domain semantics into four entities at the canonical layer.

Instantiate rich schemas only for the domains Brain monetizes now. Defer the rest until there is a paying use case.

Build now:

- Identity: person, organization, legal entity, ownership.
- Connections: provider, connection, consent, source resource.
- Accounts: financial account, ledger account, wallet.
- Money movement: transaction, transfer, payment, payout, refund, fee.
- Accounting: journal entry, journal line, invoice, bill, receivable, payable.
- Tax: document, return, filing, liability, payment, jurisdiction.
- Payroll: employment, pay run, earning, deduction, withholding, benefit.
- Payments and commerce: charge, payout, dispute, settlement, order.
- Documents: artifact, page, extracted field, evidence reference.

Defer: investments and securities (unless a design partner needs it), insurance, property and vehicles, healthcare finance, legal and estate, utilities and household. These belong to a personal-wealth surface, not the US-firm B2B focus.

Provider-only fields stay in namespaced extensions, not in shared schemas.

```json
{
  "canonical": { "invoice_number": "INV-1004", "amount": { "value": "1250.00", "currency": "USD" } },
  "extensions": { "quickbooks": { "sync_token": "3", "custom_fields": [] } }
}
```

Ledger and Wiki are rebuildable projections of this model. Ledger projects accounts, transactions, obligations, balances, and financial events. Wiki projects people, organizations, counterparties, ownership, context, documents, and relationships.

---

## 13. Entity resolution, reconciliation, and authority

The same economic event is often observed from several sources. A Stripe payout, a bank deposit, and an accounting journal entry can describe one event. Resolve and reconcile rather than storing duplicates.

Matching order: exact provider identifiers, explicit source relationships, stable account or entity or document identifiers, deterministic business keys, probabilistic matching with confidence, then user review for material ambiguity.

Authority is defined by domain and field, not globally by provider. A bank is authoritative for posted amount and date, accounting software for ledger account and classification, payroll for gross pay and withholding, a filed return for what was filed, and the user for ownership intent and approved corrections. Preserve all observations, then produce a resolved view.

---

## 14. Evidence model

MVP scope: do not build this. The MVP uses the existing `Provenance` enum (`extracted`, `inferred`, `ambiguous`, `human_confirmed`, `agent_contributed`) plus the one added `customer_asserted` value and the existing `cappedConfidence` ceiling, as specified in Phase 2. That single enum plus the confidence number plus the corroboration promotion already gives a working, comparable trust tier across all sources. The multidimensional model below is the deferred target, built one dimension at a time only when a concrete gate policy needs a dimension the enum cannot express (freshness, authority). Recording it here so the direction is fixed, not so it is built now.

Target design. Do not collapse provenance, confidence, and authority into one ordered enum. Record each dimension separately. Grow the model only as gate policies require.

```typescript
interface EvidenceAssessment {
  deliveryAuthentication: "cryptographically_verified" | "authenticated_session"
    | "customer_authenticated" | "public" | "unverified";
  extractionMethod: "native_structured" | "deterministic_parser" | "model";
  authority: "primary" | "secondary" | "asserted" | "derived";
  // grow into:
  originalSource?: SourceIdentity;
  intermediaries?: SourceIdentity[];
  acquisitionMethod?: "provider_api" | "webhook" | "document_upload" | "email"
    | "public_observation" | "human_entry" | "model_inference";
  verificationStatus?: "unverified" | "corroborated" | "confirmed" | "disputed";
  confidence?: number;
  freshnessAt?: string;
}
```

Authentication proves delivery identity, not factual accuracy. A model-extracted field from an authenticated source is well-delivered but weakly extracted, and the gate should treat it accordingly.

---

## 15. Action policy gate

MVP: the gate reads the existing `Provenance` enum. This is the existing §6 gate in `shared/src/gate/gate.ts`, extended only to refuse auto-execution of a write rail when the supporting evidence is `customer_asserted` or uncorroborated `agent_contributed`. Corroborated obligations are already promoted to `extracted` and are eligible. That is the whole MVP gate change.

Target: as the deferred evidence dimensions are added, the gate grows to evaluate richer requirements rather than a single tier: specific authoritative fields, a maximum data age, corroboration from multiple observations, no unresolved material conflict, user confirmation, a required role or approval, value thresholds, destination allowlists, or jurisdiction controls. High-risk actions fail closed when requirements are not met. Build each requirement type when a policy needs it.

Every write rail emits a receipt: action requested, policy decision, approvals, evidence references, provider request id, provider result, idempotency key, execution time, final status. Receipts return through the ingestion log. Receipt schemas already exist in `schemas/rail-receipts/` (erp, wire, ach, onchain).

---

## 16. Source coverage (firm-scoped)

Trimmed to the US-firm B2B focus. Aggregators accelerate coverage but Brain evaluates each on field coverage, freshness, data rights, economics, reliability, and whether it exposes original-source identifiers.

| Source class | Examples | Aggregator option |
|---|---|---|
| Banking and cash | Accounts, balances, cards, loans, transactions | Plaid |
| Accounting and ERP | Chart of accounts, journals, invoices, bills, AR, AP | Codat, Rutter, Merge |
| Tax | Documents, returns, liabilities, payments, jurisdictions | direct (Avalara, Stripe Tax) |
| Payroll and HR | Employment, earnings, deductions, withholding, benefits | Finch, Argyle |
| Payments | Charges, refunds, payouts, fees, disputes, settlements | direct (Stripe, others) |
| Billing | Customers, subscriptions, usage, invoices, renewals | direct |
| Expense and procurement | Cards, receipts, reimbursements, vendors, POs | Ramp, Brex, Bill.com |
| Digital assets | Exchanges, wallets, custody, chain events | Alchemy as indexer |
| CRM and commerce | Customers, orders, settlements, projected revenue | Merge, Rutter |
| Cap tables | Entities, shareholders, grants, dilution | Carta, Pulley |
| Documents and email | Statements, PDFs, CSV, OFX, QFX, attachments | n/a |
| Customer data platforms | Warehouses, databases, event streams, internal APIs | n/a |
| User and advisor input | Cash, private assets, assumptions, corrections | n/a |
| Enrichment | Merchants, securities, FX, market prices | n/a |
| Internal Brain data | Confirmations, categorizations, scenarios | n/a |

---

## 17. What exists in brain-core versus what is net-new

This is the grounding the external proposals omit. Much of Phases 1 and 2 is refactoring, not greenfield.

| Architecture component | Status in brain-core | Files |
|---|---|---|
| Source vocabulary and concrete/stub split | Exists, vocabularies disagree | `services/raw/src/sources/types.ts`, `services/raw/src/adapters/stubs.ts` |
| Connect-time connector and registry | Exists | `services/raw/src/sources/connectors.ts`, `services/raw/src/adapters/registry.ts` |
| Webhook ingestion and signature verify | Exists (Plaid), others stubbed | `services/raw/src/adapters/plaid.ts`, `shared/src/webhooks/plaid.ts`, `services/api/src/webhooks/plaidJwks.ts` |
| Generic caller push | Exists | `/raw/ingest`, `services/raw/src/services/ingest.ts` |
| Authenticated pull and sync | Net-new (the core build) | extend `services/raw/src/adapters/types.ts`, new sync worker |
| Sync partitions and checkpoints | Net-new (only `last_synced_at` today) | `services/raw/src/sources/types.ts`, `PostgresSourceRepository.ts` |
| Credential vault with refresh | Partial (AES-256-GCM helper exists; `BRAIN_AZURE_KEY_VAULT_URL` already in config) | generalize `shared/src/crypto/aes-gcm.ts`, key env in `shared/src/config.ts`, Azure Key Vault |
| Raw evidence store and content hashing | Partial | `services/raw/src/services/ingest.ts` |
| Normalization dispatch by parser | Partial: worker hardcoded to `plaid_tx_v1`; `doc_obligation_v1` dispatched via switch in `LedgerService.ts`. Phase 1 generalizes to a parser registry | `services/ledger/src/workers/normalizeWorker.ts`, `services/ledger/src/service/LedgerService.ts`, `services/ledger/src/extractors/` |
| Canonical entities (compact) | Exists (account, counterparty, transaction, obligation) | `schemas/entity/` |
| Rich domain schemas | Net-new | new versioned domain schemas |
| Ledger and Wiki as projections | Refactor (today they are the model) | ledger and wiki services |
| Entity resolution and reconciliation | Net-new (only within-source dedup today) | new resolution and reconciliation stage |
| Trust contract (provenance enum) | Exists; MVP adds one value (`customer_asserted`) | `shared/src/contracts/types.ts` (`Provenance`), `services/ledger/src/service/writes.ts` (`cappedConfidence`) |
| Multidimensional evidence model | Deferred (not MVP) | new, built per-dimension when a gate policy needs it |
| Action gate | Exists, extend to read evidence | `shared/src/gate/gate.ts` |
| Write rails and receipts | Exists | `services/api/src/rails/`, `schemas/rail-receipts/` |
| CI invariant on wiring | Exists, extend to descriptors | `scripts/` invariant script |

---

## 18. Migration plan with acceptance criteria

Build priority is breadth-first. The raw layer and its ability to ingest many sources fast is the acquisition lever, so the foundation and the universal fallback are the product, not a precursor to it. Fund them first and hardest. Named connectors come after the platform can already accept anything. The AP invoice review wedge is retained only as a quality gate that proves reconciliation works on real data, not as the thing that scopes the build.

### Phase 1: Source-agnostic platform foundation

This phase is the product. It makes the raw layer able to accept any source through one contract (see Appendix B).

- Reconcile the two source vocabularies to one provider-named set across `sources/types.ts` and `adapters/stubs.ts`.
- Introduce the standard ingestion envelope with the three timestamps, source chain, declared `source_schema`, and content hash, and route every modality through one ingest entrypoint that treats the payload as opaque. AC: an artifact with an unknown `source_schema` ingests and persists successfully and waits for a parser; nothing parses at intake.
- Harden the universal customer-push and file entrypoints (`/raw/ingest`, upload, inbound email) as a first-class "ingest anything" surface at `customer_asserted` trust, with content-hash idempotency. AC: a source with no native connector lands as opaque bytes today, with zero new code, and is retained for later interpretation.
- Add a connector scaffold (descriptor plus parser plus conformance-test template, ideally codegen) so a new source is hours of work. AC: scaffolding a new connector produces a registered descriptor, a stub parser, and passing skeleton tests without touching platform code.
- Add the connector descriptor to the registry; extend the CI invariant to assert descriptor, parser version, capability claims, fixtures, and signature-verification tests for every connector. AC: CI fails on any unregistered, undescribed, or dormant connector.
- Extend `SourceAdapter` with `fetchIncremental` and add a `SyncPartition` table; add a sync worker peer to `normalizeWorker.ts` that reads a committed checkpoint, commits raw and events, then advances the checkpoint atomically. AC: Plaid backfills on first sync and pulls only deltas after, idempotently, with per-object-type checkpoints.
- Generalize the token encryption (AES-256-GCM helper in `shared/src/crypto/aes-gcm.ts`, key env in `shared/src/config.ts`, where `BRAIN_AZURE_KEY_VAULT_URL` already exists) into a tenant-scoped Azure Key Vault credential store with refresh.
- Generalize parser dispatch into one registry keyed by parser id: replace the hardcoded `WHERE parser = 'plaid_tx_v1'` poll in `normalizeWorker.ts` and fold the `doc_obligation_v1` switch case in `services/ledger/src/service/LedgerService.ts` into the same registry, without changing either parser's behavior. AC: both existing parsers run through the registry with unchanged outputs on existing fixtures; registering a new parser requires no worker change.

### Phase 2: Minimal trust contract and gate

Do not rewrite the working document trust path. The existing `Provenance` enum (`extracted`, `inferred`, `ambiguous`, `human_confirmed`, `agent_contributed`), the `cappedConfidence` ceiling on `agent_contributed` in `services/ledger/src/service/writes.ts`, and the corroboration promotion in `services/ledger/src/reconciliation/persist.ts` already work and stay as they are. The full multidimensional `EvidenceAssessment` in section 14 is the deferred target, not MVP scope.

The MVP needs only one property: every source carries a `Provenance` value the action gate understands, so generic-pushed data cannot mint high trust.

- Add one low-trust value `customer_asserted` to the `Provenance` union in `shared/src/contracts/types.ts`, to `PROVENANCE_VALUES`, and to `cappedConfidence` (capped at the same 0.5 ceiling). Tag all generic-push and unknown-source ingestion with it. AC: a row ingested through `/raw/ingest` or the file path is written `customer_asserted` and cannot exceed 0.5 confidence.
- Set provenance on new connectors using the existing enum: structured provider data (Plaid, Stripe, the accounting aggregator, Finch) writes `extracted`; document extraction keeps writing `agent_contributed`. No new fields.
- Extend the gate to refuse auto-execution of a write rail when the supporting evidence is `customer_asserted` or uncorroborated `agent_contributed`. Read `shared/src/gate/evidence-validator.ts` first; the gate directory already has evidence-checking machinery, and this check likely belongs there rather than in new code. AC: a high-value rail fails closed, deterministically, on low-trust evidence; corroborated obligations (already promoted to `extracted`) are eligible.
- Confirm read connectors and write rails are separate registrations. AC: no component both ingests and executes.

Defer until a concrete gate policy needs a dimension the enum cannot express (for example "act only if data is under 24 hours old" needs freshness, or "act only if a bank is the authority" needs authority): the multidimensional `EvidenceAssessment`. Build one dimension when a policy demands it, not before.

### Phase 3: MVP connector set

Build the named MVP connector set in Appendix A. The set is chosen for breadth of coverage and to exercise the platform across structured pull, sensitive scoped data, and document extraction, not to fit any one design partner. Most of these are aggregators that fan out to dozens of underlying systems, and the universal fallback from Phase 1 already covers everything else.

1. Banking and cash: Plaid (already concrete; finish the pull path).
2. Payments and revenue: Stripe (already concrete).
3. Accounting and ERP: Merge (default, for the broadest multi-category surface), covering QuickBooks, Xero, NetSuite, Sage, and FreshBooks. Use Rutter instead only if a partner forces early NetSuite write-back depth.
4. Payroll: Finch, covering Gusto, Rippling, ADP, and Deel (sensitive scoped data, PII tagging).
5. Documents and email: the hardened `pdf_upload`, `csv_upload`, and `email_inbound` path from Phase 1.

AP and spend (Ramp or Bill.com) is deferred to a later depth add, not MVP scope, because the accounting aggregator already surfaces bills and vendors and the document tier reads invoice PDFs.

Quality gate for the phase: a real vendor invoice can be reviewed end to end, with the open bill from the accounting aggregator, the vendor record and prior payments, the live cash position from Plaid, and the invoice PDF itself, all reconciled into one recommendation. This proves reconciliation and the evidence model work on real data; it does not scope the build. AC: each connector produces expected canonical records with correct evidence, direction, and idempotent dedup; the descriptor and evidence model are revised from what these connectors reveal, not before.

### Phase 4: Resolution and reconciliation

- Resolve people, organizations, accounts, and counterparties with uncertainty and reversibility.
- Match related events across banking, payments, and accounting; preserve conflicts; define field-level authority; add user confirmation for material ambiguity. AC: one economic event observed from three sources resolves to one reconciled fact with all observations retained.

### Phase 5: Rich domains and projections

- Introduce versioned domain schemas for the firm-scoped domains in section 12.
- Refactor Ledger and Wiki into rebuildable projections of those schemas. AC: Ledger and Wiki can be rebuilt from canonical without recontacting providers.

### Phase 6: Governed data products and ecosystem

- Publish domain APIs for agents and product services; provenance-backed explanations; freshness, completeness, and conflict surfacing; an internal connector SDK with conformance and certification. Partner connectors only in isolated runtimes.

---

## 19. Amendments applied to the target architecture

1. Scope trimmed to firm domains. Build rich schemas only for banking, accounting, tax, payroll, payments, commerce, documents, and identity. Defer insurance, property, healthcare, estate, utilities, and consumer-wealth classes.
2. Abstractions are provisional until validated. Spec the descriptor, but treat it as draft until the MVP connectors prove it. The MVP uses the existing provenance enum; the multidimensional evidence model is deferred entirely until a gate policy needs a specific dimension, not built speculatively.
3. Refactor, not rewrite. Recognize that the gate, the CI invariant, the trust boundary, the Ledger and Wiki layers, the obligation model, and the rails already exist. The net-new core is the pull modality with partitioned checkpoints, the credential vault, the rich domain schemas, and the resolution and reconciliation stage.

---

## 20. Anti-patterns to avoid

- Provider-specific services writing directly to product databases.
- One universal financial-record schema, or forcing every domain into four entities.
- Treating authentication as proof of factual correctness.
- Treating provenance as a single ordered trust score.
- Recording an aggregator while losing the original source.
- One cursor per connection for all resources and object types.
- Advancing a checkpoint before raw data is durably committed.
- Treating webhooks as exactly-once complete records.
- Combining read connectors and write rails.
- Treating a vector index as the source of truth.
- Discarding raw evidence after normalization.
- Overwriting conflicting observations.
- Giving agents direct access to provider credentials.
- Opening a connector marketplace before isolation and certification.

---

## 21. Success criteria

- New connectors require no change to Brain's reasoning core.
- Connector output replays after a parser or schema change.
- Every canonical and derived fact traces to source evidence.
- Original sources stay visible through aggregators.
- Partial sync failures lose no records and never advance a checkpoint incorrectly.
- Duplicate and out-of-order events do not corrupt canonical state.
- Conflicting observations remain visible and resolvable.
- Brain distinguishes observations, resolved facts, assumptions, and recommendations.
- Read access and external actions have separate authorization boundaries.
- High-risk actions fail closed when evidence requirements are unmet.
- Search and AI indexes rebuild without recontacting providers.
- Connection freshness, completeness, and errors are visible to users and operators.

---

## 22. Final position

Plaid is the first connector proving this model, not the model itself. Reading is broad, evidence-tracked, and ungated. Writing is narrow, gated against evidence requirements, and receipted. The canonical model is rich and the Ledger and Wiki are projections of it. The target architecture is the consolidated design above; the path to it is mostly a refactor of `brain-core`, with the authenticated pull modality, partitioned checkpoints, credential vault, rich domain schemas, and the resolution stage as the genuine net-new work.

---

## Appendix A: MVP connector build specifications

This appendix is the build target for the MVP. It is written to be handed to Claude Code one connector at a time. Each connector is a separate branch.

### Prerequisite

The Phase 1 source-agnostic foundation must land before any named connector beyond Plaid, because every connector depends on the ingestion envelope, the universal opaque-payload intake, the `fetchIncremental` and `SyncPartition` machinery, the credential vault, the `ConnectorDescriptor`, the connector scaffold, and the Phase 2 provenance trust contract. Do not start a named connector until the foundation and the universal customer-push and file path are merged. Once they are, the platform can already ingest any source through the fallback; named connectors only upgrade specific sources to higher trust and richer structure.

### Build order

0. Phase 1 foundation, including the universal customer-push and file intake and the connector scaffold. This alone makes the platform able to ingest anything.
1. Plaid: finish the pull path (already concrete on webhooks).
2. Stripe: add the cursor pull path alongside the existing webhook (already concrete).
3. Accounting aggregator: Merge by default for the broadest surface; Rutter only if early NetSuite write depth is required.
4. Payroll: Finch.
5. Document and email tier: confirm the hardened Phase 1 path extracts invoices and statements.

Deferred to a later depth add, not MVP: AP and spend (Ramp or Bill.com), tax engines, CRM and commerce, treasury, cap table, and crypto.

### Per-connector task template

Each connector is one branch, `feat/connector-<name>`, off an up-to-date `main` (git fetch and pull first). Steps:

1. Add or confirm the source type in `services/raw/src/sources/types.ts`; move it from `STUB_SOURCE_TYPES` to `CONCRETE_SOURCE_TYPES` once wired.
2. Add the `ConnectorDescriptor` and adapter in `services/raw/src/adapters/<name>.ts`; register in `services/raw/src/adapters/registry.ts`.
3. Implement connect-time `validateCredentials` in `services/raw/src/sources/connectors.ts`.
4. Implement `fetchIncremental` (and `handleWebhook` where the provider pushes) using per-object-type `SyncPartition` checkpoints.
5. For push connectors, add signature verification in `shared/src/webhooks/<name>.ts`.
6. Add the parser and extractor in `services/ledger/src/extractors/<name>.ts`; register it in the parser registry built in Phase 1 (which generalizes the hardcoded `plaid_tx_v1` poll in `normalizeWorker.ts`); map to canonical entities with the evidence defaults below; preserve provider-specific structure in namespaced `extensions`.
7. Add fixtures and a conformance test: backfill, deltas, idempotent dedup, signature rejection where applicable, and an evidence assertion.
8. Extend the CI invariant in `scripts/` to assert this connector's descriptor, parser version, capabilities, and tests.
9. Update `CLAUDE.md` with the connector, its object types, parser id, canonical mapping, and any sensitive-data handling.

### Connector specifications

MVP trust mapping. Each spec below lists "evidence defaults" in the target multidimensional vocabulary, which is deferred (section 14). For the MVP, ignore those fields and set only the existing `Provenance` value: structured provider sources (Plaid, Stripe, the accounting aggregator, Finch) write `extracted`; the document tier keeps writing `agent_contributed` (capped at 0.5); generic push writes the new `customer_asserted` (capped). The multidimensional detail is recorded for direction only.

**1. Plaid (banking and cash).** Finish the pull path.

- connectorType `plaid`, origin `aggregator`, delivery `[webhook, cursor]`, format `[structured]`, authentication `[oauth2]`.
- objectTypes: `account`, `transaction`, `balance`.
- parsers: `plaid_tx_v1` (exists), add `plaid_balance_v1`.
- canonical: account, transaction, counterparty.
- evidence defaults: `cryptographically_verified` on webhook or `authenticated_session` on pull, `native_structured`, authority `primary` for posted amount and date.
- idempotency: account by `external_account_id`, transaction by `external_transaction_id` plus the Plaid sync version.
- AC: backfills on first sync, then pulls only deltas via `transactions/sync`, with per-account checkpoints.

**2. Stripe (payments and revenue).** Already concrete on webhooks; add the pull path.

- connectorType `stripe`, origin `provider`, delivery `[webhook, cursor]`, format `[structured]`, authentication `[api_key]`.
- objectTypes: `charge`, `payout`, `refund`, `fee`, `dispute`, `balance_transaction`, `customer`.
- parser: `stripe_v1`.
- canonical: transaction (charges, payouts, refunds, fees), counterparty (customer), obligation (dispute, and invoice if Stripe Billing is in scope).
- evidence defaults: `cryptographically_verified` (signed webhook), `native_structured`, authority `primary` for payout amounts.
- idempotency: by Stripe object id plus event id.
- AC: signed webhooks rejected if invalid; payouts and charges land as transactions with correct direction.

**3. Accounting aggregator (accounting and ERP).** One connector covers QuickBooks, Xero, NetSuite, Sage, and FreshBooks. Default to Merge for the broadest multi-category surface (accounting, HRIS and payroll, CRM, file storage through one relationship), which fits the breadth-first acquisition motion. Use Rutter instead only if a partner forces early NetSuite write-back depth.

- connectorType `merge_accounting` (or `rutter`), origin `aggregator`, delivery `[webhook, cursor, poll]`, format `[structured]`, authentication `[oauth2]`.
- objectTypes: `gl_account`, `journal_entry`, `journal_line`, `invoice`, `bill`, `vendor`, `customer`, `payment`, `tax_rate`.
- parser: `rutter_accounting_v1`.
- canonical: account (GL accounts), transaction (journal lines, payments), counterparty (vendor, customer), obligation (invoice maps to receivable, bill maps to payable). Preserve multi-line journal structure, dimensions, and class tracking in `extensions`.
- evidence defaults: `authenticated_session`, `native_structured`, authority `primary` for ledger account and classification, `secondary` for amounts where a bank is also present.
- idempotency: by connection plus object type plus external id plus sync token.
- AC: open bills and their vendors land as payable obligations and counterparties with GL coding preserved in extensions; per-object-type checkpoints; original source identifier retained so the underlying platform (for example NetSuite) is visible, not just the aggregator.

**4. AP and spend (deferred, post-MVP).** Not part of the MVP build, kept here as the next depth add. When built, it becomes the live invoice workflow source: Ramp for growth-stage or Bill.com for established mid-market AP volume. Until then, bills and vendors come from the accounting aggregator and invoice PDFs come from the document tier.

**5. Payroll (Finch).** One connector covers Gusto, Rippling, ADP, and Deel. Sensitive scoped data; this is the connector that validates PII handling.

- connectorType `finch`, origin `aggregator`, delivery `[poll, snapshot]`, format `[structured]`, authentication `[oauth2]`.
- objectTypes: `company`, `individual`, `employment`, `pay_statement`, `pay_run`, `deduction`, `contribution`, `benefit`.
- parser: `finch_payroll_v1`.
- canonical: counterparty (employee, PII-tagged), transaction (net pay outflow per pay run), obligation (upcoming pay run as a payroll liability).
- evidence defaults: `authenticated_session`, `native_structured`, authority `primary` for gross pay and withholding.
- idempotency: by `pay_statement` id plus `pay_run` id.
- sensitive-data requirements: tag SSN, compensation, and individual identity fields; apply field-level redaction in agent traces; never place raw PII in model prompts.
- AC: pay runs land as transactions and payroll obligations; employee PII is tagged and excluded from model context; sensitive fields are redacted in agent traces.

**6. Document and email tier.** Harden the existing stubs into real extraction. This is the universal fallback and the source of the actual invoice PDF in the wedge.

- connectorTypes `pdf_upload`, `csv_upload`, `email_inbound` (exist as stubs).
- origin `customer`, delivery `[file]` for upload and `[webhook]` for inbound email, format `[document]`, authentication `[none]` for upload (RBAC-scoped) and `[signature]` for verified inbound email.
- parser: `doc_obligation_v1` (exists), extend for invoice and statement extraction.
- canonical: obligation (extracted invoice maps to a payable at capped confidence), counterparty (vendor, model-derived).
- evidence defaults: `customer_authenticated`, `extractionMethod` `model`, authority `asserted`, confidence at most 0.5.
- idempotency: by `content_hash`.
- AC: an uploaded or emailed vendor invoice PDF produces an obligation and counterparty at capped confidence, deduplicated by content hash, and the action gate refuses to auto-execute on document-only evidence.

### Wedge acceptance test (definition of done for the MVP)

A single end-to-end test must pass: ingest a real vendor invoice through the document tier, match it to the open bill from the accounting aggregator and the vendor record, pull the live cash position from Plaid and the prior payments to that vendor, reconcile these observations into one payable, and produce a single review recommendation. The recommendation must carry evidence references to every source, and the action gate must require explicit user confirmation before any write rail executes a payment.

---

## Appendix B: How the raw layer is source-agnostic

This appendix specifies the mechanism that lets the raw layer accept data from any source without per-source platform code. Claude Code should build the Phase 1 foundation to this spec. The governing idea: intake is dumb and uniform, interpretation is smart and replaceable. The raw layer never tries to understand what it receives, so a source it has never seen still lands safely, and adding a source becomes "write one parser" rather than "change the platform." The anti-goal is a smart, universal intake schema, which couples the platform to every source.

### Four mechanisms

**1. One ingestion contract for everything: the envelope.** Every byte that enters, from any source and any modality (webhook, pull, file, customer push, chain, agent), is wrapped in the standard envelope (section 9) and handed to one entrypoint. The pipeline is identical regardless of origin:

1. authenticate the channel (signature, OAuth session, or the caller's RBAC for push)
2. wrap in the envelope (provenance and source chain, the three timestamps, a declared `source_schema`, a content hash)
3. idempotency check by content hash and idempotency key
4. persist the raw bytes immutably and append the ingestion-log event
5. emit "artifact landed"

The raw layer never branches on "is this Plaid or a CSV." It runs these five steps on opaque bytes. In `brain-core` this is `ingestOne` in `services/raw/src/services/ingest.ts` generalized, with `FetchedArtifact` in `services/raw/src/adapters/types.ts` widened into the full envelope.

**2. Opaque payload, deferred interpretation.** The raw store keeps the bytes plus the declared `source_schema` tag and does not parse them. Ingestion cannot fail on an unknown schema, because nothing understands the schema at intake. Interpretation is a separate worker that picks up landed artifacts and dispatches by `source_schema` to a parser. `brain-core` has the seed of this but it is not yet generic: `normalizeWorker.ts` is hardcoded to poll `WHERE parser = 'plaid_tx_v1'`, and `doc_obligation_v1` is dispatched separately through a switch in `services/ledger/src/service/LedgerService.ts`. Phase 1 must generalize this into one parser registry keyed by parser id, so the worker polls all registered parsers and dispatch lives in one place. The intake-versus-interpretation decoupling already exists in code and time; the generic dispatch is a small net-new build, not an existing capability.

**3. Acquisition is a small modality plugin, and the fallback needs no plugin at all.** A native connector implements only the modality methods it needs (`handleWebhook` or `fetchIncremental`) and declares the rest in a `ConnectorDescriptor`, which is data, not code. For any source with no native connector, the universal push and file entrypoints accept the bytes through the same envelope with no connector at all, at `customer_asserted` trust. So "can we ingest X" is always yes: worst case, X lands as opaque bytes tagged with a declared schema, immediately, and a parser is written later.

**4. Interpretation is a pure, versioned, replayable parser.** The contract is `parser(bytes, source_schema) -> canonical records + evidence`: no I/O, no provider knowledge, registered by schema version. Because raw bytes are retained, a parser can be added or fixed and history replayed to populate or correct canonical data without recontacting the source. New source coverage equals one parser, with no platform change.

### The three cases (where the acquisition story lives)

- Native connector (Stripe): descriptor plus adapter plus parser. Hours.
- Behind an aggregator (QuickBooks via Merge): the aggregator is the connector, so one descriptor and one parser for its normalized schema unlock dozens of underlying systems. Hours, once.
- No connector at all (a bank's custom CSV export, a neobank's warehouse table): lands through the universal push or file entrypoint as opaque bytes at capped trust, today, with zero new code, and a parser to promote it comes later. This is the case that onboards the neobank and the commercial bank without building to either of them.

### Why agnosticism is safe, not reckless

The evidence model (section 14) makes breadth safe. The envelope records how data arrived, the parser stamps how it was extracted and whether the source is authoritative, so trust is computed per observation rather than assumed. The platform accepts everything and tiers it automatically, and the action gate refuses to act on low-trust evidence. Agnostic intake, typed trust. This is what keeps a high source count from degrading into a thin aggregator: breadth is the acquisition surface, and reconciliation plus the evidence model is the moat.

### What this is not

Source-agnostic does not mean one universal schema that all data is forced into. That couples the platform to every source and destroys structure. Agnosticism lives only at the raw layer, as a uniform envelope over an opaque payload. Richness is preserved in the retained bytes and projected by per-source parsers into the rich domain model (section 12). Dumb uniform input, rich typed output.

### Phase 1 acceptance criteria specific to agnosticism

- An artifact with a `source_schema` the system has never seen ingests, persists, and is retained without error, and no parsing occurs at intake.
- A source with no native connector is ingestible through the universal push or file entrypoint with zero new code, at `customer_asserted` trust.
- Adding a parser for a previously opaque `source_schema` and replaying history populates canonical records without recontacting the source.
- The ingest entrypoint has one signature for all modalities; no branch in the raw layer is keyed to a specific provider.
