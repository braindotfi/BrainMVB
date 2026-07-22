import { randomUUID } from "crypto";
import {
  type User, type InsertUser,
  type Notification, type InsertNotification,
  users as usersTable,
  notifications as notificationsTable,
  siweNonces as siweNoncesTable,
  type SiweNonce,
  bankConnections as bankConnectionsTable,
  sourceDocuments as sourceDocumentsTable,
  userRules as userRulesTable,
  brainIdentities as brainIdentitiesTable,
  type BrainIdentity, type InsertBrainIdentity,
  brainAgentTokens as brainAgentTokensTable,
  type BrainAgentToken,
} from "@shared/schema";
import { eq, and, or, inArray, desc, count, ne, isNull, gte, lt, sql } from "drizzle-orm";

import { db } from "./db";
import { encryptPlaidAccessToken, readPlaidAccessToken } from "./tokenCrypto";

export interface DeleteAccountIdentifiers {
  userId?: string;          // app user id (free-form)
  email?: string;           // mapped to users.username when SIWE created the row
  walletAddress?: string;   // canonical link to users.wallet_address
}

export interface DeleteAccountResult {
  user: User | null;
  notificationsDeleted: number;
  noncesDeleted: number;
  toolConnectionsDeleted: number;
  bankConnectionsDeleted: number;
  sourceDocumentsDeleted: number;
  userRulesDeleted: number;
  brainIdentitiesDeleted: number;
  brainAgentTokensDeleted: number;
}

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

  // Notifications
  getNotifications(userId: string, limit?: number): Promise<Notification[]>;
  getUnreadCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markAsRead(id: string): Promise<void>;
  deleteNotification(id: string): Promise<void>;
  deleteNotificationForUser(userId: string, id: string): Promise<boolean>;

  // SIWE nonces
  createSiweNonce(nonce: { nonce: string; walletAddress?: string | null; expiresAt: Date }): Promise<SiweNonce>;
  consumeSiweNonce(nonce: string): Promise<SiweNonce | undefined>;

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
  updateSourceDocumentExtraction(userId: string, id: string, patch: SourceDocumentExtractionPatch): Promise<SourceDocument | null>;
  removeSourceDocument(userId: string, id: string): Promise<boolean>;

  // User rules (authored via the "New rule" creator, per tenant)
  listUserRules(userId: string): Promise<UserRule[]>;
  createUserRule(rule: InsertUserRule): Promise<UserRule>;
  removeUserRule(userId: string, id: string): Promise<boolean>;

  // Brain identities (production tenancy: durable appUserId → external_ref/tenant mapping)
  getBrainIdentity(userId: string): Promise<BrainIdentity | undefined>;
  createBrainIdentity(identity: InsertBrainIdentity): Promise<BrainIdentity>;

  // Brain agent tokens (production tenancy: per-tenant agent principal, server-side only)
  getBrainAgentToken(tenantId: string): Promise<BrainAgentToken | undefined>;
  upsertBrainAgentToken(tenantId: string, token: string, expiresAt: Date): Promise<BrainAgentToken>;

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
  institutionId?: string | null;
  institutionName?: string | null;
  accounts: BankAccount[];
  connectedAt: string;     // ISO
};

async function revokePlaidTokens(accessTokens: string[]): Promise<void> {
  if (accessTokens.length === 0) return;
  let getPlaidClient: (() => { itemRemove: (arg: { access_token: string }) => Promise<unknown> }) | undefined;
  try {
    ({ getPlaidClient } = await import("./plaid"));
  } catch (err) {
    console.warn("[plaid] item revoke skipped:", (err as Error).message);
    return;
  }

  for (const token of accessTokens) {
    try {
      await getPlaidClient().itemRemove({ access_token: token });
    } catch (err) {
      console.warn("[plaid] item revoke failed:", (err as Error).message);
    }
  }
}

/** Where the uploaded file is in Brain's extraction pipeline (metadata mirror). */
export type ExtractStatus =
  | "pending"      // record created, not yet ingested to Brain
  | "ingested"     // bytes stored in Brain (raw_id assigned), extraction not triggered/settled
  | "extracting"   // extraction triggered, parsed record not yet materialized
  | "extracted"    // Brain produced a parsed record
  | "unsupported"  // Brain can't read this file type yet (e.g. scanned image - 422)
  | "unavailable"  // extraction endpoint not deployed yet (404)
  | "failed";      // ingest/extract errored

