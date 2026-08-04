---
name: Brain agent type resolution
description: How to correctly recover a proposal's agent type key (e.g. "collections") for audit record badge display after the proposal is decided and removed from the live feed.
---

## The Problem

brain-core's `proposal.decided` audit event carries `outputs.proposal_summary.proposing_agent` which is the **execution agent ULID** (e.g. `"agent_01KZ..."`), not the analysis agent type key (e.g. `"collections"`). The execution agent's display_name from the registry is a generic name like `"Demo Payment Agent"` regardless of the functional proposal category.

The only reliable source of the agent type key is the live proposal's `p.type` field — available **before** the decision is made.

**Why:** brain-core uses a single payment execution agent for multiple proposal types. The `proposing_agent` field is the executor, not the classifier.

## The Correct Fix

Pass `needsReviewProposals` from InboxPage directly into `useBrainAuditRecords`. Inside the hook, use a `useRef` accumulating map that's populated **inline** (synchronously, before any `useMemo` in the same hook call):

```typescript
export function useBrainAuditRecords(proposals?: ProposalForTracking[]) {
  const proposalTypeMapRef = useRef(new Map<string, string>());
  // Inline: runs before any useMemo in this hook, guaranteed current
  for (const p of proposals ?? []) {
    if (p.id && p.type) proposalTypeMapRef.current.set(p.id, p.type);
  }
  // records useMemo passes proposalTypeMapRef.current to mapAuditEventToRecord
}
```

The ref is **accumulating** (never clears entries), so the type key is available even after the proposal is decided and removed from the proposals feed.

**Why the module-level cache approach (PR #71) failed:**
1. Entries were set as a side effect inside a `useMemo` — React can skip or discard memos
2. Mutations to a module-level `Map` don't cause `useBrainAuditRecords`'s `records` useMemo to re-run
3. So even if the cache was populated in a previous render, nothing re-triggered the records computation

**Why the useRef inline approach works:**
- Inline code runs on EVERY render, before any `useMemo` in the hook
- The records useMemo reads `proposalTypeMapRef.current` which is always up-to-date
- The useMemo only runs when `events.data` changes (audit events arrive), by which point the ref is populated

## Badge Display Convention

In InboxPage audit records loop, badge priority:
1. `proposingAgent` is type-key (lowercase+underscores) → `agentBadgeLabel(proposingAgent)` = "Collections Agent"
2. `proposingAgentDisplay` (registry display name for ULID fallback) → strip/re-add " Agent" suffix
3. Raw ULID fallback (should not reach production)

In `auditRecordAgentName` (popup title): use type key for "Collections Audit Record", NOT "Collections Agent Audit Record".

## Page Reload Trap

After a page reload, `needsReviewProposals` is empty (proposals already decided → filtered out of the live feed). The `useRef` accumulating map starts fresh and is never populated. The fix: back `_proposalAgentKeyCache` with `sessionStorage`.

- `_restoreCache()` is called at module init → cache is pre-populated before any React render
- `registerProposalAgentKey()` writes through to sessionStorage on each new entry (no-op when already stored, so repeated renders are cheap)
- The inline loop in `useBrainAuditRecords` calls `registerProposalAgentKey` in addition to updating the useRef

The three-layer lookup hierarchy in `mapAuditEventToRecord`:
1. `proposalTypeMap` (useRef — same render, same session)
2. `_proposalAgentKeyCache` (sessionStorage — survives page reloads)
3. `resolvedActors` display name (registry ULID — historical fallback)

## How to Apply

- Any time `useBrainAuditRecords` is called and needs proposal context, pass the proposals array
- `mapAuditEventToRecord` accepts an optional `Map<string, string>` as 4th arg — this takes priority over the module-level cache
- Module-level `_proposalAgentKeyCache` remains as tertiary fallback for edge cases
