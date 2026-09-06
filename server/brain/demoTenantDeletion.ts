import { brainConfig } from "./config";
import type { IStorage } from "../storage";

const POLL_MS = 30_000;
const TIMEOUT_MS = 15 * 60_000;
let passInFlight = false;

function enabled() {
  return process.env.BRAIN_TENANT_DELETE_ENABLED === "true";
}

function endpoint(path: string) {
  // The configured Brain URLs conventionally already end in /v1.
  return `${brainConfig.demoBaseUrl.replace(/\/v1$/, "")}${path}`;
}

function errorText(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 1000);
  if (value && typeof value === "object") {
    const candidate = value as { error?: unknown; message?: unknown };
    const nestedError =
      candidate.error && typeof candidate.error === "object"
        ? (candidate.error as { message?: unknown; detail?: unknown }).message
          ?? (candidate.error as { detail?: unknown }).detail
        : candidate.error;
    const message = nestedError ?? candidate.message;
    if (typeof message === "string") return message.slice(0, 1000);
  }
  return "Brain tenant deletion request failed";
}

/** Drives remote deletion only for expired isolated demo tenants. It never uses a
 * member, platform, or demo credential; the dedicated admin JWT is mandatory. */
export async function processExpiredDemoTenantDeletions(storage: IStorage, olderThan: Date): Promise<void> {
  if (!enabled()) return;
  // Both the startup cron and the 30-second poller invoke this function.
  // A slow upstream response must not cause them to issue duplicate POSTs.
  if (passInFlight) return;
  passInFlight = true;
  try {
    const candidates = await storage.listExpiredDemoTenantCandidates(olderThan);
    if (process.env.BRAIN_TENANT_DELETE_DRY_RUN === "true") {
      for (const candidate of candidates) {
        console.log(`[demo-tenant-delete] dry-run candidate tenant=${candidate.tenantId}`);
      }
      return;
    }
    const jwt = process.env.BRAIN_TENANT_DELETE_JWT;
    if (!jwt) {
      console.warn("[demo-tenant-delete] enabled but BRAIN_TENANT_DELETE_JWT is not configured");
      return;
    }
    for (const candidate of candidates) {
      if (candidate.deletionStatus === "deleted" || candidate.deletionStatus === "protected_skipped") continue;
      if (candidate.deletionJobId && isActiveStatus(candidate.deletionStatus)) {
        await poll(storage, candidate.userId, candidate.tenantId, candidate.deletionJobId, candidate.deletionStartedAt, jwt);
        continue;
      }
      const claimedAt = new Date();
      const claimed = await storage.claimDemoTenantDeletionAttempt(candidate.userId, claimedAt);
      if (!claimed) continue;
      await start(storage, candidate.userId, candidate.tenantId, jwt, claimedAt);
    }
  } finally {
    passInFlight = false;
  }
}

function isActiveStatus(status: string | null): boolean {
  return status === "queued"
    || status === "fencing"
    || status === "deleting"
    || status === "purging_blobs";
}

async function start(storage: IStorage, userId: string, tenantId: string, jwt: string, attemptedAt: Date) {
  try {
    const response = await fetch(endpoint(`/v1/admin/tenants/${encodeURIComponent(tenantId)}/delete`), {
      method: "POST", headers: { Authorization: `Bearer ${jwt}` },
    });
    const json = await response.json().catch(() => ({}));
    if (response.status === 403) {
      console.warn(`[demo-tenant-delete] forbidden tenant=${tenantId}; automatic retries disabled`);
      await storage.updateDemoTenantLifecycle(userId, {
        deletionStatus: "protected_skipped",
        deletionJobId: null,
        deletionError: "protected tenant",
        deletionAttemptedAt: attemptedAt,
      });
      return;
    }
    if (!response.ok) {
      await storage.updateDemoTenantLifecycle(userId, { deletionStatus: "needs_attention", deletionError: errorText(json), deletionAttemptedAt: attemptedAt });
      return;
    }
    const jobId = typeof json.job_id === "string" ? json.job_id : typeof json.id === "string" ? json.id : undefined;
    if (!jobId) {
      await storage.updateDemoTenantLifecycle(userId, { deletionStatus: "needs_attention", deletionError: "Brain deletion response omitted job_id", deletionAttemptedAt: attemptedAt });
      return;
    }
    await storage.updateDemoTenantLifecycle(userId, {
      deletionStatus: "queued", deletionJobId: jobId, deletionError: null,
      deletionAttemptedAt: attemptedAt, deletionStartedAt: attemptedAt,
    });
  } catch (error) {
    await storage.updateDemoTenantLifecycle(userId, { deletionStatus: "needs_attention", deletionError: errorText(error), deletionAttemptedAt: attemptedAt });
  }
}

async function poll(storage: IStorage, userId: string, tenantId: string, jobId: string, startedAt: Date | null, jwt: string) {
  const now = new Date();
  if (!startedAt || now.getTime() - startedAt.getTime() >= TIMEOUT_MS) {
    await storage.updateDemoTenantLifecycle(userId, { deletionStatus: "needs_attention", deletionJobId: null, deletionError: "Deletion polling timed out after 15 minutes", deletionLastPolledAt: now });
    return;
  }
  try {
    const response = await fetch(endpoint(`/v1/admin/tenant-deletions/${encodeURIComponent(jobId)}`), { headers: { Authorization: `Bearer ${jwt}` } });
    const json = await response.json().catch(() => ({}));
    const status = typeof json.status === "string" ? json.status.toLowerCase() : "";
    if (response.status === 403) {
      console.warn(`[demo-tenant-delete] forbidden polling tenant=${tenantId}; automatic retries disabled`);
      await storage.updateDemoTenantLifecycle(userId, {
        deletionStatus: "protected_skipped",
        deletionJobId: null,
        deletionError: "protected tenant",
        deletionLastPolledAt: now,
      });
    } else if (!response.ok || status === "failed") {
      await storage.updateDemoTenantLifecycle(userId, { deletionStatus: "needs_attention", deletionJobId: null, deletionError: errorText(json), deletionLastPolledAt: now });
    } else if (status === "completed") {
      // Preserve the normal account/data cleanup semantics, then write the
      // terminal lifecycle record (which deliberately has no user-row FK).
      await storage.deleteUserAccount({ userId });
      await storage.updateDemoTenantLifecycle(userId, { deletionStatus: "deleted", deletionError: null, deletionCompletedAt: now, deletionLastPolledAt: now });
      console.log(`[demo-tenant-delete] completed tenant=${tenantId}; local user cleaned up`);
    } else {
      const nextStatus = isActiveStatus(status) ? status : "needs_attention";
      await storage.updateDemoTenantLifecycle(userId, {
        deletionStatus: nextStatus,
        deletionError: nextStatus === "needs_attention"
          ? `Unexpected Brain deletion status: ${status || "missing"}`
          : null,
        deletionLastPolledAt: now,
      });
    }
  } catch (error) {
    await storage.updateDemoTenantLifecycle(userId, { deletionStatus: "needs_attention", deletionError: errorText(error), deletionLastPolledAt: now });
  }
}

let timer: ReturnType<typeof setInterval> | undefined;
export function startDemoTenantDeletionPolling(storage: IStorage, olderThan: () => Date) {
  if (timer || !enabled()) return;
  timer = setInterval(() => { void processExpiredDemoTenantDeletions(storage, olderThan()).catch((error) => console.warn("[demo-tenant-delete] poll pass failed:", errorText(error))); }, POLL_MS);
  timer.unref?.();
}