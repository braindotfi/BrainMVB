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
});

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
});

export const insertMarketplaceListingSchema = createInsertSchema(marketplaceListings).omit({ id: true, createdAt: true });
export type InsertMarketplaceListing = z.infer<typeof insertMarketplaceListingSchema>;
export type MarketplaceListing = typeof marketplaceListings.$inferSelect;

/* ─── Launchpad Launches ─── */
export const launchpadLaunches = pgTable("launchpad_launches", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  launchIndex: integer("launch_index"),      // on-chain index from LaunchpadFactory
  agentId: text("agent_id").notNull(),
  agentName: text("agent_name").notNull(),
  symbol: text("symbol").notNull(),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  creator: text("creator").notNull(),        // wallet address
  tokenAddress: text("token_address"),
  bondingCurveAddress: text("bonding_curve_address"),
  baseRaised: numeric("base_raised", { precision: 30, scale: 18 }).default("0"),
  graduationThreshold: numeric("graduation_threshold", { precision: 30, scale: 18 }).default("69000000000000000000000"),
  marketCapUsd: numeric("market_cap_usd", { precision: 20, scale: 2 }).default("0"),
  currentPriceEth: numeric("current_price_eth", { precision: 30, scale: 18 }).default("0"),
  holders: integer("holders").default(0),
  txCount: integer("tx_count").default(0),
  graduated: boolean("graduated").default(false),
  aerodromePool: text("aerodrome_pool"),
  capabilities: text("capabilities").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLaunchpadLaunchSchema = createInsertSchema(launchpadLaunches).omit({ id: true, createdAt: true });
export type InsertLaunchpadLaunch = z.infer<typeof insertLaunchpadLaunchSchema>;
export type LaunchpadLaunch = typeof launchpadLaunches.$inferSelect;

/* ─── Bonding Curve Snapshots (chart data) ─── */
export const bondingCurveSnapshots = pgTable("bonding_curve_snapshots", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  curveAddress: text("curve_address").notNull(),
  agentTokenAddress: text("agent_token_address").notNull(),
  priceEth: numeric("price_eth", { precision: 30, scale: 18 }),
  supply: numeric("supply", { precision: 30, scale: 0 }),
  marketCapUsd: numeric("market_cap_usd", { precision: 20, scale: 2 }),
  baseRaised: numeric("base_raised", { precision: 30, scale: 18 }),
  txHash: text("tx_hash"),
  eventType: text("event_type"),             // buy|sell|graduate
  buyerSeller: text("buyer_seller"),
  amountTokens: numeric("amount_tokens", { precision: 30, scale: 0 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBondingCurveSnapshotSchema = createInsertSchema(bondingCurveSnapshots).omit({ id: true, createdAt: true });
export type InsertBondingCurveSnapshot = z.infer<typeof insertBondingCurveSnapshotSchema>;
export type BondingCurveSnapshot = typeof bondingCurveSnapshots.$inferSelect;

/* ─── Agent Memory ─── */
export const agentMemory = pgTable("agent_memory", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: text("agent_id").notNull(),
  content: text("content").notNull(),
  actionType: text("action_type"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
});

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
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

/* ─── SIWE Sessions ─── */
export const siweNonces = pgTable("siwe_nonces", {
  nonce: text("nonce").primaryKey(),
  walletAddress: text("wallet_address"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
