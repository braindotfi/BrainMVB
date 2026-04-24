import { useState, type ComponentType } from "react";
import { useToast } from "@/hooks/use-toast";

/* ─── Section type ───────────────────────────────────────── */
type Section =
  | "profile"
  | "security"
  | "notifications"
  | "payments"
  | "agents"
  | "legal"
  | "account";

/* ─── Nav icon components ─────────────────────────────────── */
const ProfileNavIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="8" r="4" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" fill={active ? "rgba(118,49,238,0.15)" : "none"} />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const SecurityNavIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.5C16.5 22.15 20 17.25 20 12V6l-8-4z" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" strokeLinejoin="round" fill={active ? "rgba(118,49,238,0.15)" : "none"} />
    <path d="M9 12l2 2 4-4" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const NotifNavIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill={active ? "rgba(118,49,238,0.15)" : "none"} />
    <path d="M13.73 21a2 2 0 01-3.46 0" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" strokeLinecap="round" />
    {active && <circle cx="18" cy="5" r="2.5" fill="#7631ee" />}
  </svg>
);

const PaymentsNavIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="5" width="20" height="14" rx="2" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" fill={active ? "rgba(118,49,238,0.15)" : "none"} />
    <path d="M2 10h20" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" />
    <path d="M6 15h4M16 15h2" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const AgentsNavIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="8" width="18" height="12" rx="2" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" fill={active ? "rgba(118,49,238,0.15)" : "none"} />
    <path d="M12 2v6M9.5 5h5" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="9" cy="14" r="1.5" fill={active ? "#7631ee" : "#6c779d"} />
    <circle cx="15" cy="14" r="1.5" fill={active ? "#7631ee" : "#6c779d"} />
  </svg>
);

const LegalNavIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" strokeLinejoin="round" fill={active ? "rgba(118,49,238,0.15)" : "none"} />
    <path d="M14 2v6h6M8 13h8M8 17h5" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const AccountNavIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="5" width="18" height="14" rx="2" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" fill={active ? "rgba(118,49,238,0.15)" : "none"} />
    <circle cx="12" cy="11" r="3" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" fill={active ? "rgba(118,49,238,0.2)" : "none"} />
    <path d="M6 19c0-2.5 2.7-4 6-4s6 1.5 6 4" stroke={active ? "#a8b9f4" : "#6c779d"} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/* ─── Nav items definition ───────────────────────────────── */
const NAV_ITEMS: { id: Section; label: string; Icon: ComponentType<{ active: boolean }> }[] = [
  { id: "profile",       label: "Profile",           Icon: ProfileNavIcon  },
  { id: "security",      label: "Security",          Icon: SecurityNavIcon },
  { id: "notifications", label: "Notifications",     Icon: NotifNavIcon    },
  { id: "payments",      label: "Payments",          Icon: PaymentsNavIcon },
  { id: "agents",        label: "Agent Permissions", Icon: AgentsNavIcon   },
  { id: "legal",         label: "Legal",             Icon: LegalNavIcon    },
  { id: "account",       label: "Account",           Icon: AccountNavIcon  },
];

