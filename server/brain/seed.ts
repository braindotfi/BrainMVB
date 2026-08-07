/**
 * One-time starter seed for a freshly created DURABLE tenant (config.brainDurableTenancy).
 *
 * Runs the five demo documents through the SAME pipeline the Add Source modal uses:
 *   local sourceDocuments metadata record → brain-core /raw/ingest → /raw/{id}/extract.
 * That fires brain-core's full interpretation/projection/wiki path, so the Home and
 * Finances numbers come from whatever the tenant's ledger actually derives — nothing
 * is hardcoded client-side.
 *
 * The documents are GENERATED AT SEED TIME (server/brain/demo-seed/), not read from
 * disk, so their dates are always relative to when the tenant was created. They used to
 * be static files pinned to June 2026, which slid out of the trailing windows the UI
 * queries as wall-clock time passed. See demo-seed/scenario.ts for the date model.
 *
 * Invoked exactly once, fire-and-forget, right after tenant creation in auth.ts.
 * Failures are LOUD (console.error + "failed"/"unavailable" document statuses the UI
 * shows honestly) but never block the login/session path. It is never re-run for an
 * existing tenant: the caller only invokes it in the create-tenant branch.
 */

import { storage } from "../storage";
import { ingestRawDocument, pollRawExtraction, BrainApiError } from "./client";
import { extractStatusForJob } from "./extractStatus";
import { getSeedDocuments, SEED_MANIFEST as MANIFEST } from "./demo-seed/documents";
import { withBrainBaseUrl } from "./baseUrl";
import { brainConfig } from "./config";
import type { ExtractStatus } from "../storage";

export { SEED_MANIFEST } from "./demo-seed/documents";
export type { SeedDocument, SeedManifestEntry } from "./demo-seed/documents";

/**
 * Ingest the generated seed documents into the user's (just-created) tenant using the
 * provided ingest-capable token (the AGENT token in durable mode - the durable member
 * token lacks the raw:write scope; verified live 2026-07-24). Sequential on purpose:
 * predictable ordering in the documents list and no burst against /raw/ingest. Each
 * file is independent — one failure does not stop the others.
 */
export async function seedTenantDocuments(appUserId: string, ingestToken: string, baseUrl?: string): Promise<void> {
  const run = withBrainBaseUrl(baseUrl ?? brainConfig.baseUrl, () => runSeed(appUserId, ingestToken));
  inFlightSeeds.add(run);
  seedingUsers.set(appUserId, (seedingUsers.get(appUserId) ?? 0) + 1);
  try {
    await run;
  } finally {
    inFlightSeeds.delete(run);
    const left = (seedingUsers.get(appUserId) ?? 1) - 1;
    if (left > 0) seedingUsers.set(appUserId, left);
    else seedingUsers.delete(appUserId);
  }
}

/**
 * Which users have a seed run in flight RIGHT NOW.
 *
 * `inFlightSeeds` below answers "is anything seeding" for tests and shutdown; this
 * answers "is THIS user's tenant still filling up", which is a question the UI has to
 * ask on every read of their ledger.
 *
 * Why the UI cannot work it out for itself: a seed ingests its documents one at a
 * time, and each one's ledger rows appear only when brain-core finishes projecting
 * it. For the first seconds of a new tenant there are no documents and no rows, which
 * is indistinguishable — from the client — from a tenant that genuinely has nothing.
 * It once wasn't: a fresh tenant showed a confident $211,200.00 owed against a real
 * $287,223.39, with nothing on screen to suggest the figure was a floor. The server
 * kicked the seed off and is the only party that knows it is still running, so it
 * says so rather than leaving the client to infer it from an absence.
 *
 * A count, not a flag: the same user can (in principle) have two runs in flight, and
 * the first to finish must not clear the second's signal.
 *
 * In-memory and per-process, so a restart mid-seed reports "not seeding". That
 * degrades to today's behaviour rather than to a wrong answer, and a seed does not
 * survive the restart either.
 */
const seedingUsers = new Map<string, number>();

export function isSeedInFlight(appUserId: string): boolean {
  return (seedingUsers.get(appUserId) ?? 0) > 0;
}

/**
 * Is this tenant still filling up — including before the seed has started, and after a
 * restart forgot it?
 *
 * `isSeedInFlight` only knows about a run this process is currently performing. Two
 * stretches sit outside it, and the figures on screen are provisional in both:
 *
 *   - **Before it starts.** A demo tenant is provisioned lazily, on the session's
 *     first brain call, and only then are documents ingested. Measured: nothing is in
 *     flight and no document exists for the first seconds of a new account.
 *   - **After a restart.** The in-flight set is per-process.
 *
 * Both are covered by a durable fact rather than more in-memory state: a seeded demo
 * tenant ends up with the whole starter manifest, so a demo account holding fewer
 * documents than that has not finished being set up.
 *
 * `expectedWithinMs` bounds it. A user who later deletes a starter document must not
 * be told forever that their ledger is still importing — this flag exists to caveat a
 * figure while it is genuinely provisional, not to add a permanent disclaimer.
 */
