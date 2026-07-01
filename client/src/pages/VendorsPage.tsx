import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight, ShieldCheck, AlertTriangle, Sparkles, Clock } from "lucide-react";
import { MOCK_VENDORS } from "@/lib/mockVendors";
import { useCurrency } from "@/lib/currencyContext";
import type { Vendor, TrustStatus } from "@/lib/vendorTypes";
import { VendorDetailPopup } from "@/components/VendorDetailPopup";

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

/* ── Section header ──────────────────────────────────────────────────────────── */
function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
      <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">{title}</p>
        {count > 0 && (
          <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{count}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────────────── */
export function VendorsPage() {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [activeVendor, setActiveVendor] = useState<Vendor | null>(null);

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
    navigate("/vendors", { replace: true });
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

  const suggestionCount = grouped.known.filter((v) => v.eligibleForTrust).length;

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[32px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            <div className="flex items-start justify-between w-full">
              <div className="flex flex-col items-start relative shrink-0">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Trusted vendors</p>
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px]">
                  {MOCK_VENDORS.length} vendors in your network
                </p>
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#414965] text-[16px]">
                  Trust is granted deliberately here — never from inside a rule.
                </p>
              </div>
            </div>
          </div>

          {/* Under review */}
          {grouped.underReview.length > 0 && (
            <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
              <SectionHeader title="Under review" count={grouped.underReview.length} />
              <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                {grouped.underReview.map((vendor, idx) => (
                  <div key={vendor.id} className="flex flex-col gap-[8px] w-full">
                    <VendorRow
                      vendor={vendor}
                      format={format}
                      onClick={() => handleOpenVendor(vendor)}
                      badge={
                        <span
                          className="px-[6px] py-[2px] rounded-[4px] [font-family:'Gilroy',sans-serif] font-medium text-[11px] shrink-0"
                          style={{ background: "rgba(210,3,68,0.08)", color: "#d20344" }}
                        >
                          Flag raised
                        </span>
                      }
                    />
                    {idx < grouped.underReview.length - 1 && <Divider />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New */}
          {grouped.newVendors.length > 0 && (
            <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
              <SectionHeader title="New" count={grouped.newVendors.length} />
              <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                {grouped.newVendors.map((vendor, idx) => (
                  <div key={vendor.id} className="flex flex-col gap-[8px] w-full">
                    <VendorRow
                      vendor={vendor}
                      format={format}
                      onClick={() => handleOpenVendor(vendor)}
                    />
                    {idx < grouped.newVendors.length - 1 && <Divider />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trusted */}
          {grouped.trusted.length > 0 && (
            <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
              <SectionHeader title="Trusted" count={grouped.trusted.length} />
              <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                {grouped.trusted.map((vendor, idx) => (
                  <div key={vendor.id} className="flex flex-col gap-[8px] w-full">
                    <VendorRow
                      vendor={vendor}
                      format={format}
                      onClick={() => handleOpenVendor(vendor)}
                    />
                    {idx < grouped.trusted.length - 1 && <Divider />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Known — with Brain suggestion for eligible ones */}
          {grouped.known.length > 0 && (
            <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
              <SectionHeader title="Known" count={grouped.known.length} />
              <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                {grouped.known.map((vendor, idx) => (
                  <div key={vendor.id} className="flex flex-col gap-[8px] w-full">
                    <VendorRow
                      vendor={vendor}
                      format={format}
                      onClick={() => handleOpenVendor(vendor)}
                      badge={
                        vendor.eligibleForTrust ? (
                          <span
                            className="px-[6px] py-[2px] rounded-[4px] [font-family:'Gilroy',sans-serif] font-medium text-[11px] flex items-center gap-[4px] shrink-0"
                            style={{ background: "rgba(118,49,238,0.10)", color: "#7631ee" }}
                          >
                            <Sparkles size={11} />
                            Brain suggests trust
                          </span>
                        ) : undefined
                      }
                    />
                    {idx < grouped.known.length - 1 && <Divider />}
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
      />
    </div>
  );
}
