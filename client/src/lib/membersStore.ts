import { useSyncExternalStore } from "react";
import type { BrainMember } from "./membersApi";

/* Members store — a lightweight module-global cache + a "which member is open"
   signal, shared via useSyncExternalStore so any surface (Settings → Team, an
   audit record's ACTOR label, a receipt) resolves a member the SAME way.

   This is a CACHE, not a source of truth: brain-core is authoritative. The Members
   page primes it after every successful fetch/mutation; `resolveMember(id)` reads
   it synchronously for label rendering, and the detail popup independently re-fetches
   the authoritative record by id (so a deactivated member — which is dropped from the
   active list but still GET-able by id — still resolves and opens). */

let cache = new Map<string, BrainMember>();
let openId: string | null = null;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/* ── cache ─────────────────────────────────────────────── */

/** Wipe the entire members cache + any open detail. MUST be called on an auth
    boundary (logout / account deletion) so a next session/tenant can never see a
    previous tenant's cached members (the cache is merge-only within a session to
    keep deactivated members resolvable, so it needs an explicit session reset). */
export function clearMembers(): void {
  if (cache.size === 0 && openId === null) return;
  cache = new Map();
  openId = null;
  emit();
}

/** Replace/merge the cache from a list fetch. Merges (doesn't wipe) so a
    previously-seen deactivated member stays resolvable after it leaves the list. */
export function primeMembers(members: BrainMember[]): void {
  const next = new Map(cache);
  for (const m of members) next.set(m.id, m);
  cache = next;
  emit();
}

/** Prime/replace a single member (used after a detail fetch or a mutation). */
export function primeMember(member: BrainMember): void {
  const next = new Map(cache);
  next.set(member.id, member);
  cache = next;
  emit();
}

export function getCachedMember(id: string | null | undefined): BrainMember | undefined {
  if (!id) return undefined;
  return cache.get(id);
}

/** Synchronous resolver for label rendering. Deactivated members still resolve. */
export function resolveMember(id: string | null | undefined): BrainMember | undefined {
  return getCachedMember(id);
}

/** Resolve a cached member from an actor identity (email/id tokens). Used to make an
    audit-record ACTOR label tappable ONLY when it maps to a real core member — never
    a client-side authority claim, just a link to core's record. Returns undefined
    (→ plain text) when no core member matches. */
export function resolveMemberByTokens(tokens: string[]): BrainMember | undefined {
  if (!tokens.length) return undefined;
  const set = new Set(tokens.map((t) => t.trim().toLowerCase()).filter(Boolean));
  if (!set.size) return undefined;
  for (const m of Array.from(cache.values())) {
    if (set.has(m.id.toLowerCase()) || set.has(m.email.trim().toLowerCase())) return m;
  }
  return undefined;
}

function getCacheSnapshot(): Map<string, BrainMember> {
  return cache;
}

export function useMembersCache(): Map<string, BrainMember> {
  return useSyncExternalStore(subscribe, getCacheSnapshot, getCacheSnapshot);
}

/* ── open-detail signal ────────────────────────────────── */

export function openMemberDetail(id: string): void {
  openId = id;
  emit();
}

export function closeMemberDetail(): void {
  if (openId === null) return;
  openId = null;
  emit();
}

function getOpenIdSnapshot(): string | null {
  return openId;
}

export function useOpenMemberId(): string | null {
  return useSyncExternalStore(subscribe, getOpenIdSnapshot, getOpenIdSnapshot);
}