export type SourceDocument = {
  id: string;
  userId: string;
  name: string;
  size: number;            // bytes
  mimeType: string | null;
  category: string | null; // bank | accounting | payroll | tax | payments | general
  rawId: string | null;
  sha256: string | null;
  sourceType: string | null;     // pdf_upload | csv_upload
  extractStatus: ExtractStatus | null;
  parsedId: string | null;
  confidence: string | null;     // ≤0.5, stored as string
  uploadedAt: string;      // ISO
};

export type InsertSourceDocument = {
  userId: string;
  name: string;
  size: number;
  mimeType?: string | null;
  category?: string | null;
  rawId?: string | null;
  sha256?: string | null;
  sourceType?: string | null;
  extractStatus?: ExtractStatus | null;
  parsedId?: string | null;
  confidence?: string | null;
};

/** Patch applied after a Brain ingest/extract round-trip. */
export type SourceDocumentExtractionPatch = {
  rawId?: string | null;
  sha256?: string | null;
  sourceType?: string | null;
  extractStatus?: ExtractStatus | null;
  parsedId?: string | null;
  confidence?: string | null;
};

export type UserRule = {
  id: string;
  userId: string;
  name: string;
  summary: string;
  kind: "automation" | "guardrail" | "always_on";
  policyId: string;
  active: boolean;
  agent: string | null;
  category: string | null;
  cap: number | null;
  threshold: number | null;
  thresholdEditable: boolean | null;
  allowlist: string[] | null;
  scopeSummary: string | null;
  createdLabel: string;
};

export type InsertUserRule = {
  id: string;
  userId: string;
  name: string;
  summary?: string;
  kind?: "automation" | "guardrail" | "always_on";
  policyId: string;
  active?: boolean;
  agent?: string | null;
  category?: string | null;
  cap?: number | null;
  threshold?: number | null;
  thresholdEditable?: boolean | null;
  allowlist?: string[] | null;
  scopeSummary?: string | null;
  createdLabel?: string;
};

// ─── In-memory implementation (replace with Drizzle+PostgreSQL when DB is provisioned) ───

export class MemStorage implements IStorage {
  private users = new Map<string, User>();
  private notifs = new Map<string, Notification>();
  private siweNoncesStore = new Map<string, SiweNonce>();

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

    let notificationsDeleted = 0;
    for (const [nid, n] of Array.from(this.notifs.entries())) {
      if (ownerKeys.has(n.userId)) {
        this.notifs.delete(nid);
        notificationsDeleted++;
      }
    }

    const bankAccessTokens = Array.from(this.bankConns.values())
      .filter(c => ownerKeys.has(c.userId))
      .map(c => readPlaidAccessToken(c.accessToken));
    await revokePlaidTokens(bankAccessTokens);

    let toolConnectionsDeleted = 0;
    for (const [key, c] of Array.from(this.toolConns.entries())) {
      if (ownerKeys.has(c.userId)) {
        this.toolConns.delete(key);
        toolConnectionsDeleted++;
      }
    }

    let bankConnectionsDeleted = 0;
    for (const [key, c] of Array.from(this.bankConns.entries())) {
      if (ownerKeys.has(c.userId)) {
        this.bankConns.delete(key);
        bankConnectionsDeleted++;
      }
    }

    let sourceDocumentsDeleted = 0;
    for (const [key, d] of Array.from(this.sourceDocs.entries())) {
      if (ownerKeys.has(d.userId)) {
        this.sourceDocs.delete(key);
        sourceDocumentsDeleted++;
      }
    }

    let userRulesDeleted = 0;
    for (const [key, r] of Array.from(this.userRulesStore.entries())) {
      if (ownerKeys.has(r.userId)) {
        this.userRulesStore.delete(key);
        userRulesDeleted++;
      }
    }

    const tenantIds = new Set<string>();
    let brainIdentitiesDeleted = 0;
    for (const [key, identity] of Array.from(this.brainIdentitiesStore.entries())) {
      if (ownerKeys.has(identity.userId)) {
        tenantIds.add(identity.tenantId);
        this.brainIdentitiesStore.delete(key);
        brainIdentitiesDeleted++;
      }
    }

