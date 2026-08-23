/**
 * SourceIngestToast — bottom-right progress popup shown while a document source
 * is being uploaded, ingested, and extracted by brain-core.
 *
 * Matches the Figma "Postponed" popup chrome (node 6415:69318):
 *  • bg #0a0c10, border #1d2132, rounded-16, deep layered shadow
 *  • 24×24 icon disc on the left, 16px gap, 16px padding
 *  • Title  — brain-v1baby-blue-100 (#a8b9f4), 16px / leading-24
 *  • Progress bar — 8px tall; track #e0e4eb; fill brain-v1purple (#7631ee); rounded-40
 *
 * Progress milestones (animated via CSS transitions so each step is smooth):
 *  • Upload in-flight       →  5% → 30%  (time-stepped over ~4 s)
 *  • extractStatus pending  →  48%  (1.5 s transition)
 *  • extractStatus ingested →  62%  (1.2 s)
 *  • extractStatus extracting → 82%  (4 s — simulates the read taking time)
 *  • extracted + proj running → 90%  (2 s)
 *  • terminal               → 100%  (0.6 s), then auto-dismiss after 1.2 s
 *  • error status           → dismiss immediately + fire an AppAlert error
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useAppAlert } from "@/components/AppAlert";
import postponedIcon from "@assets/postpone_1784058164236.png";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type ExtractStatus =
  | "pending"
  | "ingested"
  | "extracting"
  | "extracted"
  | "unsupported"
  | "unavailable"
  | "failed";

type ProjectionStatus =
  | "pending"
  | "projecting"
  | "projected"
  | "projection_timed_out"
  | "projection_failed";

type TrackedDoc = {
  id: string;
  extractStatus: ExtractStatus | null;
  projectionStatus?: ProjectionStatus | null;
  uploadedAt?: string | null;
};

type Phase = "idle" | "uploading" | "processing" | "completing";

type IngestState = {
  phase: Phase;
  /** Display name — filename for single file, undefined for a batch. */
  label?: string;
  /** brain-core doc ID returned by the POST endpoint. */
  docId?: string;
};

export type SourceIngestContextValue = {
  /** Call when upload starts (before mutate). */
  notifyUploadStart: (label?: string) => void;
  /** Call in mutation onSuccess with the raw JSON payload. */
  notifyUploadSuccess: (data: unknown) => void;
  /** Call in mutation onError. */
  notifyUploadError: () => void;
};

/* ─── Context ────────────────────────────────────────────────────────────── */

const SourceIngestContext = createContext<SourceIngestContextValue | null>(null);

/* ─── Progress helpers ───────────────────────────────────────────────────── */

type ProgressSpec = { pct: number; ms: number };

const UPLOAD_STEPS: { pct: number; delay: number }[] = [
  { pct: 10, delay: 600 },
  { pct: 18, delay: 1400 },
  { pct: 24, delay: 2500 },
  { pct: 30, delay: 4000 },
];

function progressForStatus(
  extract: ExtractStatus | null,
  proj: ProjectionStatus | null | undefined,
): ProgressSpec | { error: true } {
  switch (extract) {
    case null:
    case "pending":
      return { pct: 48, ms: 1500 };
    case "ingested":
      return { pct: 62, ms: 1200 };
    case "extracting":
      return { pct: 82, ms: 4000 };
    case "extracted": {
      const p = proj ?? null;
      if (p === "pending" || p === "projecting") return { pct: 90, ms: 2000 };
      return { pct: 100, ms: 600 };
    }
    case "failed":
    case "unsupported":
    case "unavailable":
      return { error: true };
    default:
      return { pct: 50, ms: 1500 };
  }
}

/* ─── Card component ─────────────────────────────────────────────────────── */