export function seedStillExpected(input: {
  inFlight: boolean;
  isDemo: boolean;
  createdAt: Date | null | undefined;
  documentCount: number;
  expectedDocuments?: number;
  expectedWithinMs: number;
  now: number;
}): boolean {
  if (input.inFlight) return true;
  // Only demo accounts are ever seeded. A real account starts empty and stays empty
  // until its owner connects something, so "fewer documents than the manifest" says
  // nothing at all about it.
  if (!input.isDemo) return false;
  if (input.createdAt == null) return false;
  if (input.now - input.createdAt.getTime() > input.expectedWithinMs) return false;
  return input.documentCount < (input.expectedDocuments ?? SEED_MANIFEST_LENGTH);
}

/** How many documents a fully seeded demo tenant ends up with. */
const SEED_MANIFEST_LENGTH = MANIFEST.length;

/**
 * Seeding is fire-and-forget off the login path, so nothing normally awaits it. This
 * handle lets a caller that DOES need it to be finished - a test asserting on the
 * resulting documents, or a graceful-shutdown path - wait for every in-flight run to
 * settle instead of racing it with a sleep.
 */
const inFlightSeeds = new Set<Promise<unknown>>();

/** Wall-clock budget for whenSeedsSettle(). Comfortably longer than a real seed run
 *  (5 files x brain-core's async extract poll) so only a genuinely stuck run trips it. */
const SETTLE_TIMEOUT_MS = 5 * 60_000;

export async function whenSeedsSettle(timeoutMs = SETTLE_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  // Each pass drains the current set, then yields so the `finally` blocks above can
  // remove the settled entries before we look for runs that started in the meantime.
  // Bounded by wall clock, not by pass count: a seed whose fetch stalls would otherwise
  // park the caller (a test barrier, a shutdown hook) forever.
  while (inFlightSeeds.size > 0) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.allSettled([...inFlightSeeds]),
      new Promise((r) => {
        timer = setTimeout(r, remaining);
      }),
    ]);
    if (timer) clearTimeout(timer);
    await new Promise((r) => setTimeout(r, 0));
  }
  if (inFlightSeeds.size > 0) {
    // Never return silently as if the work were done - a caller that assumes a clean
    // slate would otherwise attribute the stalled run's side effects to whatever runs next.
    console.warn(`[brain-seed] ${inFlightSeeds.size} seed run(s) still in flight after ${timeoutMs}ms`);
    return false;
  }
  return true;
}

async function runSeed(appUserId: string, ingestToken: string): Promise<void> {
  // Generation is pure computation over the current date; if it throws, there is no
  // partial seed to reconcile, so fail the whole run loudly rather than per file.
  let documents;
  try {
    documents = await getSeedDocuments(new Date());
  } catch (err) {
    console.error("[brain-seed] could not generate the demo documents:", (err as Error).message);
    return;
  }

  for (const file of documents) {
    let doc;
    try {
      // 1. Local metadata record (bytes are NOT persisted here - they live in Brain).
      doc = await storage.createSourceDocument({
        userId: appUserId,
        name: file.filename,
        size: file.bytes.length,
        mimeType: file.mimeType,
        category: file.category,
        sourceType: file.sourceType,
        extractStatus: "pending",
      });

      // 2. Ingest bytes to brain-core.
      const ingest = await ingestRawDocument(ingestToken, {
        sourceType: file.sourceType,
        bytes: new Uint8Array(file.bytes),
        filename: file.filename,
        mimeType: file.mimeType,
      });
      await storage.updateSourceDocumentExtraction(appUserId, doc.id, {
        rawId: ingest.raw_id,
        sha256: ingest.sha256,
        extractStatus: "ingested",
      });

      // 3. Trigger extraction and WAIT for brain-core's job to settle. The extract call is
      // async (first response is 202/"queued" with parsed_id: null), so returning on the
      // first response recorded "extracted" with a null parsed_id forever. Nobody is waiting
      // on this seed (fire-and-forget after tenant create), so polling here is free.
      // Status mapping mirrors the /api/integrations/documents/ingest route
      // (422 → unsupported; 404/other → unavailable).
      let extractStatus: ExtractStatus = "extracting";
      let parsedId: string | null = null;
      let confidence: string | null = null;
      try {
        const extract = await pollRawExtraction(ingestToken, ingest.raw_id);
        extractStatus = extractStatusForJob(extract);
        if (extractStatus === "failed") {
          console.warn(`[brain-seed] extraction ${extract.status} for ${file.filename}: ${extract.error ?? "no detail"}`);
        } else if (extractStatus === "extracting") {
          // Budget exhausted while still queued/running - say so instead of claiming success.
          console.warn(`[brain-seed] extraction still ${extract.status ?? "pending"} for ${file.filename} after poll budget`);
        }
        parsedId = extract.parsed_id;
        confidence = extract.confidence !== null ? String(extract.confidence) : null;
      } catch (err) {
        if (err instanceof BrainApiError && err.status === 422) {
          extractStatus = "unsupported";
        } else {
          const detail = err instanceof BrainApiError ? `status=${err.status}` : (err as Error).message;
          console.warn(`[brain-seed] extract failed for ${file.filename} (${detail})`);
          extractStatus = "unavailable";
        }
      }
      await storage.updateSourceDocumentExtraction(appUserId, doc.id, { extractStatus, parsedId, confidence });
      console.log(`[brain-seed] ${file.filename} → ${extractStatus}`);
    } catch (err) {
      console.error(`[brain-seed] ingest failed for ${file.filename}:`, (err as Error).message);
      if (doc) {
        await storage
          .updateSourceDocumentExtraction(appUserId, doc.id, { extractStatus: "failed" })
          .catch(() => undefined);
      }
    }
  }
}