    let brainAgentTokensDeleted = 0;
    for (const tenantId of tenantIds) {
      const stillOwned = Array.from(this.brainIdentitiesStore.values()).some(i => i.tenantId === tenantId);
      if (!stillOwned && this.brainAgentTokensStore.delete(tenantId)) {
        brainAgentTokensDeleted++;
      }
    }

    let noncesDeleted = 0;
    for (const [nonce, row] of Array.from(this.siweNoncesStore.entries())) {
      if (row.walletAddress && ownerKeys.has(row.walletAddress)) {
        this.siweNoncesStore.delete(nonce);
        noncesDeleted++;
      }
    }

    if (user) this.users.delete(user.id);
    return {
      user,
      notificationsDeleted,
      noncesDeleted,
      toolConnectionsDeleted,
      bankConnectionsDeleted,
      sourceDocumentsDeleted,
      userRulesDeleted,
      brainIdentitiesDeleted,
      brainAgentTokensDeleted,
    };
  }

  async deleteUserData(ids: DeleteAccountIdentifiers): Promise<DeleteAccountResult> {
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

    let notificationsDeleted = 0;
    for (const [nid, n] of Array.from(this.notifs.entries())) {
      if (ownerKeys.has(n.userId)) {
        this.notifs.delete(nid);
        notificationsDeleted++;
      }
    }

    const bankAccessTokens = Array.from(this.bankConns.values())
      .filter(c => ownerKeys.has(c.userId))
      .map(c => readPlaidAccessToken(c.accessToken));
    await revokePlaidTokens(bankAccessTokens);

    let toolConnectionsDeleted = 0;
    for (const [key, c] of Array.from(this.toolConns.entries())) {
      if (ownerKeys.has(c.userId)) {
        this.toolConns.delete(key);
        toolConnectionsDeleted++;
      }
    }

    let bankConnectionsDeleted = 0;
    for (const [key, c] of Array.from(this.bankConns.entries())) {
      if (ownerKeys.has(c.userId)) {
        this.bankConns.delete(key);
        bankConnectionsDeleted++;
      }
    }

    let sourceDocumentsDeleted = 0;
    for (const [key, d] of Array.from(this.sourceDocs.entries())) {
      if (ownerKeys.has(d.userId)) {
        this.sourceDocs.delete(key);
        sourceDocumentsDeleted++;
      }
    }

    let userRulesDeleted = 0;
    for (const [key, r] of Array.from(this.userRulesStore.entries())) {
      if (ownerKeys.has(r.userId)) {
        this.userRulesStore.delete(key);
        userRulesDeleted++;
      }
    }

    const tenantIds = new Set<string>();
    let brainIdentitiesDeleted = 0;
    for (const [key, identity] of Array.from(this.brainIdentitiesStore.entries())) {
      if (ownerKeys.has(identity.userId)) {
        tenantIds.add(identity.tenantId);
        this.brainIdentitiesStore.delete(key);
        brainIdentitiesDeleted++;
      }
    }

    let brainAgentTokensDeleted = 0;
    for (const tenantId of tenantIds) {
      const stillOwned = Array.from(this.brainIdentitiesStore.values()).some(i => i.tenantId === tenantId);
      if (!stillOwned && this.brainAgentTokensStore.delete(tenantId)) {
        brainAgentTokensDeleted++;
      }
    }

    let noncesDeleted = 0;
    for (const [nonce, row] of Array.from(this.siweNoncesStore.entries())) {
      if (row.walletAddress && ownerKeys.has(row.walletAddress)) {
        this.siweNoncesStore.delete(nonce);
        noncesDeleted++;
      }
    }

    return {
      user,
      notificationsDeleted,
      noncesDeleted,
      toolConnectionsDeleted,
      bankConnectionsDeleted,
      sourceDocumentsDeleted,
      userRulesDeleted,
      brainIdentitiesDeleted,
      brainAgentTokensDeleted,
    };
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
  async deleteNotificationForUser(userId: string, id: string): Promise<boolean> {
    const n = this.notifs.get(id);
    if (!n || n.userId !== userId) return false;
    return this.notifs.delete(id);
  }

  async createSiweNonce(row: { nonce: string; walletAddress?: string | null; expiresAt: Date }): Promise<SiweNonce> {
    const full: SiweNonce = {
      nonce: row.nonce,
      walletAddress: row.walletAddress ?? null,
      expiresAt: row.expiresAt,
      createdAt: new Date(),
    };
    this.siweNoncesStore.set(full.nonce, full);
    return full;
  }
  async consumeSiweNonce(nonce: string): Promise<SiweNonce | undefined> {
    const row = this.siweNoncesStore.get(nonce);
    if (!row) return undefined;
    this.siweNoncesStore.delete(nonce);
    return row;
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
    return Array.from(this.bankConns.values())
      .filter(c => c.userId === userId)
      .map(c => ({ ...c, accessToken: readPlaidAccessToken(c.accessToken) }));
  }
  async createBankConnection(conn: BankConnection): Promise<BankConnection> {
    this.bankConns.set(`${conn.userId}::${conn.itemId}`, {
      ...conn,
      accessToken: encryptPlaidAccessToken(conn.accessToken),
    });
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
      rawId: doc.rawId ?? null,
      sha256: doc.sha256 ?? null,
      sourceType: doc.sourceType ?? null,
      extractStatus: doc.extractStatus ?? null,
      parsedId: doc.parsedId ?? null,
      confidence: doc.confidence ?? null,
      uploadedAt: new Date().toISOString(),
    };
    this.sourceDocs.set(created.id, created);
    return created;
  }
  async updateSourceDocumentExtraction(userId: string, id: string, patch: SourceDocumentExtractionPatch): Promise<SourceDocument | null> {
    const existing = this.sourceDocs.get(id);
    if (!existing || existing.userId !== userId) return null;
    const updated: SourceDocument = {
      ...existing,
      rawId: patch.rawId !== undefined ? patch.rawId : existing.rawId,
      sha256: patch.sha256 !== undefined ? patch.sha256 : existing.sha256,
      sourceType: patch.sourceType !== undefined ? patch.sourceType : existing.sourceType,
      extractStatus: patch.extractStatus !== undefined ? patch.extractStatus : existing.extractStatus,
      parsedId: patch.parsedId !== undefined ? patch.parsedId : existing.parsedId,
      confidence: patch.confidence !== undefined ? patch.confidence : existing.confidence,
    };
    this.sourceDocs.set(id, updated);
    return updated;
  }
  async removeSourceDocument(userId: string, id: string): Promise<boolean> {
    const existing = this.sourceDocs.get(id);
    if (!existing || existing.userId !== userId) return false;
    return this.sourceDocs.delete(id);
  }

  private userRulesStore = new Map<string, UserRule>(); // key = `${userId}::${id}`
  async listUserRules(userId: string): Promise<UserRule[]> {
    return Array.from(this.userRulesStore.values()).filter(r => r.userId === userId);
  }
  async createUserRule(rule: InsertUserRule): Promise<UserRule> {
    const created: UserRule = {
      id: rule.id,
      userId: rule.userId,
      name: rule.name,
      summary: rule.summary ?? "",
      kind: rule.kind ?? "automation",
      policyId: rule.policyId,
      active: rule.active ?? true,
      agent: rule.agent ?? null,
      category: rule.category ?? null,
      cap: rule.cap ?? null,
      threshold: rule.threshold ?? null,
      thresholdEditable: rule.thresholdEditable ?? null,
      allowlist: rule.allowlist ?? null,
      scopeSummary: rule.scopeSummary ?? null,
      createdLabel: rule.createdLabel ?? "You created this",
    };
    this.userRulesStore.set(`${created.userId}::${created.id}`, created);
    return created;
  }
  async removeUserRule(userId: string, id: string): Promise<boolean> {
    return this.userRulesStore.delete(`${userId}::${id}`);
  }

  // ─── Brain identities ───
  private brainIdentitiesStore = new Map<string, BrainIdentity>();
  async getBrainIdentity(userId: string): Promise<BrainIdentity | undefined> {
    return this.brainIdentitiesStore.get(userId);
  }
  async createBrainIdentity(identity: InsertBrainIdentity): Promise<BrainIdentity> {
    const row: BrainIdentity = {
      userId: identity.userId,
      externalRef: identity.externalRef,
      tenantId: identity.tenantId,
      memberId: identity.memberId ?? null,
      companyName: identity.companyName ?? null,
      linkedAt: new Date(),
    };
    this.brainIdentitiesStore.set(row.userId, row);
    return row;
  }

  // ─── Brain agent tokens ───
  private brainAgentTokensStore = new Map<string, BrainAgentToken>();
  async getBrainAgentToken(tenantId: string): Promise<BrainAgentToken | undefined> {
    return this.brainAgentTokensStore.get(tenantId);
  }
  async upsertBrainAgentToken(tenantId: string, token: string, expiresAt: Date): Promise<BrainAgentToken> {
    const row: BrainAgentToken = { tenantId, token, expiresAt, updatedAt: new Date() };
    this.brainAgentTokensStore.set(tenantId, row);
    return row;
  }

}

