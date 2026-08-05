import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useLocation, useSearch } from "wouter";
import {
  useBrainVendors,
  useBrainVendorDetail,
  vendorTier,
  isReviewedOnly,
  reviewReasonLabel,
  vendorSegment,
} from "@/lib/brainVendors";
import { useCurrency } from "@/lib/useCurrency";
import { useToast } from "@/hooks/use-toast";
import { AppAlertLink, useAppAlert } from "@/components/AppAlert";
import { queryClient } from "@/lib/queryClient";
import type { Vendor, VendorTier } from "@/lib/vendorTypes";
import { VendorDetailPopup } from "@/components/VendorDetailPopup";
import { FilterChipRow } from "@/components/FilterChipRow";
import { Plus, ChevronDown } from "lucide-react";
import { AlertCallout, UnavailableDataBox } from "@/components/Callout";
import closeIcon from "@assets/Close_1783293571882.png";
import { CountPill } from "@/components/CountPill";
import { RecordPill } from "@/components/RecordPill";

/* "New" is deliberately NOT a top-level chip. It was one half of the bug this
   screen used to have: the banner counted new+unreviewed rows while the Needs
   Review chip counted only risk-flagged ones, so a warning pointed at rows the
   active filter refused to show. Newness is now a REASON inside Needs Review,
   not a competing filter. */
type VendorTab = "Needs Review" | "Trusted" | "Flagged" | "Suggested";

/** Vendors (we pay them) vs Customers (they pay us). */
type Segment = "vendor" | "customer";

/** Tabs are addressed by meaning, not by their label. The Customers segment
 *  renames "Trusted" to "Confirmed", and that rename is label-only: same tier,
 *  same underlying state, same endpoint when one exists. Keeping the tab VALUE
 *  stable across segments is what stops a segment switch from silently
 *  reinterpreting which rows the user is looking at. */
const TAB_TIER: Record<VendorTab, VendorTier> = {
  "Needs Review": "needsReview",
  Trusted: "trusted",
  Flagged: "flagged",
  Suggested: "suggested",
};

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
    <RecordPill
      className={danger ? "bg-[#350011] text-[#d20344] border-[rgba(210,3,68,0.2)]" : "bg-[#4a2300] text-[#ff9400] border-[rgba(255,149,0,0.2)]"}
      testId="chip-review-reason"
    >
      {label}
    </RecordPill>
  );
}

/** A row someone reviewed but took no action on. It shares the Trusted/Confirmed
 *  list so the row stays findable, and this badge is what keeps that list honest
 *  — without it the row would read as trusted.
 *
 *  DISPLAY COPY ONLY: the wire/enum value stays `acknowledged` everywhere
 *  (trustState, the /trust/acknowledge route, stored values). "No action" is
 *  what a human sees; nothing about the API changed. */
function ReviewedChip() {
  return (
    <RecordPill
      className="bg-[#222737] text-[#6c779d] border-[rgba(108,119,157,0.2)]"
      testId="chip-reviewed"
      title="Reviewed — no action taken"
    >
      No action
    </RecordPill>
  );
}

