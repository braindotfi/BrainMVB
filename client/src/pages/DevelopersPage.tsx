/**
 * Developers section — Overview, API Keys, Tenants, Usage and Limits (+ Docs link).
 *
 * Assembled ONLY from existing design patterns (Settings two-column shell,
 * Home metric cards / list rows, existing pill buttons and badges). No mock
 * data: keys are issued and stored by brain-core (proxied via
 * /api/developers/keys; plaintext relayed exactly once), usage aggregates
 * REAL brain-core audit events plus brain-core's per-key usage attribution,
 * tenants read the existing tenancy layer. While brain-core's key API flag
 * is off upstream, the server answers 503 keys_api_unavailable and this page
 * shows an honest "not yet enabled" state — never a local fallback.
 *
 * Webhooks are deliberately excluded from this section (v2).
 */
import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Plus } from "lucide-react";
import overviewActiveIcon from "@assets/Icon=Overview,_State=Active_1784755235082.png";
import overviewInactiveIcon from "@assets/Icon=Overview,_State=Normal_1784755235083.png";
// NOTE: the attached filenames for Keys are swapped relative to their actual
// visual content. The file named "Active" is gray/inactive; "Inactive" is
// purple/active. We import them into correctly-named variables here.
import keysActiveIcon from "@assets/Icon=Keys_State=Inactive_1784673358523.png";
import keysInactiveIcon from "@assets/Icon=Keys_State=Active_1784673358524.png";
import tenantsActiveIcon from "@assets/Icon=Tenants,_State=Active_1784755235083.png";
import tenantsInactiveIcon from "@assets/Icon=Tenants,_State=Normal_1784755235083.png";
import usageActiveIcon from "@assets/Icon=Usage,_State=Active_1784673358525.png";
import usageInactiveIcon from "@assets/Icon=Usage,_State=Inactive_1784673358525.png";
import docsInactiveIcon from "@assets/Icon=Docs,_State=Normal_1784755235083.png";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppAlert } from "@/components/AppAlert";
import { usePlanId, PLAN_RATE_LIMITS } from "@/lib/planStore";

/* ─── Types (wire shapes from server/routes.ts developers block) ─── */
type DevEnv = "sandbox" | "live";

interface MaskedKey {
  id: string;
  name: string;
  environment: string;
  scopes: string[];
  keyPrefix: string;
  keyLast4: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  rotatedFromId: string | null;
  status: "active" | "revoked";
}

/** Masked display is built CLIENT-side from prefix + last4 (PR #309 contract). */
const maskKey = (k: Pick<MaskedKey, "keyPrefix" | "keyLast4">): string =>
  `${k.keyPrefix}\u2022\u2022\u2022\u2022${k.keyLast4}`;

/** True when the server reported 503 keys_api_unavailable (brain-core's
 *  key API flag is off upstream). The UI shows an honest waiting state. */
const isKeysApiUnavailable = (e: unknown): boolean =>
  e instanceof Error && e.message.startsWith("503") && e.message.includes("keys_api_unavailable");

interface TenantsResponse {
  mode: "demo" | "production";
  canCreate: boolean;
  /** Server-computed readiness signal — matches the gate on POST /keys exactly. */
  liveKeysAvailable: boolean;
  tenants: Array<{
    id: string;
    companyName: string | null;
    environment: string;
    createdAt: string | null;
    ephemeral: boolean;
    /** Demo tenants only: when the ephemeral session (and tenant) resets. */
    expiresAt?: string | null;
  }>;
}

interface UsageResponse {
  totalEvents: number;
  byAction: Array<{ action: string; count: number; daily: Array<{ date: string; count: number }> }>;
  byLayer: Array<{ layer: string; count: number }>;
  daily: Array<{ date: string; count: number }>;
  windowDays: number;
  environment: DevEnv;
}

/** brain-core per-key usage attribution (camelCase wire shape from the
 *  platform proxy; 30-day window). */
interface KeyUsageResponse {
  window: string;
  totalEvents: number;
  keys: Array<{
    keyId: string;
    environment: string;
    eventCount: number;
    firstEventAt: string | null;
    lastEventAt: string | null;
  }>;
}

/** Full brain-core audit event shape passed through the generic proxy —
 *  the list row uses a subset; the detail modal consumes the rest. */
interface DevAuditEvent {
  id: string;
  tenant_id: string;
  layer: string;
  actor: string;
  action: string;
  inputs: unknown;
  outputs: unknown;
  created_at: string;
}

interface AuditEventsResponse {
  events: DevAuditEvent[];
}

/** The only scopes brain-core recognizes on tenant API keys — enforced by
 *  brain-core's gateway on every key-authenticated call. */
const SCOPE_OPTIONS = [
  { id: "ledger:read", label: "Ledger read", hint: "Accounts, transactions, invoices" },
  { id: "audit:read", label: "Audit read", hint: "Audit events and anchors" },
] as const;

const ENV_STORAGE_KEY = "brain_developers_env";

/** Display-name mapping for raw brain-core audit event names → the SDK-facing
 *  concept a developer actually called. Raw name stays available on hover. */
const ACTION_LABELS: Record<string, string> = {
  "wiki.question": "Ask a question (brain.ask)",
  "wiki.answer": "Answer generated (brain.ask)",
  "payment_intent.proposed": "Propose a payment (brain.propose)",
  "payment_intent.approved": "Approve a payment (brain.approve)",
  "payment_intent.rejected": "Reject a payment (brain.reject)",
  "raw.ingested": "Ingest a document (brain.ingest)",
  "raw.extracted": "Extract a document (brain.extract)",
};
const humanizeAction = (action: string): string => ACTION_LABELS[action] ?? action;

/** Key-authed platform endpoints — paths and scopes MUST mirror the
 *  registerKeyAuthedRead registrations in server/routes.ts exactly. */
const API_ENDPOINTS: Array<{ path: string; scope: string | null; description: string }> = [
  { path: "/api/v1/ping", scope: null, description: "Verify a key works and complete the checklist above" },
  { path: "/api/v1/ledger/accounts", scope: "ledger:read", description: "Ledger accounts for your tenant" },
  { path: "/api/v1/ledger/transactions", scope: "ledger:read", description: "Ledger transactions (supports ?limit=, max 200)" },
  { path: "/api/v1/audit/events", scope: "audit:read", description: "Audit events (supports ?limit= and ?after=)" },
];

/* ─── Shared primitives (Settings/Home card + label patterns) ─── */
const Card = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <div data-testid={testId} className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
    {children}
  </div>
);

/* 16px/24 semibold #414965. Spacing to the card below comes from the
   parent flex container (flex flex-col gap-[4px]), NOT margin here. */
const SectionLabel = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <div className="flex items-center min-h-[36px]">
    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[16px] leading-[24px]" data-testid={testId}>
      {children}
    </p>
  </div>
);

const Mono = ({ children, className = "", testId }: { children: ReactNode; className?: string; testId?: string }) => (
  <span data-testid={testId} className={`[font-family:'JetBrains_Mono',monospace] ${className}`}>{children}</span>
);

const PillButton = ({ children, onClick, tone = "purple", disabled, testId }: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "purple" | "neutral" | "danger";
  disabled?: boolean;
  testId?: string;
}) => {
  const styles = {
    purple: { background: "#240757", color: "#a8b9f4" },
    neutral: { background: "#222737", color: "#6c779d" },
    danger: { background: "#350011", color: "#d20344" },
  }[tone];
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className="rounded-full px-4 py-2 hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center [font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] whitespace-nowrap"
      style={styles}
    >
      {children}
    </button>
  );
};

/* Pills matching the ProposalDetail review pop-up pattern:
   rounded-[100px], px-[10px] py-[5px], 12px/16px semibold, subtle border. */
const StatusBadge = ({ status }: { status: "active" | "revoked" }) => (
  <span
    data-testid={`badge-key-status-${status}`}
    className="inline-flex items-center justify-center px-[8px] py-[3px] rounded-[22px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] text-center whitespace-nowrap border"
    style={status === "active"
      ? { background: "#222737", color: "#a8b9f4", borderColor: "rgba(168,185,244,0.2)" }
      : { background: "#350011", color: "#d20344", borderColor: "rgba(210,3,68,0.2)" }}
  >
    {status === "active" ? "Active" : "Revoked"}
  </span>
);

const EnvBadge = ({ env }: { env: string }) => (
  <span
    className="inline-flex items-center justify-center px-[10px] py-[5px] rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] whitespace-nowrap border"
    style={env === "live"
      ? { background: "#4a2300", color: "#ff9500", borderColor: "rgba(255,149,0,0.2)" }
      : { background: "#222737", color: "#a8b9f4", borderColor: "rgba(168,185,244,0.2)" }}
  >
    {env === "live" ? "Live" : "Sandbox"}
  </span>
);