// ─── PostgreSQL-backed implementation ───

function mapSourceDocumentRow(r: typeof sourceDocumentsTable.$inferSelect): SourceDocument {
  return {
    id: r.id,
    userId: r.userId,
    name: r.name,
    size: r.size,
    mimeType: r.mimeType,
    category: r.category,
    rawId: r.rawId,
    sha256: r.sha256,
    sourceType: r.sourceType,
    extractStatus: (r.extractStatus as ExtractStatus | null) ?? null,
    parsedId: r.parsedId,
    confidence: r.confidence,
    uploadedAt: r.uploadedAt.toISOString(),
  };
}

export class DatabaseStorage implements IStorage {
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

    let notificationsDeleted = 0;
    let noncesDeleted = 0;
    let toolConnectionsDeleted = 0;
    let bankConnectionsDeleted = 0;
    let sourceDocumentsDeleted = 0;
    let userRulesDeleted = 0;
    let brainIdentitiesDeleted = 0;
    let brainAgentTokensDeleted = 0;

    const walletForNonces = ids.walletAddress ?? user?.walletAddress;
    const identities = ownerKeyList.length > 0
      ? await db.select().from(brainIdentitiesTable).where(inArray(brainIdentitiesTable.userId, ownerKeyList))
      : [];
    const tenantIds = identities.map((i) => i.tenantId);
    const bankRows = ownerKeyList.length > 0
      ? await db.select().from(bankConnectionsTable).where(inArray(bankConnectionsTable.userId, ownerKeyList))
      : [];
    const bankAccessTokens = bankRows
      .map((row) => readPlaidAccessToken(row.accessToken));
    await revokePlaidTokens(bankAccessTokens);

