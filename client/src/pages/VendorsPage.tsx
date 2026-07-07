import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBrainVendors, useBrainVendorDetail } from "@/lib/brainVendors";
import { useCurrency } from "@/lib/currencyContext";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Vendor } from "@/lib/vendorTypes";
import { VendorDetailPopup } from "@/components/VendorDetailPopup";
import closeIcon from "@assets/Close_1783293571882.png";

type VendorTab = "Needs Review" | "New" | "Trusted" | "Suggested";
const VENDOR_TABS: VendorTab[] = ["Needs Review", "New", "Trusted", "Suggested"];


const Divider = () => <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />;

/* ── Vendor row ──────────────────────────────────────────────────────────────── */
function VendorRow({
  vendor,
  onClick,
  format,
}: {
  vendor: Vendor;
  onClick: () => void;
  format: (a: string | number) => string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`row-vendor-${vendor.id}`}
      className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
    >
      <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] truncate w-full">
          {vendor.name}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]">
          {vendor.category} · {vendor.history.paymentCount} payments
        </p>
      </div>
      <div className="flex flex-col items-end justify-center relative shrink-0">
        {typeof vendor.history.totalPaid === "number" && (
          <span className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">
            {format(vendor.history.totalPaid)}
          </span>
        )}
      </div>
    </button>
  );
}


/* ── Add vendor dialog ────────────────────────────────────────────────────────
   Manually creates a counterparty in live brain-core (POST /api/brain/ledger/counterparties,
   MEMBER token, identity fields only — mirrors AddMemberDialog in TeamSection.tsx).
   Honesty: this runs on the app's ephemeral per-session demo tenant, so we don't
   imply permanence — copy stays neutral ("Add vendor"), no persistence claims. */
function AddVendorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [category, setCategory] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [country, setCountry] = useState("");
  const [taxId, setTaxId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName(""); setDisplayName(""); setCategory("");
      setContactEmail(""); setCountry(""); setTaxId("");
      setBusy(false); setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/brain/ledger/counterparties", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          display_name: displayName.trim() || undefined,
          category: category.trim() || undefined,
          contact_email: contactEmail.trim() || undefined,
          country: country.trim() || undefined,
          tax_id: taxId.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) {
        const message =
          (body?.body?.error?.message as string | undefined) ??
          (body?.message as string | undefined) ??
          "Brain core rejected this vendor.";
        setError(message);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/brain/ledger/counterparties"] });
      toast({ title: "Vendor added", description: `${name.trim()} is now in your vendor list.` });
      onClose();
    } catch {
      setError("Couldn't reach Brain core. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const fieldCls =
    "w-full bg-[#0a0c10] border border-[#1d2132] rounded-[10px] px-[12px] py-[10px] [font-family:'Gilroy',sans-serif] text-[15px] text-white placeholder:text-[#414965] outline-none focus:border-[#7631ee]";

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" data-testid="add-vendor-backdrop" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] rounded-[24px] w-[440px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none flex flex-col"
          data-testid="add-vendor-dialog"
        >
          <div className="h-[56px] border-b border-[#1d2132] relative shrink-0">
            <DialogPrimitive.Title className="absolute left-1/2 -translate-x-1/2 top-[16px] [font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[20px]">
              Add vendor
            </DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Close" data-testid="button-add-vendor-close" className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity">
              <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex flex-col gap-[14px] p-[24px] overflow-y-auto">
            <div className="flex flex-col gap-[6px]">
              <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Name</label>
              <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Supplies Inc." data-testid="input-vendor-name" />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Display name (optional)</label>
              <input className={fieldCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Acme" data-testid="input-vendor-display-name" />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Category (optional)</label>
              <input className={fieldCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Office supplies" data-testid="input-vendor-category" />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Contact email (optional)</label>
              <input className={fieldCls} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="billing@acme.com" data-testid="input-vendor-contact-email" />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Country (optional)</label>
              <input className={fieldCls} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="US" data-testid="input-vendor-country" />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Tax ID (optional)</label>
              <input className={fieldCls} value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="12-3456789" data-testid="input-vendor-tax-id" />
            </div>

            {error && (
              <div className="rounded-[10px] border border-[rgba(210,3,68,0.3)] bg-[rgba(210,3,68,0.08)] p-[12px]" data-testid="text-add-vendor-error">
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#d20344] text-[13px] leading-[18px]">{error}</p>
              </div>
            )}

            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[12px] leading-[16px]">
              Added to your current Brain session — this demo tenant is temporary.
            </p>

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              data-testid="button-submit-vendor"
              className="mt-[4px] rounded-[100px] bg-[#7631ee] hover:bg-[#8544ff] disabled:opacity-40 disabled:cursor-not-allowed px-[20px] py-[11px] [font-family:'Gilroy',sans-serif] font-semibold text-white text-[16px] transition-colors"
            >
              {busy ? "Adding…" : "Add vendor"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────────────── */
export function VendorsPage() {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  const search = useSearch();
  const { vendors, isLoading, isError } = useBrainVendors();
  const [activeVendor, setActiveVendor] = useState<Vendor | null>(null);
  // Enrich the OPEN vendor with live payment history + refined trust (the list
  // carries neither). Identity/pager logic stays on `activeVendor`; only the
  // popup renders the enriched copy.
  const detailVendor = useBrainVendorDetail(activeVendor);
  const [activeTab, setActiveTab] = useState<VendorTab>("Needs Review");
  const [addOpen, setAddOpen] = useState(false);

  /* Deep-link: ?vendor=<id> opens that vendor automatically */
  useEffect(() => {
    const params = new URLSearchParams(search);
    const vendorId = params.get("vendor");
    if (!vendorId) {
      setActiveVendor(null);
      return;
    }
    const found = vendors.find((v) => v.id === vendorId);
    if (found) setActiveVendor(found);
  }, [search, vendors]);

  const handleCloseDetail = () => {
    setActiveVendor(null);
    // If we arrived here via a deep-link that carried a `?from=` return target
    // (e.g. from the Audit Log record popup), go back there so that surface
    // re-opens — mirroring the stacked invoice-viewer experience. Otherwise
    // just drop the ?vendor= param.
    const params = new URLSearchParams(search);
    const from = params.get("from");
    navigate(from ?? "/vendors", { replace: true });
  };

  const handleOpenVendor = (vendor: Vendor) => {
    navigate(`/vendors?vendor=${vendor.id}`, { replace: true });
  };

  /* Group vendors by trust status */
  const grouped = useMemo(() => {
    const trusted = vendors.filter((v) => v.trustStatus === "trusted");
    const underReview = vendors.filter((v) => v.trustStatus === "under_review");
    const known = vendors.filter((v) => v.trustStatus === "known");
    const newVendors = vendors.filter((v) => v.trustStatus === "new");
    return { trusted, underReview, known, newVendors };
  }, [vendors]);

  const tabVendors: Vendor[] = useMemo(() => {
    if (activeTab === "Needs Review") return grouped.underReview;
    if (activeTab === "New") return grouped.newVendors;
    if (activeTab === "Trusted") return grouped.trusted;
    return grouped.known;
  }, [activeTab, grouped]);

  /* Header pager — cycle (wrap-around) through the vendors in the active tab.
     Paging navigates the ?vendor= param so the deep-link effect stays in sync. */
  const vendorIdx = activeVendor ? tabVendors.findIndex((v) => v.id === activeVendor.id) : -1;
  const vendorPagerDisabled = vendorIdx < 0 || tabVendors.length <= 1;
  const pageVendor = (dir: 1 | -1) => {
    if (vendorPagerDisabled) return;
    const next = tabVendors[(vendorIdx + dir + tabVendors.length) % tabVendors.length];
    // Preserve any existing params (e.g. `from` return-to-audit target) — only
    // swap the vendor, so closing after paging still returns to the origin.
    const params = new URLSearchParams(search);
    params.set("vendor", next.id);
    navigate(`/vendors?${params.toString()}`, { replace: true });
  };

  // tab counts removed — shown in table header instead

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start gap-[4px] relative shrink-0">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Your Vendors</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px]">
              The people and businesses you pay.
            </p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#414965] text-[16px]">
              See vendor activity, payment history, risks, and recommendations.
            </p>
          </div>

          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            {/* Tab bar — active tab is ORANGE */}
            <div className="flex items-center justify-between gap-[16px] w-full">
              <div className="bg-[#06070a] flex gap-[2px] items-center overflow-clip p-[2px] relative rounded-[400px] shrink-0 flex-wrap">
                {VENDOR_TABS.map((tab) => {
                  const isActive = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className="flex items-center justify-center gap-[6px] px-[14px] py-[8px] relative rounded-[100px] shrink-0 transition-colors"
                      style={{ background: isActive ? "#4a2300" : "transparent" }}
                      data-testid={`tab-vendor-${tab.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <p
                        className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap"
                        style={{ color: isActive ? "#ff9500" : "#414965" }}
                      >
                        {tab}
                      </p>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                data-testid="button-add-vendor"
                className="rounded-[100px] bg-[rgba(118,49,238,0.15)] border border-[#7631ee] px-[14px] py-[6px] [font-family:'Gilroy',sans-serif] font-semibold text-[#a78bfa] text-[14px] hover:bg-[rgba(118,49,238,0.25)] transition-colors shrink-0"
              >
                + Add vendor
              </button>
            </div>
          </div>

          {/* Tab content */}
          {isLoading ? (
            <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
              <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
                Loading vendors from Brain...
              </p>
            </div>
          ) : isError ? (
            <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
              <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#d20344] text-[16px]">
                Couldn't reach Brain to load vendors. Try again shortly.
              </p>
            </div>
          ) : tabVendors.length === 0 ? (
            <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
              <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
                {activeTab === "Needs Review" && "No vendors under review. Brain flags new or unusual counterparties here."}
                {activeTab === "New" && "No new vendors detected yet."}
                {activeTab === "Trusted" && "No trusted vendors yet. Brain promotes vendors here after consistent, safe payments."}
                {activeTab === "Suggested" && "No suggested vendors yet. Brain promotes vendors here after consistent, safe payments."}
              </p>
            </div>
          ) : (
            <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
              {/* Section header matching the selected tab name */}
              <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
                <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">{activeTab}</p>
                  <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{tabVendors.length}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                {tabVendors.map((vendor, idx) => (
                  <div key={vendor.id} className="flex flex-col gap-[8px] w-full">
                    <VendorRow
                      vendor={vendor}
                      format={format}
                      onClick={() => handleOpenVendor(vendor)}
                    />
                    {idx < tabVendors.length - 1 && <Divider />}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </ScrollArea>

      <VendorDetailPopup
        vendor={detailVendor}
        open={activeVendor !== null}
        onOpenChange={(o) => { if (!o) handleCloseDetail(); }}
        onPrev={() => pageVendor(-1)}
        onNext={() => pageVendor(1)}
        pagerDisabled={vendorPagerDisabled}
      />

      <AddVendorDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
