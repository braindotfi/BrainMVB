import { sql } from "drizzle-orm";
import {
  pgTable, text, varchar, boolean, integer, numeric,
  timestamp, jsonb, bigint, uuid, index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ─── Users ─── */
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  walletAddress: text("wallet_address").unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
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

/* ─── SIWE Sessions ─── */
export const siweNonces = pgTable("siwe_nonces", {
  nonce: text("nonce").primaryKey(),
  walletAddress: text("wallet_address"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("siwe_nonces_expires_at_idx").on(t.expiresAt),
]);
