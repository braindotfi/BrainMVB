import { randomUUID } from "crypto";
import {
  type User, type InsertUser,
  type Agent, type InsertAgent,
  type AgentMemory, type InsertAgentMemory,
  type AgentTransaction, type InsertAgentTransaction,
  type Notification, type InsertNotification,
  type MarketplaceListing,
} from "@shared/schema";

export type AgentStatus = "active" | "inactive" | "paused";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByWallet(walletAddress: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserWallet(id: string, walletAddress: string): Promise<User | undefined>;

  // Agents
  getAgent(id: string): Promise<Agent | undefined>;
  listAgents(ownerId?: string): Promise<Agent[]>;
  createAgent(agent: InsertAgent): Promise<Agent>;
  updateAgent(id: string, updates: Partial<InsertAgent>): Promise<Agent | undefined>;
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
}

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
  async getUserByWallet(walletAddress: string) {
    return Array.from(this.users.values()).find(u => u.walletAddress === walletAddress);
  }
  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id, walletAddress: insertUser.walletAddress ?? null, createdAt: new Date() };
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
      totalPaymentsExecuted: agent.totalPaymentsExecuted ?? 0,
      totalVolumeUsdc: agent.totalVolumeUsdc ?? "0",
      graduated: agent.graduated ?? false,
      status: agent.status ?? "active",
      avatarUrl: agent.avatarUrl ?? null,
      metadataUri: agent.metadataUri ?? null,
      executionWallet: agent.executionWallet ?? null,
      brainAccountAddress: agent.brainAccountAddress ?? null,
      policy: agent.policy ?? null,
      tokenAddress: agent.tokenAddress ?? null,
      bondingCurveAddress: agent.bondingCurveAddress ?? null,
      aerodromePool: agent.aerodromePool ?? null,
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
    return Array.from(this.notifs.values()).filter(n => n.userId === userId && !n.read).length;
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
}

export const storage = new MemStorage();
