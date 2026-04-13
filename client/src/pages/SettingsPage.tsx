import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ─────────────────────────────────────────────── */
type Section =
  | "profile"
  | "security"
  | "notifications"
  | "payments"
  | "agents"
  | "legal";

/* ─── Sub-components ─────────────────────────────────────── */

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
    className="relative h-[24px] w-[44px] flex-shrink-0 cursor-pointer"
  >
    <div
      className="absolute left-[2px] top-[2px] h-[20px] w-[40px] rounded-[100px] transition-colors"
      style={{ background: checked ? "#123509" : "#222737" }}
    />
    <div
      className="absolute top-[4px] size-[16px] rounded-[100px] transition-all"
      style={{
        background: checked ? "#42bf23" : "#06070a",
        left: checked ? "24px" : "4px",
      }}
    />
  </button>
);

const SectionLabel = ({ children }: { children: string }) => (
  <span
    className="text-[11px] uppercase tracking-widest"
    style={{ color: "#414965", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
  >
    {children}
  </span>
);

const SettingRow = ({
  icon,
  label,
  sublabel,
  right,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    data-testid={`setting-row-${label.toLowerCase().replace(/\s+/g, "-")}`}
    className={`flex items-center gap-4 px-4 py-3.5 transition-colors ${onClick ? "cursor-pointer hover:bg-[#131927]" : ""}`}
  >
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: danger ? "#1a0510" : "#161b28" }}
    >
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p
        className="text-sm leading-snug"
        style={{
          color: danger ? "#d20344" : "#c8d4f0",
          fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
        }}
      >
        {label}
      </p>
      {sublabel && (
        <p
          className="text-[12px] mt-0.5 leading-snug"
          style={{ color: "#414965", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
        >
          {sublabel}
        </p>
      )}
    </div>
    {right && <div className="flex-shrink-0">{right}</div>}
    {onClick && !right && (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
        <path d="M5 3L9 7L5 11" stroke="#414965" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </div>
);

const Divider = () => (
  <div className="h-px mx-4" style={{ background: "#1d2132" }} />
);

const Card = ({ children }: { children: React.ReactNode }) => (
  <div
    className="rounded-[16px] overflow-hidden"
    style={{ background: "#0a0c10", border: "1px solid #1d2132" }}
  >
    {children}
  </div>
);

const SelectInput = ({
  value,
  onChange,
  options,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  testId?: string;
}) => (
  <select
    data-testid={testId}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="appearance-none rounded-xl px-3 py-2 text-sm outline-none cursor-pointer"
    style={{
      background: "#161b28",
      border: "1px solid #1d2132",
      color: "#a8b9f4",
      fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
      minWidth: "120px",
    }}
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
);

const AmountInput = ({
  value,
  onChange,
  prefix,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  testId?: string;
}) => (
  <div
    className="flex items-center gap-1.5 rounded-xl px-3 py-2"
    style={{ background: "#161b28", border: "1px solid #1d2132" }}
  >
    {prefix && (
      <span className="text-sm" style={{ color: "#414965", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}>
        {prefix}
      </span>
    )}
    <input
      data-testid={testId}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-transparent outline-none w-20 text-sm text-right"
      style={{ color: "#a8b9f4", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
    />
  </div>
);

/* ─── Sidebar nav items ──────────────────────────────────── */
const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  {
    id: "profile",
    label: "Profile",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "security",
    label: "Security",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2L3 4.5V8c0 3 2.5 5.5 5 6 2.5-.5 5-3 5-6V4.5L8 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2a5 5 0 0 1 5 5v3l1 2H2l1-2V7a5 5 0 0 1 5-5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "payments",
    label: "Payments",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="4" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M2 7h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M5 10.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "agents",
    label: "Agent Permissions",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="3" y="2" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="8" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5.5 12c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "legal",
    label: "Legal & Privacy",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2l1.5 3H13l-2.7 1.96 1.03 3.16L8 8.12 4.67 10.12l1.03-3.16L3 5h3.5L8 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 14h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
];

/* ─── Section renderers ──────────────────────────────────── */
function ProfileSection({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const kycStatuses = ["Verified", "Pending", "Not Started"];
  const [kycStatus] = useState("Verified");
  const [name, setName] = useState("Kevin Brainsworth");
  const [email] = useState("kevin@brain.finance");
  const [phone, setPhone] = useState("+1 (415) 555-0192");
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      {/* Avatar + name */}
      <Card>
        <div className="flex items-center gap-4 p-5">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #7631ee, #4a1a9e)", color: "white", fontFamily: "'Plus Jakarta Sans', Helvetica" }}
          >
            {name.split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                data-testid="input-display-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-transparent outline-none border-b text-base w-full"
                style={{ borderColor: "#7631ee", color: "#c8d4f0", fontFamily: "'Plus Jakarta Sans', Helvetica" }}
                autoFocus
              />
            ) : (
              <p className="text-base" style={{ color: "#c8d4f0", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}>{name}</p>
            )}
            <p className="text-[12px] mt-0.5" style={{ color: "#414965", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}>{email}</p>
          </div>
          <button
            data-testid="button-edit-profile"
            onClick={() => {
              if (editing) toast({ title: "Profile saved", description: "Your display name has been updated." });
              setEditing((v) => !v);
            }}
            className="px-3 py-1.5 rounded-full text-xs transition-colors"
            style={{
              background: editing ? "#7631ee" : "#161b28",
              color: editing ? "white" : "#6c779d",
              fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
              border: "1px solid #1d2132",
            }}
          >
            {editing ? "Save" : "Edit"}
          </button>
        </div>
      </Card>

      {/* Identity details */}
      <div>
        <SectionLabel>Identity</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="9" rx="1.5" stroke="#6c779d" strokeWidth="1.3"/><path d="M5 8h4M5 10.5h2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="KYC Verification"
            sublabel="Identity fully verified"
            right={
              <span
                className="px-2.5 py-1 rounded-full text-xs"
                style={{
                  background: kycStatus === "Verified" ? "#0d2e0d" : "#2e1a0d",
                  color: kycStatus === "Verified" ? "#42bf23" : "#ff9500",
                  fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
                  border: `1px solid ${kycStatus === "Verified" ? "rgba(66,191,35,0.2)" : "rgba(255,149,0,0.2)"}`,
                }}
              >
                {kycStatus}
              </span>
            }
          />
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="10" height="12" rx="1.5" stroke="#6c779d" strokeWidth="1.3"/><path d="M5 6h6M5 9h4M5 11.5h2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Wallet Address"
            sublabel="0x00d0...86A8"
            right={
              <button
                data-testid="button-copy-wallet"
                onClick={() => { navigator.clipboard.writeText("0x00d03cB5a84f9E2d100d0486A8"); toast({ title: "Copied", description: "Wallet address copied to clipboard." }); }}
                className="px-2.5 py-1 rounded-lg text-xs transition-colors hover:opacity-80"
                style={{ background: "#161b28", color: "#6c779d", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif", border: "1px solid #1d2132" }}
              >
                Copy
              </button>
            }
          />
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 14V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v10M1 14h14" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><rect x="6" y="9" width="4" height="5" rx="0.5" stroke="#6c779d" strokeWidth="1.3"/></svg>}
            label="Phone Number"
            sublabel={phone}
            onClick={() => toast({ title: "Phone update", description: "An OTP has been sent to your current number." })}
          />
        </Card>
      </div>
    </div>
  );
}

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
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="5" y="7" width="6" height="6" rx="1" stroke="#6c779d" strokeWidth="1.3"/><path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><circle cx="8" cy="10" r="1" fill="#6c779d"/></svg>}
            label="Two-Factor Authentication"
            sublabel={twoFA ? "Enabled via authenticator app" : "Disabled — your account is less secure"}
            right={<Toggle checked={twoFA} onChange={setTwoFA} testId="toggle-2fa" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" stroke="#6c779d" strokeWidth="1.3"/><path d="M3 14a5 5 0 0 1 10 0" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Biometric Login"
            sublabel="Use Face ID or fingerprint"
            right={<Toggle checked={biometric} onChange={setBiometric} testId="toggle-biometric" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#6c779d" strokeWidth="1.3"/><path d="M8 5v3.5l2 2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Session Timeout"
            sublabel="Auto-lock after inactivity"
            right={
              <SelectInput
                testId="select-session-timeout"
                value={sessionTimeout}
                onChange={setSessionTimeout}
                options={[
                  { value: "15", label: "15 min" },
                  { value: "30", label: "30 min" },
                  { value: "60", label: "1 hour" },
                  { value: "0", label: "Never" },
                ]}
              />
            }
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Account Activity</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4Z" stroke="#6c779d" strokeWidth="1.3"/><path d="M2 4l6-2 6 2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Login Alerts"
            sublabel="Email me on new sign-ins"
            right={<Toggle checked={loginAlerts} onChange={setLoginAlerts} testId="toggle-login-alerts" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v2M12.24 3.76l-1.41 1.41M14 8h-2M12.24 12.24l-1.41-1.41M8 14v-2M3.76 12.24l1.41-1.41M2 8h2M3.76 3.76l1.41 1.41" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Login History"
            sublabel="View recent sign-in activity"
            onClick={() => toast({ title: "Login history", description: "Last login: Today at 6:58 PM from Chrome / macOS" })}
          />
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="5" y="7" width="6" height="6" rx="1" stroke="#6c779d" strokeWidth="1.3"/><path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Change PIN"
            sublabel="Update your 6-digit transaction PIN"
            onClick={() => toast({ title: "Change PIN", description: "A verification code has been sent to your phone." })}
          />
        </Card>
      </div>
    </div>
  );
}

function NotificationsSection({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [txAlerts, setTxAlerts] = useState(true);
  const [lowBalance, setLowBalance] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [agentAlerts, setAgentAlerts] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [emailChannel, setEmailChannel] = useState(true);
  const [pushChannel, setPushChannel] = useState(true);
  const [smsChannel, setSmsChannel] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionLabel>Alert Types</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="9" rx="2" stroke="#6c779d" strokeWidth="1.3"/><path d="M2 7h12" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><path d="M5 10.5h2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Transaction Alerts"
            sublabel="Notify on every payment or transfer"
            right={<Toggle checked={txAlerts} onChange={setTxAlerts} testId="toggle-tx-alerts" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v4l3 3" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><circle cx="8" cy="9" r="6" stroke="#6c779d" strokeWidth="1.3"/></svg>}
            label="Low Balance Alerts"
            sublabel="Warn me when balance falls below $100"
            right={<Toggle checked={lowBalance} onChange={setLowBalance} testId="toggle-low-balance" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L3 4.5V8c0 3 2.5 5.5 5 6 2.5-.5 5-3 5-6V4.5L8 2Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            label="Security Alerts"
            sublabel="Logins, policy changes, suspicious activity"
            right={<Toggle checked={securityAlerts} onChange={setSecurityAlerts} testId="toggle-security-alerts" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="10" height="12" rx="2" stroke="#6c779d" strokeWidth="1.3"/><circle cx="8" cy="7" r="2" stroke="#6c779d" strokeWidth="1.3"/></svg>}
            label="Agent Activity"
            sublabel="When your agents execute actions"
            right={<Toggle checked={agentAlerts} onChange={setAgentAlerts} testId="toggle-agent-alerts" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M8 2l4 6-4 6-4-6 4-6Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
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
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="9" rx="2" stroke="#6c779d" strokeWidth="1.3"/><path d="M2 6.5l6 4 6-4" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Email"
            sublabel="kevin@brain.finance"
            right={<Toggle checked={emailChannel} onChange={setEmailChannel} testId="toggle-email-channel" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="4" y="1" width="8" height="14" rx="2" stroke="#6c779d" strokeWidth="1.3"/><path d="M7 12.5h2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Push Notifications"
            sublabel="In-app and mobile alerts"
            right={<Toggle checked={pushChannel} onChange={setPushChannel} testId="toggle-push-channel" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H9l-3 3v-3H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            label="SMS"
            sublabel="+1 (415) 555-0192"
            right={<Toggle checked={smsChannel} onChange={setSmsChannel} testId="toggle-sms-channel" />}
          />
        </Card>
      </div>
    </div>
  );
}

function PaymentsSection({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [currency, setCurrency] = useState("USD");
  const [dailyLimit, setDailyLimit] = useState("10,000");
  const [singleLimit, setSingleLimit] = useState("5,000");
  const [autoSave, setAutoSave] = useState(true);
  const [autoSavePercent, setAutoSavePercent] = useState("10");
  const [roundups, setRoundups] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionLabel>Currency & Display</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#6c779d" strokeWidth="1.3"/><path d="M8 4v1.5M8 10.5V12M6 6.5C6 5.67 6.895 5 8 5s2 .67 2 1.5S9.105 8 8 8 6 8.83 6 9.5 6.895 11 8 11s2-.67 2-1.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Default Currency"
            sublabel="Used for balance display"
            right={
              <SelectInput
                testId="select-currency"
                value={currency}
                onChange={setCurrency}
                options={[
                  { value: "USD", label: "USD $" },
                  { value: "EUR", label: "EUR €" },
                  { value: "GBP", label: "GBP £" },
                  { value: "AED", label: "AED د.إ" },
                  { value: "USDC", label: "USDC" },
                ]}
              />
            }
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Spending Limits</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v7" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><path d="M1 12h14" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><path d="M6 8h4" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Daily Spend Limit"
            sublabel="Maximum per calendar day"
            right={<AmountInput testId="input-daily-limit" value={dailyLimit} onChange={setDailyLimit} prefix="$" />}
          />
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="9" rx="2" stroke="#6c779d" strokeWidth="1.3"/><path d="M2 7h12M5 10.5h2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Single Transaction Limit"
            sublabel="Maximum per transaction"
            right={<AmountInput testId="input-single-limit" value={singleLimit} onChange={setSingleLimit} prefix="$" />}
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Savings</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 13V7a5 5 0 0 1 10 0v6" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><path d="M1 13h14" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><path d="M6 10h4" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Auto-Save"
            sublabel="Automatically save a % of each deposit"
            right={<Toggle checked={autoSave} onChange={setAutoSave} testId="toggle-auto-save" />}
          />
          {autoSave && (
            <>
              <Divider />
              <SettingRow
                icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 12L13 4M5.5 4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3ZM10.5 14.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
                label="Save Rate"
                sublabel="Percentage of each inbound transfer"
                right={<AmountInput testId="input-save-rate" value={autoSavePercent} onChange={setAutoSavePercent} prefix="%" />}
              />
            </>
          )}
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#6c779d" strokeWidth="1.3"/><path d="M8 5v3l2 2" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Round-Up Investments"
            sublabel="Round up spend to nearest dollar, invest the change"
            right={<Toggle checked={roundups} onChange={setRoundups} testId="toggle-roundups" />}
          />
        </Card>
      </div>
    </div>
  );
}

function AgentsSection({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [agentTx, setAgentTx] = useState(true);
  const [agentConfirm, setAgentConfirm] = useState(false);
  const [maxAutoApprove, setMaxAutoApprove] = useState("500");
  const [maxDailyAgent, setMaxDailyAgent] = useState("2,000");
  const [agentTwoFA, setAgentTwoFA] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionLabel>Permissions</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="10" height="12" rx="2" stroke="#6c779d" strokeWidth="1.3"/><circle cx="8" cy="7" r="2" stroke="#6c779d" strokeWidth="1.3"/><path d="M5.5 12c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Allow Agent Transactions"
            sublabel="Let AI agents execute payments on your behalf"
            right={<Toggle checked={agentTx} onChange={setAgentTx} testId="toggle-agent-tx" />}
          />
          {agentTx && (
            <>
              <Divider />
              <SettingRow
                icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L3 4.5V8c0 3 2.5 5.5 5 6 2.5-.5 5-3 5-6V4.5L8 2Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                label="Require 2FA for Agent Payments"
                sublabel="Confirm agent spends via authenticator"
                right={<Toggle checked={agentTwoFA} onChange={setAgentTwoFA} testId="toggle-agent-2fa" />}
              />
              <Divider />
              <SettingRow
                icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#6c779d" strokeWidth="1.3"/><path d="M8 4v1.5M8 10.5V12M6 6.5C6 5.67 6.895 5 8 5s2 .67 2 1.5S9.105 8 8 8 6 8.83 6 9.5 6.895 11 8 11s2-.67 2-1.5" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
                label="Max Auto-Approve Amount"
                sublabel="Amounts below this execute without confirmation"
                right={<AmountInput testId="input-max-auto-approve" value={maxAutoApprove} onChange={setMaxAutoApprove} prefix="$" />}
              />
              <Divider />
              <SettingRow
                icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v7" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><path d="M1 12h14" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/><path d="M6 8h4" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
                label="Max Daily Agent Spend"
                sublabel="Aggregate cap across all agents per day"
                right={<AmountInput testId="input-max-daily-agent" value={maxDailyAgent} onChange={setMaxDailyAgent} prefix="$" />}
              />
            </>
          )}
        </Card>
      </div>

      {agentTx && (
        <div>
          <SectionLabel>Confirmation Rules</SectionLabel>
          <Card>
            <SettingRow
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 4" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              label="Manual Approval Required"
              sublabel="Ask me before every agent transaction"
              right={<Toggle checked={agentConfirm} onChange={setAgentConfirm} testId="toggle-agent-confirm" />}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

function LegalSection({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionLabel>Documents</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2h6l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" stroke="#6c779d" strokeWidth="1.3"/><path d="M10 2v4h3M6 8h4M6 10.5h4M6 5.5h1" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Terms of Service"
            sublabel="Last updated Jan 2025"
            onClick={() => toast({ title: "Opening Terms of Service…" })}
          />
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L3 4.5V8c0 3 2.5 5.5 5 6 2.5-.5 5-3 5-6V4.5L8 2Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            label="Privacy Policy"
            sublabel="How we handle your data"
            onClick={() => toast({ title: "Opening Privacy Policy…" })}
          />
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2h6l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" stroke="#6c779d" strokeWidth="1.3"/><path d="M10 2v4h3" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Cookie Policy"
            sublabel="Manage cookie preferences"
            onClick={() => toast({ title: "Opening Cookie Policy…" })}
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Your Data</SectionLabel>
        <Card>
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M4.5 6L8 10l3.5-4" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 13h12" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            label="Export My Data"
            sublabel="Download a copy of your account data"
            onClick={() => toast({ title: "Export requested", description: "Your data export will be emailed within 24 hours." })}
          />
          <Divider />
          <SettingRow
            icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M13 4l-.867 9.143A1 1 0 0 1 11.138 14H4.862a1 1 0 0 1-.995-.857L3 4" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            label="Delete My Data"
            sublabel="Request erasure under GDPR / CCPA"
            onClick={() => toast({ title: "Deletion request logged", description: "We'll confirm your erasure request within 48 hours.", variant: "destructive" })}
          />
        </Card>
      </div>

      <div>
        <SectionLabel>Account</SectionLabel>
        <Card>
          <SettingRow
            danger
            icon={
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 2H6a1 1 0 0 0-1 1v1H3v1h10V4h-2V3a1 1 0 0 0-1-1ZM4 6l.762 7.619A1 1 0 0 0 5.757 14h4.486a1 1 0 0 0 .995-.881L12 6" stroke="#d20344" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
            label="Close Account"
            sublabel="Permanently delete your Brain Finance account"
            onClick={() => toast({ title: "Contact support", description: "Please email support@brain.finance to initiate account closure.", variant: "destructive" })}
          />
        </Card>
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────── */
export const SettingsPage = (): JSX.Element => {
  const [section, setSection] = useState<Section>("profile");
  const { toast } = useToast();

  const CONTENT: Record<Section, React.ReactNode> = {
    profile: <ProfileSection toast={toast} />,
    security: <SecuritySection toast={toast} />,
    notifications: <NotificationsSection toast={toast} />,
    payments: <PaymentsSection toast={toast} />,
    agents: <AgentsSection toast={toast} />,
    legal: <LegalSection toast={toast} />,
  };

  const TITLES: Record<Section, string> = {
    profile: "Profile",
    security: "Security",
    notifications: "Notifications",
    payments: "Payment Preferences",
    agents: "Agent Permissions",
    legal: "Legal & Privacy",
  };

  return (
    <div className="flex h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">

      {/* ── Sidebar ── */}
      <div
        className="flex flex-col w-[220px] flex-shrink-0 h-full overflow-hidden"
        style={{ borderRight: "1px solid #1d2132" }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex-shrink-0" style={{ borderBottom: "1px solid #1d2132" }}>
          <h2
            className="text-base"
            style={{ color: "#f1f5f9", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
          >
            Settings
          </h2>
        </div>

        {/* Nav */}
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-1 p-3">
            {NAV_ITEMS.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  data-testid={`settings-nav-${item.id}`}
                  onClick={() => setSection(item.id)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-left transition-colors"
                  style={{
                    background: active ? "#1a1033" : "transparent",
                    border: active ? "1px solid #4a1a9e" : "1px solid transparent",
                  }}
                >
                  <span style={{ color: active ? "#9d5cf5" : "#414965" }}>
                    {item.icon}
                  </span>
                  <span
                    className="text-sm"
                    style={{
                      color: active ? "#c8d4f0" : "#6c779d",
                      fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
                    }}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {/* App version */}
        <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: "1px solid #1d2132" }}>
          <p
            className="text-[11px]"
            style={{ color: "#414965", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
          >
            Brain Finance v1.0.0
          </p>
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Top bar */}
        <div
          className="flex items-center px-6 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid #1d2132" }}
        >
          <h3
            className="text-base"
            style={{ color: "#f1f5f9", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
          >
            {TITLES[section]}
          </h3>
        </div>

        {/* Scrollable content */}
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-6 p-6">
            {CONTENT[section]}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};
