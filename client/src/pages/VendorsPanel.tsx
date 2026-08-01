import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useBrainVendors, useBrainVendorDetail } from "@/lib/brainVendors";
import { useCurrency } from "@/lib/useCurrency";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Vendor } from "@/lib/vendorTypes";
import { VendorDetailPopup } from "@/components/VendorDetailPopup";
import { FilterChipRow } from "@/components/FilterChipRow";
import { Plus } from "lucide-react";
import { AlertCallout, InfoIcon } from "@/components/Callout";

type VendorTab = "Needs Review" | "New" | "Trusted" | "Suggested";

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
      className="flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full bg-[#0a0c10] transition-colors border-b border-solid border-[#1d2132] last:border-b-0 hover:bg-[#11141b] cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
    >
      <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
          {vendor.name}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] whitespace-nowrap">
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

/* ── Main page ─────────────────────────────────────────────────────────────────── */
/**
 * Vendors — a Ledger tab, no longer a top-level page.
 *
 * Everything it had is intact: the detail popup, the wrap-around pager, `?vendor=`
 * deep links and `?from=` return targets. What changed is the chrome. Its own
 * header is gone (the Ledger supplies one) and its four sub-tabs render as a
 * filter row, because two stacked pill bars would make "which page am I on" and
 * "which slice of one list am I looking at" look like the same control.
 */
