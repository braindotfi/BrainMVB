import type { ExtractStatus } from "@/lib/sourceTypes";

/* ── How far Brain has got with an uploaded document ──────────────────────────
   Shared by the upload screens and by Settings → Sources so a document never
   reports one thing in the form that uploaded it and another in the list below.

   "Stored" is the honest default for an unrecognised status: the file reached us,
   and we decline to claim anything further about it. */

export function extractStatusMeta(s: ExtractStatus): { label: string; tone: "ok" | "progress" | "warn" | "muted" } {
  switch (s) {
    case "extracted":   return { label: "Read", tone: "ok" };
    case "extracting":  return { label: "Extracting…", tone: "progress" };
    case "ingested":    return { label: "Stored · awaiting extraction", tone: "progress" };
    case "pending":     return { label: "Uploading…", tone: "progress" };
    case "unsupported": return { label: "Can't read this file type yet", tone: "warn" };
    case "unavailable": return { label: "Stored · extraction coming soon", tone: "muted" };
    case "failed":      return { label: "Couldn't process", tone: "warn" };
    default:            return { label: "Stored", tone: "muted" };
  }
}

const TONE_STYLE: Record<"ok" | "progress" | "warn" | "muted", { color: string; dot: string }> = {
  ok:       { color: "#42bf23", dot: "#42bf23" },
  progress: { color: "#a8b9f4", dot: "#7631ee" },
  warn:     { color: "#ff9500", dot: "#ff9500" },
  muted:    { color: "#6c779d", dot: "#414965" },
};

export function ExtractStatusBadge({ status, testId }: { status: ExtractStatus; testId?: string }) {
  const meta = extractStatusMeta(status);
  const s = TONE_STYLE[meta.tone];
  const spinning = meta.tone === "progress";
  return (
    <span className="flex items-center gap-[6px]" data-testid={testId}>
      {spinning ? (
        <span
          className="size-[10px] rounded-full border-2 border-t-transparent animate-spin shrink-0"
          style={{ borderColor: s.dot, borderTopColor: "transparent" }}
          aria-hidden
        />
      ) : (
        <span className="size-[6px] rounded-full shrink-0" style={{ background: s.dot }} aria-hidden />
      )}
      <span className="[font-family:'Gilroy',sans-serif] font-medium text-[12px] leading-[16px]" style={{ color: s.color }}>
        {meta.label}
      </span>
    </span>
  );
}
