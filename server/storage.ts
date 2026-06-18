import { randomUUID } from "crypto";
import {
  type User, type InsertUser,
  type Agent, type InsertAgent,
  type AgentMemory, type InsertAgentMemory,
  type AgentTransaction, type InsertAgentTransaction,
  type Notification, type InsertNotification,
  type MarketplaceListing,
  users as usersTable,
  agents as agentsTable,
  marketplaceListings as marketplaceListingsTable,
  agentMemory as agentMemoryTable,
  agentTransactions as agentTransactionsTable,
  notifications as notificationsTable,
  siweNonces as siweNoncesTable,
  bankConnections as bankConnectionsTable,
  sourceDocuments as sourceDocumentsTable,
} from "@shared/schema";
import { eq, and, or, inArray, desc, count, ne } from "drizzle-orm";
import { db } from "./db";

export interface DeleteAccountIdentifiers {
  userId?: string;          // app user id (free-form) — also used as agents.ownerId
  email?: string;           // mapped to users.username when SIWE created the row
  walletAddress?: string;   // canonical link to users.wallet_address
}

export interface DeleteAccountResult {
  user: User | null;
  agentsDeleted: number;
  memoriesDeleted: number;
  transactionsDeleted: number;
  notificationsDeleted: number;
  noncesDeleted: number;
}

export type AgentStatus = "active" | "inactive" | "paused";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getUserByWallet(walletAddress: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserWallet(id: string, walletAddress: string): Promise<User | undefined>;
  deleteUserAccount(ids: DeleteAccountIdentifiers): Promise<DeleteAccountResult>;
  deleteUserData(ids: DeleteAccountIdentifiers): Promise<DeleteAccountResult>;

  // Agents
  getAgent(id: string): Promise<Agent | undefined>;
  listAgents(ownerId?: string): Promise<Agent[]>;
  createAgent(agent: InsertAgent): Promise<Agent>;
  updateAgent(id: string, updates: Partial<InsertAgent>): Promise<Agent | undefined>;
  deleteAgent(id: string): Promise<boolean>;
  getAgentStatus(agentId: string): Promise<AgentStatus | undefined>;
  setAgentStatus(agentId: string, status: AgentStatus): Promise<AgentStatus>;

  // Marketplace
  listMarketplaceListings(filters?: { category?: string; featured?: boolean; trending?: boolean }): Promise<MarketplaceListing[]>;

  // Agent Memory
  addMemory(memory: InsertAgentMemory): Promise<AgentMemory>;
  getMemories(agentId: string, limit?: number): Promise<AgentMemory[]>;

  // Agent Transactions
  addTransaction(tx: InsertAgentTransaction): Promise<AgentTransaction>;
  getTransactions(agentId: string, limit?: number): Promise<AgentTransaction[]>;

  // Notifications
  getNotifications(userId: string, limit?: number): Promise<Notification[]>;
  getUnreadCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markAsRead(id: string): Promise<void>;
  deleteNotification(id: string): Promise<void>;

  // Tool connections (third-party integrations linked from onboarding)
  listToolConnections(userId: string): Promise<ToolConnection[]>;
  upsertToolConnection(conn: ToolConnection): Promise<ToolConnection>;
  removeToolConnection(userId: string, toolId: string): Promise<boolean>;

  // Bank connections via Plaid
  listBankConnections(userId: string): Promise<BankConnection[]>;
  createBankConnection(conn: BankConnection): Promise<BankConnection>;
  removeBankConnection(userId: string, itemId: string): Promise<boolean>;

  // Source documents (uploaded files registered as an ingestion source)
  listSourceDocuments(userId: string): Promise<SourceDocument[]>;
  createSourceDocument(doc: InsertSourceDocument): Promise<SourceDocument>;
  removeSourceDocument(userId: string, id: string): Promise<boolean>;
}

export type ToolConnection = {
  userId: string;
  toolId: string;       // e.g. "stripe", "notion"
  status: "connected" | "error";
  accountLabel?: string; // e.g. Stripe business name
  connectedAt: string;   // ISO
};

export type BankAccount = {
  accountId: string;
  name: string;
  mask: string | null;
  subtype: string | null;
  type: string | null;
};

export type BankConnection = {
  userId: string;
  itemId: string;          // Plaid item_id (unique per institution per user)
  accessToken: string;     // Plaid access_token (sensitive)
  institutionId?: string;
  institutionName?: string;
  accounts: BankAccount[];
  connectedAt: string;     // ISO
};

export type SourceDocument = {
  id: string;
  userId: string;
  name: string;
  size: number;            // bytes
  mimeType: string | null;
  category: string | null; // bank | accounting | payroll | tax | payments | general
  uploadedAt: string;      // ISO
};

export type InsertSourceDocument = {
  userId: string;
  name: string;
  size: number;
  mimeType?: string | null;
  category?: string | null;
};

// ─── In-memory implementation (replace with Drizzle+PostgreSQL when DB is provisioned) ───

export class MemStorage implements IStorage {
  private users = new Map<string, User>();
  private agents = new Map<string, Agent>();
  private agentStatuses = new Map<string, AgentStatus>();
  private marketplaceListings = new Map<string, MarketplaceListing>();
  private memories: AgentMemory[] = [];
  private txLog: AgentTransaction[] = [];
  private notifs = new Map<string, Notification>();