    await db.transaction(async (tx) => {
      if (ownerKeyList.length > 0) {
        const notifDel = await tx
          .delete(notificationsTable)
          .where(inArray(notificationsTable.userId, ownerKeyList))
          .returning({ id: notificationsTable.id });
        notificationsDeleted = notifDel.length;

        const bankDel = await tx
          .delete(bankConnectionsTable)
          .where(inArray(bankConnectionsTable.userId, ownerKeyList))
          .returning({ itemId: bankConnectionsTable.itemId });
        bankConnectionsDeleted = bankDel.length;

        const docsDel = await tx
          .delete(sourceDocumentsTable)
          .where(inArray(sourceDocumentsTable.userId, ownerKeyList))
          .returning({ id: sourceDocumentsTable.id });
        sourceDocumentsDeleted = docsDel.length;

        const rulesDel = await tx
          .delete(userRulesTable)
          .where(inArray(userRulesTable.userId, ownerKeyList))
          .returning({ id: userRulesTable.id });
        userRulesDeleted = rulesDel.length;

        const identitiesDel = await tx
          .delete(brainIdentitiesTable)
          .where(inArray(brainIdentitiesTable.userId, ownerKeyList))
          .returning({ userId: brainIdentitiesTable.userId });
        brainIdentitiesDeleted = identitiesDel.length;
      }

      if (walletForNonces) {
        const nonceDel = await tx
          .delete(siweNoncesTable)
          .where(eq(siweNoncesTable.walletAddress, walletForNonces))
          .returning({ nonce: siweNoncesTable.nonce });
        noncesDeleted = nonceDel.length;
      }

      if (tenantIds.length > 0) {
        const remaining = await tx
          .select()
          .from(brainIdentitiesTable)
          .where(inArray(brainIdentitiesTable.tenantId, tenantIds));
        const stillLinkedTenantIds = new Set(remaining.map((i) => i.tenantId));
        const tokenTenantIds = tenantIds.filter((tenantId) => !stillLinkedTenantIds.has(tenantId));
        if (tokenTenantIds.length > 0) {
          const tokenDel = await tx
            .delete(brainAgentTokensTable)
            .where(inArray(brainAgentTokensTable.tenantId, tokenTenantIds))
            .returning({ tenantId: brainAgentTokensTable.tenantId });
          brainAgentTokensDeleted = tokenDel.length;
        }
      }

      if (user) {
        await tx.delete(usersTable).where(eq(usersTable.id, user.id));
      }
    });