/* Honest waiting state while brain-core's key API flag is off upstream.
   Shared by Overview / API Keys / Usage — never a local fallback. */
const KeysUnavailableCard = ({ testId }: { testId?: string }) => (
  <Card testId={testId ?? "card-keys-unavailable"}>
    <div className="p-[16px] flex flex-col gap-[4px]">
      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px]">
        The keys API isn't enabled yet
      </p>
      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[16px]">
        brain-core's API-key service hasn't been switched on for this environment. Keys become
        available here automatically as soon as it is — no action needed on your side.
      </p>
    </div>
  </Card>
);

const EmptyRow = ({ children }: { children: ReactNode }) => (
  <div className="p-4">
    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[20px]">{children}</p>
  </div>
);

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Relative time for fresh, per-session timestamps ("just now", "12 min ago"). */
function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  return formatDate(iso);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/* ─── Environment toggle (persisted; Live gated server-side too).
   Matches the Finances page tab switcher formatting. ─── */
const EnvToggle = ({ env, onChange }: { env: DevEnv; onChange: (e: DevEnv) => void }) => (
  <div className="bg-[#06070a] flex gap-[2px] items-center overflow-clip p-[2px] relative rounded-[400px] shrink-0">
    {(["sandbox", "live"] as DevEnv[]).map((e) => {
      const isActive = env === e;
      return (
        <button
          key={e}
          type="button"
          data-testid={`toggle-env-${e}`}
          onClick={() => onChange(e)}
          className="flex items-center justify-center px-[14px] py-[8px] relative rounded-[100px] shrink-0 transition-colors"
          style={{ background: isActive ? "#4a2300" : "transparent" }}
        >
          <p
            className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[14px] whitespace-nowrap"
            style={{ color: isActive ? "#ff9500" : "#414965" }}
          >
            {e === "live" ? "Live" : "Sandbox"}
          </p>
        </button>
      );
    })}
  </div>
);

/* ─── Figma popup shell: rounded-24 card, 56px blurred header with centered
   title + circular close button, blurred bordered footer. (Figma 6053-69793/69539) ─── */