  constructor() {
    this._seed();
  }

  // ─── Seed marketplace + demo launches ───
  private _seed() {
    const now = new Date();

    // Seed marketplace listings
    const listings: Omit<MarketplaceListing, "id">[] = [
      { agentId: "alpha-001", name: "AlphaFlow", description: "Executes automated trading strategies across DeFi protocols using momentum indicators and on-chain signals.", category: "trading", rating: "4.8", installs: 2341, price: "free", featured: true, trending: true, newAndNoteworthy: false, previewImages: [], capabilities: ["trading", "defi", "automation"], createdAt: now },
      { agentId: "yield-001", name: "Yield Pilot", description: "Manages capital allocation across DeFi protocols to maximize yield while respecting risk parameters.", category: "trading", rating: "4.6", installs: 1872, price: "free", featured: true, trending: true, newAndNoteworthy: false, previewImages: [], capabilities: ["lending", "yield", "defi"], createdAt: now },
      { agentId: "risk-001", name: "Risk Sentinel", description: "Continuously monitors positions and transactions for risk thresholds, liquidation danger, and anomalies.", category: "trading", rating: "4.9", installs: 3102, price: "free", featured: false, trending: true, newAndNoteworthy: false, previewImages: [], capabilities: ["risk", "monitoring", "alerts"], createdAt: now },
      { agentId: "signal-001", name: "Signal Seer", description: "Aggregates news, social signals, and on-chain data to generate actionable trading signals.", category: "research", rating: "4.5", installs: 1234, price: "free", featured: false, trending: true, newAndNoteworthy: false, previewImages: [], capabilities: ["research", "signals", "analytics"], createdAt: now },
      { agentId: "trend-001", name: "TrendRadar", description: "Detects emerging trends across markets, social platforms, and on-chain activity before they go mainstream.", category: "research", rating: "4.4", installs: 987, price: "free", featured: false, trending: true, newAndNoteworthy: false, previewImages: [], capabilities: ["research", "trends", "social"], createdAt: now },
      { agentId: "task-001", name: "TaskForge Pro", description: "Automates repetitive workflows across tools, APIs, and DeFi protocols with smart scheduling.", category: "automation", rating: "4.7", installs: 1567, price: "free", featured: false, trending: true, newAndNoteworthy: false, previewImages: [], capabilities: ["automation", "workflows", "scheduling"], createdAt: now },
      { agentId: "inbox-001", name: "InboxZero", description: "Manages email, filters priority messages, and drafts responses using context from your financial data.", category: "automation", rating: "4.3", installs: 756, price: "free", featured: false, trending: false, newAndNoteworthy: true, previewImages: [], capabilities: ["email", "productivity", "automation"], createdAt: now },
      { agentId: "ops-001", name: "Ops Commander", description: "Coordinates multi-step workflows across systems, APIs, and agents with dependency management.", category: "automation", rating: "4.5", installs: 843, price: "free", featured: false, trending: false, newAndNoteworthy: true, previewImages: [], capabilities: ["orchestration", "workflows", "multi-agent"], createdAt: now },
      { agentId: "pay-001", name: "Pay Stream", description: "Executes real-time payments for APIs and services using x402 machine-to-machine protocol.", category: "payments", rating: "4.6", installs: 1102, price: "free", featured: false, trending: false, newAndNoteworthy: true, previewImages: [], capabilities: ["payments", "x402", "automation"], createdAt: now },
      { agentId: "inv-001", name: "Invoice Bot", description: "Generates invoices, tracks payments, and automates collections for freelancers and businesses.", category: "payments", rating: "4.2", installs: 634, price: "free", featured: false, trending: false, newAndNoteworthy: true, previewImages: [], capabilities: ["invoicing", "payments", "accounting"], createdAt: now },
      { agentId: "deal-001", name: "Deal Closer", description: "Negotiates and executes transactions between agents using on-chain escrow and dispute resolution.", category: "payments", rating: "4.4", installs: 521, price: "free", featured: false, trending: false, newAndNoteworthy: true, previewImages: [], capabilities: ["negotiation", "escrow", "payments"], createdAt: now },
      { agentId: "swarm-001", name: "SwarmAlpha", description: "Coordinates multiple sub-agents to execute complex strategies that no single agent can handle alone.", category: "swarm", rating: "4.8", installs: 2891, price: "free", featured: false, trending: false, newAndNoteworthy: true, previewImages: [], capabilities: ["swarm", "multi-agent", "orchestration"], createdAt: now },
    ];

    listings.forEach(l => {
      const id = randomUUID();
      this.marketplaceListings.set(id, { id, ...l } as MarketplaceListing);
    });
  }

