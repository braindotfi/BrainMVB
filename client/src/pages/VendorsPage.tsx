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
import { Plus } from "lucide-react";

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
      <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
          {vendor.name}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] whitespace-nowrap">
          {vendor.category || "Vendor"} · {vendor.history.paymentCount} payments
        </p>
      </div>
      {typeof vendor.history.totalPaid === "number" && (
        <div className="flex flex-col items-end justify-center relative shrink-0">
          <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">
            {format(vendor.history.totalPaid)}
          </p>
        </div>
      )}
    </button>
  );
}


/* ── Add vendor dialog ────────────────────────────────────────────────────────
   Manually creates a counterparty in live brain-core (POST /api/brain/ledger/counterparties,
   MEMBER token, identity fields only. Mirrors AddMemberDialog in TeamSection.tsx).
   Honesty: this runs on the app's ephemeral per-session demo tenant, so we don't
   imply permanence. Copy stays neutral ("Add vendor"), no persistence claims. */
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

  const inputCls =
    "w-full bg-[#222737] rounded-[8px] px-[8px] py-[10px] [font-family:'Gilroy',sans-serif] text-[16px] text-white placeholder:text-[#6c779d] outline-none focus:ring-1 focus:ring-[#7631ee]";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" data-testid="add-vendor-backdrop" />
        <DialogPrimitive.Content
          aria-labelledby="add-vendor-title"
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] rounded-[24px] w-[440px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none flex flex-col overflow-hidden"
          data-testid="add-vendor-dialog"
        >
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full">
            <p id="add-vendor-title" className="-translate-x-1/2 [font-family:'Gilroy',sans-serif] font-semibold leading-[24px] absolute left-[calc(50%+0.5px)] not-italic text-[#a8b9f4] text-[20px] text-center top-[calc(50%-12px)] whitespace-nowrap">
              Add Vendor
            </p>
            <DialogPrimitive.Close aria-label="Close" data-testid="button-add-vendor-close" className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity">
              <img src={closeIcon} alt="" className="size-[32px]" />
            </DialogPrimitive.Close>
          </div>

          <div className="content-stretch flex flex-col gap-[16px] items-start p-[24px] relative shrink-0 w-full overflow-y-auto">
            <div className="relative shrink-0 w-full">
              <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[24px] items-start relative size-full">
                {/* Name */}
                <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                  <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full">
                      <p className="[word-break:break-word] [font-family:'Gilroy',sans-serif] font-semibold leading-[14px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">Name</p>
                      <div className="flex-[1_0_0] h-px min-w-px bg-[#1d2132] relative" />
                    </div>
                  </div>
                  <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Supplies Inc." data-testid="input-vendor-name" />
                </div>
                {/* Display Name */}
                <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                  <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full">
                      <p className="[word-break:break-word] [font-family:'Gilroy',sans-serif] font-semibold leading-[14px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">Display Name (Optional)</p>
                      <div className="flex-[1_0_0] h-px min-w-px bg-[#1d2132] relative" />
                    </div>
                  </div>
                  <input className={inputCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Acme" data-testid="input-vendor-display-name" />
                </div>
                {/* Category */}
                <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                  <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full">
                      <p className="[word-break:break-word] [font-family:'Gilroy',sans-serif] font-semibold leading-[14px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">Category (Optional)</p>
                      <div className="flex-[1_0_0] h-px min-w-px bg-[#1d2132] relative" />
                    </div>
                  </div>
                  <input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. billing@acme.com" data-testid="input-vendor-category" />
                </div>
                {/* Country */}
                <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                  <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full">
                      <p className="[word-break:break-word] [font-family:'Gilroy',sans-serif] font-semibold leading-[14px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">Country (Optional)</p>
                      <div className="flex-[1_0_0] h-px min-w-px bg-[#1d2132] relative" />
                    </div>
                  </div>
                  <input className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="US" data-testid="input-vendor-country" />
                </div>
                {/* Tax ID */}
                <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full">
                  <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                    <div className="content-stretch flex gap-[8px] items-center relative shrink-0 w-full">
                      <p className="[word-break:break-word] [font-family:'Gilroy',sans-serif] font-semibold leading-[14px] not-italic relative shrink-0 text-[#6c779d] text-[14px] whitespace-nowrap">Tax ID (Optional)</p>
                      <div className="flex-[1_0_0] h-px min-w-px bg-[#1d2132] relative" />
                    </div>
                  </div>
                  <input className={inputCls} value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="e.g. 12-34567890" data-testid="input-vendor-tax-id" />
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-[10px] border border-[rgba(210,3,68,0.3)] bg-[rgba(210,3,68,0.08)] p-[12px]" data-testid="text-add-vendor-error">
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#d20344] text-[13px] leading-[18px]">{error}</p>
              </div>
            )}

            {/* Info banner — matches the Inbox helper banner style */}
            <div
              className="flex items-start gap-[10px] p-[12px] rounded-[12px] w-full"
              style={{ background: "#240757", border: "1px solid rgba(118,49,238,0.2)" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 mt-[2px]">
        <circle cx="8" cy="8" r="7" stroke="#7631ee" strokeWidth="1.3" />
        <path d="M8 7.3v4.2" stroke="#7631ee" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="8" cy="4.7" r="0.9" fill="#7631ee" />
      </svg>
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#7631ee] text-[14px] flex-1 min-w-px">
                Added to your current Brain session. This demo tenant is temporary.
              </p>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              data-testid="button-submit-vendor"
              className="w-full bg-[#4a2300] hover:bg-[#5a2b00] transition-colors flex items-center justify-center px-[20px] py-[10px] rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[#ff9400] text-[16px] leading-[20px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Adding…" : "Add Vendor"}
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
    // re-opens, mirroring the stacked invoice-viewer experience. Otherwise
    // just drop the ?vendor= param.
    const params = new URLSearchParams(search);
    const from = params.get("from");
    navigate(from ?? "/vendors", { replace: true });
  };

  const handleOpenVendor = (vendor: Vendor) => {
    setActiveVendor(vendor);
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
    let list: Vendor[];
    if (activeTab === "Needs Review") list = grouped.underReview;
    else if (activeTab === "New") list = grouped.newVendors;
    else if (activeTab === "Trusted") list = grouped.trusted;
    else list = grouped.known;
    return list;
  }, [activeTab, grouped]);

  /* Header pager - cycle (wrap-around) through the vendors in the active tab.
     Paging navigates the ?vendor= param so the deep-link effect stays in sync. */
  const vendorIdx = activeVendor ? tabVendors.findIndex((v) => v.id === activeVendor.id) : -1;
  const vendorPagerDisabled = vendorIdx < 0 || tabVendors.length <= 1;
  const pageVendor = (dir: 1 | -1) => {
    if (vendorPagerDisabled) return;
    const next = tabVendors[(vendorIdx + dir + tabVendors.length) % tabVendors.length];
    // Preserve any existing params (e.g. `from` return-to-audit target). Only
    // swap the vendor, so closing after paging still returns to the origin.
    const params = new URLSearchParams(search);
    params.set("vendor", next.id);
    navigate(`/vendors?${params.toString()}`, { replace: true });
  };

  // tab counts removed. Shown in table header instead

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
            <div className="bg-[#06070a] flex gap-[2px] items-center overflow-clip p-[2px] relative rounded-[400px] shrink-0 flex-wrap">
              {VENDOR_TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="content-stretch flex items-center justify-center px-[16px] py-[8px] relative rounded-[100px] shrink-0 transition-colors"
                    style={{ background: isActive ? "#4a2300" : "#06070a" }}
                    data-testid={`tab-vendor-${tab.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <p
                      className="[word-break:break-word] [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] not-italic relative shrink-0 text-[14px] whitespace-nowrap"
                      style={{ color: isActive ? "#ff9400" : "#414965" }}
                    >
                      {tab}
                    </p>
                  </button>
                );
              })}
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
          ) : (
            <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
              {/* Section header with tab name + count + Add Vendor button */}
              <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid content-stretch flex items-center justify-between px-[16px] py-[12px] relative shrink-0 w-full">
                <div className="content-stretch flex flex-[1_0_0] gap-[8px] items-center min-w-px relative">
                  <p className="[word-break:break-word] [font-family:'Gilroy',sans-serif] font-semibold leading-[20px] not-italic relative shrink-0 text-[#a8b9f4] text-[20px] whitespace-nowrap">{activeTab}</p>
                  <div className="bg-[#414965] content-stretch flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
                    <p className="[word-break:break-word] [font-family:'Gilroy',sans-serif] font-semibold leading-[12px] not-italic relative shrink-0 text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{tabVendors.length}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  data-testid="button-add-vendor"
                  className="bg-[#240757] content-stretch flex gap-[2px] items-center justify-center px-[10px] py-[4px] relative rounded-[100px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#7631ee] text-[12px] whitespace-nowrap hover:bg-[#2e0a6e] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                >
                  <Plus className="relative shrink-0 size-[16px] text-[#7631ee]" />
                  Add Vendor
                </button>
              </div>
              <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                {tabVendors.length === 0 ? (
                  <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
                    <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
                      {activeTab === "Needs Review" && "No vendors under review. Brain flags new or unusual counterparties here."}
                      {activeTab === "New" && "No new vendors detected yet."}
                      {activeTab === "Trusted" && "No trusted vendors yet. Brain promotes vendors here after consistent, safe payments."}
                      {activeTab === "Suggested" && "No known vendors yet. Regular payees show up here."}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
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
                )}
              </div>
            </div>
          )}
          </div>

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