    if (ownerKeyList.length > 0) {
      for (const [key, c] of Array.from(this.toolConns.entries())) {
        if (ownerKeys.has(c.userId)) {
          this.toolConns.delete(key);
          toolConnectionsDeleted++;
        }
      }
    }

    return {
      user: user ?? null,
      notificationsDeleted,
      noncesDeleted,
      toolConnectionsDeleted,
      bankConnectionsDeleted,
      sourceDocumentsDeleted,
      userRulesDeleted,
      brainIdentitiesDeleted,
      brainAgentTokensDeleted,
    };
  }

  async deleteUserData(ids: DeleteAccountIdentifiers): Promise<DeleteAccountResult> {
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

    let notificationsDeleted = 0;
    let noncesDeleted = 0;
    let toolConnectionsDeleted = 0;
    let bankConnectionsDeleted = 0;
    let sourceDocumentsDeleted = 0;
    let userRulesDeleted = 0;
    let brainIdentitiesDeleted = 0;
    let brainAgentTokensDeleted = 0;
    const walletForNonces = ids.walletAddress ?? user?.walletAddress;
    const identities = ownerKeyList.length > 0
      ? await db.select().from(brainIdentitiesTable).where(inArray(brainIdentitiesTable.userId, ownerKeyList))
      : [];
    const tenantIds = identities.map((i) => i.tenantId);
    const bankRows = ownerKeyList.length > 0
      ? await db.select().from(bankConnectionsTable).where(inArray(bankConnectionsTable.userId, ownerKeyList))
      : [];
    const bankAccessTokens = bankRows
      .map((row) => readPlaidAccessToken(row.accessToken));
    await revokePlaidTokens(bankAccessTokens);

    await db.transaction(async (tx) => {
      if (ownerKeyList.length > 0) {
        const notifDel = await tx
          .delete(notificationsTable)
          .where(inArray(notificationsTable.userId, ownerKeyList))
          .returning({ id: notificationsTable.id });
        notificationsDeleted = notifDel.length;

        const bankDel = await tx
          .delete(bankConnectionsTable)
          .where(inArray(bankConnectionsTable.userId, ownerKeyList))
          .returning({ itemId: bankConnectionsTable.itemId });
        bankConnectionsDeleted = bankDel.length;

        const docsDel = await tx
          .delete(sourceDocumentsTable)
          .where(inArray(sourceDocumentsTable.userId, ownerKeyList))
          .returning({ id: sourceDocumentsTable.id });
        sourceDocumentsDeleted = docsDel.length;

        const rulesDel = await tx
          .delete(userRulesTable)
          .where(inArray(userRulesTable.userId, ownerKeyList))
          .returning({ id: userRulesTable.id });
        userRulesDeleted = rulesDel.length;

        const identitiesDel = await tx
          .delete(brainIdentitiesTable)
          .where(inArray(brainIdentitiesTable.userId, ownerKeyList))
          .returning({ userId: brainIdentitiesTable.userId });
        brainIdentitiesDeleted = identitiesDel.length;
      }

      if (walletForNonces) {
        const nonceDel = await tx
          .delete(siweNoncesTable)
          .where(eq(siweNoncesTable.walletAddress, walletForNonces))
          .returning({ nonce: siweNoncesTable.nonce });
        noncesDeleted = nonceDel.length;
      }

      if (tenantIds.length > 0) {
        const remaining = await tx
          .select()
          .from(brainIdentitiesTable)
          .where(inArray(brainIdentitiesTable.tenantId, tenantIds));
        const stillLinkedTenantIds = new Set(remaining.map((i) => i.tenantId));
        const tokenTenantIds = tenantIds.filter((tenantId) => !stillLinkedTenantIds.has(tenantId));
        if (tokenTenantIds.length > 0) {
          const tokenDel = await tx
            .delete(brainAgentTokensTable)
            .where(inArray(brainAgentTokensTable.tenantId, tokenTenantIds))
            .returning({ tenantId: brainAgentTokensTable.tenantId });
          brainAgentTokensDeleted = tokenDel.length;
        }
      }
    });

    if (ownerKeyList.length > 0) {
      for (const [key, c] of Array.from(this.toolConns.entries())) {
        if (ownerKeys.has(c.userId)) {
          this.toolConns.delete(key);
          toolConnectionsDeleted++;
        }
      }
    }

    return {
      user: user ?? null,
      notificationsDeleted,
      noncesDeleted,
      toolConnectionsDeleted,
      bankConnectionsDeleted,
      sourceDocumentsDeleted,
      userRulesDeleted,
      brainIdentitiesDeleted,
      brainAgentTokensDeleted,
    };
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
  async deleteNotificationForUser(userId: string, id: string): Promise<boolean> {
    const res = await db
      .delete(notificationsTable)
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.id, id)))
      .returning({ id: notificationsTable.id });
    return res.length > 0;
  }

  async createSiweNonce(row: { nonce: string; walletAddress?: string | null; expiresAt: Date }): Promise<SiweNonce> {
    const [created] = await db
      .insert(siweNoncesTable)
      .values({
        nonce: row.nonce,
        walletAddress: row.walletAddress ?? null,
        expiresAt: row.expiresAt,
      })
      .returning();
    return created;
  }
  async consumeSiweNonce(nonce: string): Promise<SiweNonce | undefined> {
    const [row] = await db
      .delete(siweNoncesTable)
      .where(eq(siweNoncesTable.nonce, nonce))
      .returning();
    return row ?? undefined;
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
      accessToken: readPlaidAccessToken(r.accessToken),
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
        accessToken: encryptPlaidAccessToken(conn.accessToken),
        institutionId: conn.institutionId,
        institutionName: conn.institutionName,
        accounts: conn.accounts,
        connectedAt: new Date(conn.connectedAt),
      })
      .onConflictDoUpdate({
        target: [bankConnectionsTable.userId, bankConnectionsTable.itemId],
        set: {
          accessToken: encryptPlaidAccessToken(conn.accessToken),
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
    return rows.map((r) => mapSourceDocumentRow(r));
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
        rawId: doc.rawId ?? null,
        sha256: doc.sha256 ?? null,
        sourceType: doc.sourceType ?? null,
        extractStatus: doc.extractStatus ?? null,
        parsedId: doc.parsedId ?? null,
        confidence: doc.confidence ?? null,
      })
      .returning();
    return mapSourceDocumentRow(row);
  }
  async updateSourceDocumentExtraction(userId: string, id: string, patch: SourceDocumentExtractionPatch): Promise<SourceDocument | null> {
    const values: Record<string, unknown> = {};
    if (patch.rawId !== undefined) values.rawId = patch.rawId;
    if (patch.sha256 !== undefined) values.sha256 = patch.sha256;
    if (patch.sourceType !== undefined) values.sourceType = patch.sourceType;
    if (patch.extractStatus !== undefined) values.extractStatus = patch.extractStatus;
    if (patch.parsedId !== undefined) values.parsedId = patch.parsedId;
    if (patch.confidence !== undefined) values.confidence = patch.confidence;
    if (Object.keys(values).length === 0) {
      const [row] = await db
        .select()
        .from(sourceDocumentsTable)
        .where(and(eq(sourceDocumentsTable.userId, userId), eq(sourceDocumentsTable.id, id)));
      return row ? mapSourceDocumentRow(row) : null;
    }
    const [row] = await db
      .update(sourceDocumentsTable)
      .set(values)
      .where(and(eq(sourceDocumentsTable.userId, userId), eq(sourceDocumentsTable.id, id)))
      .returning();
    return row ? mapSourceDocumentRow(row) : null;
  }
  async removeSourceDocument(userId: string, id: string): Promise<boolean> {
    const res = await db
      .delete(sourceDocumentsTable)
      .where(and(eq(sourceDocumentsTable.userId, userId), eq(sourceDocumentsTable.id, id)))
      .returning({ id: sourceDocumentsTable.id });
    return res.length > 0;
  }

  // ─── User rules ───
  async listUserRules(userId: string): Promise<UserRule[]> {
    const rows = await db
      .select()
      .from(userRulesTable)
      .where(eq(userRulesTable.userId, userId))
      .orderBy(desc(userRulesTable.createdAt));
    return rows.map(mapUserRuleRow);
  }
  async createUserRule(rule: InsertUserRule): Promise<UserRule> {
    const [row] = await db
      .insert(userRulesTable)
      .values({
        id: rule.id,
        userId: rule.userId,
        name: rule.name,
        summary: rule.summary ?? "",
        kind: rule.kind ?? "automation",
        policyId: rule.policyId,
        active: rule.active ?? true,
        agent: rule.agent ?? null,
        category: rule.category ?? null,
        cap: rule.cap ?? null,
        threshold: rule.threshold ?? null,
        thresholdEditable: rule.thresholdEditable ?? null,
        allowlist: rule.allowlist ?? null,
        scopeSummary: rule.scopeSummary ?? null,
        createdLabel: rule.createdLabel ?? "You created this",
      })
      .onConflictDoUpdate({
        target: [userRulesTable.userId, userRulesTable.id],
        set: {
          name: rule.name,
          summary: rule.summary ?? "",
          kind: rule.kind ?? "automation",
          policyId: rule.policyId,
          active: rule.active ?? true,
          agent: rule.agent ?? null,
          category: rule.category ?? null,
          cap: rule.cap ?? null,
          threshold: rule.threshold ?? null,
          thresholdEditable: rule.thresholdEditable ?? null,
          allowlist: rule.allowlist ?? null,
          scopeSummary: rule.scopeSummary ?? null,
          createdLabel: rule.createdLabel ?? "You created this",
        },
      })
      .returning();
    return mapUserRuleRow(row);
  }
  async removeUserRule(userId: string, id: string): Promise<boolean> {
    const res = await db
      .delete(userRulesTable)
      .where(and(eq(userRulesTable.userId, userId), eq(userRulesTable.id, id)))
      .returning({ id: userRulesTable.id });
    return res.length > 0;
  }

  // ─── Brain identities ───
  async getBrainIdentity(userId: string): Promise<BrainIdentity | undefined> {
    const [row] = await db
      .select()
      .from(brainIdentitiesTable)
      .where(eq(brainIdentitiesTable.userId, userId))
      .limit(1);
    return row ?? undefined;
  }
  async createBrainIdentity(identity: InsertBrainIdentity): Promise<BrainIdentity> {
    const [row] = await db.insert(brainIdentitiesTable).values(identity).returning();
    return row;
  }

  // ─── Brain agent tokens ───
  async getBrainAgentToken(tenantId: string): Promise<BrainAgentToken | undefined> {
    const [row] = await db
      .select()
      .from(brainAgentTokensTable)
      .where(eq(brainAgentTokensTable.tenantId, tenantId))
      .limit(1);
    return row ?? undefined;
  }
  async upsertBrainAgentToken(tenantId: string, token: string, expiresAt: Date): Promise<BrainAgentToken> {
    const [row] = await db
      .insert(brainAgentTokensTable)
      .values({ tenantId, token, expiresAt, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: brainAgentTokensTable.tenantId,
        set: { token, expiresAt, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

}

function mapUserRuleRow(r: typeof userRulesTable.$inferSelect): UserRule {
  return {
    id: r.id,
    userId: r.userId,
    name: r.name,
    summary: r.summary,
    kind: r.kind as UserRule["kind"],
    policyId: r.policyId,
    active: r.active,
    agent: r.agent,
    category: r.category,
    cap: r.cap,
    threshold: r.threshold,
    thresholdEditable: r.thresholdEditable,
    allowlist: r.allowlist,
    scopeSummary: r.scopeSummary,
    createdLabel: r.createdLabel,
  };
}

async function createStorage(): Promise<IStorage> {
  if (process.env.DATABASE_URL) {
    return new DatabaseStorage();
  }
  return new MemStorage();
}

export const storage: IStorage = await createStorage();