  // ─── Users ───
  async getUser(id: string) { return this.users.get(id); }
  async getUserByUsername(username: string) {
    return Array.from(this.users.values()).find(u => u.username === username);
  }
  async getUserByEmail(email: string) {
    const lower = email.toLowerCase();
    return Array.from(this.users.values()).find(u => u.email?.toLowerCase() === lower);
  }
  async getUserByGoogleId(googleId: string) {
    return Array.from(this.users.values()).find(u => u.googleId === googleId);
  }
  async getUserByWallet(walletAddress: string) {
    return Array.from(this.users.values()).find(u => u.walletAddress === walletAddress);
  }
  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      ...insertUser,
      id,
      email: insertUser.email ?? null,
      password: insertUser.password ?? null,
      googleId: insertUser.googleId ?? null,
      name: insertUser.name ?? null,
      walletAddress: insertUser.walletAddress ?? null,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }
  async updateUserWallet(id: string, walletAddress: string): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated = { ...user, walletAddress };
    this.users.set(id, updated);
    return updated;
  }

  async deleteUserAccount(ids: DeleteAccountIdentifiers): Promise<DeleteAccountResult> {
    // Resolve the matching user row (if any) by wallet, id, or username/email.
    const allUsers = Array.from(this.users.values());
    const user = allUsers.find(u =>
      (ids.walletAddress && u.walletAddress === ids.walletAddress) ||
      (ids.userId && u.id === ids.userId) ||
      (ids.email && u.username === ids.email),
    ) ?? null;

    // Build the set of owner identifiers used as agents.ownerId across the app.
    const ownerKeys = new Set<string>();
    if (user?.id)                ownerKeys.add(user.id);
    if (user?.walletAddress)     ownerKeys.add(user.walletAddress);
    if (ids.userId)              ownerKeys.add(ids.userId);
    if (ids.walletAddress)       ownerKeys.add(ids.walletAddress);
    if (ids.email)               ownerKeys.add(ids.email);

    const ownedAgents = Array.from(this.agents.values()).filter(a => ownerKeys.has(a.ownerId));
    const ownedAgentIds = new Set(ownedAgents.map(a => a.id));

    // Delete agent transactions + memories that belong to those agents.
    const memoriesBefore = this.memories.length;
    this.memories = this.memories.filter(m => !ownedAgentIds.has(m.agentId));
    const memoriesDeleted = memoriesBefore - this.memories.length;

    const txnsBefore = this.txLog.length;
    this.txLog = this.txLog.filter(t => !ownedAgentIds.has(t.agentId));
    const transactionsDeleted = txnsBefore - this.txLog.length;

    // Delete the agents themselves.
    for (const id of ownedAgentIds) {
      this.agents.delete(id);
      this.agentStatuses.delete(id);
    }
    const agentsDeleted = ownedAgentIds.size;

    // Delete notifications for any of the user's identifiers.
    let notificationsDeleted = 0;
    for (const [nid, n] of Array.from(this.notifs.entries())) {
      if (ownerKeys.has(n.userId)) {
        this.notifs.delete(nid);
        notificationsDeleted++;
      }
    }

    // Finally remove the user row.
    if (user) this.users.delete(user.id);

    return { user, agentsDeleted, memoriesDeleted, transactionsDeleted, notificationsDeleted, noncesDeleted: 0 };
  }

  async deleteUserData(ids: DeleteAccountIdentifiers): Promise<DeleteAccountResult> {
    // Locate the user (kept; only their owned data is removed).
    const allUsers = Array.from(this.users.values());
    const user = allUsers.find(u =>
      (ids.walletAddress && u.walletAddress === ids.walletAddress) ||
      (ids.userId && u.id === ids.userId) ||
      (ids.email && u.username === ids.email),
    ) ?? null;

    const ownerKeys = new Set<string>();
    if (user?.id)            ownerKeys.add(user.id);
    if (user?.walletAddress) ownerKeys.add(user.walletAddress);
    if (ids.userId)          ownerKeys.add(ids.userId);
    if (ids.walletAddress)   ownerKeys.add(ids.walletAddress);
    if (ids.email)           ownerKeys.add(ids.email);

    const ownedAgents = Array.from(this.agents.values()).filter(a => ownerKeys.has(a.ownerId));
    const ownedAgentIds = new Set(ownedAgents.map(a => a.id));

    const memoriesBefore = this.memories.length;
    this.memories = this.memories.filter(m => !ownedAgentIds.has(m.agentId));
    const memoriesDeleted = memoriesBefore - this.memories.length;

    const txnsBefore = this.txLog.length;
    this.txLog = this.txLog.filter(t => !ownedAgentIds.has(t.agentId));
    const transactionsDeleted = txnsBefore - this.txLog.length;

    for (const id of ownedAgentIds) {
      this.agents.delete(id);
      this.agentStatuses.delete(id);
    }
    const agentsDeleted = ownedAgentIds.size;

    let notificationsDeleted = 0;
    for (const [nid, n] of Array.from(this.notifs.entries())) {
      if (ownerKeys.has(n.userId)) {
        this.notifs.delete(nid);
        notificationsDeleted++;
      }
    }

    // NB: the user row is intentionally preserved so the session survives.
    return { user, agentsDeleted, memoriesDeleted, transactionsDeleted, notificationsDeleted, noncesDeleted: 0 };
  }

  // ─── Agents ───
  async getAgent(id: string) { return this.agents.get(id); }
  async listAgents(ownerId?: string) {
    const all = Array.from(this.agents.values());
    return ownerId ? all.filter(a => a.ownerId === ownerId) : all;
  }
  async createAgent(agent: InsertAgent): Promise<Agent> {
    const now = new Date();
    const full: Agent = {
      ...agent,
      website:              agent.website              ?? null,
      avatarUrl:            agent.avatarUrl            ?? null,
      metadataUri:          agent.metadataUri          ?? null,
      executionWallet:      agent.executionWallet      ?? null,
      brainAccountAddress:  agent.brainAccountAddress  ?? null,
      policy:               agent.policy               ?? null,
      tokenAddress:         agent.tokenAddress         ?? null,
      bondingCurveAddress:  agent.bondingCurveAddress  ?? null,
      aerodromePool:        agent.aerodromePool        ?? null,
      totalPaymentsExecuted: agent.totalPaymentsExecuted ?? 0,
      totalVolumeUsdc:      agent.totalVolumeUsdc      ?? "0",
      graduated:            agent.graduated            ?? false,
      status:               agent.status               ?? "active",
      createdAt: now,
      lastActiveAt: now,
    };
    this.agents.set(full.id, full);
    return full;
  }
  async updateAgent(id: string, updates: Partial<InsertAgent>): Promise<Agent | undefined> {
    const existing = this.agents.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, lastActiveAt: new Date() };
    this.agents.set(id, updated);
    return updated;
  }
  async deleteAgent(id: string): Promise<boolean> {
    return this.agents.delete(id);
  }
  async getAgentStatus(agentId: string): Promise<AgentStatus | undefined> {
    const agent = this.agents.get(agentId);
    if (agent) return agent.status as AgentStatus;
    return this.agentStatuses.get(agentId);
  }
  async setAgentStatus(agentId: string, status: AgentStatus): Promise<AgentStatus> {
    const agent = this.agents.get(agentId);
    if (agent) this.agents.set(agentId, { ...agent, status });
    this.agentStatuses.set(agentId, status);
    return status;
  }

  // ─── Marketplace ───
  async listMarketplaceListings(filters?: { category?: string; featured?: boolean; trending?: boolean }): Promise<MarketplaceListing[]> {
    let all = Array.from(this.marketplaceListings.values());
    if (filters?.category) all = all.filter(l => l.category === filters.category);
    if (filters?.featured !== undefined) all = all.filter(l => l.featured === filters.featured);
    if (filters?.trending !== undefined) all = all.filter(l => l.trending === filters.trending);
    return all;
  }

  // ─── Agent Memory ───
  async addMemory(memory: InsertAgentMemory): Promise<AgentMemory> {
    const full: AgentMemory = {
      id: randomUUID(),
      ...memory,
      actionType: memory.actionType ?? null,
      metadata: memory.metadata ?? null,
      createdAt: new Date(),
    };
    this.memories.push(full);
    return full;
  }
  async getMemories(agentId: string, limit = 20): Promise<AgentMemory[]> {
    return this.memories
      .filter(m => m.agentId === agentId)
      .slice(-limit);
  }

  // ─── Agent Transactions ───
  async addTransaction(tx: InsertAgentTransaction): Promise<AgentTransaction> {
    const full: AgentTransaction = {
      id: randomUUID(),
      ...tx,
      txHash: tx.txHash ?? null,
      intentHash: tx.intentHash ?? null,
      resourceUri: tx.resourceUri ?? null,
      amountUsdc: tx.amountUsdc ?? null,
      merchant: tx.merchant ?? null,
      status: tx.status ?? "pending",
      blockNumber: tx.blockNumber ?? null,
      createdAt: new Date(),
    };
    this.txLog.push(full);
    return full;
  }
  async getTransactions(agentId: string, limit = 50): Promise<AgentTransaction[]> {
    return this.txLog
      .filter(t => t.agentId === agentId)
      .slice(-limit)
      .reverse();
  }

  // ─── Notifications ───
  async getNotifications(userId: string, limit = 50): Promise<Notification[]> {
    return Array.from(this.notifs.values())
      .filter(n => n.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, limit);
  }
  async getUnreadCount(userId: string): Promise<number> {
    return Array.from(this.notifs.values())
      .filter(n => n.userId === userId && !n.read && n.type !== "insights")
      .length;
  }
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const full: Notification = {
      id: randomUUID(),
      ...notification,
      data: notification.data ?? null,
      read: notification.read ?? false,
      createdAt: new Date(),
    };
    this.notifs.set(full.id, full);
    return full;
  }
  async markAsRead(id: string): Promise<void> {
    const n = this.notifs.get(id);
    if (n) this.notifs.set(id, { ...n, read: true });
  }
  async deleteNotification(id: string): Promise<void> {
    this.notifs.delete(id);
  }

  // ─── Tool connections ───
  private toolConns = new Map<string, ToolConnection>(); // key = `${userId}::${toolId}`
  async listToolConnections(userId: string): Promise<ToolConnection[]> {
    return Array.from(this.toolConns.values()).filter(c => c.userId === userId);
  }
  async upsertToolConnection(conn: ToolConnection): Promise<ToolConnection> {
    this.toolConns.set(`${conn.userId}::${conn.toolId}`, conn);
    return conn;
  }
  async removeToolConnection(userId: string, toolId: string): Promise<boolean> {
    return this.toolConns.delete(`${userId}::${toolId}`);
  }

  // ─── Bank connections (Plaid) ───
  private bankConns = new Map<string, BankConnection>(); // key = `${userId}::${itemId}`
  async listBankConnections(userId: string): Promise<BankConnection[]> {
    return Array.from(this.bankConns.values()).filter(c => c.userId === userId);
  }
  async createBankConnection(conn: BankConnection): Promise<BankConnection> {
    this.bankConns.set(`${conn.userId}::${conn.itemId}`, conn);
    return conn;
  }
  async removeBankConnection(userId: string, itemId: string): Promise<boolean> {
    return this.bankConns.delete(`${userId}::${itemId}`);
  }

  private sourceDocs = new Map<string, SourceDocument>(); // key = id
  async listSourceDocuments(userId: string): Promise<SourceDocument[]> {
    return Array.from(this.sourceDocs.values())
      .filter(d => d.userId === userId)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }
  async createSourceDocument(doc: InsertSourceDocument): Promise<SourceDocument> {
    const created: SourceDocument = {
      id: randomUUID(),
      userId: doc.userId,
      name: doc.name,
      size: doc.size,
      mimeType: doc.mimeType ?? null,
      category: doc.category ?? null,
      uploadedAt: new Date().toISOString(),
    };
    this.sourceDocs.set(created.id, created);
    return created;
  }
  async removeSourceDocument(userId: string, id: string): Promise<boolean> {
    const existing = this.sourceDocs.get(id);
    if (!existing || existing.userId !== userId) return false;
    return this.sourceDocs.delete(id);
  }
}

