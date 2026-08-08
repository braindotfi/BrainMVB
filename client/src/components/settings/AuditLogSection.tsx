import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import chevronDownIcon from "@/assets/chevron_down_dropdown.png";
import { useBrainAuditRecords, AUDIT_EVENTS_LIMIT } from "@/lib/brainAudit";
import { partitionSystemActivity } from "@/lib/auditVisibility";
import { humanReadableActor, isAssistantActivity } from "@/lib/auditTypes";
import type { AuditRecord } from "@/lib/auditTypes";
import { useAcknowledgedRecords } from "@/lib/acknowledgedStore";
import { useCurrency } from "@/lib/useCurrency";
import { AuditRecordPopup } from "@/components/AuditRecordPopup";
import { AlertCallout } from "@/components/Callout";
import { capitalCase } from "@/lib/displayLabels";
import { CountPill } from "@/components/CountPill";
import { RecordPill } from "@/components/RecordPill";

/* Settings → Audit Log.
 *
 * The complete, unfiltered event trail. The Decisions timeline deliberately
 * shows only what a person decided — it is a working queue, and pipeline noise
 * buries it. That leaves nowhere in the product to answer "what has actually
 * happened on this tenant", which is the question an auditor, a security
 * reviewer, or anyone debugging an ingest asks. This page is that place.
 *
 * Two rules it exists to keep:
 *
 * 1. NOTHING IS HIDDEN BY DEFAULT. The type filter starts on "All Types". A
 *    default filter would make an empty list a fact about the filter rather
 *    than about the tenant, which is the failure `auditVisibility` was written
 *    to prevent. When the user DOES narrow the list and it comes back empty,
 *    the copy below names how many records the filter is withholding.
 *
 * 2. UNREACHABLE IS NOT EMPTY. `useBrainAuditRecords` returns `records: []`
 *    when the audit read fails. Rendering that as "no audit records yet" would
 *    tell someone their history is clean when it is merely unreadable, so the
 *    error state is handled before the empty state and says so plainly.
 *
 * The same care applies to the count. brain-core's event list pages behind a
 * cursor this app does not follow, so a full page back is "at least N", not
 * "N". The header badge and caption say which of the two they mean.
 *
 * Row categorisation reuses `partitionSystemActivity` / `isAssistantActivity`
 * rather than re-deriving what counts as pipeline traffic — brain-core's own
 * event_type decides, and one place should read it.
 */

type TypeFilter = "all" | "decisions" | "assistant" | "system";

const FILTER_OPTIONS: { id: TypeFilter; label: string }[] = [
  { id: "all", label: "All Types" },
  { id: "decisions", label: "Decisions" },
  { id: "assistant", label: "Assistant" },
  { id: "system", label: "System" },
];

/* Assistant activity is neither a decision nor pipeline traffic: it is a person
   asking Brain a question. It gets its own badge so "Decisions Only" can mean
   decisions, and is reachable through "All Types". */
type Category = "decision" | "assistant" | "system";

const CATEGORY_BADGE: Record<Category, { label: string; bg: string; color: string; border: string }> = {
  decision:  { label: "Decision",  bg: "#4a2300", color: "#ff9500", border: "1px solid rgba(255,149,0,0.2)" },
  assistant: { label: "Assistant", bg: "#4a2300", color: "#ff9500", border: "1px solid rgba(255,149,0,0.2)" },
  system:    { label: "Systems",   bg: "#4a2300", color: "#ff9500", border: "1px solid rgba(255,149,0,0.2)" },
};

const RECORD_STATUS_BADGE = {
  pending: { label: "Pending", bg: "#222737", color: "#6c779d", border: "1px solid rgba(108,119,157,0.2)" },
  anchored: { label: "Anchored", bg: "#123509", color: "#42bf23", border: "1px solid rgba(66,191,35,0.2)" },
  /* not_recorded never reached brain-core's audit log, so "Pending" (which
     implies a future anchor) would be false. Distinct, honest styling — no
     "waiting" connotation. */
  notRecorded: { label: "Not recorded", bg: "#3a1414", color: "#e5484d", border: "1px solid rgba(229,72,77,0.2)" },
} as const;

function categorise(record: AuditRecord, systemIds: ReadonlySet<string>): Category {
  if (systemIds.has(record.id)) return "system";
  return isAssistantActivity(record) ? "assistant" : "decision";
}

/** Free-text match across everything the row actually shows, plus the record
 *  id so a support ticket quoting an id finds its record. */