/* ─── Shared primitives ─────────────────────────────────── */
const Toggle = ({
  checked,
  onChange,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) => (
  <button
    data-testid={testId}
    onClick={() => onChange(!checked)}
    className={`relative h-[24px] w-[40px] flex-shrink-0 cursor-pointer ${checked ? "rounded-[100px]" : "rounded-[12px]"}`}
  >
    <div
      className="absolute left-[2px] top-[2px] h-[20px] w-[36px] rounded-[100px]"
      style={{ background: checked ? "#123509" : "#222737" }}
    />
    <div
      className="absolute top-[4px] size-[16px] rounded-[100px] transition-all duration-150"
      style={{
        background: checked ? "#42bf23" : "#06070a",
        left: checked ? "20px" : "4px",
      }}
    />
  </button>
);

const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-[16px] overflow-hidden border border-[#1d2132]" style={{ background: "#0a0c10" }}>
    {children}
  </div>
);

const Divider = () => <div className="h-px bg-[#1d2132] mx-4" />;

const RowIcon = ({ children, danger }: { children: React.ReactNode; danger?: boolean }) => (
  <div
    className="size-[40px] rounded-[12px] flex items-center justify-center flex-shrink-0"
    style={{ background: danger ? "#1a0510" : "#161b28" }}
  >
    {children}
  </div>
);

const ChevronRight = ({ color = "#414965" }: { color?: string }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
    <path d="M5 3L9 7L5 11" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SettingRow = ({
  icon,
  label,
  sublabel,
  right,
  danger,
  onClick,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
  testId?: string;
}) => (
  <div
    data-testid={testId ?? `setting-row-${label.toLowerCase().replace(/\s+/g, "-")}`}
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-3 ${onClick ? "cursor-pointer hover:bg-[#0d1018] transition-colors" : ""}`}
  >
    <RowIcon danger={danger}>{icon}</RowIcon>
    <div className="flex-1 min-w-0">
      <p
        className="text-[15px] leading-5"
        style={{
          color: danger ? "#d20344" : "#c8d4f0",
          fontFamily: "'Gilroy', sans-serif",
          fontWeight: 500,
        }}
      >
        {label}
      </p>
      {sublabel && (
        <p
          className="text-[12px] mt-0.5 leading-[16px]"
          style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 400 }}
        >
          {sublabel}
        </p>
      )}
    </div>
    {right && <div className="flex-shrink-0">{right}</div>}
    {onClick && !right && <ChevronRight color={danger ? "#6b1a2a" : "#414965"} />}
  </div>
);

const SectionLabel = ({ children }: { children: string }) => (
  <p
    className="text-[11px] uppercase tracking-[0.08em] px-1 mb-2"
    style={{ color: "#414965", fontFamily: "'Gilroy', sans-serif", fontWeight: 600 }}
  >
    {children}
  </p>
);

/* ─── Profile section ────────────────────────────────────── */
function ProfileSection({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [name, setName] = useState("Kevin Brainsworth");
  const [email] = useState("kevin@brain.finance");
  const [phone] = useState("+1 (415) 555-0192");
  const [editing, setEditing] = useState(false);
  const kycStatus = "Verified";

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex items-center gap-4 p-4">
          <div
            className="size-[64px] rounded-full flex items-center justify-center text-[22px] flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#7631ee,#4a1a9e)", color: "#fff", fontFamily: "'Gilroy', sans-serif", fontWeight: 700 }}
          >
            {name.split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                data-testid="input-display-name"
                value={name}
                onChange={e => setName(e.target.value)}
                className="bg-transparent outline-none border-b w-full text-base"
                style={{ borderColor: "#7631ee", color: "#fff", fontFamily: "'Gilroy', sans-serif", fontWeight: 500 }}
                autoFocus
              />
            ) : (
              <p className="text-base" style={{ color: "#fff", fontFamily: "'Gilroy', sans-serif", fontWeight: 500 }}>{name}</p>
            )}
            <p className="text-[12px] mt-0.5" style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif" }}>{email}</p>
          </div>
          <button
            data-testid="button-edit-profile"
            onClick={() => {
              if (editing) toast({ title: "Profile saved", description: "Your display name has been updated." });
              setEditing(v => !v);
            }}
            className="px-3 py-1.5 rounded-full text-xs transition-colors hover:opacity-80"
            style={{
              background: editing ? "#7631ee" : "#161b28",
              color: editing ? "#fff" : "#6c779d",
              fontFamily: "'Gilroy', sans-serif",
              fontWeight: 600,
              border: "1px solid #1d2132",
            }}
          >
            {editing ? "Save" : "Edit"}
          </button>
        </div>
      </Card>

      <div>
        <SectionLabel>Identity</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="4.5" width="14" height="10" rx="1.5" stroke="#6c779d" strokeWidth="1.3"/><path d="M5.5 9h5M5.5 11.5h3" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="KYC Verification"
            sublabel="Identity fully verified"
            right={
              <span
                className="px-2.5 py-1 rounded-full text-[11px]"
                style={{
                  background: "#0d2e0d",
                  color: "#42bf23",
                  fontFamily: "'Gilroy', sans-serif",
                  fontWeight: 600,
                  border: "1px solid rgba(66,191,35,0.2)",
                }}
              >
                {kycStatus}
              </span>
            }
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2.5" y="2" width="11" height="14" rx="1.5" stroke="#6c779d" strokeWidth="1.3"/><path d="M5 6.5h6M5 9.5h4M5 12h2.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Wallet Address"
            sublabel="0x00d0...86A8"
            right={
              <button
                data-testid="button-copy-wallet"
                onClick={() => { navigator.clipboard.writeText("0x00d03cB5a84f9E2d100d0486A8"); toast({ title: "Copied", description: "Wallet address copied to clipboard." }); }}
                className="px-2.5 py-1 rounded-lg text-[11px] transition-colors hover:opacity-80"
                style={{ background: "#161b28", color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, border: "1px solid #1d2132" }}
              >
                Copy
              </button>
            }
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="5" y="1.5" width="8" height="15" rx="2" stroke="#6c779d" strokeWidth="1.3"/><path d="M8 13.5h2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Phone Number"
            sublabel={phone}
            onClick={() => toast({ title: "Phone update", description: "An OTP has been sent to your current number." })}
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Connected Accounts</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2C5.13 2 2 5.13 2 9c0 3.09 1.99 5.72 4.77 6.66.35.06.48-.15.48-.33v-1.16c-1.94.42-2.35-.93-2.35-.93-.32-.8-.77-1.01-.77-1.01-.63-.43.05-.42.05-.42.7.05 1.06.71 1.06.71.62 1.05 1.62.75 2.02.57.06-.44.24-.75.44-.92-1.55-.18-3.18-.78-3.18-3.45 0-.76.27-1.38.72-1.87-.07-.18-.31-.88.07-1.84 0 0 .59-.19 1.92.72A6.65 6.65 0 019 5.8c.59 0 1.19.08 1.74.23 1.33-.91 1.92-.72 1.92-.72.38.96.14 1.66.07 1.84.45.49.72 1.11.72 1.87 0 2.68-1.63 3.27-3.19 3.44.25.22.47.64.47 1.29v1.91c0 .19.12.4.48.33C14.01 14.72 16 12.09 16 9c0-3.87-3.13-7-7-7z" fill="#6c779d"/></svg>}
            label="GitHub"
            sublabel="Not connected"
            onClick={() => toast({ title: "GitHub", description: "GitHub connection coming soon." })}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M16 4.7c-.55.24-1.14.41-1.76.48.63-.38 1.12-1 1.35-1.72-.59.35-1.24.6-1.94.74A3.07 3.07 0 009.5 6.5c0 .24.03.47.07.7C6.85 7.07 4.57 5.78 3.08 3.8c-.26.45-.41.97-.41 1.53 0 1.06.54 2 1.36 2.55-.5-.02-.97-.15-1.38-.38v.04c0 1.48 1.05 2.72 2.45 3-.26.07-.52.1-.8.1-.2 0-.38-.02-.57-.05.39 1.2 1.5 2.07 2.83 2.09A6.15 6.15 0 012 13.8c.4.26.89.41 1.41.41a6.1 6.1 0 004.53-1.98A6.12 6.12 0 0016 4.7z" fill="#6c779d"/></svg>}
            label="X (Twitter)"
            sublabel="Not connected"
            onClick={() => toast({ title: "X", description: "X connection coming soon." })}
          />
        </Card>
      </div>
    </div>
  );
}

/* ─── Security section ───────────────────────────────────── */
function SecuritySection({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [twoFA, setTwoFA] = useState(true);
  const [biometric, setBiometric] = useState(false);
  const [loginAlerts, setLoginAlerts] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState("30");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionLabel>Authentication</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="5.5" y="8" width="7" height="7" rx="1.2" stroke="#6c779d" strokeWidth="1.3"/><path d="M6 8V6a3 3 0 016 0v2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><circle cx="9" cy="11.5" r="1" fill="#6c779d"/></svg>}
            label="Two-Factor Authentication"
            sublabel={twoFA ? "Enabled via authenticator app" : "Disabled — account is less secure"}
            right={<Toggle checked={twoFA} onChange={setTwoFA} testId="toggle-2fa" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2a3.5 3.5 0 110 7 3.5 3.5 0 010-7Z" stroke="#6c779d" strokeWidth="1.3"/><path d="M3 16a6 6 0 0112 0" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Biometric Login"
            sublabel="Use Face ID or fingerprint"
            right={<Toggle checked={biometric} onChange={setBiometric} testId="toggle-biometric" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="#6c779d" strokeWidth="1.3"/><path d="M9 5.5v4l2.5 2.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Session Timeout"
            sublabel="Auto-lock after inactivity"
            right={
              <select
                data-testid="select-session-timeout"
                value={sessionTimeout}
                onChange={e => setSessionTimeout(e.target.value)}
                className="appearance-none rounded-xl px-3 py-1.5 text-[13px] outline-none cursor-pointer"
                style={{ background: "#161b28", border: "1px solid #1d2132", color: "#a8b9f4", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, minWidth: "90px" }}
              >
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="60">1 hour</option>
                <option value="0">Never</option>
              </select>
            }
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Account Activity</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="4" width="14" height="10" rx="1.5" stroke="#6c779d" strokeWidth="1.3"/><path d="M2 7.5l7 4.5 7-4.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Login Alerts"
            sublabel="Email me on new sign-ins"
            right={<Toggle checked={loginAlerts} onChange={setLoginAlerts} testId="toggle-login-alerts" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2v2.5M13.25 4.75l-1.77 1.77M15.5 9H13M13.25 13.25l-1.77-1.77M9 16v-2.5M4.75 13.25l1.77-1.77M2.5 9H5M4.75 4.75l1.77 1.77" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Login History"
            sublabel="View recent sign-in activity"
            onClick={() => toast({ title: "Login history", description: "Last login: Today at 6:58 PM from Chrome / macOS" })}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="5.5" y="8" width="7" height="7" rx="1.2" stroke="#6c779d" strokeWidth="1.3"/><path d="M6 8V6a3 3 0 016 0v2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Change PIN"
            sublabel="Update your 6-digit transaction PIN"
            onClick={() => toast({ title: "Change PIN", description: "A verification code has been sent to your phone." })}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 5h12M7 5V3.5h4V5M5 5l.7 10h6.6L13 5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            label="Active Sessions"
            sublabel="Manage devices currently signed in"
            onClick={() => toast({ title: "Active sessions", description: "1 active session found." })}
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Passkey</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="7" cy="8" r="4" stroke="#6c779d" strokeWidth="1.3"/><path d="M9.5 10.5l7 7M12.5 14.5l3-3" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Add Passkey"
            sublabel="Sign in with biometrics or a security key"
            onClick={() => toast({ title: "Passkey", description: "Passkey registration coming soon." })}
          />
        </Card>
      </div>
    </div>
  );
}

/* ─── Notifications section ──────────────────────────────── */
function NotificationsSection({ toast: _ }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [txAlerts, setTxAlerts] = useState(true);
  const [lowBalance, setLowBalance] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [agentAlerts, setAgentAlerts] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [priceAlerts, setPriceAlerts] = useState(false);
  const [emailChannel, setEmailChannel] = useState(true);
  const [pushChannel, setPushChannel] = useState(true);
  const [smsChannel, setSmsChannel] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionLabel>Alert Types</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="4.5" width="14" height="10" rx="2" stroke="#6c779d" strokeWidth="1.3"/><path d="M2 8h14" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><path d="M5.5 11.5h3" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Transaction Alerts"
            sublabel="Notify on every payment or transfer"
            right={<Toggle checked={txAlerts} onChange={setTxAlerts} testId="toggle-tx-alerts" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2.5v4.5l3.5 3.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><circle cx="9" cy="10" r="7" stroke="#6c779d" strokeWidth="1.3"/></svg>}
            label="Low Balance Alerts"
            sublabel="Warn me when balance falls below $100"
            right={<Toggle checked={lowBalance} onChange={setLowBalance} testId="toggle-low-balance" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2L4 4.5V9c0 3.5 2.5 6 5 6.5 2.5-.5 5-3 5-6.5V4.5L9 2Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            label="Security Alerts"
            sublabel="Logins, policy changes, suspicious activity"
            right={<Toggle checked={securityAlerts} onChange={setSecurityAlerts} testId="toggle-security-alerts" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3.5" y="2" width="11" height="14" rx="2" stroke="#6c779d" strokeWidth="1.3"/><circle cx="9" cy="8" r="2.5" stroke="#6c779d" strokeWidth="1.3"/></svg>}
            label="Agent Activity"
            sublabel="When your agents execute actions"
            right={<Toggle checked={agentAlerts} onChange={setAgentAlerts} testId="toggle-agent-alerts" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2l1.8 3.6H15l-3.2 2.35 1.23 3.79L9 9.65 5.97 11.74l1.23-3.79L3.99 5.6H7.2L9 2Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            label="Price Alerts"
            sublabel="Significant moves on tracked assets"
            right={<Toggle checked={priceAlerts} onChange={setPriceAlerts} testId="toggle-price-alerts" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 9.5h14M9 2L5 9.5 9 17l4-7.5L9 2Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            label="Marketing & Updates"
            sublabel="Product news and special offers"
            right={<Toggle checked={marketing} onChange={setMarketing} testId="toggle-marketing" />}
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Channels</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="4.5" width="14" height="10" rx="2" stroke="#6c779d" strokeWidth="1.3"/><path d="M2 7.5l7 4.5 7-4.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Email"
            sublabel="kevin@brain.finance"
            right={<Toggle checked={emailChannel} onChange={setEmailChannel} testId="toggle-email-channel" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="5" y="1.5" width="8" height="15" rx="2" stroke="#6c779d" strokeWidth="1.3"/><path d="M8 13.5h2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Push Notifications"
            sublabel="In-app and mobile alerts"
            right={<Toggle checked={pushChannel} onChange={setPushChannel} testId="toggle-push-channel" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3.5 2h11a1.5 1.5 0 011.5 1.5v8A1.5 1.5 0 0114.5 13H10l-3.5 4v-4H3.5A1.5 1.5 0 012 11.5v-8A1.5 1.5 0 013.5 2Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            label="SMS"
            sublabel="+1 (415) 555-0192"
            right={<Toggle checked={smsChannel} onChange={setSmsChannel} testId="toggle-sms-channel" />}
          />
        </Card>
      </div>
    </div>
  );
}

/* ─── Payments section ───────────────────────────────────── */
function PaymentsSection({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [currency, setCurrency] = useState("USD");
  const [autoSave, setAutoSave] = useState(true);
  const [roundups, setRoundups] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionLabel>Currency & Display</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="#6c779d" strokeWidth="1.3"/><path d="M9 4.5V6M9 12v1.5M7 7.5C7 6.67 7.895 6 9 6s2 .67 2 1.5S10.105 9 9 9 7 9.83 7 10.5 7.895 12 9 12s2-.67 2-1.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Default Currency"
            sublabel="Used for balance display"
            right={
              <select
                data-testid="select-currency"
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="appearance-none rounded-xl px-3 py-1.5 text-[13px] outline-none cursor-pointer"
                style={{ background: "#161b28", border: "1px solid #1d2132", color: "#a8b9f4", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, minWidth: "90px" }}
              >
                <option value="USD">USD $</option>
                <option value="EUR">EUR €</option>
                <option value="GBP">GBP £</option>
                <option value="AED">AED د.إ</option>
                <option value="USDC">USDC</option>
              </select>
            }
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Spending Limits</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 13.5V6a1 1 0 011-1h12a1 1 0 011 1v7.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><path d="M1 13.5h16" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><path d="M7 9h4" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Daily Spend Limit"
            sublabel="$10,000 per calendar day"
            onClick={() => toast({ title: "Spending limit", description: "Contact support to change your spending limits." })}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="4.5" width="14" height="10" rx="2" stroke="#6c779d" strokeWidth="1.3"/><path d="M2 8h14" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><circle cx="6" cy="11.5" r="1" fill="#6c779d"/></svg>}
            label="Single Transaction Limit"
            sublabel="$5,000 per transaction"
            onClick={() => toast({ title: "Transaction limit", description: "Contact support to change your transaction limits." })}
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Smart Savings</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M14.5 9.5a5.5 5.5 0 01-5.5 5.5A5.5 5.5 0 013.5 9.5 5.5 5.5 0 019 4" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><path d="M9 2v4l2 2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Auto-Save"
            sublabel="Save 10% of every deposit automatically"
            right={<Toggle checked={autoSave} onChange={setAutoSave} testId="toggle-auto-save" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 14h14M5 14V7M9 14V4M13 14V9" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Round-Ups"
            sublabel="Round up transactions and invest the change"
            right={<Toggle checked={roundups} onChange={setRoundups} testId="toggle-roundups" />}
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Payment Methods</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="4.5" width="14" height="10" rx="2" stroke="#6c779d" strokeWidth="1.3"/><path d="M2 8h14" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><path d="M5.5 11.5h3" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Add Payment Method"
            sublabel="Link a bank account or card"
            onClick={() => toast({ title: "Add payment method", description: "Payment method setup coming soon." })}
          />
        </Card>
      </div>
    </div>
  );
}

/* ─── Agent Permissions section ──────────────────────────── */
function AgentsSection({ toast: _ }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [tradeApproval, setTradeApproval] = useState(true);
  const [autoRebalance, setAutoRebalance] = useState(false);
  const [spendingLimit, setSpendingLimit] = useState(true);
  const [crossChain, setCrossChain] = useState(true);
  const [maxPerTx, setMaxPerTx] = useState("500");
  const [dailyMax, setDailyMax] = useState("2000");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionLabel>Global Permissions</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2L4 4.5V9c0 3.5 2.5 6 5 6.5 2.5-.5 5-3 5-6.5V4.5L9 2Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M6.5 9l2 2 3-3" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            label="Require Trade Approval"
            sublabel="Confirm every trade over $100 manually"
            right={<Toggle checked={tradeApproval} onChange={setTradeApproval} testId="toggle-trade-approval" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 9a7 7 0 0114 0M2 9a7 7 0 0014 0M9 2v14M5 4.5C5.83 6 7.33 7 9 7s3.17-1 4-2.5M5 13.5C5.83 12 7.33 11 9 11s3.17 1 4 2.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Auto-Rebalance"
            sublabel="Automatically rebalance portfolio daily"
            right={<Toggle checked={autoRebalance} onChange={setAutoRebalance} testId="toggle-auto-rebalance" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2C5.13 2 2 5.13 2 9s3.13 7 7 7 7-3.13 7-7-3.13-7-7-7zM9 6v4l3 1.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Enforce Spending Limits"
            sublabel="Block agents from exceeding your caps"
            right={<Toggle checked={spendingLimit} onChange={setSpendingLimit} testId="toggle-spending-limit" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2a7 7 0 100 14A7 7 0 009 2Z" stroke="#6c779d" strokeWidth="1.3"/><path d="M2 9h14M9 2c-2 2-3.5 4.5-3.5 7S7 14 9 16c2-2 3.5-4.5 3.5-7S11 4 9 2Z" stroke="#6c779d" strokeWidth="1.3"/></svg>}
            label="Cross-Chain Operations"
            sublabel="Allow agents to bridge assets cross-chain"
            right={<Toggle checked={crossChain} onChange={setCrossChain} testId="toggle-cross-chain" />}
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Spending Caps</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="4.5" width="14" height="10" rx="2" stroke="#6c779d" strokeWidth="1.3"/><path d="M2 8h14" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Max per Transaction"
            sublabel="Hard cap per single agent action"
            right={
              <div className="flex items-center gap-1.5 rounded-xl px-3 py-1.5" style={{ background: "#161b28", border: "1px solid #1d2132" }}>
                <span className="text-[13px]" style={{ color: "#414965", fontFamily: "'Gilroy', sans-serif" }}>$</span>
                <input
                  data-testid="input-max-per-tx"
                  type="text"
                  value={maxPerTx}
                  onChange={e => setMaxPerTx(e.target.value)}
                  className="bg-transparent outline-none w-14 text-[13px] text-right"
                  style={{ color: "#a8b9f4", fontFamily: "'JetBrains_Mono', sans-serif", fontWeight: 500 }}
                />
              </div>
            }
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 14V6a1 1 0 011-1h12a1 1 0 011 1v8M1 14h16" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><path d="M7 10.5h4" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Daily Agent Budget"
            sublabel="Maximum total per day across all agents"
            right={
              <div className="flex items-center gap-1.5 rounded-xl px-3 py-1.5" style={{ background: "#161b28", border: "1px solid #1d2132" }}>
                <span className="text-[13px]" style={{ color: "#414965", fontFamily: "'Gilroy', sans-serif" }}>$</span>
                <input
                  data-testid="input-daily-max"
                  type="text"
                  value={dailyMax}
                  onChange={e => setDailyMax(e.target.value)}
                  className="bg-transparent outline-none w-14 text-[13px] text-right"
                  style={{ color: "#a8b9f4", fontFamily: "'JetBrains_Mono', sans-serif", fontWeight: 500 }}
                />
              </div>
            }
          />
        </Card>
      </div>
    </div>
  );
}

/* ─── Legal section ──────────────────────────────────────── */
function LegalSection({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionLabel>Documents</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3.5" y="2" width="11" height="14" rx="1.5" stroke="#6c779d" strokeWidth="1.3"/><path d="M6 6.5h6M6 9.5h6M6 12.5h4" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Terms of Service"
            sublabel="Last updated March 2025"
            onClick={() => window.open("https://brain.finance/terms", "_blank")}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2L4 4.5V9c0 3.5 2.5 6 5 6.5 2.5-.5 5-3 5-6.5V4.5L9 2Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            label="Privacy Policy"
            sublabel="How we handle your data"
            onClick={() => window.open("https://brain.finance/privacy", "_blank")}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="#6c779d" strokeWidth="1.3"/><path d="M9 6v3.5l2.5 2.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Cookie Policy"
            sublabel="Manage your cookie preferences"
            onClick={() => window.open("https://brain.finance/cookies", "_blank")}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2.5 9a6.5 6.5 0 0113 0c0 3.59-2.91 6.5-6.5 6.5S2.5 12.59 2.5 9Z" stroke="#6c779d" strokeWidth="1.3"/><path d="M9 6.5v4M9 12v.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Disclosures"
            sublabel="Risk disclosures and regulatory information"
            onClick={() => window.open("https://brain.finance/disclosures", "_blank")}
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Data Rights</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2v9M5.5 7.5L9 11l3.5-3.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 13.5v1A1.5 1.5 0 003.5 16h11a1.5 1.5 0 001.5-1.5v-1" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Export My Data"
            sublabel="Download a copy of your account data"
            onClick={() => toast({ title: "Data export", description: "Your data export will be emailed to you within 24 hours." })}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 5h12M7 5V3.5h4V5M5 5l.7 10h6.6L13 5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            label="Request Data Deletion"
            sublabel="Permanently remove all your data"
            danger
            onClick={() => toast({ title: "Data deletion", description: "Please contact support to process your deletion request." })}
          />
        </Card>
      </div>
    </div>
  );
}

/* ─── Account section ────────────────────────────────────── */
function AccountSection({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionLabel>Account Info</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2a3.5 3.5 0 110 7A3.5 3.5 0 019 2Z" stroke="#6c779d" strokeWidth="1.3"/><path d="M3 16a6 6 0 0112 0" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Member since"
            sublabel="January 2025"
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2a7 7 0 100 14A7 7 0 009 2Z" stroke="#6c779d" strokeWidth="1.3"/><path d="M6 9l2 2 4-4" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            label="Plan"
            sublabel="Brain Pro"
            right={
              <span
                className="px-2.5 py-1 rounded-full text-[11px]"
                style={{ background: "#1a0d3d", color: "#a8b9f4", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, border: "1px solid rgba(168,185,244,0.2)" }}
              >
                Active
              </span>
            }
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 9h14M9 2l5 7-5 7-5-7 5-7Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            label="Referral Code"
            sublabel="BRAIN-K3V1N"
            right={
              <button
                data-testid="button-copy-referral"
                onClick={() => { navigator.clipboard.writeText("BRAIN-K3V1N"); toast({ title: "Copied", description: "Referral code copied to clipboard." }); }}
                className="px-2.5 py-1 rounded-lg text-[11px] transition-colors hover:opacity-80"
                style={{ background: "#161b28", color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, border: "1px solid #1d2132" }}
              >
                Copy
              </button>
            }
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Preferences</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="#6c779d" strokeWidth="1.3"/><path d="M9 5v4l3 2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Timezone"
            sublabel="UTC−8 (Pacific Time)"
            onClick={() => toast({ title: "Timezone", description: "Timezone settings coming soon." })}
          />
          <Divider />
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2a7 7 0 100 14A7 7 0 009 2Z" stroke="#6c779d" strokeWidth="1.3"/><path d="M6 9c0-1.66 1.34-3 3-3s3 1.34 3 3-1.34 3-3 3-3-1.34-3-3Z" stroke="#6c779d" strokeWidth="1.3"/></svg>}
            label="Language"
            sublabel="English (US)"
            onClick={() => toast({ title: "Language", description: "Language settings coming soon." })}
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Danger Zone</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2a7 7 0 100 14A7 7 0 009 2Z" stroke="#d20344" strokeWidth="1.3"/><path d="M9 6v4M9 12v.5" stroke="#d20344" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Deactivate Account"
            sublabel="Temporarily disable your account"
            danger
            onClick={() => toast({ title: "Deactivate account", description: "Please contact support to deactivate your account." })}
          />
          <Divider />
          {showDeleteConfirm ? (
            <div className="flex flex-col gap-3 px-4 py-4">
              <p className="text-[13px]" style={{ color: "#d20344", fontFamily: "'Gilroy', sans-serif" }}>
                Are you sure? This action is permanent and cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  data-testid="button-confirm-delete"
                  onClick={() => { toast({ title: "Account deletion requested", description: "We'll process your request within 30 days." }); setShowDeleteConfirm(false); }}
                  className="flex-1 py-2 rounded-[100px] text-[13px] transition-opacity hover:opacity-80"
                  style={{ background: "#350011", color: "#d20344", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, border: "1px solid rgba(210,3,68,0.3)" }}
                >
                  Yes, delete my account
                </button>
                <button
                  data-testid="button-cancel-delete"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 rounded-[100px] text-[13px] transition-opacity hover:opacity-80"
                  style={{ background: "#161b28", color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, border: "1px solid #1d2132" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <SettingRow
              icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 5h12M7 5V3.5h4V5M5 5l.7 10h6.6L13 5" stroke="#d20344" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              label="Delete Account"
              sublabel="Permanently delete all data and close account"
              danger
              onClick={() => setShowDeleteConfirm(true)}
              testId="button-delete-account"
            />
          )}
        </Card>
      </div>
    </div>
  );
}

/* ─── Main SettingsPage ──────────────────────────────────── */
export function SettingsPage() {
  const [section, setSection] = useState<Section>("profile");
  const { toast } = useToast();

  const SectionContent = {
    profile:       <ProfileSection toast={toast} />,
    security:      <SecuritySection toast={toast} />,
    notifications: <NotificationsSection toast={toast} />,
    payments:      <PaymentsSection toast={toast} />,
    agents:        <AgentsSection toast={toast} />,
    legal:         <LegalSection toast={toast} />,
    account:       <AccountSection toast={toast} />,
  }[section];

  const SECTION_TITLES: Record<Section, string> = {
    profile:       "Profile",
    security:      "Security",
    notifications: "Notifications",
    payments:      "Payments",
    agents:        "Agent Permissions",
    legal:         "Legal",
    account:       "Account",
  };

  return (
    <div
      className="flex h-full rounded-[16px] border border-[#1d2132] overflow-hidden"
      style={{ background: "#11141b" }}
    >
      {/* ── Settings sidebar ── */}
      <nav
        className="flex-shrink-0 flex flex-col overflow-y-auto"
        style={{ width: 240, borderRight: "1px solid #1d2132", background: "#11141b" }}
      >
        <div className="flex flex-col gap-1 p-2 pt-2">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                data-testid={`settings-nav-${id}`}
                onClick={() => setSection(id)}
                className="flex items-center gap-2 p-2 w-full rounded-[12px] transition-colors text-left"
                style={{ background: active ? "#0a0c10" : "transparent" }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(168,185,244,0.05)"; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div className="size-[24px] flex-shrink-0 flex items-center justify-center">
                  <Icon active={active} />
                </div>
                <span
                  className="flex-1 text-[16px] leading-5 whitespace-nowrap"
                  style={{
                    fontFamily: "'Gilroy', sans-serif",
                    fontWeight: 500,
                    color: active ? "#ffffff" : "#6c779d",
                  }}
                >
                  {label}
                </span>
                {active && <ChevronRight color="#414965" />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Content area ── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="px-6 py-5">
          {/* Section header */}
          <div className="mb-5">
            <h1
              className="text-[20px] leading-7"
              style={{ fontFamily: "'Gilroy', sans-serif", fontWeight: 700, color: "#ffffff" }}
            >
              {SECTION_TITLES[section]}
            </h1>
          </div>

          {SectionContent}
        </div>
      </div>
    </div>
  );
}