// ─── PostgreSQL-backed implementation ───

const MARKETPLACE_SEED: Omit<MarketplaceListing, "id" | "createdAt">[] = [
  { agentId: "alpha-001", name: "AlphaFlow", description: "Executes automated trading strategies across DeFi protocols using momentum indicators and on-chain signals.", category: "trading", rating: "4.8", installs: 2341, price: "free", featured: true, trending: true, newAndNoteworthy: false, previewImages: [], capabilities: ["trading", "defi", "automation"] },
  { agentId: "yield-001", name: "Yield Pilot", description: "Manages capital allocation across DeFi protocols to maximize yield while respecting risk parameters.", category: "trading", rating: "4.6", installs: 1872, price: "free", featured: true, trending: true, newAndNoteworthy: false, previewImages: [], capabilities: ["lending", "yield", "defi"] },
  { agentId: "risk-001", name: "Risk Sentinel", description: "Continuously monitors positions and transactions for risk thresholds, liquidation danger, and anomalies.", category: "trading", rating: "4.9", installs: 3102, price: "free", featured: false, trending: true, newAndNoteworthy: false, previewImages: [], capabilities: ["risk", "monitoring", "alerts"] },
  { agentId: "signal-001", name: "Signal Seer", description: "Aggregates news, social signals, and on-chain data to generate actionable trading signals.", category: "research", rating: "4.5", installs: 1234, price: "free", featured: false, trending: true, newAndNoteworthy: false, previewImages: [], capabilities: ["research", "signals", "analytics"] },
  { agentId: "trend-001", name: "TrendRadar", description: "Detects emerging trends across markets, social platforms, and on-chain activity before they go mainstream.", category: "research", rating: "4.4", installs: 987, price: "free", featured: false, trending: true, newAndNoteworthy: false, previewImages: [], capabilities: ["research", "trends", "social"] },
  { agentId: "task-001", name: "TaskForge Pro", description: "Automates repetitive workflows across tools, APIs, and DeFi protocols with smart scheduling.", category: "automation", rating: "4.7", installs: 1567, price: "free", featured: false, trending: true, newAndNoteworthy: false, previewImages: [], capabilities: ["automation", "workflows", "scheduling"] },
  { agentId: "inbox-001", name: "InboxZero", description: "Manages email, filters priority messages, and drafts responses using context from your financial data.", category: "automation", rating: "4.3", installs: 756, price: "free", featured: false, trending: false, newAndNoteworthy: true, previewImages: [], capabilities: ["email", "productivity", "automation"] },
  { agentId: "ops-001", name: "Ops Commander", description: "Coordinates multi-step workflows across systems, APIs, and agents with dependency management.", category: "automation", rating: "4.5", installs: 843, price: "free", featured: false, trending: false, newAndNoteworthy: true, previewImages: [], capabilities: ["orchestration", "workflows", "multi-agent"] },
  { agentId: "pay-001", name: "Pay Stream", description: "Executes real-time payments for APIs and services using x402 machine-to-machine protocol.", category: "payments", rating: "4.6", installs: 1102, price: "free", featured: false, trending: false, newAndNoteworthy: true, previewImages: [], capabilities: ["payments", "x402", "automation"] },
  { agentId: "inv-001", name: "Invoice Bot", description: "Generates invoices, tracks payments, and automates collections for freelancers and businesses.", category: "payments", rating: "4.2", installs: 634, price: "free", featured: false, trending: false, newAndNoteworthy: true, previewImages: [], capabilities: ["invoicing", "payments", "accounting"] },
  { agentId: "deal-001", name: "Deal Closer", description: "Negotiates and executes transactions between agents using on-chain escrow and dispute resolution.", category: "payments", rating: "4.4", installs: 521, price: "free", featured: false, trending: false, newAndNoteworthy: true, previewImages: [], capabilities: ["negotiation", "escrow", "payments"] },
  { agentId: "swarm-001", name: "SwarmAlpha", description: "Coordinates multiple sub-agents to execute complex strategies that no single agent can handle alone.", category: "swarm", rating: "4.8", installs: 2891, price: "free", featured: false, trending: false, newAndNoteworthy: true, previewImages: [], capabilities: ["swarm", "multi-agent", "orchestration"] },
];

