import { sql } from "drizzle-orm";
import {
  pgTable, text, varchar, boolean, integer, numeric,
  timestamp, jsonb, bigint, uuid, index, uniqueIndex, primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ─── Users ─── */
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  password: text("password"),                  // nullable: Google-only accounts have no password
  googleId: text("google_id").unique(),        // Google OAuth subject id
  name: text("name"),                          // display name (from Google profile or signup)
  walletAddress: text("wallet_address").unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
  googleId: true,
  name: true,
  walletAddress: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

/* ─── Notifications ─── */
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  data: jsonb("data"),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("notifications_user_id_idx").on(t.userId),
  index("notifications_user_read_idx").on(t.userId, t.read),
]);

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

/* ─── Bank Connections (Plaid) ─── */
export const bankConnections = pgTable("bank_connections", {
  userId: text("user_id").notNull(),
  itemId: text("item_id").notNull(),               // Plaid item_id
  accessToken: text("access_token").notNull(),     // Plaid access_token (sensitive - never returned to client)
  institutionId: text("institution_id"),
  institutionName: text("institution_name"),
  accounts: jsonb("accounts").notNull(),           // BankAccount[]
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
}, (t) => [
  index("bank_connections_user_id_idx").on(t.userId),
  // UNIQUE: createBankConnection upserts with ON CONFLICT (user_id, item_id)
  uniqueIndex("bank_connections_user_item_idx").on(t.userId, t.itemId),
]);

/* ─── Source Documents (uploaded files registered as an ingestion source) ─── */
export const sourceDocuments = pgTable("source_documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  size: integer("size").notNull(),          // bytes
  mimeType: text("mime_type"),
  category: text("category"),               // bank | accounting | payroll | tax | payments | general
  // ── brain-core ingestion (files live in Brain, not here) ──
  rawId: text("raw_id"),                     // brain-core raw artifact id (POST /v1/raw/ingest)
  sha256: text("sha256"),                    // content hash returned by ingest
  sourceType: text("source_type"),          // pdf_upload | csv_upload
  // pending | ingested | extracting | extracted | unsupported | unavailable | failed
  extractStatus: text("extract_status"),
  parsedId: text("parsed_id"),              // brain-core parsed record id (from extract)
  confidence: text("confidence"),           // model-read confidence (≤0.5), stored as string
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
}, (t) => [
  index("source_documents_user_id_idx").on(t.userId),
]);

/* ─── User Rules (rules authored via the "New rule" creator, per tenant) ─── */
export const userRules = pgTable("user_rules", {
  id: varchar("id").notNull(),                        // client-generated slug id (unique per tenant)
  userId: text("user_id").notNull(),                 // owning tenant/account
  name: text("name").notNull(),
  summary: text("summary").notNull().default(""),
  kind: text("kind").notNull().default("automation"),   // automation | guardrail | always_on
  policyId: text("policy_id").notNull(),
  active: boolean("active").notNull().default(true),
  agent: text("agent"),
  category: text("category"),
  cap: integer("cap"),                               // auto-clear ceiling
  threshold: integer("threshold"),                   // guardrail trip point / sweep amount
  thresholdEditable: boolean("threshold_editable"),
  allowlist: text("allowlist").array(),              // trusted vendor names
  scopeSummary: text("scope_summary"),
  createdLabel: text("created_label").notNull().default("You created this"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.id] }),
  index("user_rules_user_id_idx").on(t.userId),
]);

/* ─── Brain Identities (production tenancy: app user → brain-core external_ref) ───
 * One row per app user linked to a brain-core tenant. `externalRef` is the stable
 * platform-side identifier sent as founder_external_ref at tenant creation or bound at
 * invite consume - it is the app user's id (never an email). The mapping is durable and
 * survives restarts; without a row here, production mode has NO tenant for the user
 * (NoTenantError) and must route them to "create a company" or "enter an invite link". */
export const brainIdentities = pgTable("brain_identities", {
  userId: text("user_id").primaryKey(),               // app users.id
  externalRef: text("external_ref").notNull().unique(), // sent to brain-core; = userId today
  tenantId: text("tenant_id").notNull(),               // brain-core tnt_… id
  memberId: text("member_id"),                         // brain-core user_… member id
  companyName: text("company_name"),                   // what the founder typed at tenant creation; brain-core has no GET-by-member-token for this, so we keep our own copy
  linkedAt: timestamp("linked_at").defaultNow().notNull(),
}, (t) => [
  index("brain_identities_tenant_id_idx").on(t.tenantId),
]);

export const insertBrainIdentitySchema = createInsertSchema(brainIdentities).omit({ linkedAt: true });
export type InsertBrainIdentity = z.infer<typeof insertBrainIdentitySchema>;
export type BrainIdentity = typeof brainIdentities.$inferSelect;

/* ─── Brain Agent Tokens (production tenancy: per-TENANT agent principal) ───
 * brain-core mints a real agent token at tenant creation (production-agents contract) and
 * re-issues it idempotently via POST /v1/tenants/{tenantId}/agent-token. One row per tenant
 * (shared by every member of that tenant); refreshed server-side before expiry. The token
 * NEVER reaches the browser. Tenants created before this contract have no row - the next
 * session use mints one (idempotent backfill, no data migration). */
export const brainAgentTokens = pgTable("brain_agent_tokens", {
  tenantId: text("tenant_id").primaryKey(),            // brain-core tnt_… id
  token: text("token").notNull(),                      // agent principal token (propose-only)
  expiresAt: timestamp("expires_at").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type BrainAgentToken = typeof brainAgentTokens.$inferSelect;

/* ─── SIWE Sessions ─── */
export const siweNonces = pgTable("siwe_nonces", {
  nonce: text("nonce").primaryKey(),
  walletAddress: text("wallet_address"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("siwe_nonces_expires_at_idx").on(t.expiresAt),
]);
export type SiweNonce = typeof siweNonces.$inferSelect;
