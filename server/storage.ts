import { type User, type InsertUser } from "@shared/schema";
import { randomUUID } from "crypto";

// modify the interface with any CRUD methods
// you might need

export type AgentStatus = "active" | "inactive" | "paused";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAgentStatus(agentId: string): Promise<AgentStatus | undefined>;
  setAgentStatus(agentId: string, status: AgentStatus): Promise<AgentStatus>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private agentStatuses: Map<string, AgentStatus>;

  constructor() {
    this.users = new Map();
    this.agentStatuses = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getAgentStatus(agentId: string): Promise<AgentStatus | undefined> {
    return this.agentStatuses.get(agentId);
  }

  async setAgentStatus(agentId: string, status: AgentStatus): Promise<AgentStatus> {
    this.agentStatuses.set(agentId, status);
    return status;
  }
}

export const storage = new MemStorage();