export class DatabaseStorage implements IStorage {
  async init() {
    const existing = await db.select().from(marketplaceListingsTable).limit(1);
    if (existing.length === 0) {
      await db.insert(marketplaceListingsTable).values(MARKETPLACE_SEED as any);
    }
  }

  // ─── Users ───
  async getUser(id: string): Promise<User | undefined> {
    const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    return row ?? undefined;
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [row] = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
    return row ?? undefined;
  }
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [row] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    return row ?? undefined;
  }
  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [row] = await db.select().from(usersTable).where(eq(usersTable.googleId, googleId)).limit(1);
    return row ?? undefined;
  }
  async getUserByWallet(walletAddress: string): Promise<User | undefined> {
    const [row] = await db.select().from(usersTable).where(eq(usersTable.walletAddress, walletAddress)).limit(1);
    return row ?? undefined;
  }
  async createUser(insertUser: InsertUser): Promise<User> {
    const [row] = await db.insert(usersTable).values(insertUser).returning();
    return row;
  }
  async updateUserWallet(id: string, walletAddress: string): Promise<User | undefined> {
    const [row] = await db.update(usersTable).set({ walletAddress }).where(eq(usersTable.id, id)).returning();
    return row ?? undefined;
  }

  async deleteUserAccount(ids: DeleteAccountIdentifiers): Promise<DeleteAccountResult> {
    // Locate the matching user row by wallet/id/email (username).
    const userConditions = [];
    if (ids.walletAddress) userConditions.push(eq(usersTable.walletAddress, ids.walletAddress));
    if (ids.userId)        userConditions.push(eq(usersTable.id, ids.userId));
    if (ids.email)         userConditions.push(eq(usersTable.username, ids.email));

    const [user] = userConditions.length
      ? await db.select().from(usersTable).where(or(...userConditions)).limit(1)
      : [undefined as User | undefined];

    // Build the set of owner identifiers used by agents.ownerId across the app.
    const ownerKeys = new Set<string>();
    if (user?.id)             ownerKeys.add(user.id);
    if (user?.walletAddress)  ownerKeys.add(user.walletAddress);
    if (ids.userId)           ownerKeys.add(ids.userId);
    if (ids.walletAddress)    ownerKeys.add(ids.walletAddress);
    if (ids.email)            ownerKeys.add(ids.email);
    const ownerKeyList = Array.from(ownerKeys);

    let agentsDeleted = 0;
    let memoriesDeleted = 0;
    let transactionsDeleted = 0;
    let notificationsDeleted = 0;
    let noncesDeleted = 0;

    // SIWE nonces are keyed by wallet — use the request wallet OR the resolved user's wallet.
    const walletForNonces = ids.walletAddress ?? user?.walletAddress;

    // Run the cascade atomically so a partial failure leaves no orphaned rows.
    await db.transaction(async (tx) => {
      if (ownerKeyList.length > 0) {
        const ownedAgents = await tx
          .select({ id: agentsTable.id })
          .from(agentsTable)
          .where(inArray(agentsTable.ownerId, ownerKeyList));
        const ownedAgentIds = ownedAgents.map(a => a.id);

        if (ownedAgentIds.length > 0) {
          const memDel = await tx
            .delete(agentMemoryTable)
            .where(inArray(agentMemoryTable.agentId, ownedAgentIds))
            .returning({ id: agentMemoryTable.id });
          memoriesDeleted = memDel.length;

          const txDel = await tx
            .delete(agentTransactionsTable)
            .where(inArray(agentTransactionsTable.agentId, ownedAgentIds))
            .returning({ id: agentTransactionsTable.id });
          transactionsDeleted = txDel.length;

          const agentDel = await tx
            .delete(agentsTable)
            .where(inArray(agentsTable.id, ownedAgentIds))
            .returning({ id: agentsTable.id });
          agentsDeleted = agentDel.length;
        }

        const notifDel = await tx
          .delete(notificationsTable)
          .where(inArray(notificationsTable.userId, ownerKeyList))
          .returning({ id: notificationsTable.id });
        notificationsDeleted = notifDel.length;
      }

      if (walletForNonces) {
        const nonceDel = await tx
          .delete(siweNoncesTable)
          .where(eq(siweNoncesTable.walletAddress, walletForNonces))
          .returning({ nonce: siweNoncesTable.nonce });
        noncesDeleted = nonceDel.length;
      }

      if (user) {
        await tx.delete(usersTable).where(eq(usersTable.id, user.id));
      }
    });

    return {
      user: user ?? null,
      agentsDeleted,
      memoriesDeleted,
      transactionsDeleted,
      notificationsDeleted,
      noncesDeleted,
    };
  }

  async deleteUserData(ids: DeleteAccountIdentifiers): Promise<DeleteAccountResult> {
    // Same cascade as deleteUserAccount, but the user row + SIWE nonces are kept
    // so the active session stays valid and the user can rebuild their data.
    const userConditions = [];
    if (ids.walletAddress) userConditions.push(eq(usersTable.walletAddress, ids.walletAddress));
    if (ids.userId)        userConditions.push(eq(usersTable.id, ids.userId));
    if (ids.email)         userConditions.push(eq(usersTable.username, ids.email));

    const [user] = userConditions.length
      ? await db.select().from(usersTable).where(or(...userConditions)).limit(1)
      : [undefined as User | undefined];

    const ownerKeys = new Set<string>();
    if (user?.id)             ownerKeys.add(user.id);
    if (user?.walletAddress)  ownerKeys.add(user.walletAddress);
    if (ids.userId)           ownerKeys.add(ids.userId);
    if (ids.walletAddress)    ownerKeys.add(ids.walletAddress);
    if (ids.email)            ownerKeys.add(ids.email);
    const ownerKeyList = Array.from(ownerKeys);

    let agentsDeleted = 0;
    let memoriesDeleted = 0;
    let transactionsDeleted = 0;
    let notificationsDeleted = 0;

    await db.transaction(async (tx) => {
      if (ownerKeyList.length > 0) {
        const ownedAgents = await tx
          .select({ id: agentsTable.id })
          .from(agentsTable)
          .where(inArray(agentsTable.ownerId, ownerKeyList));
        const ownedAgentIds = ownedAgents.map(a => a.id);

        if (ownedAgentIds.length > 0) {
          const memDel = await tx
            .delete(agentMemoryTable)
            .where(inArray(agentMemoryTable.agentId, ownedAgentIds))
            .returning({ id: agentMemoryTable.id });
          memoriesDeleted = memDel.length;

          const txDel = await tx
            .delete(agentTransactionsTable)
            .where(inArray(agentTransactionsTable.agentId, ownedAgentIds))
            .returning({ id: agentTransactionsTable.id });
          transactionsDeleted = txDel.length;

          const agentDel = await tx
            .delete(agentsTable)
            .where(inArray(agentsTable.id, ownedAgentIds))
            .returning({ id: agentsTable.id });
          agentsDeleted = agentDel.length;
        }

        const notifDel = await tx
          .delete(notificationsTable)
          .where(inArray(notificationsTable.userId, ownerKeyList))
          .returning({ id: notificationsTable.id });
        notificationsDeleted = notifDel.length;
      }
      // The user row and SIWE nonces are intentionally NOT deleted here.
    });

    return {
      user: user ?? null,
      agentsDeleted,
      memoriesDeleted,
      transactionsDeleted,
      notificationsDeleted,
      noncesDeleted: 0,
    };
  }

  // ─── Agents ───
  async getAgent(id: string): Promise<Agent | undefined> {
    const [row] = await db.select().from(agentsTable).where(eq(agentsTable.id, id)).limit(1);
    return row ?? undefined;
  }
  async listAgents(ownerId?: string): Promise<Agent[]> {
    if (ownerId) {
      return db.select().from(agentsTable).where(eq(agentsTable.ownerId, ownerId));
    }
    return db.select().from(agentsTable);
  }
  async createAgent(agent: InsertAgent): Promise<Agent> {
    const [row] = await db.insert(agentsTable).values(agent).returning();
    return row;
  }
  async updateAgent(id: string, updates: Partial<InsertAgent>): Promise<Agent | undefined> {
    const [row] = await db.update(agentsTable)
      .set({ ...updates, lastActiveAt: new Date() })
      .where(eq(agentsTable.id, id))
      .returning();
    return row ?? undefined;
  }
  async deleteAgent(id: string): Promise<boolean> {
    const result = await db.delete(agentsTable).where(eq(agentsTable.id, id)).returning({ id: agentsTable.id });
    return result.length > 0;
  }
  async getAgentStatus(agentId: string): Promise<AgentStatus | undefined> {
    const [row] = await db.select({ status: agentsTable.status }).from(agentsTable).where(eq(agentsTable.id, agentId)).limit(1);
    return (row?.status as AgentStatus) ?? undefined;
  }
  async setAgentStatus(agentId: string, status: AgentStatus): Promise<AgentStatus> {
    await db.update(agentsTable).set({ status }).where(eq(agentsTable.id, agentId));
    return status;
  }

  // ─── Marketplace ───
  async listMarketplaceListings(filters?: { category?: string; featured?: boolean; trending?: boolean }): Promise<MarketplaceListing[]> {
    const conditions = [];
    if (filters?.category) conditions.push(eq(marketplaceListingsTable.category, filters.category));
    if (filters?.featured !== undefined) conditions.push(eq(marketplaceListingsTable.featured, filters.featured));
    if (filters?.trending !== undefined) conditions.push(eq(marketplaceListingsTable.trending, filters.trending));
    if (conditions.length > 0) {
      return db.select().from(marketplaceListingsTable).where(and(...conditions));
    }
    return db.select().from(marketplaceListingsTable);
  }

  // ─── Agent Memory ───
  async addMemory(memory: InsertAgentMemory): Promise<AgentMemory> {
    const [row] = await db.insert(agentMemoryTable).values(memory).returning();
    return row;
  }
  async getMemories(agentId: string, limit = 20): Promise<AgentMemory[]> {
    return db.select().from(agentMemoryTable)
      .where(eq(agentMemoryTable.agentId, agentId))
      .orderBy(desc(agentMemoryTable.createdAt))
      .limit(limit);
  }

  // ─── Agent Transactions ───
  async addTransaction(tx: InsertAgentTransaction): Promise<AgentTransaction> {
    const [row] = await db.insert(agentTransactionsTable).values(tx).returning();
    return row;
  }
  async getTransactions(agentId: string, limit = 50): Promise<AgentTransaction[]> {
    return db.select().from(agentTransactionsTable)
      .where(eq(agentTransactionsTable.agentId, agentId))
      .orderBy(desc(agentTransactionsTable.createdAt))
      .limit(limit);
  }

  // ─── Notifications ───
  async getNotifications(userId: string, limit = 50): Promise<Notification[]> {
    return db.select().from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit);
  }
  async getUnreadCount(userId: string): Promise<number> {
    const [result] = await db.select({ value: count() }).from(notificationsTable)
      .where(and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.read, false),
        ne(notificationsTable.type, "insights"),
      ));
    return result?.value ?? 0;
  }
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [row] = await db.insert(notificationsTable).values(notification).returning();
    return row;
  }
  async markAsRead(id: string): Promise<void> {
    await db.update(notificationsTable).set({ read: true }).where(eq(notificationsTable.id, id));
  }
  async deleteNotification(id: string): Promise<void> {
    await db.delete(notificationsTable).where(eq(notificationsTable.id, id));
  }

  // ─── Tool connections (kept in-memory; no DB schema yet) ───
  private toolConns = new Map<string, ToolConnection>();
  async listToolConnections(userId: string): Promise<ToolConnection[]> {
    return Array.from(this.toolConns.values()).filter(c => c.userId === userId);
  }
  async upsertToolConnection(conn: ToolConnection): Promise<ToolConnection> {
    this.toolConns.set(`${conn.userId}::${conn.toolId}`, conn);
    return conn;
  }
  async removeToolConnection(userId: string, toolId: string): Promise<boolean> {
    return this.toolConns.delete(`${userId}::${toolId}`);
  }

  // ─── Bank connections (Plaid) ───
  async listBankConnections(userId: string): Promise<BankConnection[]> {
    const rows = await db
      .select()
      .from(bankConnectionsTable)
      .where(eq(bankConnectionsTable.userId, userId));
    return rows.map((r) => ({
      userId: r.userId,
      itemId: r.itemId,
      accessToken: r.accessToken,
      institutionId: r.institutionId,
      institutionName: r.institutionName,
      accounts: (r.accounts as BankAccount[]) ?? [],
      connectedAt: r.connectedAt.toISOString(),
    }));
  }
  async createBankConnection(conn: BankConnection): Promise<BankConnection> {
    await db
      .insert(bankConnectionsTable)
      .values({
        userId: conn.userId,
        itemId: conn.itemId,
        accessToken: conn.accessToken,
        institutionId: conn.institutionId,
        institutionName: conn.institutionName,
        accounts: conn.accounts,
        connectedAt: new Date(conn.connectedAt),
      })
      .onConflictDoUpdate({
        target: [bankConnectionsTable.userId, bankConnectionsTable.itemId],
        set: {
          accessToken: conn.accessToken,
          institutionId: conn.institutionId,
          institutionName: conn.institutionName,
          accounts: conn.accounts,
          connectedAt: new Date(conn.connectedAt),
        },
      });
    return conn;
  }
  async removeBankConnection(userId: string, itemId: string): Promise<boolean> {
    const res = await db
      .delete(bankConnectionsTable)
      .where(and(eq(bankConnectionsTable.userId, userId), eq(bankConnectionsTable.itemId, itemId)))
      .returning({ itemId: bankConnectionsTable.itemId });
    return res.length > 0;
  }

  // ─── Source documents ───
  async listSourceDocuments(userId: string): Promise<SourceDocument[]> {
    const rows = await db
      .select()
      .from(sourceDocumentsTable)
      .where(eq(sourceDocumentsTable.userId, userId))
      .orderBy(desc(sourceDocumentsTable.uploadedAt));
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      size: r.size,
      mimeType: r.mimeType,
      category: r.category,
      uploadedAt: r.uploadedAt.toISOString(),
    }));
  }
  async createSourceDocument(doc: InsertSourceDocument): Promise<SourceDocument> {
    const [row] = await db
      .insert(sourceDocumentsTable)
      .values({
        userId: doc.userId,
        name: doc.name,
        size: doc.size,
        mimeType: doc.mimeType ?? null,
        category: doc.category ?? null,
      })
      .returning();
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      size: row.size,
      mimeType: row.mimeType,
      category: row.category,
      uploadedAt: row.uploadedAt.toISOString(),
    };
  }
  async removeSourceDocument(userId: string, id: string): Promise<boolean> {
    const res = await db
      .delete(sourceDocumentsTable)
      .where(and(eq(sourceDocumentsTable.userId, userId), eq(sourceDocumentsTable.id, id)))
      .returning({ id: sourceDocumentsTable.id });
    return res.length > 0;
  }
}

async function createStorage(): Promise<IStorage> {
  if (process.env.DATABASE_URL) {
    const dbStorage = new DatabaseStorage();
    await dbStorage.init();
    return dbStorage;
  }
  return new MemStorage();
}

export const storage: IStorage = await createStorage();
