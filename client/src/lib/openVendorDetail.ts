import { queryClient } from "./queryClient";
import { mapCounterpartyToVendor, type BrainCounterparty } from "./brainVendors";
import type { Vendor } from "./vendorTypes";

/* ── Single source of truth for opening a vendor's detail popup ───────────────
   Every vendor reference across the app resolves the same way: look the vendor
   up by id, and — only if it resolves — navigate to the vendor detail route.
   Callers use `resolveVendor` to decide whether to render a tappable link or
   plain text; they never duplicate the lookup. An unresolved id falls back to
   plain text (e.g. the live counterparties list hasn't loaded/cached yet) —
   this path is a graceful fallback, not necessarily a bug, so it's expected
   more often than the old mock catalogue's "dangling ref = bug" invariant. */

export function resolveVendor(
  vendorId: string | null | undefined,
): Vendor | undefined {
  if (!vendorId) return undefined;
  // Reads the same react-query cache useBrainVendors() populates
  // (queryKey ["/api/brain/ledger/counterparties"]) — no separate fetch/store.
  const data = queryClient.getQueryData<{ counterparties: BrainCounterparty[] }>([
    "/api/brain/ledger/counterparties",
  ]);
  const cp = data?.counterparties.find((c) => c.id === vendorId);
  return cp ? mapCounterpartyToVendor(cp) : undefined;
}

export function openVendorDetail(
  vendorId: string | null | undefined,
  navigate: (to: string) => void,
  returnTo?: string,
): boolean {
  const vendor = resolveVendor(vendorId);
  if (!vendor) {
    console.warn(`openVendorDetail: no vendor found for id '${vendorId ?? ""}'`);
    return false;
  }
  // `returnTo` lets a caller (e.g. the Audit Log record popup) request that
  // closing the vendor detail returns to where it came from, mirroring the
  // stacked invoice-viewer experience. VendorsPage reads `?from=` on close.
  const suffix = returnTo ? `&from=${encodeURIComponent(returnTo)}` : "";
  navigate(`/vendors?vendor=${vendor.id}${suffix}`);
  return true;
}
