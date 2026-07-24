// One-off: manually run the starter seed for an existing durable tenant whose
// automatic seed failed (member token lacked raw:write before the agent-token fix).
import { storage } from "../server/storage";
import { seedTenantDocuments } from "../server/brain/seed";

const userId = process.argv[2];
if (!userId) throw new Error("usage: tsx scripts/run-seed-once.ts <appUserId>");
const identity = await storage.getBrainIdentity(userId);
if (!identity) throw new Error("no identity row");
const agent = await storage.getBrainAgentToken(identity.tenantId);
if (!agent) throw new Error("no agent token row");
await seedTenantDocuments(userId, agent.token);
console.log("seed complete for", identity.tenantId);
