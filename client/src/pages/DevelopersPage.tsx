/**
 * Developers section — Overview, API Keys, Tenants, Usage & Limits (+ Docs link).
 *
 * Assembled ONLY from existing design patterns (Settings two-column shell,
 * Home metric cards / list rows, existing pill buttons and badges). No mock
 * data: keys come from /api/developers/keys (platform-issued, hashed at rest,
 * plaintext shown exactly once), usage aggregates REAL brain-core audit
 * events, tenants read the existing tenancy layer.
 *
 * Webhooks are deliberately excluded from this section (v2).
 */
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppAlert } from "@/components/AppAlert";
import { usePlanId, PLAN_RATE_LIMITS } from "@/lib/planStore";

/* ─── Types (wire shapes from server/routes.ts developers block) ─── */
type DevEnv = "sandbox" | "live";

interface MaskedKey {
  id: string;
  tenantId: string | null;
  name: string;
  environment: string;
  scopes: string[];
  maskedKey: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  rotatedFromId: string | null;
  status: "active" | "revoked";
}

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
  }>;
}

interface UsageResponse {
  totalEvents: number;
  byAction: Array<{ action: string; count: number }>;
  byLayer: Array<{ layer: string; count: number }>;
  daily: Array<{ date: string; count: number }>;
  windowDays: number;
  environment: DevEnv;
}

interface AuditEventsResponse {
  events: Array<{ id: string; layer: string; action: string; created_at: string }>;
}

const SCOPE_OPTIONS = [
  { id: "ledger:read", label: "Ledger read", hint: "Accounts, transactions, invoices" },
  { id: "audit:read", label: "Audit read", hint: "Audit events and anchors" },
  { id: "payment_intent:propose", label: "Propose", hint: "Create PaymentIntents (never executes)" },
] as const;

const ENV_STORAGE_KEY = "brain_developers_env";

/* ─── Shared primitives (Settings/Home card + label patterns) ─── */
const Card = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <div data-testid={testId} className="rounded-[16px] overflow-hidden" style={{ background: "#0a0c10" }}>
    {children}
  </div>
);

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <p className="mb-2 [font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[12px] leading-[16px] uppercase tracking-wide">
    {children}
  </p>
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
      className="rounded-full px-4 py-2 hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed [font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] whitespace-nowrap"
      style={styles}
    >
      {children}
    </button>
  );
};

const StatusBadge = ({ status }: { status: "active" | "revoked" }) => (
  <span
    data-testid={`badge-key-status-${status}`}
    className="px-2 py-[2px] rounded-[4px] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[14px]"
    style={status === "active"
      ? { background: "#1c1132", color: "#a88afa" }
      : { background: "#350011", color: "#d20344" }}
  >
    {status === "active" ? "Active" : "Revoked"}
  </span>
);

const EnvBadge = ({ env }: { env: string }) => (
  <span
    className="px-2 py-[2px] rounded-[4px] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-[14px]"
    style={env === "live"
      ? { background: "#4a2300", color: "#ff9500" }
      : { background: "#1d2132", color: "#a8b9f4" }}
  >
    {env === "live" ? "Live" : "Sandbox"}
  </span>
);

const EmptyRow = ({ children }: { children: ReactNode }) => (
  <div className="p-4">
    <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[20px]">{children}</p>
  </div>
);