function matches(record: AuditRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    record.summary,
    record.counterparty,
    record.actor,
    record.id,
    record.rowSubtitle,
    typeof record.amount === "number" ? String(record.amount) : undefined,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function AuditLogSection() {
  const { records: brainRecords, isLoading, isError, eventCount } = useBrainAuditRecords();
  const acknowledgedRecords = useAcknowledgedRecords();
  const { formatText } = useCurrency();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<AuditRecord | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /* Which option the keyboard is on. Opens on the current selection so an arrow
     press moves from where the user is, not from the top of the list. */
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filterOpen]);

  /* Focus follows activeIndex while the menu is open, so `aria-activedescendant`
     and the real focus ring never disagree. */
  useEffect(() => {
    if (filterOpen) optionRefs.current[activeIndex]?.focus();
  }, [filterOpen, activeIndex]);

  const openMenu = (open: boolean) => {
    if (open) {
      const i = FILTER_OPTIONS.findIndex((o) => o.id === filter);
      setActiveIndex(i < 0 ? 0 : i);
    }
    setFilterOpen(open);
  };

  const closeMenu = (returnFocus: boolean) => {
    setFilterOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const commit = (id: TypeFilter) => {
    setFilter(id);
    closeMenu(true);
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const last = FILTER_OPTIONS.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i >= last ? 0 : i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? last : i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(last);
        break;
      case "Escape":
        e.preventDefault();
        closeMenu(true);
        break;
      case "Tab":
        /* Tabbing away is a dismissal, but focus belongs wherever Tab is
           sending it — do not yank it back to the trigger. */
        closeMenu(false);
        break;
      default:
        break;
    }
  };

  /* Local insight acknowledgements are already shaped as canonical audit records,
     but they are intentionally kept in the user-scoped acknowledgement store until
     Brain-core has a durable event for them. Include them here so acknowledging an
     insight removes it from the active queue without making it disappear from the
     audit trail. Suppress a local duplicate if the same record has reached the
     authoritative Brain audit feed. */
  const records = useMemo(() => {
    const brainIds = new Set(brainRecords.map((record) => record.id));
    return [...brainRecords, ...acknowledgedRecords.filter((record) => !brainIds.has(record.id))]
      .sort((a, b) => b.occurredAtMs - a.occurredAtMs);
  }, [brainRecords, acknowledgedRecords]);

  const systemIds = useMemo(() => {
    const { system } = partitionSystemActivity(records);
    return new Set(system.map((r) => r.id));
  }, [records]);

  /* Search applies to every record first, so the "hidden by the type filter"
     counts below describe what the TYPE filter is withholding from the current
     search — not the whole log, which would overstate it. */
  const searched = useMemo(() => records.filter((r) => matches(r, query)), [records, query]);

  const visible = useMemo(() => {
    if (filter === "all") return searched;
    if (filter === "assistant") return searched.filter((r) => categorise(r, systemIds) === "assistant");
    if (filter === "system") return searched.filter((r) => systemIds.has(r.id));
    return searched.filter((r) => categorise(r, systemIds) === "decision");
  }, [searched, filter, systemIds]);

  const withheldByFilter = searched.length - visible.length;

  /* A full page back means the cursor has more behind it. Nothing here may say
     "N events" in that case — only "at least N". Measured on brain-core's raw
     page, never the merged list: locally-recorded assistant questions are not
     subject to the read's limit, and letting them count would turn a short page
     into a false "there is more" claim. */
  const atEventLimit = eventCount >= AUDIT_EVENTS_LIMIT;

  /* The audit read failing does NOT empty the list — locally-recorded assistant
     questions are merged in from a separate query and survive. So the error
     cannot be left to the empty state: a list of two local rows under copy that
     promises "every recorded event" is a completeness claim the page has no
     standing to make. When the primary feed is unreadable, say so above the
     rows, whatever else is on screen. */
  const feedUnavailable = isError;

  /* Pager over exactly what is on screen, so Next never jumps to a row the
     current filter is hiding. */
  const stepRecord = (delta: number) => {
    if (!activeRecord) return;
    const i = visible.findIndex((r) => r.id === activeRecord.id);
    if (i < 0) return;
    const next = visible[i + delta];
    if (next) setActiveRecord(next);
  };
  const pagerDisabled = visible.length < 2;

  const emptyMessage = (): { title: string; detail?: string } => {
    if (isError) {
      return {
        title: "Brain could not read your audit history.",
        detail: "This list is unavailable, not empty. No conclusion should be drawn from it being blank.",
      };
    }
    if (isLoading) return { title: "Reading your audit history…" };
    if (records.length === 0) return { title: "No audit records yet." };
    if (query.trim() && searched.length === 0) return { title: "No records match your search." };
    if (withheldByFilter > 0) {
      return {
        title:
          filter === "system"
            ? "No system activity here."
            : filter === "assistant"
              ? "No assistant activity here."
              : "No decision records here.",
        detail: `${plural(withheldByFilter, "record is", "records are")} hidden by the type filter. Switch to "All Types" to see everything.`,
      };
    }
    return { title: "No records match your search." };
  };

  const activeLabel = FILTER_OPTIONS.find((o) => o.id === filter)?.label ?? "All Types";

  return (
    <div className="flex flex-col gap-[20px] w-full">
      <div className="flex flex-col gap-[4px] w-full">
        <div className="flex items-center gap-2 min-h-[36px]">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-brain-v1baby-blue-60 text-[16px]">
            Audit Log
          </p>
          {/* Suppressed while the feed is unreadable: a count next to a partial
              list reads as a total. */}
          {!isLoading && !feedUnavailable && records.length > 0 && (
            <CountPill testId="badge-audit-count">
              {visible.length === records.length
                ? `${records.length}${atEventLimit ? "+" : ""}`
                : `${visible.length} of ${records.length}${atEventLimit ? "+" : ""}`}
            </CountPill>
          )}
        </div>

        {feedUnavailable && (
          <p
            className="[font-family:'Gilroy',sans-serif] font-medium leading-[18px] text-brain-v1baby-blue-60 text-[13px] pb-[8px]"
            data-testid="text-audit-scope"
          >
            Brain's audit feed could not be read, so this page cannot say what your history contains.
          </p>
        )}

        {/* The read can fail and still leave rows on screen: assistant questions
            are recorded locally and merge in from a separate query. Without this
            banner those few rows would sit under a heading that implies they are
            the whole trail. */}
        {feedUnavailable && visible.length > 0 && (
          <AlertCallout
            title="This list is incomplete."
            testId="notice-audit-unavailable"
            className="mb-[8px]"
          >
            Brain could not read your audit history. What is shown below was recorded in this
            browser — the events from Brain are missing, not absent. Try again in a moment.
          </AlertCallout>
        )}

        {/* Controls */}
        <div className="flex items-center gap-[8px] w-full">
          <div className="flex-1 min-w-0 flex h-[40px] items-center gap-[8px] p-[8px] rounded-[8px] bg-brain-v1baby-blue-15">
            <Search className="flex-shrink-0 size-[24px]" color="#6c779d" strokeWidth={1.8} />
            <input
              data-testid="input-audit-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search audit log…"
              aria-label="Search audit records"
              className="flex-1 min-w-0 h-[24px] bg-transparent outline-none [font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 placeholder:text-brain-v1baby-blue-60 text-[14px] leading-[20px]"
            />
          </div>

          {/* Keyboard behaviour is hand-rolled because this is the only listbox
              on the page and the shared Select brings its own visual language.
              It implements the parts a keyboard user actually needs: open on
              Enter/Space/ArrowDown, move with the arrows and Home/End, commit on
              Enter/Space, dismiss on Escape with focus returned to the trigger. */}
          <div ref={filterRef} className="relative shrink-0 w-[120px]">
            <button
              ref={triggerRef}
              type="button"
              data-testid="button-audit-type-filter"
              aria-haspopup="listbox"
              aria-expanded={filterOpen}
              aria-label={`Filter by record type: ${activeLabel}`}
              onClick={() => openMenu(!filterOpen)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  openMenu(true);
                }
              }}
              className="bg-brain-v1baby-blue-15 rounded-[8px] p-[8px] flex items-center gap-[8px] w-full text-left outline-none hover:bg-brain-v1baby-blue-15-hover transition-colors focus-visible:ring-2 focus-visible:ring-brain-v1purple"
            >
              <span className="flex-1 min-w-0 [font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 text-[14px] leading-[20px] whitespace-nowrap truncate">
                {activeLabel}
              </span>
              <img src={chevronDownIcon} alt="" aria-hidden="true" className="shrink-0 h-[7px] w-auto" />
            </button>
            {filterOpen && (
              <div
                role="listbox"
                aria-label="Record type"
                aria-activedescendant={`audit-type-option-${FILTER_OPTIONS[activeIndex]?.id ?? filter}`}
                onKeyDown={onMenuKeyDown}
                className="absolute left-0 top-[calc(100%+4px)] z-[60] bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 border-solid flex flex-col items-start p-[8px] rounded-row w-[208px] shadow-[0px_68px_13.5px_rgba(0,0,0,0.06),0px_38px_11.5px_rgba(0,0,0,0.2),0px_17px_8.5px_rgba(0,0,0,0.34),0px_4px_4.5px_rgba(0,0,0,0.39)]"
              >
                {FILTER_OPTIONS.map((o, i) => (
                  <button
                    key={o.id}
                    id={`audit-type-option-${o.id}`}
                    ref={(el) => { optionRefs.current[i] = el; }}
                    type="button"
                    role="option"
                    aria-selected={filter === o.id}
                    tabIndex={i === activeIndex ? 0 : -1}
                    data-testid={`option-audit-type-${o.id}`}
                    onFocus={() => setActiveIndex(i)}
                    onClick={() => commit(o.id)}
                    className="flex items-center p-[8px] rounded-[8px] shrink-0 w-full text-left [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-brain-v1baby-blue-100 text-[14px] whitespace-nowrap outline-none hover:bg-brain-v1baby-blue-15 focus-visible:bg-brain-v1baby-blue-15"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Records */}
      <div
        className="rounded-panel overflow-hidden border border-solid border-brain-v1stroke-2"
        style={{ background: "#0a0c10" }}
      >
        {visible.length === 0 ? (
          <div className="p-[24px] flex flex-col items-center gap-[6px]" data-testid="text-audit-empty">
            <p
              className="[font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] text-center"
              style={{ color: isError ? "#ff9500" : "#6c779d" }}
            >
              {emptyMessage().title}
            </p>
            {emptyMessage().detail && (
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[13px] leading-[18px] text-center max-w-[420px]">
                {emptyMessage().detail}
              </p>
            )}
          </div>
        ) : (
          visible.map((record, i) => {
            const category = categorise(record, systemIds);
            const categoryBadge = CATEGORY_BADGE[category];
            /* A record is only Anchored when brain-core has confirmed an
               on-chain transaction. Records with no Merkle proof yet and
               records sealed in the audit chain while the transaction is
               still pending both use the honest Pending pill. not_recorded
               never reached brain-core's audit log at all, so it gets its
               own pill rather than being folded into "Pending". */
            const statusBadge =
              record.anchor.status === "anchored"
                ? RECORD_STATUS_BADGE.anchored
                : record.anchor.status === "not_recorded"
                  ? RECORD_STATUS_BADGE.notRecorded
                  : RECORD_STATUS_BADGE.pending;
            const actor = humanReadableActor(record.actor);
            return (
              <div key={record.id}>
                {i > 0 && <div className="h-px bg-brain-v1stroke-2 w-full" />}
                <button
                  type="button"
                  data-testid={`row-audit-${record.id}`}
                  onClick={() => setActiveRecord(record)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-brain-v1row-hover transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px]"
                >
                  <div className="flex-1 min-w-0 flex flex-col gap-[4px]">
                    <div className="flex items-center gap-[8px] w-full min-w-0">
                      <span className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 text-[16px] leading-[20px] min-w-0 max-w-full basis-auto grow-0 shrink truncate">
                        {formatText(record.summary)}
                      </span>
                      <RecordPill
                        testId={`badge-audit-category-${record.id}`}
                        className=""
                        style={{ background: categoryBadge.bg, color: categoryBadge.color, border: categoryBadge.border }}
                      >
                        {capitalCase(categoryBadge.label)}
                      </RecordPill>
                    </div>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[14px] leading-[16px]">
                      {[actor, formatText(record.rowSubtitle ?? ""), record.occurredAtLabel]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <RecordPill
                    testId={`badge-audit-status-${record.id}`}
                    className=""
                    style={{ background: statusBadge.bg, color: statusBadge.color, border: statusBadge.border }}
                  >
                    {statusBadge.label}
                  </RecordPill>
                </button>
              </div>
            );
          })
        )}
      </div>

      <AuditRecordPopup
        record={activeRecord}
        open={activeRecord !== null}
        onOpenChange={(o) => { if (!o) setActiveRecord(null); }}
        onPrev={() => stepRecord(-1)}
        onNext={() => stepRecord(1)}
        pagerDisabled={pagerDisabled}
        returnToBase="/settings?section=audit"
      />
    </div>
  );
}