const PopupShell = ({ title, onClose, children, footer, testId }: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid={testId}
    >
      <div className="flex flex-col rounded-[24px] w-[480px] max-h-[85vh] overflow-hidden bg-[#11141b] border border-[#1d2132]">
        <div className="relative h-[56px] shrink-0 w-full backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132]">
          <p className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 [font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[20px] leading-[24px] whitespace-nowrap max-w-[380px] truncate text-center" data-testid="text-popup-title">
            {title}
          </p>
          <button
            type="button"
            data-testid="button-close-popup"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-[11px] top-[11px] size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2a3046] transition-colors text-[#6c779d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col gap-[32px] p-[24px] overflow-y-auto">{children}</div>
        {footer && (
          <div className="shrink-0 w-full backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-t border-[#1d2132] p-[24px]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/* Labelled section inside a PopupShell: small label + hairline, then content. */
const PopupSection = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-[16px] w-full">
    <div className="flex gap-[8px] items-center w-full">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[14px] leading-[14px] whitespace-nowrap">{label}</p>
      <div className="flex-1 min-w-px border-t border-[#1d2132]" />
    </div>
    {children}
  </div>
);

/* Code box used for keys / curl examples inside popups. */
const PopupCodeBox = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <div className="bg-[#06070a] border border-[#1d2132] rounded-[12px] p-[12px] w-full">
    <p className="[font-family:'JetBrains_Mono',monospace] font-bold text-[#a8b9f4] text-[12px] leading-[16px] break-all" data-testid={testId}>{children}</p>
  </div>
);

/* ─── One-time plaintext key modal (Figma 6053-69539 "Your New API Key") ─── */
const PlaintextKeyModal = ({ plaintext, onClose }: { plaintext: string; onClose: () => void }) => {
  const [copied, setCopied] = useState(false);
  return (
    <PopupShell
      title="Your New API Key"
      onClose={onClose}
      testId="modal-plaintext-key"
      footer={
        <button
          type="button"
          data-testid="button-copy-key"
          onClick={async () => {
            try { await navigator.clipboard.writeText(plaintext); setCopied(true); } catch { /* clipboard unavailable */ }
          }}
          className="w-full bg-[#240757] hover:bg-[#2e0a6e] transition-colors flex items-center justify-center px-[20px] py-[10px] rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[#7631ee] text-[16px] leading-[20px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
        >
          {copied ? "Copied" : "Copy Key"}
        </button>
      }
    >
      <div className="bg-[#4a2300] border border-[rgba(255,148,0,0.2)] rounded-[12px] flex items-center p-[8px] w-full">
        <div className="flex flex-1 min-w-px gap-[8px] items-start">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 mt-[2px]">
        <circle cx="8" cy="8" r="7" stroke="#ff9400" strokeWidth="1.3" />
        <path d="M8 7.3v4.2" stroke="#ff9400" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="8" cy="4.7" r="0.9" fill="#ff9400" />
      </svg>
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#ff9400] text-[14px] leading-[16px] flex-1 min-w-px">
            Copy it now — for your security, it will never be shown again.
          </p>
        </div>
      </div>
      <PopupSection label="API Key">
        <PopupCodeBox testId="text-plaintext-key">{plaintext}</PopupCodeBox>
      </PopupSection>
      <PopupSection label="Try it now">
        <PopupCodeBox testId="text-curl-example">
          {`curl ${window.location.origin}/api/v1/ping -H "Authorization: Bearer ${plaintext}"`}
        </PopupCodeBox>
      </PopupSection>
    </PopupShell>
  );
};

/* ─── Shared record-detail modal (ONE component for keys / activity / tenants).
   Shell matches PlaintextKeyModal: backdrop blur, #11141b card, #1d2132 border. ─── */
const DetailModal = ({ title, badges, onClose, children, footer, testId }: {
  title: ReactNode;
  badges?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid={testId}
    >
      <div className="flex flex-col rounded-[16px] w-[480px] max-h-[80vh] overflow-hidden" style={{ background: "#11141b", border: "1px solid #1d2132" }}>
        <div className="flex items-center gap-2 p-5 pb-3">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[18px] leading-[22px] flex-1 min-w-0 truncate" data-testid="text-detail-modal-title">{title}</p>
          {badges}
          <button
            type="button"
            data-testid="button-close-detail-modal"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 size-[28px] rounded-full flex items-center justify-center hover:bg-[#1d2132] transition-colors text-[#6c779d]"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col gap-3 px-5 pb-5 overflow-y-auto">{children}</div>
        {footer && <div className="flex items-center gap-2 p-3 border-t border-[#1d2132]">{footer}</div>}
      </div>
    </div>
  );
};

/* Label/value line inside the detail modal. */
const DetailRow = ({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) => (
  <div className="flex items-start justify-between gap-4" data-testid={testId}>
    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px] flex-shrink-0">{label}</p>
    <div className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[13px] leading-[18px] text-right min-w-0 break-words">{children}</div>
  </div>
);

/** Live countdown to an ISO timestamp; ticks every second. Null when no target. */
function useCountdown(targetIso: string | null | undefined): string | null {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!targetIso) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [targetIso]);
  if (!targetIso) return null;
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return null;
  const left = target - nowMs;
  if (left <= 0) return "expiring now";
  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/* ─── API reference (copy-paste curl examples for key-authed endpoints).
   Figma frame 5985:65819: pill tags (GET / scope), 16px path in baby blue,
   curl inside a #06070a bordered box with the Copy pill INSIDE the box. ─── */
const EndpointRow = ({ path, scope, description }: { path: string; scope: string | null; description: string }) => {
  const [copied, setCopied] = useState(false);
  const curl = `curl ${window.location.origin}${path} -H "Authorization: Bearer brain_sk_..."`;
  const slug = path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return (
    <div className="flex flex-col gap-[16px] w-full" data-testid={`row-endpoint-${slug}`}>
      <div className="flex flex-col gap-[4px] justify-center w-full">
        <div className="flex gap-[12px] items-start w-full flex-wrap">
          <span className="bg-[#222737] border border-[rgba(108,119,157,0.2)] flex items-center justify-center px-[8px] py-[3px] rounded-[22px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#6c779d] text-[12px] text-center whitespace-nowrap">
            GET
          </span>
          <p className="flex-1 min-w-0 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#a8b9f4] text-[16px] break-all" data-testid={`text-endpoint-path-${slug}`}>
            {path}
          </p>
          <span
            data-testid={`badge-endpoint-scope-${slug}`}
            className="flex items-center justify-center px-[8px] py-[3px] rounded-[22px] shrink-0 border [font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[12px] text-center whitespace-nowrap"
            style={scope
              ? { background: "#240757", color: "#7631ee", borderColor: "rgba(118,49,238,0.2)" }
              : { background: "#222737", color: "#6c779d", borderColor: "rgba(108,119,157,0.2)" }}
          >
            {scope ? `Requires ${scope}` : "Any Active Key"}
          </span>
        </div>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px]">{description}</p>
      </div>
      <div className="bg-[#06070a] border border-[#1d2132] flex gap-[12px] items-center p-[12px] rounded-[12px] w-full">
        <p className="flex-1 min-w-0 [font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[14px] truncate" data-testid={`text-curl-${slug}`}>
          {curl}
        </p>
        <button
          type="button"
          data-testid={`button-copy-curl-${slug}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(curl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch { /* clipboard unavailable */ }
          }}
          className="bg-[#222737] flex gap-[2px] items-center justify-center px-[10px] py-[4px] rounded-[100px] shrink-0 hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#6c779d] text-[12px] whitespace-nowrap"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
            <rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1.5" stroke="#6c779d" strokeWidth="1.2" />
            <path d="M10.5 5.5V4.2C10.5 3.54 9.96 3 9.3 3H4.2C3.54 3 3 3.54 3 4.2V9.3C3 9.96 3.54 10.5 4.2 10.5H5.5" stroke="#6c779d" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
};

/* ─── Overview ─── */
function OverviewSection({ env, envControl, onNavigate }: { env: DevEnv; envControl: ReactNode; onNavigate: (s: DevSection) => void }) {
  // Poll keys ONLY while an active key has never been used, so the
  // "Make a key-authenticated call" step lights up in-session when the
  // user makes their first real key-authed call (e.g. curl /api/v1/ping).
  // Once every active key has a lastUsedAt (or there are no keys), stop.
  const keysQ = useQuery<{ keys: MaskedKey[] }>({
    queryKey: ["/api/developers/keys"],
    retry: (count, err) => !isKeysApiUnavailable(err) && count < 2,
    refetchInterval: (query) => {
      if (isKeysApiUnavailable(query.state.error)) return false;
      const ks = query.state.data?.keys ?? [];
      const awaitingFirstCall = ks.some((k) => k.status === "active" && k.lastUsedAt === null);
      return awaitingFirstCall ? 5000 : false;
    },
  });
  const keyUsageQ = useQuery<KeyUsageResponse>({
    queryKey: [`/api/developers/key-usage?environment=${env}`],
    retry: (count, err) => !isKeysApiUnavailable(err) && count < 2,
  });
  const keysUnavailable = isKeysApiUnavailable(keysQ.error);
  const tenantsQ = useQuery<TenantsResponse>({ queryKey: ["/api/developers/tenants"] });
  const usageQ = useQuery<UsageResponse>({ queryKey: [`/api/developers/usage?environment=${env}`] });
  const activityQ = useQuery<AuditEventsResponse>({ queryKey: ["/api/brain/audit/events?limit=8"] });
  const [selectedEvent, setSelectedEvent] = useState<DevAuditEvent | null>(null);
  const navigate = useLocation()[1];
  const { data: tenancy } = useQuery<{ mode: string; linked: boolean; companyName?: string }>({
    queryKey: ["/api/brain/tenancy"],
  });

  const activeKeys = (keysQ.data?.keys ?? []).filter((k) => k.status === "active" && k.environment === env);
  const hasTenant = (tenantsQ.data?.tenants.length ?? 0) > 0;
  const hasKey = activeKeys.length > 0;
  // "Make a key-authenticated call" completes ONLY once an issued key has
  // actually been used — from brain-core's own signals (a key's last_used_at
  // or a nonzero event count in the key-usage attribution), never from
  // chat/session-auth activity. It can never show done while step 2 (issue a
  // key) is incomplete.
  const hasKeyAuthedCall = hasKey && (
    activeKeys.some((k) => k.lastUsedAt !== null) ||
    (keyUsageQ.data?.keys ?? []).some((u) => u.eventCount > 0)
  );
  const today = usageQ.data?.daily.length ? usageQ.data.daily[usageQ.data.daily.length - 1].count : null;

  const steps = [
    { label: "Create a Tenant", done: hasTenant },
    { label: "Issue an API Key", done: hasKey },
    { label: "Make a Key-Authenticated Call", done: hasKeyAuthedCall },
  ];

  const orgName = tenancy?.companyName;

  // Question / response only for wiki events, pulled from the event's own
  // inputs/outputs — never fabricated for other event kinds.
  const str = (v: unknown, key: string): string | null => {
    if (v && typeof v === "object" && typeof (v as Record<string, unknown>)[key] === "string") {
      return (v as Record<string, string>)[key];
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-[40px] w-full pt-[20px]">
      {selectedEvent && (
        <DetailModal
          title={humanizeAction(selectedEvent.action)}
          badges={
            <span className="px-2 py-[2px] rounded-[4px] text-[11px] [font-family:'Gilroy',sans-serif] font-semibold" style={{ background: "#1d2132", color: "#a8b9f4" }}>
              {selectedEvent.layer}
            </span>
          }
          onClose={() => setSelectedEvent(null)}
          testId="modal-activity-detail"
          footer={
            <PillButton
              tone="neutral"
              testId="button-open-audit-log"
              onClick={() => { setSelectedEvent(null); navigate("/audit-log"); }}
            >
              View in Audit Log
            </PillButton>
          }
        >
          <DetailRow label="Event" testId="detail-activity-action"><Mono className="text-white">{selectedEvent.action}</Mono></DetailRow>
          <DetailRow label="When" testId="detail-activity-when"><Mono className="text-white">{formatDateTime(selectedEvent.created_at)}</Mono></DetailRow>
          <DetailRow label="Authenticated as" testId="detail-activity-actor">
            <span className="inline-flex flex-col items-end gap-[2px]">
              <span>{selectedEvent.actor.startsWith("agent") ? "Agent token" : "Member session"}</span>
              <Mono className="text-[#6c779d] text-[12px]">{selectedEvent.actor}</Mono>
            </span>
          </DetailRow>
          <DetailRow label="Tenant" testId="detail-activity-tenant"><Mono className="text-white">{selectedEvent.tenant_id}</Mono></DetailRow>
          <DetailRow label="Event id"><Mono className="text-[#6c779d] text-[12px]">{selectedEvent.id}</Mono></DetailRow>
          {str(selectedEvent.inputs, "question") && (
            <div className="flex flex-col gap-1">
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px]">Question</p>
              <div className="rounded-[8px] p-3" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[13px] leading-[18px] whitespace-pre-wrap break-words" data-testid="text-activity-question">
                  {str(selectedEvent.inputs, "question")}
                </p>
              </div>
            </div>
          )}
          {(str(selectedEvent.outputs, "answer") ?? str(selectedEvent.outputs, "response")) && (
            <div className="flex flex-col gap-1">
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px]">Response</p>
              <div className="rounded-[8px] p-3" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[13px] leading-[18px] whitespace-pre-wrap break-words" data-testid="text-activity-response">
                  {str(selectedEvent.outputs, "answer") ?? str(selectedEvent.outputs, "response")}
                </p>
              </div>
            </div>
          )}
        </DetailModal>
      )}
      {/* Header: text left, env toggle top-right. No bottom padding — root gap handles spacing. */}
      <div className="flex items-start justify-between gap-4 w-full">
        <div className="flex flex-col gap-[4px] min-w-0">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px]" data-testid="text-page-eyebrow">
            Developers
            {orgName && <span className="text-[#a8b9f4]">, {orgName}</span>}
            .
          </p>
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px]" data-testid="text-page-title">
            Build on your Brain ledger.
          </p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[22px] text-[#414965] text-[16px]" data-testid="text-enforcement-disclosure">
            Keys are issued and enforced by brain-core. Start with GET /api/v1/ping.
          </p>
        </div>
        <div className="flex-shrink-0">{envControl}</div>
      </div>

      <div className="flex flex-col gap-[24px] w-full">

      <div className="flex flex-col gap-[4px]">
        <SectionLabel>Get Started</SectionLabel>
        <div data-testid="card-get-started" className="bg-[#0a0c10] flex flex-col gap-[16px] items-start p-[16px] rounded-[16px] w-full">
          {steps.map((s, i) => (
            <div key={s.label} className="contents">
              {i > 0 && <div className="h-px w-full bg-[#1d2132]" />}
              <div className="flex gap-[8px] items-center w-full" data-testid={`step-get-started-${i}`}>
                <div
                  className="size-[32px] rounded-full flex items-center justify-center flex-shrink-0"
                  style={s.done ? { background: "#4a2300" } : { background: "#222737" }}
                >
                  {s.done ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8.5L6.2 11.5L13 4.5" stroke="#ff9400" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px]">{i + 1}</span>
                  )}
                </div>
                <p className="flex-1 min-w-0 [font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px]" style={{ color: s.done ? "#ff9400" : "#a8b9f4" }}>
                  {s.label}
                </p>
                {i === 0 && (
                  <button
                    type="button"
                    data-testid="button-overview-add-tenant"
                    onClick={() => onNavigate("tenants")}
                    className="bg-[#240757] flex gap-[2px] items-center justify-center px-[10px] py-[4px] rounded-[100px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#7631ee] text-[12px] whitespace-nowrap hover:bg-[#2e0a6e] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                  >
                    <Plus className="relative shrink-0 size-[16px] text-[#7631ee]" />
                    Add Tenant
                  </button>
                )}
                {i === 1 && (
                  <button
                    type="button"
                    data-testid="button-overview-create-key"
                    onClick={() => onNavigate("keys")}
                    disabled={!hasTenant}
                    className="bg-[#240757] flex gap-[2px] items-center justify-center px-[10px] py-[4px] rounded-[100px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#7631ee] text-[12px] whitespace-nowrap hover:bg-[#2e0a6e] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="relative shrink-0 size-[16px] text-[#7631ee]" />
                    Create Key
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-[4px]">
        <SectionLabel>API Reference</SectionLabel>
        <div data-testid="card-api-reference" className="bg-[#0a0c10] flex flex-col gap-[16px] items-start p-[16px] rounded-[16px] w-full">
          {API_ENDPOINTS.map((ep, i) => (
            <div key={ep.path} className="contents">
              {i > 0 && <div className="h-px w-full bg-[#1d2132]" />}
              <EndpointRow {...ep} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-[4px]">
        <SectionLabel>Usage and Limits</SectionLabel>
        <Card testId="card-overview-usage">
          <div className="flex gap-[16px] items-stretch p-[16px]">
            <button
              type="button"
              onClick={() => onNavigate("usage")}
              className="flex-1 min-w-px flex flex-col gap-[4px] justify-center text-left cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[8px]"
              data-testid="metric-requests-today"
            >
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px] group-hover:text-white transition-colors">
                Requests Today ({env === "sandbox" ? "Sandbox" : "Live"})
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[40px] leading-[48px]">
                {usageQ.isLoading ? "…" : usageQ.isError ? "—" : String(today ?? 0)}
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[20px]">
                {usageQ.isError ? "Usage unavailable" : "From brain-core audit events"}
              </p>
            </button>
            <div className="w-px shrink-0 self-stretch bg-[#1d2132]" />
            <button
              type="button"
              onClick={() => onNavigate("keys")}
              className="flex-1 min-w-px flex flex-col gap-[4px] justify-center text-left cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[8px]"
              data-testid="metric-active-keys"
            >
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px] group-hover:text-white transition-colors">
                Active Keys ({env === "sandbox" ? "Sandbox" : "Live"})
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[48px]">
                {keysQ.isLoading ? "…" : keysQ.isError ? "—" : String(activeKeys.length)}
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[20px]">
                {keysUnavailable ? "Keys API not yet enabled" : "Issued by brain-core"}
              </p>
            </button>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-[4px]">
        <SectionLabel>Recent Activity</SectionLabel>
        <Card testId="card-recent-activity">
          {activityQ.isLoading ? (
            <EmptyRow>Loading activity…</EmptyRow>
          ) : activityQ.isError || !activityQ.data?.events?.length ? (
            <EmptyRow>No recorded activity yet. Calls appear here as brain-core audit events.</EmptyRow>
          ) : (
            <div className="flex flex-col gap-[16px] p-[16px]">
              {activityQ.data.events.slice(0, 8).map((ev, i) => (
                <div key={ev.id} className="flex flex-col gap-[16px] w-full">
                  {i > 0 && <div className="w-full border-t border-[#1d2132]" />}
                  <button
                    type="button"
                    onClick={() => setSelectedEvent(ev)}
                    className="flex gap-[12px] items-start w-full text-left cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[8px]"
                    data-testid={`row-activity-${ev.id}`}
                  >
                    <span className="inline-flex items-center justify-center px-[8px] py-[3px] rounded-[22px] bg-[#222737] border border-[rgba(108,119,157,0.2)] [font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[14px] whitespace-nowrap shrink-0">
                      {ev.layer}
                    </span>
                    <p className="flex-1 min-w-px [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px] break-words group-hover:text-white transition-colors" title={ev.action}>{humanizeAction(ev.action)}</p>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[20px] text-right shrink-0">{formatDateTime(ev.created_at)}</p>
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      </div>
    </div>
  );
}

/* ─── API Keys ─── */
function KeysSection({ env }: { env: DevEnv }) {
  const alert = useAppAlert();
  const keysQ = useQuery<{ keys: MaskedKey[] }>({
    queryKey: ["/api/developers/keys"],
    retry: (count, err) => !isKeysApiUnavailable(err) && count < 2,
  });
  const usageQ = useQuery<KeyUsageResponse>({
    queryKey: [`/api/developers/key-usage?environment=${env}`],
    retry: (count, err) => !isKeysApiUnavailable(err) && count < 2,
  });
  const usageByKey = new Map((usageQ.data?.keys ?? []).map((u) => [u.keyId, u]));
  const keysUnavailable = isKeysApiUnavailable(keysQ.error);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["ledger:read"]);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/developers/keys"] });
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/developers/key-usage") });
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/developers/keys", { name: name.trim(), environment: env, scopes });
      return res.json();
    },
    onSuccess: (data: { plaintext: string }) => {
      setPlaintext(data.plaintext);
      setShowCreate(false);
      setName("");
      setScopes(["ledger:read"]);
      invalidate();
    },
    onError: (e: Error) => alert.error("Couldn't create key", e.message),
  });

  const rotateMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/developers/keys/${id}/rotate`);
      return res.json();
    },
    onSuccess: (data: { plaintext: string }) => {
      setPlaintext(data.plaintext);
      setSelectedKeyId(null);
      invalidate();
    },
    onError: (e: Error) => {
      // 404 api_key_not_found: already rotated/revoked elsewhere — refresh honestly.
      if (e.message.startsWith("404") && e.message.includes("api_key_not_found")) {
        setSelectedKeyId(null);
        alert.error("Key no longer exists", "This key was already rotated or revoked. The list has been refreshed.");
        invalidate();
        return;
      }
      alert.error("Couldn't rotate key", e.message);
    },
  });

  const revokeMut = useMutation({
    // brain-core revoke: DELETE, 204 on success (no body to parse).
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/developers/keys/${id}`); },
    onSuccess: () => {
      setConfirmRevoke(null);
      setSelectedKeyId(null);
      alert.success("Key revoked", "The key can no longer be used.");
      invalidate();
    },
    onError: (e: Error) => {
      setConfirmRevoke(null);
      // Graceful double-click: 404 api_key_not_found means it's already gone.
      if (e.message.startsWith("404") && e.message.includes("api_key_not_found")) {
        setSelectedKeyId(null);
        alert.success("Key already revoked", "This key was already revoked.");
        invalidate();
        return;
      }
      alert.error("Couldn't revoke key", e.message);
    },
  });

  const tenantsQ = useQuery<TenantsResponse>({ queryKey: ["/api/developers/tenants"] });
  const liveAvailable = tenantsQ.data?.liveKeysAvailable === true;
  const keys = (keysQ.data?.keys ?? []).filter((k) => k.environment === env);

  return (
    <div className="flex flex-col gap-[16px]">
      {plaintext && <PlaintextKeyModal plaintext={plaintext} onClose={() => setPlaintext(null)} />}
      {(() => {
        const k = selectedKeyId ? (keysQ.data?.keys ?? []).find((x) => x.id === selectedKeyId) : undefined;
        if (!k) return null;
        const close = () => { setSelectedKeyId(null); setConfirmRevoke(null); };
        return (
          <PopupShell
            title={k.name}
            onClose={close}
            testId="modal-key-detail"
            footer={
              k.status === "active" ? (
                <div className="flex items-center gap-2 w-full">
                  <PillButton tone="neutral" testId={`button-rotate-${k.id}`} onClick={() => rotateMut.mutate(k.id)} disabled={rotateMut.isPending || revokeMut.isPending}>
                    {rotateMut.isPending ? "Rotating…" : "Rotate"}
                  </PillButton>
                  <div className="flex-1" />
                  {confirmRevoke === k.id ? (
                    <>
                      <PillButton tone="neutral" testId={`button-revoke-cancel-${k.id}`} onClick={() => setConfirmRevoke(null)}>Cancel</PillButton>
                      <PillButton tone="danger" testId={`button-revoke-confirm-${k.id}`} onClick={() => revokeMut.mutate(k.id)} disabled={revokeMut.isPending}>
                        {revokeMut.isPending ? "Revoking…" : "Confirm revoke"}
                      </PillButton>
                    </>
                  ) : (
                    <PillButton tone="danger" testId={`button-revoke-${k.id}`} onClick={() => setConfirmRevoke(k.id)}>Revoke</PillButton>
                  )}
                </div>
              ) : (
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#d20344] text-[13px] leading-[18px]" data-testid="text-key-revoked-footer">
                  Revoked {formatDateTime(k.revokedAt)}. This key can no longer be used.
                </p>
              )
            }
          >
            <div className="flex items-center gap-2">
              <EnvBadge env={k.environment} />
              <StatusBadge status={k.status} />
            </div>
            <PopupSection label="API Key">
              <PopupCodeBox testId="detail-key-masked">{maskKey(k)}</PopupCodeBox>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[14px] leading-[16px] -mt-2">
                brain-core stores keys hashed. The full key was shown exactly once, at creation. If it's lost, rotate to get a new one.
              </p>
            </PopupSection>
            <PopupSection label="Details">
              <div className="flex flex-col gap-3 w-full">
                <DetailRow label="Scopes" testId="detail-key-scopes">{k.scopes.length ? k.scopes.join(", ") : "None"}</DetailRow>
                <DetailRow label="Environment">{k.environment === "live" ? "Live" : "Sandbox"}</DetailRow>
                <DetailRow label="Created" testId="detail-key-created"><Mono className="text-white">{formatDateTime(k.createdAt)}</Mono></DetailRow>
                <DetailRow label="Last used" testId="detail-key-last-used"><Mono className="text-white">{formatDateTime(k.lastUsedAt)}</Mono></DetailRow>
                {k.rotatedFromId && <DetailRow label="Rotated from"><Mono className="text-white">{k.rotatedFromId}</Mono></DetailRow>}
                {usageByKey.get(k.id) && (
                  <>
                    <DetailRow label={`Requests (${usageQ.data?.window ?? "30d"})`} testId="detail-key-requests">
                      <Mono className="text-white">{usageByKey.get(k.id)!.eventCount.toLocaleString()}</Mono>
                    </DetailRow>
                    {usageByKey.get(k.id)!.lastEventAt && (
                      <DetailRow label="Last request" testId="detail-key-last-event">
                        <Mono className="text-white">{formatDateTime(usageByKey.get(k.id)!.lastEventAt)}</Mono>
                      </DetailRow>
                    )}
                  </>
                )}
              </div>
            </PopupSection>
            {k.status === "active" && k.lastUsedAt === null && (
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#ff9500] text-[12px] leading-[16px]">
                This key has never authenticated a call yet. Try GET /api/v1/ping from the API Reference.
              </p>
            )}
          </PopupShell>
        );
      })()}

      <div className="flex flex-col gap-[12px]">
        <div className="flex min-h-[36px] items-center justify-between gap-4">
          <SectionLabel testId="text-page-title">{env === "live" ? "Live Keys" : "Sandbox Keys"}</SectionLabel>
          <button
            type="button"
            data-testid="button-new-key"
              onClick={() => {
                if (env === "live" && !liveAvailable) {
                  alert.info("Live keys are gated", "Live key issuance unlocks when this workspace has a production tenant.");
                  return;
                }
                setShowCreate(true);
              }}
              className="bg-[#240757] flex gap-[2px] items-center justify-center px-[10px] py-[4px] rounded-[100px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#7631ee] text-[12px] whitespace-nowrap hover:bg-[#2e0a6e] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              <Plus className="relative shrink-0 size-[16px] text-[#7631ee]" />
              Create Key
            </button>
        </div>

        {env === "live" && !liveAvailable && (
        <Card testId="card-live-gated">
          <div className="p-[16px] flex flex-col gap-[16px]">
            <div className="flex flex-col gap-[4px]">
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px]">Live key issuance is gated</p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[16px]">
                {tenantsQ.data?.mode === "production"
                  ? "This workspace runs in production tenancy mode, but no company tenant is linked yet. Live key issuance unlocks once your company tenant is created."
                  : "This workspace runs in demo mode: your tenant is provisioned fresh per session, so live keys can't be issued. Live key issuance unlocks when the platform runs in production tenancy mode."}
              </p>
            </div>
            <button
              type="button"
              data-testid="button-request-live-access"
              onClick={() => alert.success("Request noted", "Live access is enabled when your workspace has a production tenant.")}
              className="bg-[#222737] hover:bg-[#2a3046] transition-colors flex items-center justify-center px-[12px] py-[8px] rounded-[100px] self-start [font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[16px] whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              Request Access
            </button>
          </div>
        </Card>
      )}

      {showCreate && (env === "sandbox" || liveAvailable) && (
        <PopupShell
          title="Create Key"
          onClose={() => setShowCreate(false)}
          testId="modal-create-key"
          footer={
            <button
              type="button"
              data-testid="button-create-key"
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || name.trim().length === 0 || scopes.length === 0}
              className="w-full bg-[#4a2300] hover:bg-[#5a2b00] transition-colors flex items-center justify-center px-[20px] py-[10px] rounded-[100px] [font-family:'Gilroy',sans-serif] font-semibold text-[#ff9400] text-[16px] leading-[20px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {createMut.isPending ? "Creating…" : "Create Key"}
            </button>
          }
        >
          <PopupSection label="Key Name">
            <div className="bg-[#222737] flex items-center px-[8px] py-[10px] rounded-[8px] w-full">
              <input
                id="key-name"
                data-testid="input-key-name"
                aria-label="Key Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Backend service"
                maxLength={80}
                autoFocus
                className="w-full bg-transparent outline-none [font-family:'Gilroy',sans-serif] font-medium text-white placeholder:text-[#6c779d] text-[16px] leading-[20px]"
              />
            </div>
          </PopupSection>
          <PopupSection label="Requested Scopes">
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px] w-full">
              Enforced on the platform data endpoints (ledger/audit reads) — see the API reference on Overview.
            </p>
            {SCOPE_OPTIONS.map((s) => {
              const checked = scopes.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  data-testid={`checkbox-scope-${s.id.replace(/[^a-z]+/g, "-")}`}
                  onClick={() => setScopes((prev) => checked ? prev.filter((x) => x !== s.id) : [...prev, s.id])}
                  className="flex gap-[8px] items-start w-full text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[4px]"
                  aria-pressed={checked}
                >
                  <span
                    className={`size-[20px] rounded-[4px] border flex items-center justify-center shrink-0 ${checked ? "bg-[#240757] border-[rgba(118,49,238,0.2)]" : "bg-[#06070a] border-[#222737]"}`}
                  >
                    {checked && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6.5L5 9L9.5 3.5" stroke="#7631ee" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="flex flex-col gap-[4px] flex-1 min-w-px">
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[16px] leading-[20px]">{s.label}</span>
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[14px] leading-[16px]">{s.hint}</span>
                  </span>
                </button>
              );
            })}
          </PopupSection>
          <div
            className="flex items-start gap-[10px] p-[12px] rounded-[12px] w-full"
            style={{ background: "#240757", border: "1px solid rgba(118,49,238,0.2)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 mt-[2px]">
        <circle cx="8" cy="8" r="7" stroke="#7631ee" strokeWidth="1.3" />
        <path d="M8 7.3v4.2" stroke="#7631ee" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="8" cy="4.7" r="0.9" fill="#7631ee" />
      </svg>
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#7631ee] text-[14px] leading-[18px] flex-1 min-w-px">
              Keys are issued by brain-core and stored hashed. Enforcement inside brain-core's API gateway is rolling
              out — until then, keys authenticate against platform endpoints only.
            </p>
          </div>
        </PopupShell>
      )}

      {keysUnavailable ? (
        <KeysUnavailableCard testId="card-keys-unavailable-keys" />
      ) : (
      <Card testId="card-keys-list">
        {keysQ.isLoading ? (
          <EmptyRow>Loading keys…</EmptyRow>
        ) : keysQ.isError ? (
          <EmptyRow>Couldn't load keys. brain-core may be unavailable.</EmptyRow>
        ) : keys.length === 0 ? (
          <div className="p-[16px] flex flex-col gap-[4px]">
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px]" data-testid="text-no-keys-title">
              No {env} keys yet
            </p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[16px]">
              {env === "sandbox"
                ? "Create one to start calling the API."
                : "Live keys appear here once issued."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-[16px] p-[16px]">
            {keys.map((k, i) => (
              <div key={k.id} className="flex flex-col gap-[16px] w-full">
                {i > 0 && <div className="w-full border-t border-[#1d2132]" />}
                <button
                  type="button"
                  onClick={() => setSelectedKeyId(k.id)}
                  className="flex flex-col gap-[16px] w-full text-left cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[8px] bg-[#0a0c10] border border-transparent hover:bg-[#11141b] hover:border-[#1d2132] transition-colors p-[12px]"
                  data-testid={`row-key-${k.id}`}
                >
                  <div className="flex flex-col gap-[4px] justify-center w-full">
                    <div className="flex gap-[12px] items-start w-full">
                      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px] flex-1 min-w-px break-words group-hover:text-white transition-colors">{k.name}</p>
                      <StatusBadge status={k.status} />
                    </div>
                    <div className="flex items-center w-full">
                      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[16px] flex-1 min-w-px break-words" data-testid={`text-masked-key-${k.id}`}>{maskKey(k)}</p>
                    </div>
                  </div>
                  <div className="bg-[#06070a] border border-[#1d2132] rounded-[12px] flex flex-col w-full overflow-hidden">
                    {[
                      { label: "Requested Scopes", value: k.scopes.length ? k.scopes.join(", ") : "None" },
                      { label: "Created", value: formatDate(k.createdAt), testId: `text-key-created-${k.id}` },
                      { label: "Last Used", value: k.lastUsedAt ? formatDateTime(k.lastUsedAt) : "Never", testId: `text-key-last-used-${k.id}` },
                      { label: `Requests (${usageQ.data?.window ?? "30d"})`, value: (usageByKey.get(k.id)?.eventCount ?? 0).toLocaleString(), testId: `text-request-count-${k.id}` },
                    ].map((row, ri, arr) => (
                      <div key={row.label} className={`flex items-start w-full ${ri < arr.length - 1 ? "border-b border-[#1d2132]" : ""}`}>
                        <div className="flex flex-col items-start justify-center px-[12px] py-[8px] shrink-0 w-[140px]">
                          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[20px] whitespace-nowrap">{row.label}</p>
                        </div>
                        <div className="flex flex-col flex-1 min-w-px items-start justify-center px-[12px] py-[8px]">
                          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[13px] leading-[20px] w-full truncate" data-testid={row.testId}>{row.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
      )}
      </div>

      <div
        className="flex items-start gap-[10px] p-[12px] rounded-[12px] w-full"
        style={{ background: "#240757", border: "1px solid rgba(118,49,238,0.2)" }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 mt-[2px]">
        <circle cx="8" cy="8" r="7" stroke="#7631ee" strokeWidth="1.3" />
        <path d="M8 7.3v4.2" stroke="#7631ee" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="8" cy="4.7" r="0.9" fill="#7631ee" />
      </svg>
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#7631ee] text-[14px] leading-[18px] flex-1 min-w-px">
          Keys are issued and stored hashed by brain-core, and enforced on every key-authenticated call.
          Rate limit: 600 requests per 60 seconds per key.
        </p>
      </div>
    </div>
  );
}

/* ─── Tenants ─── */
function TenantsSection({ onNavigate }: { onNavigate: (s: DevSection) => void }) {
  const alert = useAppAlert();
  const tenantsQ = useQuery<TenantsResponse>({ queryKey: ["/api/developers/tenants"] });
  const keysQ = useQuery<{ keys: MaskedKey[] }>({ queryKey: ["/api/developers/keys"] });
  const [companyName, setCompanyName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const selectedTenant = tenantsQ.data?.tenants.find((t) => t.id === selectedTenantId) ?? null;
  const countdown = useCountdown(selectedTenant?.ephemeral ? selectedTenant.expiresAt : null);

  // Uses the EXISTING production tenant-creation path. NOT idempotent — never retried.
  const createMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/brain/tenants", { company_name: companyName.trim() })).json(),
    onSuccess: () => {
      setShowCreate(false);
      setCompanyName("");
      alert.success("Tenant created", "Your company tenant is ready.");
      queryClient.invalidateQueries({ queryKey: ["/api/developers/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brain/tenancy"] });
    },
    onError: (e: Error) => alert.error("Tenant creation failed", e.message),
  });

  const data = tenantsQ.data;
  // Keys are listed per-tenant by brain-core, and the platform only ever
  // shows the current session's tenant — so every listed active key is this
  // tenant's.
  const tenantKeyCount = selectedTenant
    ? (keysQ.data?.keys ?? []).filter((k) => k.status === "active").length
    : 0;

  return (
    <div className="flex flex-col gap-[16px]">
      {selectedTenant && (
        <DetailModal
          title={selectedTenant.companyName ?? (selectedTenant.ephemeral ? "Demo tenant" : "Your company")}
          badges={<EnvBadge env={selectedTenant.environment} />}
          onClose={() => setSelectedTenantId(null)}
          testId="modal-tenant-detail"
          footer={
            <PillButton
              tone="neutral"
              testId="button-tenant-view-keys"
              onClick={() => { setSelectedTenantId(null); onNavigate("keys"); }}
            >
              View API Keys
            </PillButton>
          }
        >
          <DetailRow label="Tenant id" testId="detail-tenant-id"><Mono className="text-white">{selectedTenant.id}</Mono></DetailRow>
          <DetailRow label="Environment">{selectedTenant.environment === "live" ? "Live" : "Sandbox"}</DetailRow>
          <DetailRow label="Active keys" testId="detail-tenant-key-count">
            <Mono className="text-white">{keysQ.isLoading ? "…" : String(tenantKeyCount)}</Mono>
          </DetailRow>
          <DetailRow label="Created" testId="detail-tenant-created">
            <Mono className="text-white">
              {selectedTenant.ephemeral ? formatRelative(selectedTenant.createdAt) : formatDate(selectedTenant.createdAt)}
            </Mono>
          </DetailRow>
          {selectedTenant.ephemeral && (
            <>
              <DetailRow label="Resets in" testId="detail-tenant-expiry">
                <Mono className="text-[#ff9500]">{countdown ?? "—"}</Mono>
              </DetailRow>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[12px] leading-[16px]">
                Demo tenants are provisioned fresh per session (~30 minutes). When this one expires, a new tenant is
                provisioned automatically. Ids and data don't carry over.
              </p>
            </>
          )}
        </DetailModal>
      )}
      <div className="flex flex-col gap-[4px]">
      <div className="flex min-h-[36px] items-center justify-between gap-4">
        <SectionLabel testId="text-page-title">Tenants</SectionLabel>
        {(
          <button
            type="button"
            data-testid="button-create-tenant"
            onClick={() => {
              if (data?.canCreate) {
                setShowCreate((v) => !v);
              } else if (data?.mode === "demo") {
                alert.info(
                  "Demo mode: tenants are provisioned automatically",
                  "This workspace runs in demo mode: your tenant is provisioned fresh for each session (~30 min) and can't be created manually. Production tenant creation unlocks when the platform runs in production tenancy mode.",
                );
              } else {
                alert.info(
                  "Tenant creation unavailable",
                  data?.tenants.length
                    ? "Your company tenant already exists. Each workspace has exactly one."
                    : "Tenant creation isn't available right now. The platform service isn't configured for this workspace.",
                );
              }
            }}
            className="bg-[#240757] flex gap-[2px] items-center justify-center px-[10px] py-[4px] rounded-[100px] shrink-0 [font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#7631ee] text-[12px] whitespace-nowrap hover:bg-[#2e0a6e] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
          >
            {!showCreate && <Plus className="relative shrink-0 size-[16px] text-[#7631ee]" />}
            {showCreate ? "Cancel" : "Create Tenant"}
          </button>
        )}
      </div>

      {showCreate && data?.canCreate && (
        <Card testId="card-create-tenant">
          <div className="p-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]" htmlFor="company-name">Company name</label>
              <input
                id="company-name"
                data-testid="input-company-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Inc."
                className="rounded-[8px] px-3 py-2 outline-none [font-family:'Gilroy',sans-serif] font-medium text-white placeholder:text-[#414965] text-[14px]"
                style={{ background: "#11141b", border: "1px solid #1d2132" }}
              />
            </div>
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#ff9500] text-[12px] leading-[16px]">
              Tenant creation is permanent and can't be retried automatically. If it fails, the error is shown as-is.
            </p>
            <div>
              <PillButton
                testId="button-confirm-create-tenant"
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || companyName.trim().length === 0}
              >
                {createMut.isPending ? "Creating…" : "Create Tenant"}
              </PillButton>
            </div>
          </div>
        </Card>
      )}

      <Card testId="card-tenants-list">
        {tenantsQ.isLoading ? (
          <EmptyRow>Loading tenants…</EmptyRow>
        ) : tenantsQ.isError ? (
          <EmptyRow>Couldn't load tenants. brain-core may be unavailable.</EmptyRow>
        ) : !data?.tenants.length ? (
          <EmptyRow>
            {data?.mode === "production"
              ? "No tenant linked yet. Create your company to get a tenant."
              : "No tenant available."}
          </EmptyRow>
        ) : (
          <div className="flex flex-col gap-[8px] items-start p-[8px] relative shrink-0 w-full">
            {data.tenants.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTenantId(t.id)}
                className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                data-testid={`row-tenant-${t.id}`}
              >
                <div className="flex flex-1 flex-col items-start justify-center min-w-px relative gap-[4px]">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">
                    {t.companyName ?? (t.ephemeral ? "Demo tenant" : "Your company")}
                  </p>
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] whitespace-nowrap" data-testid={`text-tenant-id-${t.id}`}>
                    {t.id}
                  </p>
                </div>
                <div className="flex flex-col items-end justify-center relative shrink-0">
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] text-right whitespace-nowrap" data-testid={`text-tenant-created-${t.id}`}>
                    Created {t.ephemeral ? formatRelative(t.createdAt) : formatDate(t.createdAt)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
      </div>

    </div>
  );
}

/* ─── Usage and Limits ─── */
function UsageSection({ env }: { env: DevEnv }) {
  // Environment-scoped usage: the server attributes tenant traffic to the
  // environment implied by the tenancy mode (demo→sandbox, production→live),
  // so the non-matching environment honestly reports zero.
  const usageQ = useQuery<UsageResponse>({
    queryKey: [`/api/developers/usage?window=60&environment=${env}`],
  });
  // Per-key breakdown from brain-core's key-usage attribution (30-day
  // window) — a DIFFERENT measurement than the tenant-wide audit events
  // above, so it is labeled explicitly and never summed with them.
  const keysQ = useQuery<{ keys: MaskedKey[] }>({
    queryKey: ["/api/developers/keys"],
    retry: (count, err) => !isKeysApiUnavailable(err) && count < 2,
  });
  const keyUsageQ = useQuery<KeyUsageResponse>({
    queryKey: [`/api/developers/key-usage?environment=${env}`],
    retry: (count, err) => !isKeysApiUnavailable(err) && count < 2,
  });
  const keysUnavailable = isKeysApiUnavailable(keysQ.error) || isKeysApiUnavailable(keyUsageQ.error);
  const usageByKey = new Map((keyUsageQ.data?.keys ?? []).map((u) => [u.keyId, u]));
  const keyCount = (id: string) => usageByKey.get(id)?.eventCount ?? 0;
  const envKeys = (keysQ.data?.keys ?? [])
    .filter((k) => k.environment === env)
    .sort((a, b) => keyCount(b.id) - keyCount(a.id) || (a.name < b.name ? -1 : 1));
  // Rate-limit tier comes from the SAME plan source as Settings → Billing.
  const planId = usePlanId();
  // In-place accordion for the by-method rows (ONE open at a time).
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const navigate = useLocation()[1];
  const tier = planId ? PLAN_RATE_LIMITS[planId] : null;

  const data = usageQ.data;
  let thisMonth = 0;
  let priorMonth = 0;
  if (data) {
    const now = new Date();
    const monthKey = now.toISOString().slice(0, 7);
    const prior = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    for (const d of data.daily) {
      if (d.date.startsWith(monthKey)) thisMonth += d.count;
      else if (d.date.startsWith(prior)) priorMonth += d.count;
    }
  }
  const trend = priorMonth > 0 ? Math.round(((thisMonth - priorMonth) / priorMonth) * 100) : null;

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[4px]">
        <SectionLabel testId="text-usage-title">Usage and Limits</SectionLabel>
        <Card testId="card-usage-metrics">
        <div className="flex gap-[16px] items-stretch p-[16px]">
          <div className="flex-1 min-w-px flex flex-col gap-[4px] justify-center" data-testid="metric-requests-month">
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px]">
              Requests This Month
            </p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[40px] leading-[48px]">
              {usageQ.isLoading ? "…" : usageQ.isError ? "—" : String(thisMonth)}
            </p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[20px]">
              {usageQ.isError
                ? "Usage unavailable"
                : trend === null
                  ? "No prior-month data to compare"
                  : `${trend >= 0 ? "+" : ""}${trend}% vs. last month`}
            </p>
          </div>
          <div className="w-px shrink-0 self-stretch bg-[#1d2132]" />
          <div className="flex-1 min-w-px flex flex-col gap-[4px] justify-center" data-testid="metric-rate-limit-tier">
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px]">
              Rate-Limit Tier
            </p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[20px] leading-[48px]">
              {tier ? tier.tier : "No plan selected"}
            </p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[20px]">
              {tier ? (
                <>
                  {tier.requestsPerMin} req/min, burst {tier.burst}. From your{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/settings?section=billing")}
                    className="text-[#7631ee] hover:underline cursor-pointer"
                    data-testid="link-settings-billing"
                  >
                    Settings → Billing
                  </button>{" "}
                  plan.
                </>
              ) : (
                <>
                  Choose a plan in{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/settings?section=billing")}
                    className="text-[#7631ee] hover:underline cursor-pointer"
                    data-testid="link-settings-billing"
                  >
                    Settings → Billing
                  </button>{" "}
                  to set your tier
                </>
              )}
            </p>
          </div>
        </div>
        </Card>
      </div>

      <div className="flex flex-col gap-[4px]">
        <SectionLabel>Requests by Method</SectionLabel>
        <Card testId="card-usage-by-method">
          {usageQ.isLoading ? (
            <EmptyRow>Loading usage…</EmptyRow>
          ) : usageQ.isError ? (
            <EmptyRow>Usage is unavailable because brain-core audit events couldn't be read.</EmptyRow>
          ) : !data?.byAction.length ? (
            <EmptyRow>No {env} calls recorded in the last {data?.windowDays ?? 60} days.</EmptyRow>
          ) : (
            <div className="flex flex-col gap-[16px] p-[16px]">
              {data.byAction.map((a, i) => {
                const max = data.byAction[0]?.count || 1;
                const isOpen = expandedAction === a.action;
                // Show the trailing 14 days of the per-action series so the
                // expanded trend stays readable (full window is 60 days).
                const trend = (a.daily ?? []).slice(-14);
                const trendMax = Math.max(1, ...trend.map((d) => d.count));
                return (
                  <div key={a.action} className="flex flex-col gap-[16px] w-full">
                    {i > 0 && <div className="w-full border-t border-[#1d2132]" />}
                    <div className="flex flex-col gap-[16px] w-full">
                      <button
                        type="button"
                        onClick={() => setExpandedAction(isOpen ? null : a.action)}
                        className="flex flex-col gap-[8px] w-full text-left cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE] rounded-[8px]"
                        data-testid={`row-method-${a.action}`}
                        aria-expanded={isOpen}
                      >
                        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px] w-full break-words group-hover:text-white transition-colors" title={a.action}>{humanizeAction(a.action)}</p>
                        <div className="flex gap-[7px] items-center w-full">
                          <div className="flex-1 min-w-px h-[6px] rounded-[3px] bg-[#222737] overflow-hidden">
                            <div className="h-full rounded-[3px] bg-[#7631ee]" style={{ width: `${Math.max((a.count / max) * 100, 2)}%` }} />
                          </div>
                          <p className="[font-family:'JetBrains_Mono',monospace] font-semibold text-[#6c779d] text-[14px] leading-[14px] text-right min-w-[24px] shrink-0">{a.count.toLocaleString()}</p>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="flex flex-col gap-[16px]" data-testid={`panel-method-daily-${a.action}`}>
                          <div className="flex gap-[8px] items-center w-full">
                            <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[14px] leading-[14px] whitespace-nowrap shrink-0">
                              <span>Daily requests, last {trend.length} days: </span>
                              <span className="text-[#a8b9f4]">{a.action}</span>
                            </p>
                            <div className="flex-1 min-w-px h-px bg-[#1d2132]" />
                          </div>
                          <div className="flex items-end gap-[8px] h-[48px]">
                            {trend.map((d) => (
                              <div key={d.date} className="flex-1 flex flex-col items-center min-w-0" title={`${d.date}: ${d.count.toLocaleString()} request${d.count === 1 ? "" : "s"}`}>
                                <div
                                  className="w-full rounded-[8px] bg-[#123509] border border-[rgba(66,191,35,0.4)]"
                                  style={{
                                    height: Math.max(4, Math.round((d.count / trendMax) * 40)),
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-between [font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[20px]">
                            <span>{trend[0]?.date ?? ""}</span>
                            <span>{trend[trend.length - 1]?.date ?? ""}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-[4px]">
        <SectionLabel>Requests by Key</SectionLabel>
        {keysUnavailable ? (
          <KeysUnavailableCard testId="card-keys-unavailable-usage" />
        ) : (
        <Card testId="card-usage-by-key">
          {keysQ.isLoading || keyUsageQ.isLoading ? (
            <EmptyRow>Loading key usage…</EmptyRow>
          ) : keysQ.isError || keyUsageQ.isError ? (
            <EmptyRow>Key usage is unavailable right now.</EmptyRow>
          ) : !envKeys.length ? (
            <EmptyRow>No {env} API keys yet. Create one under API Keys.</EmptyRow>
          ) : (
            <div className="flex flex-col gap-[16px] p-[16px]">
              {envKeys.map((k, i) => {
                const max = keyCount(envKeys[0]?.id ?? "") || 1;
                const count = keyCount(k.id);
                return (
                  <div key={k.id} className="flex flex-col gap-[16px] w-full">
                    {i > 0 && <div className="w-full border-t border-[#1d2132]" />}
                    <div className="flex flex-col gap-[8px] justify-center w-full" data-testid={`row-usage-key-${k.id}`}>
                      <div className="flex flex-col gap-[4px] w-full">
                        <div className="flex gap-[12px] items-start w-full">
                          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px] flex-1 min-w-px break-words" title={k.name}>{k.name}</p>
                          {k.status === "revoked" && <StatusBadge status="revoked" />}
                        </div>
                        <div className="flex items-center w-full">
                          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[16px] flex-1 min-w-px break-words" data-testid={`text-usage-key-masked-${k.id}`}>{maskKey(k)}</p>
                        </div>
                      </div>
                      <div className="flex gap-[7px] items-center w-full">
                        <div className="flex-1 min-w-px h-[6px] rounded-[3px] bg-[#222737] overflow-hidden">
                          <div className="h-full rounded-[3px] bg-[#7631ee]" style={{ width: count > 0 ? `${Math.max((count / max) * 100, 2)}%` : "0%" }} />
                        </div>
                        <p className="[font-family:'JetBrains_Mono',monospace] font-semibold text-[#6c779d] text-[14px] leading-[14px] text-right min-w-[24px] shrink-0" data-testid={`text-usage-key-count-${k.id}`}>{count.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        )}
      </div>

      <div
        className="flex items-start gap-[10px] p-[12px] rounded-[12px] w-full"
        style={{ background: "#240757", border: "1px solid rgba(118,49,238,0.2)" }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 mt-[2px]">
        <circle cx="8" cy="8" r="7" stroke="#7631ee" strokeWidth="1.3" />
        <path d="M8 7.3v4.2" stroke="#7631ee" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="8" cy="4.7" r="0.9" fill="#7631ee" />
      </svg>
        <div className="[font-family:'Gilroy',sans-serif] font-medium text-[#7631ee] text-[14px] flex-1 min-w-px">
          <p className="leading-[18px] mb-[12px]">
            Key counts come from brain-core's per-key usage attribution ({keyUsageQ.data?.window ?? "30d"} window).
            They are a different measurement than the tenant-wide audit events above and won't match those totals.
          </p>
          <p className="leading-[18px]">
            Usage is aggregated from brain-core audit events for your tenant, attributed to the environment your
            tenancy mode runs in (demo → sandbox, production → live).
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Section nav (Settings two-column pattern) ─── */
type DevSection = "overview" | "keys" | "tenants" | "usage";

function useDevSection(): [DevSection, (s: DevSection) => void] {
  const valid: DevSection[] = ["overview", "keys", "tenants", "usage"];
  const initial = (() => {
    const s = new URLSearchParams(window.location.search).get("section");
    return valid.includes(s as DevSection) ? (s as DevSection) : "overview";
  })();
  const [section, setSection] = useState<DevSection>(initial);
  const navigate = useLocation()[1];
  const set = (s: DevSection) => {
    setSection(s);
    const url = new URL(window.location.href);
    url.searchParams.set("section", s);
    navigate(url.pathname + url.search, { replace: true });
  };
  return [section, set];
}

const DEV_NAV: { id: DevSection; label: string; activeIcon: string; inactiveIcon: string }[] = [
  { id: "overview", label: "Overview", activeIcon: overviewActiveIcon, inactiveIcon: overviewInactiveIcon },
  { id: "keys", label: "API Keys", activeIcon: keysActiveIcon, inactiveIcon: keysInactiveIcon },
  { id: "tenants", label: "Tenants", activeIcon: tenantsActiveIcon, inactiveIcon: tenantsInactiveIcon },
  { id: "usage", label: "Usage and Limits", activeIcon: usageActiveIcon, inactiveIcon: usageInactiveIcon },
];

const ChevronRight = ({ color = "#414965" }: { color?: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M6 4L10 8L6 12" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function DevelopersPage() {
  const [section, setSection] = useDevSection();
  const [env, setEnv] = useState<DevEnv>(() => {
    const stored = localStorage.getItem(ENV_STORAGE_KEY);
    return stored === "live" ? "live" : "sandbox";
  });
  useEffect(() => {
    localStorage.setItem(ENV_STORAGE_KEY, env);
  }, [env]);

  // ONE toggle instance, shown ONLY on Overview (top right). The other
  // subpages still filter by the same env state — they just don't show
  // the switch.
  const envControl = <EnvToggle env={env} onChange={setEnv} />;

  const SectionContent = {
    overview: <OverviewSection env={env} envControl={envControl} onNavigate={setSection} />,
    keys: <KeysSection env={env} />,
    tenants: <TenantsSection onNavigate={setSection} />,
    usage: <UsageSection env={env} />,
  }[section];

  return (
    <div className="flex h-full rounded-[16px] border border-[#1d2132] overflow-hidden" style={{ background: "#11141b" }}>
      {/* ── Developers sidebar ── */}
      <nav className="flex-shrink-0 flex flex-col overflow-y-auto" style={{ width: 240, borderRight: "1px solid #1d2132", background: "#11141b" }}>
        <div className="flex flex-col gap-1 p-2 pt-2">
          {DEV_NAV.map(({ id, label, activeIcon, inactiveIcon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                data-testid={`developers-nav-${id}`}
                onClick={() => setSection(id)}
                className="flex items-center gap-2 p-2 w-full rounded-[12px] transition-colors text-left"
                style={{ background: active ? "#0a0c10" : "transparent" }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(168,185,244,0.05)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <div className="size-[24px] flex-shrink-0 flex items-center justify-center">
                  <img src={active ? activeIcon : inactiveIcon} alt="" aria-hidden="true" width={20} height={20} className="select-none" draggable={false} />
                </div>
                <span
                  className="flex-1 text-[16px] leading-5 whitespace-nowrap"
                  style={{ fontFamily: "'Gilroy', sans-serif", fontWeight: 500, color: active ? "#ffffff" : "#6c779d" }}
                >
                  {label}
                </span>
                {active && <ChevronRight />}
              </button>
            );
          })}
          <a
            href="https://docs.brain.fi/introduction/quickstart"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="developers-nav-docs"
            className="flex items-center gap-2 p-2 w-full rounded-[12px] transition-colors text-left hover:bg-[rgba(168,185,244,0.05)]"
          >
            <div className="size-[24px] flex-shrink-0 flex items-center justify-center">
              <img src={docsInactiveIcon} alt="" aria-hidden="true" width={20} height={20} className="select-none" draggable={false} />
            </div>
            <span className="flex-1 text-[16px] leading-5 whitespace-nowrap" style={{ fontFamily: "'Gilroy', sans-serif", fontWeight: 500, color: "#6c779d" }}>
              Docs
            </span>
          </a>
        </div>
      </nav>

      {/* ── Content area ── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="px-[16px] py-5">{SectionContent}</div>
      </div>
    </div>
  );
}