export function VendorsPanel() {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  const search = useSearch();
  const { vendors, isLoading, isError } = useBrainVendors();
  const { toast } = useToast();
  const [activeVendor, setActiveVendor] = useState<Vendor | null>(null);
  // Enrich the OPEN vendor with live payment history + refined trust (the list
  // carries neither). Identity/pager logic stays on `activeVendor`; only the
  // popup renders the enriched copy.
  const detailVendor = useBrainVendorDetail(activeVendor);
  const [activeTab, setActiveTab] = useState<VendorTab>("Needs Review");

  /* ── Inline add-vendor form state ── */
  const [addOpen, setAddOpen] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [category, setCategory] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetAddVendor = () => {
    setAddOpen(false);
    setVendorName("");
    setCategory("");
    setContactEmail("");
    setNotes("");
    setBusy(false);
    setError(null);
  };

  const submitVendor = async () => {
    if (!vendorName.trim()) {
      setError("Vendor name is required.");
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
          name: vendorName.trim(),
          category: category.trim() || undefined,
          contact_email: contactEmail.trim() || undefined,
          ...(notes.trim() ? { description: notes.trim() } : {}),
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
      toast({ title: "Vendor added", description: `${vendorName.trim()} is now in your vendor list.` });
      resetAddVendor();
    } catch {
      setError("Couldn't reach Brain core. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

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
    if (from) {
      navigate(from, { replace: true });
      return;
    }
    params.delete("vendor");
    params.set("tab", "vendors");
    navigate(`/ledger?${params.toString()}`, { replace: true });
  };

  const handleOpenVendor = (vendor: Vendor) => {
    setActiveVendor(vendor);
    const params = new URLSearchParams(search);
    params.set("tab", "vendors");
    params.set("vendor", vendor.id);
    navigate(`/ledger?${params.toString()}`, { replace: true });
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
    params.set("tab", "vendors");
    params.set("vendor", next.id);
    navigate(`/ledger?${params.toString()}`, { replace: true });
  };

  /* Counts are omitted, not zeroed, while the list is loading or unreachable:
     "Needs Review 0" is a statement that nothing needs review. */
  const countsKnown = !isLoading && !isError;
  const vendorFilters = [
    { value: "Needs Review", label: "Needs Review", count: countsKnown ? grouped.underReview.length : undefined, variant: "amber" as const },
    { value: "New", label: "New", count: countsKnown ? grouped.newVendors.length : undefined, variant: "amber" as const },
    { value: "Trusted", label: "Trusted", count: countsKnown ? grouped.trusted.length : undefined },
    { value: "Suggested", label: "Suggested", count: countsKnown ? grouped.known.length : undefined },
  ];

  /* Shared input class — matches the rules builder's form field style */
  const inputCls =
    "w-full rounded-[8px] border border-[#1d2132] bg-[#06070a] px-[10px] py-[8px] [font-family:'Gilroy',sans-serif] font-medium text-[16px] text-white placeholder:text-[#414965] outline-none focus-visible:border-[rgba(118,49,238,0.5)] transition-colors";

  return (
    <div className="flex flex-col gap-[26px] items-start w-full pb-[8px]">

      <FilterChipRow
        chips={vendorFilters}
        value={activeTab}
        onChange={(v) => setActiveTab(v as VendorTab)}
        label="Filter vendors"
        testIdPrefix="tab-vendor"
      />

      {/* Backlog notice: shown on every sub-tab except "New" so the count is
          never invisible. Presentation-only — no new data source needed. */}
      {countsKnown && grouped.newVendors.length > 0 && activeTab !== "New" && (
        <AlertCallout testId="notice-new-vendors">
          {grouped.newVendors.length} new {grouped.newVendors.length === 1 ? "vendor hasn't" : "vendors haven't"} been reviewed yet.
        </AlertCallout>
      )}

      <div className="w-full">
        {isLoading ? (
          <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
              Loading vendors from Brain...
            </p>
          </div>
        ) : isError ? (
          <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#d20344] text-[16px]">
              Couldn't reach Brain to load vendors. Try again shortly.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-[10px] w-full">

            {/* ── Table header row ── */}
            <div className="flex items-center justify-between min-h-[16px] w-full">
              <div className="flex items-center gap-[8px]">
                <div className="size-[6px] rounded-full shrink-0 bg-[#6c779d]" />
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#6c779d] text-[12px] uppercase tracking-[0.4px] whitespace-nowrap">Vendors</p>
                <div className="bg-[#6c779d] flex items-center justify-center min-w-[18px] px-[5px] py-[1px] rounded-[4px] shrink-0">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#0a0c10] text-[11px] text-center whitespace-nowrap">{tabVendors.length}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => addOpen ? resetAddVendor() : setAddOpen(true)}
                data-testid="button-add-vendor"
                className="bg-[#240757] content-stretch flex gap-[2px] items-center justify-center px-[10px] py-[4px] relative rounded-[100px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#7631ee] text-[12px] whitespace-nowrap hover:bg-[#2e0a6e] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              >
                {!addOpen && <Plus className="relative shrink-0 size-[16px] text-[#7631ee]" />}
                {addOpen ? "Cancel" : "Add Vendor"}
              </button>
            </div>

            {/* ── Inline add-vendor form — same shell as the Rules builder panel ── */}
            {addOpen && (
              <div
                className="w-full rounded-[16px] bg-[#0a0c10] p-[16px] flex flex-col gap-[12px]"
                data-testid="panel-add-vendor"
              >
                <div className="flex flex-col gap-[10px]">

                  {/* Vendor name — required */}
                  <div className="flex flex-col gap-[6px]">
                    <label
                      htmlFor="vendor-name-inline"
                      className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] uppercase tracking-[0.4px]"
                    >
                      Vendor name
                    </label>
                    <input
                      id="vendor-name-inline"
                      data-testid="input-vendor-name"
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      placeholder="e.g. Acme Supplies Inc."
                      autoFocus
                      className={inputCls}
                    />
                  </div>

                  {/* Category — optional */}
                  <div className="flex flex-col gap-[6px]">
                    <label
                      htmlFor="vendor-category-inline"
                      className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] uppercase tracking-[0.4px]"
                    >
                      Category
                      <span className="ml-[6px] normal-case tracking-normal font-medium text-[#414965]">optional</span>
                    </label>
                    <input
                      id="vendor-category-inline"
                      data-testid="input-vendor-category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="e.g. Software, Facilities, Professional services"
                      className={inputCls}
                    />
                  </div>

                  {/* Contact email — optional, for verification correspondence */}
                  <div className="flex flex-col gap-[6px]">
                    <label
                      htmlFor="vendor-email-inline"
                      className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] uppercase tracking-[0.4px]"
                    >
                      Contact email
                      <span className="ml-[6px] normal-case tracking-normal font-medium text-[#414965]">optional — for correspondence during verification, not for payments</span>
                    </label>
                    <input
                      id="vendor-email-inline"
                      data-testid="input-vendor-contact-email"
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="e.g. billing@acme.com"
                      className={inputCls}
                    />
                  </div>

                  {/* Why are you adding this vendor? — optional context for the verification queue */}
                  <div className="flex flex-col gap-[6px]">
                    <label
                      htmlFor="vendor-notes-inline"
                      className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] uppercase tracking-[0.4px]"
                    >
                      Why are you adding this vendor?
                      <span className="ml-[6px] normal-case tracking-normal font-medium text-[#414965]">optional</span>
                    </label>
                    <textarea
                      id="vendor-notes-inline"
                      data-testid="input-vendor-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Give the verification queue some context — what this vendor does, how you found them, why they're being added now."
                      rows={3}
                      className={`${inputCls} resize-none`}
                    />
                  </div>
                </div>

                {/* Info banner — same style used throughout the design system */}
                <div
                  className="flex items-start gap-[10px] p-[12px] rounded-[12px] w-full"
                  style={{ background: "#240757", border: "1px solid rgba(118,49,238,0.2)" }}
                >
                  <InfoIcon className="mt-[2px]" />
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-[#7631ee] text-[14px] flex-1 min-w-px">
                    New vendors are added as unverified. Brain will queue a verification check before the first payment is payable.
                  </p>
                </div>

                {error && (
                  <AlertCallout testId="text-add-vendor-error">{error}</AlertCallout>
                )}

                <div className="h-px w-full bg-[#1d2132]" />

                {/* Button pair — Cancel / Add Vendor, matches the Rules builder exactly */}
                <div className="flex gap-[10px] items-stretch w-full">
                  <button
                    type="button"
                    onClick={resetAddVendor}
                    data-testid="button-add-vendor-cancel"
                    className="flex-1 px-[12px] py-[10px] rounded-[100px] bg-[#1d2132] hover:bg-[#252a3d] transition-colors flex items-center justify-center [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#a8b9f4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitVendor}
                    disabled={!vendorName.trim() || busy}
                    data-testid="button-submit-vendor"
                    className="flex-1 px-[12px] py-[10px] rounded-[100px] bg-[#4a2300] hover:bg-[#5a2d00] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#ff9500] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                  >
                    {busy ? "Adding…" : "Add Vendor"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Vendor list card ── */}
            <div className="bg-[#0a0c10] flex flex-col overflow-hidden relative rounded-[16px]">
              <div>
                {tabVendors.length === 0 ? (
                  <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full">
                    <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
                      {activeTab === "Needs Review" && "No vendors under review. Brain flags new or unusual counterparties here."}
                      {activeTab === "New" && "No new vendors detected yet."}
                      {activeTab === "Trusted" && "No trusted vendors yet. Brain promotes vendors here after consistent, safe payments."}
                      {activeTab === "Suggested" && "No known vendors yet. Regular payees show up here."}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-start w-full">
                    {tabVendors.map((vendor) => (
                      <VendorRow
                        key={vendor.id}
                        vendor={vendor}
                        format={format}
                        onClick={() => handleOpenVendor(vendor)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      <VendorDetailPopup
        vendor={detailVendor}
        open={activeVendor !== null}
        onOpenChange={(o) => { if (!o) handleCloseDetail(); }}
        onPrev={() => pageVendor(-1)}
        onNext={() => pageVendor(1)}
        pagerDisabled={vendorPagerDisabled}
      />

    </div>
  );
}
