import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight, ShieldCheck, AlertTriangle, Sparkles, Clock } from "lucide-react";
import { MOCK_VENDORS } from "@/lib/mockVendors";
import { useCurrency } from "@/lib/currencyContext";
import type { Vendor, TrustStatus } from "@/lib/vendorTypes";
import { VendorDetailPopup } from "@/components/VendorDetailPopup";

type VendorTab = "Under Review" | "New" | "Trusted" | "Known";
const VENDOR_TABS: VendorTab[] = ["Under Review", "New", "Trusted", "Known"];

const TRUST_STATUS_META: Record<
  TrustStatus,
  { label: string; chipBg: string; chipText: string; icon: typeof ShieldCheck }
> = {
  trusted: { label: "Trusted", chipBg: "rgba(66,191,35,0.10)", chipText: "#42bf23", icon: ShieldCheck },
  known: { label: "Known", chipBg: "rgba(118,49,238,0.10)", chipText: "#7631ee", icon: Clock },
  new: { label: "New", chipBg: "rgba(65,73,101,0.10)", chipText: "#414965", icon: Clock },
  under_review: { label: "Under review", chipBg: "rgba(210,3,68,0.10)", chipText: "#d20344", icon: AlertTriangle },
};

const Divider = () => <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />;

/* ── Vendor row ──────────────────────────────────────────────────────────────── */
function VendorRow({
  vendor,
  onClick,
  format,
  badge,
}: {
  vendor: Vendor;
  onClick: () => void;
  format: (a: string | number) => string;
  badge?: React.ReactNode;
}) {
  const meta = TRUST_STATUS_META[vendor.trustStatus];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`row-vendor-${vendor.id}`}
      className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
    >
      {vendor.trustStatus === "under_review" && (
        <div className="w-[3px] self-stretch rounded-full bg-[#d20344] shrink-0" />
      )}
      <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
        <div className="flex gap-[8px] items-center w-full">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] truncate w-full">
            {vendor.name}
          </p>
        </div>
        <div className="flex gap-[6px] items-center flex-wrap">
          <span
            className="px-[6px] py-[2px] rounded-[4px] [font-family:'Gilroy',sans-serif] font-medium text-[11px] flex items-center gap-[4px] shrink-0"
            style={{ background: meta.chipBg, color: meta.chipText }}
          >
            <Icon size={11} />
            {meta.label}
          </span>
          <span className="[font-family:'JetBrains_Mono',monospace] text-[11px] text-[#414965]">
            {vendor.category}
          </span>
          <span className="[font-family:'JetBrains_Mono',monospace] text-[11px] text-[#414965]">
            · {vendor.history.paymentCount} payments
          </span>
        </div>
      </div>
      <div className="flex items-center gap-[6px] shrink-0">
        {badge}
        {typeof vendor.history.totalPaid === "number" && (
          <span className="[font-family:'JetBrains_Mono',monospace] font-medium text-[14px] text-[#a8b9f4]">
            {format(vendor.history.totalPaid)}
          </span>
        )}
        <ChevronRight size={14} className="text-[#414965] shrink-0" />
      </div>
    </button>
  );
}


/* ── Main page ─────────────────────────────────────────────────────────────────── */
export function VendorsPage() {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [activeVendor, setActiveVendor] = useState<Vendor | null>(null);
  const [activeTab, setActiveTab] = useState<VendorTab>("Under Review");

  /* Deep-link: ?vendor=<id> opens that vendor automatically */
  useEffect(() => {
    const params = new URLSearchParams(search);
    const vendorId = params.get("vendor");
    if (!vendorId) {
      setActiveVendor(null);
      return;
    }
    const found = MOCK_VENDORS.find((v) => v.id === vendorId);
    if (found) setActiveVendor(found);
  }, [search]);

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
    const trusted = MOCK_VENDORS.filter((v) => v.trustStatus === "trusted");
    const underReview = MOCK_VENDORS.filter((v) => v.trustStatus === "under_review");
    const known = MOCK_VENDORS.filter((v) => v.trustStatus === "known");
    const newVendors = MOCK_VENDORS.filter((v) => v.trustStatus === "new");
    return { trusted, underReview, known, newVendors };
  }, []);

  const tabVendors: Vendor[] = useMemo(() => {
    if (activeTab === "Under Review") return grouped.underReview;
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

  const suggestionCount = grouped.known.filter((v) => v.eligibleForTrust).length;

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
          {tabVendors.length === 0 ? (
            <div className="bg-[#0a0c10] rounded-[16px] p-[16px] w-full">
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] text-[#6c779d]">
                No vendors in this category.
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
                      badge={
                        vendor.trustStatus === "under_review" ? (
                          <span
                            className="px-[6px] py-[2px] rounded-[4px] [font-family:'Gilroy',sans-serif] font-medium text-[11px] shrink-0"
                            style={{ background: "rgba(210,3,68,0.08)", color: "#d20344" }}
                          >
                            Flag raised
                          </span>
                        ) : vendor.trustStatus === "known" && vendor.eligibleForTrust ? (
                          <span
                            className="px-[6px] py-[2px] rounded-[4px] [font-family:'Gilroy',sans-serif] font-medium text-[11px] flex items-center gap-[4px] shrink-0"
                            style={{ background: "rgba(118,49,238,0.10)", color: "#7631ee" }}
                          >
                            <Sparkles size={11} />
                            Brain suggests
                          </span>
                        ) : undefined
                      }
                    />
                    {idx < tabVendors.length - 1 && <Divider />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer caption */}
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px] text-[#414965] w-full">
            {suggestionCount > 0
              ? `Brain suggests trust for ${suggestionCount} vendor${suggestionCount === 1 ? "" : "s"} based on payment history. You decide.`
              : "Vendors are grouped by trust status. Tap any row to review history and manage trust."}
          </p>
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