const MetricCard = ({ label, value, sub, testId }: { label: string; value: ReactNode; sub?: ReactNode; testId?: string }) => (
  <Card testId={testId}>
    <div className="p-4 flex flex-col gap-1">
      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[16px]">{label}</p>
      <Mono className="text-white text-[28px] leading-[34px] font-semibold">{value}</Mono>
      {sub && <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[12px] leading-[16px]">{sub}</p>}
    </div>
  </Card>
);

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/* ─── Environment toggle (persisted; Live gated server-side too) ─── */
const EnvToggle = ({ env, onChange }: { env: DevEnv; onChange: (e: DevEnv) => void }) => (
  <div className="flex items-center rounded-full p-[3px] gap-[2px]" style={{ background: "#0a0c10" }}>
    {(["sandbox", "live"] as DevEnv[]).map((e) => (
      <button
        key={e}
        type="button"
        data-testid={`toggle-env-${e}`}
        onClick={() => onChange(e)}
        className="px-3 py-[5px] rounded-full [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[16px] transition-colors"
        style={env === e
          ? e === "live"
            ? { background: "#4a2300", color: "#ff9500" }
            : { background: "#240757", color: "#a8b9f4" }
          : { background: "transparent", color: "#6c779d" }}
      >
        {e === "live" ? "Live" : "Sandbox"}
      </button>
    ))}
  </div>
);

/* ─── One-time plaintext key modal ─── */
const PlaintextKeyModal = ({ plaintext, onClose }: { plaintext: string; onClose: () => void }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col rounded-[16px] w-[440px] overflow-hidden" style={{ background: "#11141b", border: "1px solid #1d2132" }}>
        <div className="flex flex-col gap-2 p-5">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[18px] leading-[22px]">Your new API key</p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#ff9500] text-[13px] leading-[18px]">
            Copy it now — for your security, it will never be shown again.
          </p>
          <div className="rounded-[8px] p-3 mt-1 break-all" style={{ background: "#0a0c10", border: "1px solid #1d2132" }}>
            <Mono className="text-white text-[13px] leading-[18px]" testId="text-plaintext-key">{plaintext}</Mono>
          </div>
        </div>
        <div className="flex gap-2 p-3 pt-0">
          <button
            type="button"
            data-testid="button-copy-key"
            onClick={async () => {
              try { await navigator.clipboard.writeText(plaintext); setCopied(true); } catch { /* clipboard unavailable */ }
            }}
            className="flex-1 rounded-full px-4 py-2 hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[14px]"
            style={{ background: "#7631ee", color: "#ffffff" }}
          >
            {copied ? "Copied" : "Copy key"}
          </button>
          <button
            type="button"
            data-testid="button-close-key-modal"
            onClick={onClose}
            className="flex-1 rounded-full px-4 py-2 hover:opacity-80 transition-opacity [font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[14px]"
            style={{ background: "#222737" }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── Overview ─── */
function OverviewSection({ env }: { env: DevEnv }) {
  const keysQ = useQuery<{ keys: MaskedKey[] }>({ queryKey: ["/api/developers/keys"] });
  const tenantsQ = useQuery<TenantsResponse>({ queryKey: ["/api/developers/tenants"] });
  const usageQ = useQuery<UsageResponse>({ queryKey: [`/api/developers/usage?environment=${env}`] });
  const activityQ = useQuery<AuditEventsResponse>({ queryKey: ["/api/brain/audit/events?limit=8"] });

  const activeKeys = (keysQ.data?.keys ?? []).filter((k) => k.status === "active" && k.environment === env);
  const hasTenant = (tenantsQ.data?.tenants.length ?? 0) > 0;
  const hasKey = activeKeys.length > 0;
  const hasCall = (usageQ.data?.totalEvents ?? 0) > 0;
  const today = usageQ.data?.daily.length ? usageQ.data.daily[usageQ.data.daily.length - 1].count : null;

  const steps = [
    { label: "Create a tenant", done: hasTenant },
    { label: "Issue an API key", done: hasKey },
    { label: "Make your first call", done: hasCall },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SectionLabel>Get started</SectionLabel>
        <Card testId="card-get-started">
          <div className="flex items-stretch divide-x divide-[#1d2132]">
            {steps.map((s, i) => (
              <div key={s.label} className="flex-1 p-4 flex items-center gap-3" data-testid={`step-get-started-${i}`}>
                <div
                  className="size-[24px] rounded-full flex items-center justify-center flex-shrink-0 [font-family:'JetBrains_Mono',monospace] text-[12px]"
                  style={s.done ? { background: "#1c1132", color: "#a88afa" } : { background: "#1d2132", color: "#6c779d" }}
                >
                  {s.done ? "✓" : i + 1}
                </div>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[18px]" style={{ color: s.done ? "#ffffff" : "#6c779d" }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          label={`Requests today (${env})`}
          value={usageQ.isLoading ? "…" : usageQ.isError ? "—" : String(today ?? 0)}
          sub={usageQ.isError ? "Usage unavailable" : "From brain-core audit events"}
          testId="metric-requests-today"
        />
        <MetricCard
          label={`Active keys (${env})`}
          value={keysQ.isLoading ? "…" : String(activeKeys.length)}
          sub="Platform-issued keys"
          testId="metric-active-keys"
        />
      </div>

      <div>
        <SectionLabel>Recent activity</SectionLabel>
        <Card testId="card-recent-activity">
          {activityQ.isLoading ? (
            <EmptyRow>Loading activity…</EmptyRow>
          ) : activityQ.isError || !activityQ.data?.events?.length ? (
            <EmptyRow>No recorded activity yet. Calls appear here as brain-core audit events.</EmptyRow>
          ) : (
            <div className="divide-y divide-[#1d2132]">
              {activityQ.data.events.slice(0, 8).map((ev) => (
                <div key={ev.id} className="flex items-center gap-3 px-4 py-3" data-testid={`row-activity-${ev.id}`}>
                  <span className="px-2 py-[2px] rounded-[4px] text-[11px] [font-family:'Gilroy',sans-serif] font-semibold" style={{ background: "#1d2132", color: "#a8b9f4" }}>
                    {ev.layer}
                  </span>
                  <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium text-white text-[14px] leading-[18px] truncate">{ev.action}</p>
                  <Mono className="text-[#6c779d] text-[12px]">{formatDateTime(ev.created_at)}</Mono>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ─── API Keys ─── */
function KeysSection({ env }: { env: DevEnv }) {
  const alert = useAppAlert();
  const keysQ = useQuery<{ keys: MaskedKey[] }>({ queryKey: ["/api/developers/keys"] });
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["ledger:read"]);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/developers/keys"] });

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
      invalidate();
    },
    onError: (e: Error) => alert.error("Couldn't rotate key", e.message),
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/developers/keys/${id}/revoke`)).json(),
    onSuccess: () => {
      setConfirmRevoke(null);
      alert.success("Key revoked", "The key can no longer be used.");
      invalidate();
    },
    onError: (e: Error) => alert.error("Couldn't revoke key", e.message),
  });

  const tenantsQ = useQuery<TenantsResponse>({ queryKey: ["/api/developers/tenants"] });
  const liveAvailable = tenantsQ.data?.liveKeysAvailable === true;
  const keys = (keysQ.data?.keys ?? []).filter((k) => k.environment === env);

  return (
    <div className="flex flex-col gap-6">
      {plaintext && <PlaintextKeyModal plaintext={plaintext} onClose={() => setPlaintext(null)} />}

      <div className="flex items-center justify-between">
        <SectionLabel>{env === "live" ? "Live keys" : "Sandbox keys"}</SectionLabel>
        {env === "sandbox" || liveAvailable ? (
          <PillButton testId="button-new-key" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "+ New key"}
          </PillButton>
        ) : null}
      </div>

      {env === "live" && !liveAvailable && (
        <Card testId="card-live-gated">
          <div className="p-4 flex flex-col gap-2">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold text-white text-[15px] leading-[20px]">Live access not enabled</p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px]">
              Live keys require a production tenant. This workspace is running in {tenantsQ.data?.mode === "production" ? "production mode without live-key readiness — link your company tenant first" : "demo mode"}.
            </p>
            <div className="mt-1">
              <PillButton tone="neutral" testId="button-request-live-access" onClick={() => alert.success("Request noted", "Live access is enabled when your workspace has a production tenant.")}>
                Request access
              </PillButton>
            </div>
          </div>
        </Card>
      )}

      {showCreate && (env === "sandbox" || liveAvailable) && (
        <Card testId="card-create-key">
          <div className="p-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]" htmlFor="key-name">Key name</label>
              <input
                id="key-name"
                data-testid="input-key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Backend service"
                maxLength={80}
                className="rounded-[8px] px-3 py-2 bg-transparent outline-none [font-family:'Gilroy',sans-serif] font-medium text-white placeholder:text-[#414965] text-[14px]"
                style={{ background: "#11141b", border: "1px solid #1d2132" }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">Scopes</p>
              {SCOPE_OPTIONS.map((s) => {
                const checked = scopes.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    data-testid={`checkbox-scope-${s.id.replace(/[^a-z]+/g, "-")}`}
                    onClick={() => setScopes((prev) => checked ? prev.filter((x) => x !== s.id) : [...prev, s.id])}
                    className="flex items-center gap-3 rounded-[8px] p-2 text-left transition-colors hover:bg-[rgba(168,185,244,0.05)]"
                  >
                    <div
                      className="size-[18px] rounded-[4px] flex items-center justify-center flex-shrink-0 text-[12px]"
                      style={checked ? { background: "#7631ee", color: "#fff" } : { background: "transparent", border: "1px solid #414965" }}
                    >
                      {checked ? "✓" : ""}
                    </div>
                    <div>
                      <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[14px] leading-[18px]">{s.label}</p>
                      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[12px] leading-[16px]">{s.hint}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div>
              <PillButton
                testId="button-create-key"
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || name.trim().length === 0 || scopes.length === 0}
              >
                {createMut.isPending ? "Creating…" : "Create key"}
              </PillButton>
            </div>
          </div>
        </Card>
      )}

      <Card testId="card-keys-list">
        {keysQ.isLoading ? (
          <EmptyRow>Loading keys…</EmptyRow>
        ) : keys.length === 0 ? (
          <EmptyRow>No {env} keys yet.{env === "sandbox" ? " Create one to start calling the API." : ""}</EmptyRow>
        ) : (
          <div className="divide-y divide-[#1d2132]">
            {keys.map((k) => (
              <div key={k.id} className="p-4 flex flex-col gap-2" data-testid={`row-key-${k.id}`}>
                <div className="flex items-center gap-2">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold text-white text-[15px] leading-[20px] flex-1 truncate">{k.name}</p>
                  <EnvBadge env={k.environment} />
                  <StatusBadge status={k.status} />
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <Mono className="text-[#a8b9f4] text-[13px]" testId={`text-masked-key-${k.id}`}>{k.maskedKey}</Mono>
                  <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[12px]">
                    Scopes: <span className="text-[#6c779d]">{k.scopes.join(", ")}</span>
                  </span>
                  <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[12px]">
                    Created <Mono className="text-[#6c779d]">{formatDate(k.createdAt)}</Mono>
                  </span>
                  <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[12px]">
                    Last used <Mono className="text-[#6c779d]">{formatDateTime(k.lastUsedAt)}</Mono>
                  </span>
                </div>
                {k.status === "active" && (
                  <div className="flex items-center gap-2 mt-1">
                    <PillButton tone="neutral" testId={`button-rotate-${k.id}`} onClick={() => rotateMut.mutate(k.id)} disabled={rotateMut.isPending}>
                      {rotateMut.isPending ? "Rotating…" : "Rotate"}
                    </PillButton>
                    {confirmRevoke === k.id ? (
                      <>
                        <PillButton tone="danger" testId={`button-revoke-confirm-${k.id}`} onClick={() => revokeMut.mutate(k.id)} disabled={revokeMut.isPending}>
                          {revokeMut.isPending ? "Revoking…" : "Confirm revoke"}
                        </PillButton>
                        <PillButton tone="neutral" testId={`button-revoke-cancel-${k.id}`} onClick={() => setConfirmRevoke(null)}>Cancel</PillButton>
                      </>
                    ) : (
                      <PillButton tone="danger" testId={`button-revoke-${k.id}`} onClick={() => setConfirmRevoke(k.id)}>Revoke</PillButton>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[12px] leading-[16px]">
        Keys are issued by this platform and stored hashed. Enforcement inside brain-core's API gateway is rolling out —
        until then, keys authenticate against platform endpoints only.
      </p>
    </div>
  );
}

/* ─── Tenants ─── */
function TenantsSection() {
  const alert = useAppAlert();
  const tenantsQ = useQuery<TenantsResponse>({ queryKey: ["/api/developers/tenants"] });
  const [companyName, setCompanyName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <SectionLabel>Tenants</SectionLabel>
        {data?.canCreate && (
          <PillButton testId="button-create-tenant" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "+ Create tenant"}
          </PillButton>
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
                {createMut.isPending ? "Creating…" : "Create tenant"}
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
          <div className="divide-y divide-[#1d2132]">
            {data.tenants.map((t) => (
              <div key={t.id} className="p-4 flex items-center gap-4" data-testid={`row-tenant-${t.id}`}>
                <div className="flex-1 min-w-0">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold text-white text-[15px] leading-[20px] truncate">
                    {t.companyName ?? (t.ephemeral ? "Demo tenant" : "Your company")}
                  </p>
                  <Mono className="text-[#6c779d] text-[12px]" testId={`text-tenant-id-${t.id}`}>{t.id}</Mono>
                </div>
                <EnvBadge env={t.environment} />
                <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[12px]">
                  Created <Mono className="text-[#6c779d]">{formatDate(t.createdAt)}</Mono>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {data?.mode === "demo" && (
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[12px] leading-[16px]">
          This workspace runs in demo mode: the tenant above is provisioned fresh for your session (~30 min) and can't be
          created manually. Production tenant creation unlocks when the platform runs in production tenancy mode.
        </p>
      )}
    </div>
  );
}

/* ─── Usage & Limits ─── */
function UsageSection({ env }: { env: DevEnv }) {
  // Environment-scoped usage: the server attributes tenant traffic to the
  // environment implied by the tenancy mode (demo→sandbox, production→live),
  // so the non-matching environment honestly reports zero.
  const usageQ = useQuery<UsageResponse>({
    queryKey: [`/api/developers/usage?window=60&environment=${env}`],
  });
  // Rate-limit tier comes from the SAME plan source as Settings → Billing.
  const planId = usePlanId();
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
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          label="Requests this month"
          value={usageQ.isLoading ? "…" : usageQ.isError ? "—" : String(thisMonth)}
          sub={
            usageQ.isError
              ? "Usage unavailable"
              : trend === null
                ? "No prior-month data to compare"
                : `${trend >= 0 ? "+" : ""}${trend}% vs. last month`
          }
          testId="metric-requests-month"
        />
        <MetricCard
          label="Rate-limit tier"
          value={
            tier
              ? <span className="text-[18px] leading-[24px]">{tier.tier}</span>
              : <span className="text-[18px] leading-[24px]">No plan selected</span>
          }
          sub={
            tier
              ? `${tier.requestsPerMin} req/min, burst ${tier.burst} — from your Settings → Billing plan`
              : "Choose a plan in Settings → Billing to set your tier"
          }
          testId="metric-rate-limit-tier"
        />
      </div>

      <div>
        <SectionLabel>Requests by method ({env})</SectionLabel>
        <Card testId="card-usage-by-method">
          {usageQ.isLoading ? (
            <EmptyRow>Loading usage…</EmptyRow>
          ) : usageQ.isError ? (
            <EmptyRow>Usage is unavailable — brain-core audit events couldn't be read.</EmptyRow>
          ) : !data?.byAction.length ? (
            <EmptyRow>No {env} calls recorded in the last {data?.windowDays ?? 60} days.</EmptyRow>
          ) : (
            <div className="divide-y divide-[#1d2132]">
              {data.byAction.map((a) => {
                const max = data.byAction[0]?.count || 1;
                return (
                  <div key={a.action} className="px-4 py-3 flex items-center gap-3" data-testid={`row-method-${a.action}`}>
                    <p className="[font-family:'Gilroy',sans-serif] font-medium text-white text-[14px] leading-[18px] w-[220px] truncate">{a.action}</p>
                    <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: "#11141b" }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.max((a.count / max) * 100, 2)}%`, background: "#7631ee" }} />
                    </div>
                    <Mono className="text-[#a8b9f4] text-[13px] w-[48px] text-right">{a.count}</Mono>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[12px] leading-[16px]">
        Usage is aggregated from brain-core audit events for your tenant, attributed to the environment your tenancy
        mode runs in (demo → sandbox, production → live). Per-key attribution arrives once brain-core enforces
        platform-issued keys.
      </p>
    </div>
  );
}

/* ─── Section nav (Settings two-column pattern) ─── */
type DevSection = "overview" | "keys" | "tenants" | "usage";

const DEV_NAV: { id: DevSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "keys", label: "API Keys" },
  { id: "tenants", label: "Tenants" },
  { id: "usage", label: "Usage & Limits" },
];

const ChevronRight = ({ color = "#414965" }: { color?: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M6 4L10 8L6 12" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M5.5 2.5H2.5C1.94772 2.5 1.5 2.94772 1.5 3.5V11.5C1.5 12.0523 1.94772 12.5 2.5 12.5H10.5C11.0523 12.5 11.5 12.0523 11.5 11.5V8.5M8.5 1.5H12.5M12.5 1.5V5.5M12.5 1.5L6.5 7.5" stroke="#6c779d" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function DevelopersPage() {
  const [section, setSection] = useState<DevSection>("overview");
  const [env, setEnv] = useState<DevEnv>(() => {
    const stored = localStorage.getItem(ENV_STORAGE_KEY);
    return stored === "live" ? "live" : "sandbox";
  });
  useEffect(() => {
    localStorage.setItem(ENV_STORAGE_KEY, env);
  }, [env]);

  const SectionContent = {
    overview: <OverviewSection env={env} />,
    keys: <KeysSection env={env} />,
    tenants: <TenantsSection />,
    usage: <UsageSection env={env} />,
  }[section];

  return (
    <div className="flex h-full rounded-[16px] border border-[#1d2132] overflow-hidden" style={{ background: "#11141b" }}>
      {/* ── Developers sidebar ── */}
      <nav className="flex-shrink-0 flex flex-col overflow-y-auto" style={{ width: 240, borderRight: "1px solid #1d2132", background: "#11141b" }}>
        <div className="flex flex-col gap-1 p-2 pt-2 flex-1">
          {DEV_NAV.map(({ id, label }) => {
            const active = section === id;
            return (
              <button
                key={id}
                data-testid={`developers-nav-${id}`}
                onClick={() => setSection(id)}
                className="flex items-center gap-2 p-2 w-full rounded-[12px] transition-colors text-left"
                style={{ background: active ? "#0a0c10" : "transparent" }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(168,185,244,0.05)"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
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
            href="https://docs.brain.fi/quickstart"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="developers-nav-docs"
            className="flex items-center gap-2 p-2 w-full rounded-[12px] transition-colors text-left hover:bg-[rgba(168,185,244,0.05)]"
          >
            <span className="flex-1 text-[16px] leading-5 whitespace-nowrap" style={{ fontFamily: "'Gilroy', sans-serif", fontWeight: 500, color: "#6c779d" }}>
              Docs
            </span>
            <ExternalLinkIcon />
          </a>
        </div>
        <div className="p-3" style={{ borderTop: "1px solid #1d2132" }}>
          <EnvToggle env={env} onChange={setEnv} />
        </div>
      </nav>

      {/* ── Content area ── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="px-6 py-5">{SectionContent}</div>
      </div>
    </div>
  );
}
