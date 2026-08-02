import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useLocation, useSearch } from "wouter";
import {
  useBrainVendors,
  useBrainVendorDetail,
  isNeedsReview,
  reviewReasonLabel,
  vendorSegment,
} from "@/lib/brainVendors";
import { useCurrency } from "@/lib/useCurrency";
import { useToast } from "@/hooks/use-toast";
import { AppAlertLink, useAppAlert } from "@/components/AppAlert";
import { queryClient } from "@/lib/queryClient";
import type { Vendor } from "@/lib/vendorTypes";
import { VendorDetailPopup } from "@/components/VendorDetailPopup";
import { FilterChipRow } from "@/components/FilterChipRow";
import { Plus, ChevronDown } from "lucide-react";
import { AlertCallout } from "@/components/Callout";
import closeIcon from "@assets/Close_1783293571882.png";

/* "New" is deliberately NOT a top-level chip. It was one half of the bug this
   screen used to have: the banner counted new+unreviewed rows while the Needs
   Review chip counted only risk-flagged ones, so a warning pointed at rows the
   active filter refused to show. Newness is now a REASON inside Needs Review,
   not a competing filter. */
type VendorTab = "Needs Review" | "Trusted" | "Rejected" | "Suggested";

/** Vendors (we pay them) vs Customers (they pay us). */
type Segment = "vendor" | "customer";

const Divider = () => <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />;

/* ── Vendor categories (from Figma dropdown) ─────────────────────────────── */
const VENDOR_CATEGORIES = [
  "Supplier",
  "Contractor",
  "Software",
  "Services",
  "Hardware",
  "Facilities",
  "Logistics",
  "Marketing",
  "Utilities",
  "Legal",
  "Finance",
  "Other",
];

/* ── Vendor row ──────────────────────────────────────────────────────────── */
/** Why a row is in the review queue. Risk reads as danger, newness as amber —
 *  the same two tones the rest of the app uses for those meanings. */
function ReasonChip({ label }: { label: string }) {
  const danger = label.startsWith("Risk:") || label === "Flagged for review";
  return (
    <span
      data-testid="chip-review-reason"
      className="shrink-0 rounded-[4px] px-[6px] py-[1px] [font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[11px] whitespace-nowrap"
      style={
        danger
          ? { background: "#350011", color: "#d20344" }
          : { background: "#4a2300", color: "#ff9400" }
      }
    >
      {label}
    </span>
  );
}

function VendorRow({
  vendor,
  onClick,
  format,
  reason,
}: {
  vendor: Vendor;
  onClick: () => void;
  format: (a: string | number) => string;
  /** Non-null only in the Needs Review queue, where every row must say why. */
  reason?: string | null;
}) {
  const { paymentCount, totalPaid } = vendor.history;
  const hasPayments = paymentCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`row-vendor-${vendor.id}`}
      className="flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full bg-[#0a0c10] transition-colors border-b border-solid border-[#1d2132] last:border-b-0 hover:bg-[#11141b] cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
    >
      <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
        <div className="flex items-center gap-[8px] min-w-px max-w-full">
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px] truncate">
            {vendor.name}
          </p>
          {reason ? <ReasonChip label={reason} /> : null}
        </div>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] whitespace-nowrap">
          {vendor.category || "Vendor"} ·{" "}
          {hasPayments
            ? `${paymentCount} ${paymentCount === 1 ? "payment" : "payments"}`
            : "No payments yet"}
        </p>
      </div>
      {/* The amount column is hidden entirely until there is at least one
          payment — a "$0.00" next to a brand-new counterparty reads as a real
          zero balance rather than an absence of history. */}
      {hasPayments && (
        <div className="flex flex-col items-end justify-center relative shrink-0">
          <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">
            {format(totalPaid)}
          </p>
        </div>
      )}
    </button>
  );
}