function SourceIngestCard({
  label,
  pct,
  transitionMs,
}: {
  label: string;
  pct: number;
  transitionMs: number;
}) {
  const clamped = Math.max(5, Math.min(100, pct));
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      data-testid="source-ingest-toast"
      className="fixed bottom-[20px] right-[20px] z-[101] pointer-events-none"
    >
      <div
        className="bg-brain-v1highlight-dropdown-bg border border-brain-v1stroke-2 rounded-panel flex gap-[16px] items-start p-[16px] w-[335px] max-w-[calc(100vw-40px)]"
        style={{
          boxShadow:
            "0px 68px 13.5px rgba(0,0,0,0.06), 0px 38px 11.5px rgba(0,0,0,0.2), 0px 17px 8.5px rgba(0,0,0,0.34), 0px 4px 4.5px rgba(0,0,0,0.39)",
        }}
      >
        {/* Status icon */}
        <img
          src={postponedIcon}
          alt=""
          aria-hidden="true"
          className="shrink-0 size-[24px] rounded-full object-cover"
        />

        {/* Title + progress bar */}
        <div className="flex flex-col gap-[6px] flex-1 min-w-0">
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 text-[16px] leading-[24px] truncate">
            {label}
          </p>

          {/* Track */}
          <div
            className="h-[8px] w-full rounded-[40px] overflow-hidden"
            style={{ backgroundColor: "#e0e4eb" }}
            aria-hidden="true"
          >
            {/* Fill */}
            <div
              className="h-full rounded-[40px] bg-brain-v1purple"
              style={{
                width: `${clamped}%`,
                transition: `width ${transitionMs}ms ease-out`,
                willChange: "width",
              }}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ─── Provider ───────────────────────────────────────────────────────────── */

export function SourceIngestToastProvider({ children }: { children: ReactNode }) {
  const alert = useAppAlert();

  const [state, setState] = useState<IngestState>({ phase: "idle" });
  const [pct, setPct] = useState(5);
  const [transitionMs, setTransitionMs] = useState(1200);

  // Whether the toast card is visible
  const visible = state.phase !== "idle";

  // Timer refs (cleared on unmount / phase change)
  const uploadTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearUploadTimers = useCallback(() => {
    uploadTimers.current.forEach(clearTimeout);
    uploadTimers.current = [];
  }, []);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearUploadTimers();
    clearDismissTimer();
    setState({ phase: "idle" });
    setPct(5);
    setTransitionMs(1200);
  }, [clearUploadTimers, clearDismissTimer]);

  /* Poll the documents list while processing so we can track extract status. */
  const docsQuery = useQuery<TrackedDoc[]>({
    queryKey: ["/api/integrations/documents"],
    refetchInterval: state.phase === "processing" ? 4_000 : false,
    staleTime: 0,
    enabled: state.phase === "processing",
  });

  /* Find the specific document being tracked (by ID, or the most recently
     uploaded one if we don't have an ID). */
  const trackedDoc = useMemo<TrackedDoc | null>(() => {
    if (state.phase !== "processing") return null;
    const docs = docsQuery.data ?? [];
    if (state.docId) return docs.find((d) => d.id === state.docId) ?? null;
    // Fallback: pick any doc that is still in-flight.
    return (
      docs.find((d) => {
        const s = d.extractStatus ?? "pending";
        return ["pending", "ingested", "extracting"].includes(s);
      }) ?? null
    );
  }, [state.phase, state.docId, docsQuery.data]);

  /* React to extraction status changes. */
  useEffect(() => {
    if (state.phase !== "processing") return;
    if (!trackedDoc) return;

    const result = progressForStatus(
      trackedDoc.extractStatus,
      trackedDoc.projectionStatus,
    );

    if ("error" in result) {
      dismiss();
      alert.error(
        "Couldn't add source",
        "The file couldn't be read by brain-core. Try uploading again.",
      );
      return;
    }

    const { pct: targetPct, ms } = result;

    // Never go backwards.
    setPct((prev) => {
      if (targetPct <= prev) return prev;
      setTransitionMs(ms);
      return targetPct;
    });

    // Reached 100% → enter completing phase.
    if (targetPct === 100) {
      setState((prev) => ({ ...prev, phase: "completing" }));
      clearDismissTimer();
      dismissTimer.current = setTimeout(dismiss, 1400);
    }
  }, [state.phase, trackedDoc, dismiss, clearDismissTimer, alert]);

  /* ── Public API ── */

  const notifyUploadStart = useCallback(
    (label?: string) => {
      // If already showing (e.g. multiple files in a batch), just refresh label.
      clearUploadTimers();
      clearDismissTimer();
      setState({ phase: "uploading", label });
      setPct(5);
      setTransitionMs(600);

      // Step through simulated upload progress.
      const timers = UPLOAD_STEPS.map(({ pct: p, delay }) =>
        setTimeout(() => {
          setPct((prev) => Math.max(prev, p));
          setTransitionMs(800);
        }, delay),
      );
      uploadTimers.current = timers;
    },
    [clearUploadTimers, clearDismissTimer],
  );

  const notifyUploadSuccess = useCallback(
    (data: unknown) => {
      clearUploadTimers();
      // Extract the doc ID from the server response shape: { document: { id } }
      const raw = data as Record<string, unknown> | null | undefined;
      const doc = raw?.document as Record<string, unknown> | undefined;
      const docId =
        typeof doc?.id === "string"
          ? doc.id
          : typeof raw?.id === "string"
            ? raw.id
            : undefined;

      setPct(32);
      setTransitionMs(1000);
      setState((prev) => ({ ...prev, phase: "processing", docId }));
    },
    [clearUploadTimers],
  );

  const notifyUploadError = useCallback(() => {
    dismiss();
  }, [dismiss]);

  const value = useMemo<SourceIngestContextValue>(
    () => ({ notifyUploadStart, notifyUploadSuccess, notifyUploadError }),
    [notifyUploadStart, notifyUploadSuccess, notifyUploadError],
  );

  const displayLabel = state.label
    ? `Adding "${state.label}"`
    : "Adding Source";

  return (
    <SourceIngestContext.Provider value={value}>
      {children}
      {visible && (
        <SourceIngestCard label={displayLabel} pct={pct} transitionMs={transitionMs} />
      )}
    </SourceIngestContext.Provider>
  );
}

/* ─── Hook ───────────────────────────────────────────────────────────────── */

export function useSourceIngestToast(): SourceIngestContextValue {
  const ctx = useContext(SourceIngestContext);
  return useMemo(
    () =>
      ctx ?? {
        notifyUploadStart: () => {},
        notifyUploadSuccess: () => {},
        notifyUploadError: () => {},
      },
    [ctx],
  );
}
