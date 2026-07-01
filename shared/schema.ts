import { sql } from "drizzle-orm";
import {
  pgTable, text, varchar, boolean, integer, numeric,
  timestamp, jsonb, bigint, uuid, index, primaryKey,
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

/* ─── Agents ─── */
export const agents = pgTable("agents", {
  id: text("id").primaryKey(),               // bytes32 hex from registry
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  website: text("website"),
  category: text("category").notNull(),      // trading|payments|research|automation|swarm
  avatarUrl: text("avatar_url"),
  metadataUri: text("metadata_uri"),         // IPFS
  executionWallet: text("execution_wallet"),
  brainAccountAddress: text("brain_account_address"),
  policy: jsonb("policy"),                   // {spendLimit, timeWindowSeconds, allowedAssets, approvalThreshold}
  status: text("status").notNull().default("active"),  // active|paused|graduated
  totalPaymentsExecuted: integer("total_payments_executed").default(0),
  totalVolumeUsdc: numeric("total_volume_usdc", { precision: 20, scale: 6 }).default("0"),
  tokenAddress: text("token_address"),
  bondingCurveAddress: text("bonding_curve_address"),
  aerodromePool: text("aerodrome_pool"),
  graduated: boolean("graduated").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  lastActiveAt: timestamp("last_active_at").defaultNow(),
}, (t) => [
  index("agents_owner_id_idx").on(t.ownerId),
  index("agents_status_idx").on(t.status),
]);

export const insertAgentSchema = createInsertSchema(agents).omit({ createdAt: true, lastActiveAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agents.$inferSelect;

/* ─── Marketplace Listings ─── */
export const marketplaceListings = pgTable("marketplace_listings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: text("agent_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  rating: numeric("rating", { precision: 3, scale: 2 }).default("0"),
  installs: integer("installs").default(0),
  price: text("price").default("free"),
  featured: boolean("featured").default(false),
  trending: boolean("trending").default(false),
  newAndNoteworthy: boolean("new_and_noteworthy").default(false),
  previewImages: text("preview_images").array(),
  capabilities: text("capabilities").array(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("marketplace_category_idx").on(t.category),
  index("marketplace_featured_idx").on(t.featured),
  index("marketplace_trending_idx").on(t.trending),
]);

export const insertMarketplaceListingSchema = createInsertSchema(marketplaceListings).omit({ id: true, createdAt: true });
export type InsertMarketplaceListing = z.infer<typeof insertMarketplaceListingSchema>;
export type MarketplaceListing = typeof marketplaceListings.$inferSelect;

/* ─── Agent Memory ─── */
export const agentMemory = pgTable("agent_memory", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: text("agent_id").notNull(),
  content: text("content").notNull(),
  actionType: text("action_type"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("agent_memory_agent_id_idx").on(t.agentId),
]);

export const insertAgentMemorySchema = createInsertSchema(agentMemory).omit({ id: true, createdAt: true });
export type InsertAgentMemory = z.infer<typeof insertAgentMemorySchema>;
export type AgentMemory = typeof agentMemory.$inferSelect;

/* ─── Agent Transactions ─── */
export const agentTransactions = pgTable("agent_transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: text("agent_id").notNull(),
  txHash: text("tx_hash"),
  intentHash: text("intent_hash"),
  resourceUri: text("resource_uri"),
  amountUsdc: numeric("amount_usdc", { precision: 18, scale: 6 }),
  merchant: text("merchant"),
  status: text("status").default("pending"),  // pending|confirmed|failed
  blockNumber: bigint("block_number", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("agent_txns_agent_id_idx").on(t.agentId),
  index("agent_txns_status_idx").on(t.status),
]);

export const insertAgentTransactionSchema = createInsertSchema(agentTransactions).omit({ id: true, createdAt: true });
export type InsertAgentTransaction = z.infer<typeof insertAgentTransactionSchema>;
export type AgentTransaction = typeof agentTransactions.$inferSelect;

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
  accessToken: text("access_token").notNull(),     // Plaid access_token (sensitive — never returned to client)
  institutionId: text("institution_id"),
  institutionName: text("institution_name"),
  accounts: jsonb("accounts").notNull(),           // BankAccount[]
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
}, (t) => [
  index("bank_connections_user_id_idx").on(t.userId),
  index("bank_connections_user_item_idx").on(t.userId, t.itemId),
]);

/* ─── Source Documents (uploaded files registered as an ingestion source) ─── */
export const sourceDocuments = pgTable("source_documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  size: integer("size").notNull(),          // bytes
  mimeType: text("mime_type"),
  category: text("category"),               // bank | accounting | payroll | tax | payments | general
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

/* ─── SIWE Sessions ─── */
export const siweNonces = pgTable("siwe_nonces", {
  nonce: text("nonce").primaryKey(),
  walletAddress: text("wallet_address"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("siwe_nonces_expires_at_idx").on(t.expiresAt),
]);
