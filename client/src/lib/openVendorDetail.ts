import { MOCK_VENDORS } from "./mockVendors";
import type { Vendor } from "./vendorTypes";

/* ── Single source of truth for opening a vendor's detail popup ───────────────
   Every vendor reference across the app resolves the same way: look the vendor
   up by id in the mock catalogue, and — only if it resolves — navigate to the
   vendor detail route. Callers use `resolveVendor` to decide whether to render
   a tappable link or plain text; they never duplicate the lookup. An unresolved
   id is a bug (dangling reference) — we `console.warn` loudly rather than fail
   silently.
   ──────────────────────────────────────────────────────────────────────────── */

export function resolveVendor(
  vendorId: string | null | undefined,
): Vendor | undefined {
  if (!vendorId) return undefined;
  return MOCK_VENDORS.find((v) => v.id === vendorId);
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
