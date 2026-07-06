import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBrainVendors } from "@/lib/brainVendors";
import { useCurrency } from "@/lib/currencyContext";
import type { Vendor } from "@/lib/vendorTypes";
import { VendorDetailPopup } from "@/components/VendorDetailPopup";

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


/* ── Main page ─────────────────────────────────────────────────────────────────── */
export function VendorsPage() {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  const search = useSearch();
  const { vendors, isLoading, isError } = useBrainVendors();
  const [activeVendor, setActiveVendor] = useState<Vendor | null>(null);
  const [activeTab, setActiveTab] = useState<VendorTab>("Needs Review");

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
              {/* Section header with tab name + count — always visible */}
              <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
                <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">{activeTab}</p>
                  <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
                    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{tabVendors.length}</p>
                  </div>
                </div>
              </div>
              {tabVendors.length === 0 ? (
                <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
                  <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
                    Nothing needs your attention right now. Brain is keeping things moving.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-[8px] items-start p-[8px] relative shrink-0 w-full">
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
          )}

        </div>
      </ScrollArea>

      <VendorDetailPopup
        vendor={activeVendor}
        open={activeVendor !== null}
        onOpenChange={(o) => { if (!o) handleCloseDetail(); }}
        onPrev={() => pageVendor(-1)}
        onNext={() => pageVendor(1)}
        pagerDisabled={vendorPagerDisabled}
      />
    </div>
  );
}