/* ── Submit confirmation dialog ──────────────────────────────────────────── */
function SubmitConfirmDialog({
  open,
  vendorName,
  category,
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean;
  vendorName: string;
  category: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-[374px] max-w-[calc(100vw-32px)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          style={{
            background: "#11141b",
            border: "1px solid #1d2132",
            borderRadius: "16px",
            boxShadow: "0px 68px 27px rgba(0,0,0,0.06), 0px 38px 23px rgba(0,0,0,0.2), 0px 17px 17px rgba(0,0,0,0.34), 0px 4px 9px rgba(0,0,0,0.39)",
            overflow: "hidden",
          }}
        >
          <DialogPrimitive.Title asChild>
            <div className="flex flex-col gap-[8px] items-center px-[8px] pt-[24px] pb-[16px] text-center">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#a8b9f4] text-[20px] w-full">
                Submit Vendor for Review
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] w-full">
                Add vendor <span className="text-[#a8b9f4]">{vendorName}</span> as a{" "}
                <span className="text-[#a8b9f4]">{category || "supplier"}</span> for review.
              </p>
            </div>
          </DialogPrimitive.Title>

          <div className="flex gap-[8px] items-center p-[8px]">
            <button
              type="button"
              onClick={onCancel}
              className="flex flex-1 items-center justify-center min-w-px px-[12px] py-[8px] rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#6c779d] text-[12px] whitespace-nowrap hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              style={{ background: "#222737" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              data-testid="button-confirm-submit-vendor"
              className="flex flex-1 items-center justify-center min-w-px px-[12px] py-[8px] rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#42bf23] text-[12px] whitespace-nowrap hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#42bf23]"
              style={{ background: "#123509" }}
            >
              {busy ? "Submitting…" : "Confirm"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ── Category dropdown ───────────────────────────────────────────────────────
   The menu renders through a portal at fixed coordinates. The Ledger's centre
   column and the form card both clip their content, so a menu positioned inside
   the card gets cut off at the card edge — the portal escapes every ancestor
   clip, which is why the card can keep its own rounded overflow intact.       */
function CategoryDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<
    { top: number; left: number; maxHeight: number; measured: boolean } | null
  >(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /* Fixed positioning means nothing keeps the menu inside the viewport for us,
     so clamp it horizontally and flip it above the trigger when the space below
     cannot hold it. The first call runs before the menu exists, so it cannot
     measure; it reports measured:false, the menu renders hidden for one frame,
     and the layout effect below re-places it with real dimensions. */
  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menu = menuRef.current;
    const mw = menu?.offsetWidth ?? 0;
    const mh = menu?.scrollHeight ?? 0;
    const measured = mh > 0;

    const MARGIN = 8;
    const GAP = 4;
    const spaceBelow = window.innerHeight - r.bottom - GAP - MARGIN;
    const spaceAbove = r.top - GAP - MARGIN;
    const flip = measured && mh > spaceBelow && spaceAbove > spaceBelow;

    const maxHeight = Math.max(120, flip ? spaceAbove : spaceBelow);
    const left = Math.max(MARGIN, Math.min(r.left, window.innerWidth - (mw || 180) - MARGIN));
    const top = flip
      ? Math.max(MARGIN, r.top - GAP - Math.min(mh, maxHeight))
      : r.bottom + GAP;

    setPos({ top, left, maxHeight, measured });
  }, []);

  /* Terminates: place() only reports measured:false while menuRef is empty. */
  useLayoutEffect(() => {
    if (open && pos && !pos.measured) place();
  }, [open, pos, place]);

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    // capture phase: catch scrolls on any ancestor, not just the window
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  const selected = !!value;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((p) => !p)}
        data-testid="button-vendor-category-dropdown"
        aria-expanded={open}
        className="flex gap-[8px] items-center p-[8px] rounded-[8px] shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
        style={{ background: selected ? "#240757" : "#222737" }}
      >
        <span
          className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[16px] whitespace-nowrap"
          style={{ color: selected ? "#ffffff" : "#6c779d" }}
        >
          {value || "category"}
        </span>
        <ChevronDown
          size={20}
          className="shrink-0 transition-transform"
          style={{ color: selected ? "#ffffff" : "#6c779d", transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          /* Deliberately NOT role="listbox". This is a disclosure of ordinary
             buttons reached with Tab; claiming listbox would promise arrow-key
             roving focus that the markup does not implement. */
          className="fixed z-[80] flex flex-col items-start p-[8px] rounded-[12px] min-w-[180px] overflow-y-auto"
          style={{
            top: pos.top,
            left: pos.left,
            maxHeight: pos.maxHeight,
            visibility: pos.measured ? "visible" : "hidden",
            background: "#0a0c10",
            border: "1px solid #1d2132",
            boxShadow: "0px 38px 11.5px rgba(0,0,0,0.2), 0px 17px 8.5px rgba(0,0,0,0.34), 0px 4px 4.5px rgba(0,0,0,0.39)",
          }}
        >
          {VENDOR_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              aria-current={cat === value || undefined}
              onClick={() => { onChange(cat); setOpen(false); }}
              data-testid={`option-vendor-category-${cat.toLowerCase().replace(/\s+/g, "-")}`}
              className="flex items-start p-[8px] rounded-[8px] w-full text-left hover:bg-[#222737] transition-colors focus:outline-none focus-visible:bg-[#222737]"
            >
              <span
                className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[16px] whitespace-nowrap"
                style={{ color: cat === value ? "#a8b9f4" : "#6c779d" }}
              >
                {cat}
              </span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export function VendorsPanel() {
  const { format } = useCurrency();
  const [, navigate] = useLocation();
  const search = useSearch();
  const { vendors, isLoading, isError } = useBrainVendors();
  const { toast } = useToast();
  const alert = useAppAlert();
  const [activeVendor, setActiveVendor] = useState<Vendor | null>(null);
  const detailVendor = useBrainVendorDetail(activeVendor);
  const [activeTab, setActiveTab] = useState<VendorTab>("Needs Review");
  /* Vendors first: this screen's primary job is the payables review queue. */
  const [segment, setSegment] = useState<Segment>("vendor");

  /* ── Add vendor state ── */
  const [addOpen, setAddOpen] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [category, setCategory] = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetAddVendor = useCallback(() => {
    setAddOpen(false);
    setVendorName("");
    setCategory("");
    setConfirmSubmit(false);
    setBusy(false);
    setError(null);
  }, []);

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
      const submittedVendorName = vendorName.trim();
      const submittedVendorId =
        typeof body?.counterparty?.id === "string" ? body.counterparty.id : null;
      alert.success(
        "Success",
        <>
          You have successfully added vendor: {submittedVendorName}
          <br />
          <br />
          View the vendor{" "}
          {submittedVendorId ? (
            <AppAlertLink href={`/ledger?tab=counterparties&vendor=${encodeURIComponent(submittedVendorId)}`}>
              here
            </AppAlertLink>
          ) : (
            "here"
          )}
          .
        </>,
      );
      resetAddVendor();
    } catch {
      setError("Couldn't reach Brain core. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  /* ── Delete vendor handler ── */
  const handleDeleteVendor = async (vendorId: string, vendorNameLabel: string) => {
    try {
      const res = await fetch(`/api/brain/ledger/counterparties/${vendorId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 404) {
        toast({ title: "Couldn't delete vendor", description: "Brain core rejected the request. The vendor was not removed.", variant: "destructive" });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/brain/ledger/counterparties"] });
      toast({ title: "Vendor deleted", description: `${vendorNameLabel} has been removed.` });
      setActiveVendor(null);
      const params = new URLSearchParams(search);
      params.delete("vendor");
      params.set("tab", "counterparties");
      navigate(`/ledger?${params.toString()}`, { replace: true });
    } catch {
      toast({ title: "Couldn't delete vendor", description: "Couldn't reach Brain core. Nothing was changed.", variant: "destructive" });
    }
  };

  /* Deep-link: ?vendor=<id> */
  useEffect(() => {
    const params = new URLSearchParams(search);
    const vendorId = params.get("vendor");
    if (!vendorId) { setActiveVendor(null); return; }
    const found = vendors.find((v) => v.id === vendorId);
    if (found) setActiveVendor(found);
  }, [search, vendors]);

  const handleCloseDetail = () => {
    setActiveVendor(null);
    const params = new URLSearchParams(search);
    const from = params.get("from");
    if (from) { navigate(from, { replace: true }); return; }
    params.delete("vendor");
    params.set("tab", "counterparties");
    navigate(`/ledger?${params.toString()}`, { replace: true });
  };

  const handleOpenVendor = (vendor: Vendor) => {
    setActiveVendor(vendor);
    const params = new URLSearchParams(search);
    params.set("tab", "counterparties");
    params.set("vendor", vendor.id);
    navigate(`/ledger?${params.toString()}`, { replace: true });
  };

  /* ── One derivation chain ────────────────────────────────────────────────
     Segment first, then the needs-review predicate, then the tab. The chip
     badge, the rendered list and the label count all read off THIS chain, so a
     number on this screen cannot describe rows the list won't render — which is
     exactly the bug the old banner/chip split produced. */
  const segmentVendors = useMemo(
    () => vendors.filter((v) => vendorSegment(v) === segment),
    [vendors, segment],
  );

  const grouped = useMemo(
    () => ({
      needsReview: segmentVendors.filter(isNeedsReview),
      trusted: segmentVendors.filter((v) => v.trustStatus === "trusted"),
      suggested: segmentVendors.filter((v) => v.trustStatus === "known"),
      /* brain-core has no rejection state today; this tab ships honest-empty
         like the Trusted tab — it is a placeholder for future upstream support. */
      rejected: [] as Vendor[],
    }),
    [segmentVendors],
  );

  const tabVendors: Vendor[] = useMemo(() => {
    if (activeTab === "Needs Review") return grouped.needsReview;
    if (activeTab === "Trusted") return grouped.trusted;
    if (activeTab === "Rejected") return grouped.rejected;
    return grouped.suggested;
  }, [activeTab, grouped]);

  const vendorIdx = activeVendor ? tabVendors.findIndex((v) => v.id === activeVendor.id) : -1;
  const vendorPagerDisabled = vendorIdx < 0 || tabVendors.length <= 1;
  const pageVendor = (dir: 1 | -1) => {
    if (vendorPagerDisabled) return;
    const next = tabVendors[(vendorIdx + dir + tabVendors.length) % tabVendors.length];
    const params = new URLSearchParams(search);
    params.set("tab", "counterparties");
    params.set("vendor", next.id);
    navigate(`/ledger?${params.toString()}`, { replace: true });
  };

  const countsKnown = !isLoading && !isError;
  const vendorFilters = [
    {
      value: "Needs Review",
      label: "Needs Review",
      variant: "amber" as const,
      // This badge REPLACES the old red banner, so it has to carry the "N things
      // are waiting for you" signal from every filter — including while Trusted
      // or Suggested is active. It is omitted (not zeroed) while the read is
      // loading or failed: no number is honest then.
      count: countsKnown ? grouped.needsReview.length : undefined,
    },
    // Trusted, Rejected and Suggested stay clean — their counts carry no action signal.
    { value: "Trusted", label: "Trusted" },
    { value: "Rejected", label: "Rejected" },
    { value: "Suggested", label: "Suggested" },
  ];
  const segmentFilters = [
    { value: "vendor", label: "Vendors" },
    { value: "customer", label: "Customers" },
  ];
  const segmentNoun = segment === "vendor" ? "vendors" : "customers";

  /* ── Idle frame / Expanded form — above the label, same gap-[16px] sub-container as the Rules tab builder ── */
  const addBox = (
            <div className="flex flex-col gap-[16px] w-full">
              {!addOpen ? (
                /* Idle: dashed-border card with prompt + Add Vendor button */
                <div
                  className="flex items-center justify-between gap-[16px] p-[16px] rounded-[16px] w-full relative"
                  data-testid="panel-add-vendor-idle"
                >
                  {/* SVG dashed border — matches rules builder exactly */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden focusable="false">
                    <rect
                      x="0.5" y="0.5"
                      style={{ width: "calc(100% - 1px)", height: "calc(100% - 1px)" }}
                      rx="15.5" ry="15.5"
                      fill="none"
                      stroke="#414965"
                      strokeWidth="1"
                      strokeDasharray="6 8"
                    />
                  </svg>
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] text-[#6c779d] text-[20px] flex-1 min-w-px relative">
                    Add a new vendor in plain English
                  </p>
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    data-testid="button-add-vendor"
                    className="flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#ff9400] text-[12px] whitespace-nowrap hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                    style={{ background: "#4a2300" }}
                  >
                    <Plus className="size-[16px] shrink-0" />
                    Add Vendor
                  </button>
                </div>
              ) : (
                /* Expanded: sentence-style form — matches Figma 6199:70745 exactly */
                <div
                  className="w-full rounded-[16px] p-[16px] flex flex-col gap-[12px]"
                  style={{ background: "#0a0c10" }}
                  data-testid="panel-add-vendor"
                >
                    {/* Three groups in a wrapping row, gap-[16px] between groups */}
                    <div className="flex flex-wrap gap-[16px] items-center w-full">
                      {/* Group 1: "Add vendor" + name input */}
                      <div className="flex gap-[16px] items-center shrink-0">
                        <span className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
                          Add vendor
                        </span>
                        <div
                          className="flex items-center px-[8px] py-[10px] rounded-[8px] shrink-0"
                          style={{ background: "#222737" }}
                        >
                          <input
                            type="text"
                            id="vendor-name-inline"
                            data-testid="input-vendor-name"
                            placeholder="vendor name"
                            value={vendorName}
                            onChange={(e) => setVendorName(e.target.value)}
                            autoFocus
                            className="bg-transparent [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px] placeholder:text-[#6c779d] outline-none"
                            style={{ minWidth: "140px" }}
                            onKeyDown={(e) => { if (e.key === "Enter" && vendorName.trim()) setConfirmSubmit(true); }}
                          />
                        </div>
                      </div>

                      {/* Group 2: "as a" + category dropdown */}
                      <div className="flex gap-[16px] items-center shrink-0">
                        <span className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
                          as a
                        </span>
                        <CategoryDropdown value={category} onChange={setCategory} />
                      </div>

                      {/* Group 3: "for review." */}
                      <div className="flex items-center shrink-0">
                        <span className="[font-family:'Gilroy',sans-serif] font-medium leading-[24px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
                          for review.
                        </span>
                      </div>
                    </div>

                    {error && (
                      <AlertCallout testId="text-add-vendor-error">{error}</AlertCallout>
                    )}

                  {/* Inset separator + buttons — same shape as the rules builder box */}
                  <div className="h-px w-full bg-[#1d2132]" />

                  <div className="flex gap-[10px] items-stretch w-full">
                    <button
                      type="button"
                      onClick={resetAddVendor}
                      data-testid="button-add-vendor-cancel"
                      className="flex-1 px-[12px] py-[10px] rounded-[100px] bg-[#222737] hover:bg-[#2b3145] transition-colors flex items-center justify-center [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#6c779d]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!vendorName.trim()) { setError("Vendor name is required."); return; }
                        setError(null);
                        setConfirmSubmit(true);
                      }}
                      disabled={!vendorName.trim()}
                      data-testid="button-submit-vendor"
                      className="flex-1 px-[12px] py-[10px] rounded-[100px] bg-[#4a2300] hover:bg-[#5a2d00] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center [font-family:'Gilroy',sans-serif] font-semibold text-[14px] text-[#ff9500]"
                    >
                      Submit for Verification
                    </button>
                  </div>
                </div>
              )}
            </div>
  );

  /* ── VENDORS label + list — below the frame ── */
  const listBlock = (
            <div className="flex flex-col gap-[10px] w-full">
              <div className="flex items-center gap-[8px] min-h-[16px] w-full">
                <div className="size-[6px] rounded-full shrink-0 bg-[#6c779d]" />
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#6c779d] text-[12px] uppercase tracking-[0.4px] whitespace-nowrap">
                  {activeTab === "Rejected"
                    ? "Rejected"
                    : segment === "vendor"
                      ? "Added Vendors"
                      : "Customers"}
                </p>
                <div className="bg-[#6c779d] flex items-center justify-center min-w-[18px] px-[5px] py-[1px] rounded-[4px] shrink-0">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#0a0c10] text-[11px] text-center whitespace-nowrap">
                    {tabVendors.length}
                  </p>
                </div>
              </div>

              <div
                className="bg-[#0a0c10] flex flex-col overflow-hidden relative rounded-[16px]"
                data-testid="list-counterparties"
              >
                <div>
                  {tabVendors.length === 0 ? (
                    <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full">
                      <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
                        {activeTab === "Needs Review" &&
                          `Nothing to review. New and risk-flagged ${segmentNoun} appear here.`}
                        {/* Honest about a tier nothing can currently reach: brain-core
                            has no endpoint to grant trust, so this list stays empty
                            rather than implying the user simply hasn't got there yet. */}
                        {activeTab === "Trusted" &&
                          "No trusted counterparties. Granting trust isn't available yet, so this list stays empty for now."}
                        {activeTab === "Suggested" &&
                          `No suggestions yet. ${segment === "vendor" ? "Vendors" : "Customers"} Brain has seen real payments for show up here.`}
                        {activeTab === "Rejected" &&
                          "No rejected vendors. Rejected vendors will appear here once vendor rejection is supported."}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-start w-full">
                      {tabVendors.map((vendor) => (
                        <VendorRow
                          key={vendor.id}
                          vendor={vendor}
                          format={format}
                          // Reason is shown only in the review queue — it answers
                          // "why is this here?", which is only a question there.
                          reason={activeTab === "Needs Review" ? reviewReasonLabel(vendor) : null}
                          onClick={() => handleOpenVendor(vendor)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
  );

  return (
    <div className="flex flex-col gap-[26px] items-start w-full pb-[8px]">

      {/* No warning banner. The Needs Review badge is the single attention
          signal, and unlike the banner it is always one click from the exact
          rows it counts. */}
      <div className="flex flex-col gap-[16px] items-start w-full">
        <div className="flex flex-wrap items-center justify-between gap-[12px] w-full">
          <FilterChipRow
            chips={vendorFilters}
            value={activeTab}
            onChange={(v) => setActiveTab(v as VendorTab)}
            label="Filter counterparties"
            testIdPrefix="tab-vendor"
          />
          <FilterChipRow
            chips={segmentFilters}
            value={segment}
            onChange={(v) => setSegment(v as Segment)}
            label="Show vendors or customers"
            testIdPrefix="segment"
          />
        </div>
        {!isLoading && !isError && addBox}
      </div>

      <div className="w-full flex flex-col gap-[16px]">
        {isLoading ? (
          <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
              Loading counterparties from Brain...
            </p>
          </div>
        ) : isError ? (
          <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#d20344] text-[16px]">
              Couldn't reach Brain to load counterparties. Try again shortly.
            </p>
          </div>
        ) : (
          listBlock
        )}
      </div>

      {/* Submit confirmation popup */}
      <SubmitConfirmDialog
        open={confirmSubmit}
        vendorName={vendorName}
        category={category}
        onCancel={() => setConfirmSubmit(false)}
        onConfirm={() => { setConfirmSubmit(false); submitVendor(); }}
        busy={busy}
      />

      <VendorDetailPopup
        vendor={detailVendor}
        open={activeVendor !== null}
        onOpenChange={(o) => { if (!o) handleCloseDetail(); }}
        onPrev={() => pageVendor(-1)}
        onNext={() => pageVendor(1)}
        pagerDisabled={vendorPagerDisabled}
        onDeleteVendor={(id, name) => handleDeleteVendor(id, name)}
      />

    </div>
  );
}
