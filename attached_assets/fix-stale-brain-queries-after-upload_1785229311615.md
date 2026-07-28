# PR Spec: Fix stale Home/Finances/Inbox after document upload

**Repo:** `braindotfi/brainmvb`
**File:** `client/src/components/AddSourceModal.tsx`
**Component:** `ReadingScreen` (~line 1169), shared by the Add Source modal *and* `OnboardingFlow.tsx`'s account-creation flow — one fix covers both entry points.

---

## Problem

After uploading documents (either via Add Source or during new-account onboarding), Home, Finances, and Inbox continue showing stale/empty data until the user logs out and back in. A hard remount is currently the only thing that refreshes them.

## Root cause

`client/src/lib/queryClient.ts:44` sets global React Query defaults of `staleTime: Infinity`, `refetchOnWindowFocus: false`, `refetchInterval: false` — by design, no query ever refreshes itself; something has to explicitly call `invalidateQueries`.

`ReadingScreen` already polls every 15s while extraction is in progress, but only invalidates one key:

```ts
queryClient.invalidateQueries({ queryKey: ["/api/integrations/documents"] });
```

That's the in-modal document list. It never invalidates any `/api/brain/*` key — `ledger/accounts`, `ledger/transactions`, `ledger/invoices`, `ledger/obligations`, `recommendation`, `actions`, `proposals`, `audit/events`, etc. — which is what Home/Finances/Inbox actually read. Closing the modal (`onClose` → `setAddSourceOpen(false)`) is a pure UI toggle with no invalidation either. Logout/login "fixes" it only because it's a full remount with no cache to serve.

## Caveat to build in, not just patch around

`extractStatus === "extracted"` reflects brain-core's `/raw/{id}/extract` job succeeding — it says nothing about whether the downstream ledger projection (APAR rebuild → account/transaction rebuild → wiki regen → agent trigger) has finished, since that's a separate bounded async chain. There's no per-document "projection done" signal exposed to the client today. So a naive "invalidate once extraction flips to done" fix can still show an incomplete picture for a short window afterward.

## Proposed fix

Add a second effect in `ReadingScreen` that fires when `anyInProgress` transitions `true → false`, invalidates the `/api/brain/*` namespace immediately, and keeps re-invalidating on a short interval for a settle window to catch trailing projection completion:

```tsx
const prevInProgress = useRef(anyInProgress);
useEffect(() => {
  const justFinished = prevInProgress.current && !anyInProgress;
  prevInProgress.current = anyInProgress;
  if (!justFinished) return;

  const invalidateBrain = () =>
    queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/brain/"),
    });

  invalidateBrain(); // immediate
  const t = setInterval(invalidateBrain, 20000);
  const stop = setTimeout(() => clearInterval(t), 3 * 60 * 1000); // settle window for projection lag
  return () => { clearInterval(t); clearTimeout(stop); };
}, [anyInProgress]);
```

Uses the same `predicate`-based invalidation pattern already used in `HomePage.tsx`/`InboxPage.tsx` for payment-intents, so it's consistent with existing conventions rather than a new pattern.

## Open question for whoever picks this up

Is a 3-minute client-side settle window acceptable, or should brain-core instead expose a per-document "projected" status (distinct from "extracted") so the client can invalidate precisely on completion instead of polling blind? Flagging rather than deciding — that's a brain-core (Codex) change, not a BrainMVB one, if it's wanted.

## Verification steps

1. Upload a document via Add Source (or create a new account with seed docs) on a fresh tenant
2. Without logging out, confirm Home's "Money in All Accounts," Finances → Accounts, and Inbox populate within the settle window once extraction + projection finish
3. Confirm the fix doesn't regress the existing `/api/integrations/documents` polling (reading-status pills should still update as before)
4. Re-run against a case where ledger projection is slow/fails (e.g. a known `ledger.apar_projection.rebuilt` obligations-drop case) to confirm the UI doesn't falsely claim "done" — this is the scenario the settle window is meant to paper over, not fix outright