function VendorRow({
  vendor,
  onClick,
  format,
  reason,
  reviewed,
}: {
  vendor: Vendor;
  onClick: () => void;
  format: (a: string | number) => string;
  /** Non-null only in the Needs Review queue, where every row must say why. */
  reason?: string | null;
  /** Dismissed-but-not-trusted, shown only in the Trusted/Confirmed list. */
  reviewed?: boolean;
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
          {reviewed ? <ReviewedChip /> : null}
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
  nounTitle,
  noun,
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean;
  vendorName: string;
  category: string;
  /** Segment wording, e.g. "Vendor"/"vendor" or "Customer"/"customer". */
  nounTitle: string;
  noun: string;
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
                Submit {nounTitle} for Review
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] w-full">
                Add {noun} <span className="text-[#a8b9f4]">{vendorName}</span> as a{" "}
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
          className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[14px] whitespace-nowrap"
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
                className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[14px] whitespace-nowrap"
                style={{ color: "#a8b9f4" }}
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
      setError(`${segment === "vendor" ? "Vendor" : "Customer"} name is required.`);
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
          /* The create route accepts `type: "customer"`, so the add box has to
             follow the active segment. Vendors send no type and keep
             brain-core's default — changing that is a separate decision. */
          ...(segment === "customer" ? { type: "customer" } : {}),
        }),
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) {
        const message =
          (body?.body?.error?.message as string | undefined) ??
          (body?.message as string | undefined) ??
          `Brain core rejected this ${segment === "vendor" ? "vendor" : "customer"}.`;
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
          You have successfully added {segment === "vendor" ? "vendor" : "customer"}:{" "}
          {submittedVendorName}
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
      alert.success("Vendor Successfully Deleted", `${vendorNameLabel} has been successfully deleted and removed.`);
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

  /* One pass, one tier per row. Bucketing here (rather than filtering per tab)
     is what guarantees the chip counts and the rendered lists are the same
     partition of the same array. */
  const grouped = useMemo(() => {
    const buckets: Record<VendorTier, Vendor[]> = {
      needsReview: [],
      flagged: [],
      trusted: [],
      suggested: [],
    };
    for (const v of segmentVendors) {
      const tier = vendorTier(v);
      if (tier) buckets[tier].push(v);
      /* vendorTier() already warns unconditionally (dev + prod) when null. */
    }
    return buckets;
  }, [segmentVendors]);

  const countsKnown = !isLoading && !isError;

  /* Customers say "Confirmed" where vendors say "Trusted". Same tier, same
     state, same endpoint — only the word changes, because "trusting" someone
     who pays you reads as a credit judgement rather than a payment allowlist. */
  const trustedLabel = segment === "vendor" ? "Trusted" : "Confirmed";

  /* Which chips are worth showing. A chip is retired only while we KNOW its
     bucket is empty — never mid-read, when an absent chip would assert "this
     tier doesn't exist here" on the strength of data we haven't got yet. Same
     reasoning as the Needs Review count, which is omitted rather than zeroed
     until the read lands.

     Flagged: rare enough on Customers that a permanently-empty chip is just
     noise there, but it stays on Vendors, where flagging is the point.
     Suggested: nothing can currently reach the tier on either segment — brain-
     core's provenance enum has no value meaning "Brain-suggested, not yet
     confirmed". The chip is hidden until vendorTier() returns "suggested" for
     at least one row; that only happens when brain-core ships a matching
     provenance value and the implementation here is explicitly wired to it.
     The loading guard (!countsKnown) is intentionally absent: showing the chip
     during load and hiding it once the read lands would assert "this tier exists
     here" on stale data. The chip either has rows or it doesn't.

     Both hide only WHILE empty — hiding a chip that has rows would hide the
     rows, which is the failure this screen exists to prevent. */
  const showFlagged =
    !countsKnown || segment === "vendor" || grouped.flagged.length > 0;
  const showSuggested = grouped.suggested.length > 0;

  const tabVisible: Record<VendorTab, boolean> = {
    "Needs Review": true,
    Trusted: true,
    Flagged: showFlagged,
    Suggested: showSuggested,
  };

  /* A segment switch — or a bucket emptying out — can retire the chip that is
     currently selected. Clamping here rather than in an effect matters: an
     effect corrects the selection one render LATE, so the list would paint once
     showing a tier no visible chip is highlighting. Derived, the mismatch never
     exists.

     `activeTab` itself is left alone, so switching back restores the filter the
     user actually chose instead of quietly discarding it. */
  const effectiveTab: VendorTab = tabVisible[activeTab] ? activeTab : "Needs Review";

  const tabVendors: Vendor[] = grouped[TAB_TIER[effectiveTab]];

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
    // The settled tiers stay clean — their counts carry no action signal.
    { value: "Trusted", label: trustedLabel },
    ...(showFlagged ? [{ value: "Flagged", label: "Flagged" }] : []),
    ...(showSuggested ? [{ value: "Suggested", label: "Suggested" }] : []),
  ];

  const segmentFilters = [
    { value: "vendor", label: "Vendors" },
    { value: "customer", label: "Customers" },
  ];
  const segmentNoun = segment === "vendor" ? "vendors" : "customers";
  const segmentNounSingular = segment === "vendor" ? "vendor" : "customer";
  const segmentNounTitle = segment === "vendor" ? "Vendor" : "Customer";

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
                    Add a new {segmentNounSingular} in plain English
                  </p>
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    data-testid="button-add-vendor"
                    className="flex gap-[4px] items-center justify-center px-[12px] py-[8px] rounded-[100px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#ff9400] text-[12px] whitespace-nowrap hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                    style={{ background: "#4a2300" }}
                  >
                    <Plus className="size-[16px] shrink-0" />
                    Add {segmentNounTitle}
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
                        <span className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[14px] whitespace-nowrap">
                          Add {segmentNounSingular}
                        </span>
                        <div
                          className="flex items-center px-[8px] py-[10px] rounded-[8px] shrink-0"
                          style={{ background: "#222737" }}
                        >
                          <input
                            type="text"
                            id="vendor-name-inline"
                            data-testid="input-vendor-name"
                            placeholder={`${segmentNounSingular} name`}
                            value={vendorName}
                            onChange={(e) => setVendorName(e.target.value)}
                            autoFocus
                            className="bg-transparent [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[14px] leading-[20px] placeholder:text-[#6c779d] outline-none"
                            style={{ minWidth: "140px" }}
                            onKeyDown={(e) => { if (e.key === "Enter" && vendorName.trim()) setConfirmSubmit(true); }}
                          />
                        </div>
                      </div>

                      {/* Group 2: "as a" + category dropdown */}
                      <div className="flex gap-[16px] items-center shrink-0">
                        <span className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[14px] whitespace-nowrap">
                          as a
                        </span>
                        <CategoryDropdown value={category} onChange={setCategory} />
                      </div>

                      {/* Group 3: "for review." */}
                      <div className="flex items-center shrink-0">
                        <span className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[14px] whitespace-nowrap">
                          for review.
                        </span>
                      </div>
                    </div>

                    {error && (
                      <AlertCallout testId="text-add-vendor-error">{error}</AlertCallout>
                    )}

                  {/* Full-bleed separator + buttons — same shape as the rules
                      builder box. The box is padded p-[16px], so the rule is
                      pulled out by that padding to span the card edge-to-edge. */}
                  <div className="h-px -mx-[16px] w-[calc(100%+32px)] bg-[#1d2132]" />

                  <div className="flex gap-[10px] items-stretch w-full">
                    <button
                      type="button"
                      onClick={resetAddVendor}
                      data-testid="button-add-vendor-cancel"
                      className="flex-1 px-[12px] py-[8px] rounded-[100px] bg-[#222737] hover:bg-[#2b3145] transition-colors flex items-center justify-center [font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[16px] text-[#6c779d]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!vendorName.trim()) { setError(`${segmentNounTitle} name is required.`); return; }
                        setError(null);
                        setConfirmSubmit(true);
                      }}
                      disabled={!vendorName.trim()}
                      data-testid="button-submit-vendor"
                      className="flex-1 px-[12px] py-[8px] rounded-[100px] bg-[#4a2300] hover:bg-[#5a2d00] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center [font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[16px] text-[#ff9500]"
                    >
                      Submit for Verification
                    </button>
                  </div>
                </div>
              )}
            </div>
  );

  /* ── Trust action handlers — MOUNT POINT (the only one) ────────────────────
     All trust writes originate here. VendorDetailPopup receives handlers as
     props and never fetches directly: two call sites would mean two places to
     keep invalidation, optimistic state and error handling in sync.

     Routes: POST /ledger/counterparties/:id/trust/{grant|pause|acknowledge|restore}
     Auth:   member token, ledger:write (brain-core PRs #397/#403, GIT deedc628).
     Each call writes one audit event; invalidating the counterparties list key
     is what moves the row to its new tier. */
  const [trustBusy, setTrustBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const callTrustAction = async (
    vendorId: string,
    action: "grant" | "pause" | "acknowledge" | "restore",
    successTitle: string,
    successText: string,
  ) => {
    setTrustBusy(true);
    try {
      const res = await fetch(
        `/api/brain/ledger/counterparties/${encodeURIComponent(vendorId)}/trust/${action}`,
        { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => undefined);
        const msg =
          (body?.body?.error?.message as string | undefined) ??
          (body?.message as string | undefined) ??
          "Brain core rejected this action.";
        alert.error("Action failed", msg);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/brain/ledger/counterparties"] });
      setActiveVendor(null);
      const params = new URLSearchParams(search);
      params.delete("vendor");
      params.set("tab", "counterparties");
      navigate(`/ledger?${params.toString()}`, { replace: true });
      alert.success(successTitle, successText);
    } catch {
      alert.error("Action failed", "Couldn't reach Brain core. Nothing was changed.");
    } finally {
      setTrustBusy(false);
    }
  };

  const handleGrant = (vendorId: string) => {
    const v = vendors.find((x) => x.id === vendorId);
    return callTrustAction(
      vendorId,
      "grant",
      "Vendor Successfully Trusted",
      `${v?.name ?? "Vendor"} has been added as a trusted vendor.`,
    );
  };
  const handleFlag = (vendorId: string) => {
    const v = vendors.find((x) => x.id === vendorId);
    return callTrustAction(
      vendorId,
      "pause",
      "Vendor Successfully Flagged",
      `${v?.name ?? "Vendor"} has been added as a flagged vendor.`,
    );
  };
  /* paused → trusted. Uses /trust/restore (not grant — grant is only valid from
     unreviewed/acknowledged; the matrix has no paused→trusted grant transition). */
  const handleRestore = (vendorId: string) => {
    const v = vendors.find((x) => x.id === vendorId);
    return callTrustAction(
      vendorId,
      "restore",
      "Vendor Successfully Trusted",
      `${v?.name ?? "Vendor"} has been added as a trusted vendor.`,
    );
  };
  const handleAcknowledge = (vendorId: string) => {
    const v = vendors.find((x) => x.id === vendorId);
    return callTrustAction(vendorId, "acknowledge", "Vendor Successfully Mark with No Action", `${v?.name ?? "Vendor"} has been reviewed but no action was taken.`);
  };

  /* Bulk confirm — Customers segment only. N individual grant calls so each
     row gets its own audit event. Risk-flagged rows (riskLevel set) cannot be
     cleared here and stay in the per-item queue. */
  const handleBulkConfirm = async () => {
    if (bulkBusy) return;
    const toConfirm = grouped.needsReview.filter(
      (v) => vendorSegment(v) === "customer" && !v.riskLevel,
    );
    if (toConfirm.length === 0) return;
    setBulkBusy(true);
    let succeeded = 0;
    let failed = 0;
    for (const v of toConfirm) {
      try {
        const res = await fetch(
          `/api/brain/ledger/counterparties/${encodeURIComponent(v.id)}/trust/grant`,
          { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" },
        );
        if (res.ok) succeeded++; else failed++;
      } catch { failed++; }
    }
    await queryClient.invalidateQueries({ queryKey: ["/api/brain/ledger/counterparties"] });
    if (failed === 0) {
      alert.success("All confirmed", `${succeeded} customer${succeeded !== 1 ? "s" : ""} confirmed.`);
    } else {
      alert.error(
        `${succeeded} confirmed, ${failed} failed`,
        "Some customers couldn't be confirmed. Try those individually.",
      );
    }
    setBulkBusy(false);
  };

  /* ── VENDORS label + list — below the frame ── */
  const listBlock = (
            <div className="flex flex-col gap-[10px] w-full">
              <div className="flex items-center gap-[8px] min-h-[16px] w-full">
                <div className="size-[6px] rounded-full shrink-0 bg-[#6c779d]" />
                <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#6c779d] text-[12px] uppercase tracking-[0.4px] whitespace-nowrap">
                  {effectiveTab === "Flagged"
                    ? "Flagged"
                    : segment === "vendor"
                      ? "Added Vendors"
                      : "Customers"}
                </p>
                <CountPill>{tabVendors.length}</CountPill>
              </div>

              {/* Bulk confirm: Customers segment, Needs Review tab, risk-free rows only.
                  Risk-flagged rows need per-item review and are excluded here. */}
              {segment === "customer" && effectiveTab === "Needs Review" &&
               tabVendors.filter((v) => !v.riskLevel).length > 0 && (
                <button
                  type="button"
                  onClick={handleBulkConfirm}
                  disabled={bulkBusy || trustBusy}
                  data-testid="button-bulk-confirm-customers"
                  className="flex items-center justify-center px-[16px] py-[8px] rounded-[100px] w-full [font-family:'Gilroy',sans-serif] font-semibold text-[14px] disabled:opacity-50 disabled:cursor-wait hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                  style={{ background: "#0d2214", color: "#42bf23" }}
                >
                  {bulkBusy
                    ? "Confirming..."
                    : `Confirm All ${tabVendors.filter((v) => !v.riskLevel).length} Customers`}
                </button>
              )}

              <div
                className="bg-[#0a0c10] border border-solid border-[#1d2132] flex flex-col overflow-hidden relative rounded-[16px]"
                data-testid="list-counterparties"
              >
                <div>
                  {tabVendors.length === 0 ? (
                    <div className="flex gap-[12px] items-center px-[16px] py-[12px] relative shrink-0 w-full">
                      <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">
                        {effectiveTab === "Needs Review" &&
                          `Nothing to review. New and risk-flagged ${segmentNoun} appear here.`}
                        {effectiveTab === "Trusted" &&
                          `No ${trustedLabel.toLowerCase()} ${segmentNoun} yet. ${
                            segment === "vendor"
                              ? "Trust a vendor from the Needs Review tab."
                              : "Confirm a customer from the Needs Review tab."
                          }`}
                        {/* No Suggested copy: the chip is only rendered while its
                            bucket has rows, so an empty Suggested list is
                            unreachable. Restore a line here if that changes. */}
                        {effectiveTab === "Flagged" && `No flagged ${segmentNoun}.`}
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
                          reason={effectiveTab === "Needs Review" ? reviewReasonLabel(vendor) : null}
                          reviewed={effectiveTab === "Trusted" && isReviewedOnly(vendor)}
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
            value={effectiveTab}
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
          <UnavailableDataBox testId="text-counterparties-unavailable">
            Couldn't reach Brain to load counterparties. Try again shortly.
          </UnavailableDataBox>
        ) : (
          listBlock
        )}
      </div>

      {/* Submit confirmation popup */}
      <SubmitConfirmDialog
        open={confirmSubmit}
        vendorName={vendorName}
        category={category}
        nounTitle={segmentNounTitle}
        noun={segmentNounSingular}
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
        onGrant={handleGrant}
        onFlag={handleFlag}
        onRestore={handleRestore}
        onAcknowledge={handleAcknowledge}
        trustBusy={trustBusy}
      />

    </div>
  );
}
