import { useState, type ComponentType } from "react";
import { useToast } from "@/hooks/use-toast";
import { ICONS } from "@/assets/figma-icons";
import SecurityFigma from "@/components/settings/figma/SecuritySection";
import NotificationsFigma from "@/components/settings/figma/NotificationsSection";
import PaymentsFigma from "@/components/settings/figma/PaymentsSectionFigma";
import AgentsFigma from "@/components/settings/figma/AgentsSection";
import LegalFigma from "@/components/settings/figma/LegalSection";
import AccountFigma from "@/components/settings/figma/AccountSection";

/* ─── Section type ───────────────────────────────────────── */
type Section =
  | "profile"
  | "security"
  | "notifications"
  | "payments"
  | "agents"
  | "legal"
  | "account";

/* ─── Nav icon components (from Figma 3695:38606) ──────────── */
/* Profile is the only menu item with a custom "active" treatment
   in the Figma design (purple gradient + filled icon). All other
   inactive items render their Figma vector at default gray. */
const ProfileNavIcon = ({ active }: { active: boolean }) => (
  <div className="relative shrink-0 size-[24px]">
    <div className="absolute inset-[4.17%_12.5%]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.settings_profile_active_head} />
    </div>
    <div className="absolute inset-[33.33%_29.17%_16.67%_29.17%]">
      <div className="absolute inset-[-9.38%_-22.5%_-28.13%_-22.5%]">
        <img alt="" className="block max-w-none size-full" src={ICONS.settings_profile_active_body} style={{ filter: active ? "none" : "grayscale(1) brightness(0.85)" }} />
      </div>
    </div>
  </div>
);

const FigmaNavIcon = ({ src, inset = "4.17%_8.33%" }: { src: string; inset?: string }) => (
  <div className="relative shrink-0 size-[24px]">
    <div className="absolute" style={{ inset: inset.replace(/_/g, " ") }}>
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={src} />
    </div>
  </div>
);

const SecurityNavIcon  = () => <FigmaNavIcon src={ICONS.settings_security_inactive} />;
const NotifNavIcon     = () => <FigmaNavIcon src={ICONS.settings_notif_inactive} />;
const PaymentsNavIcon  = () => <FigmaNavIcon src={ICONS.settings_payments_inactive} inset="16.67%_4.17%" />;
const AgentsNavIcon    = () => (
  <div className="relative shrink-0 size-[24px]">
    <div className="absolute h-[22px] left-[2px] top-px w-[20px]">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.settings_agents_inactive} />
    </div>
  </div>
);
const LegalNavIcon     = () => <FigmaNavIcon src={ICONS.settings_legal_inactive} inset="4.17%_8.33%_0_12.5%" />;
const AccountNavIcon   = () => <FigmaNavIcon src={ICONS.settings_account_inactive} />;

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
const Card = ({ children, noBorder }: { children: React.ReactNode; noBorder?: boolean }) => (
  <div
    className={`rounded-[16px] overflow-hidden ${noBorder ? "" : "border border-[#1d2132]"}`}
    style={{ background: "#0a0c10" }}
  >
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
  useCircleIcon,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
  testId?: string;
  useCircleIcon?: boolean;
}) => (
  <div
    data-testid={testId ?? `setting-row-${label.toLowerCase().replace(/\s+/g, "-")}`}
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-3 ${onClick ? "cursor-pointer hover:bg-[#0d1018] transition-colors" : ""}`}
  >
    {useCircleIcon ? icon : <RowIcon danger={danger}>{icon}</RowIcon>}
    <div className="flex-1 min-w-0">
      <p
        className={useCircleIcon ? "leading-5" : "text-[15px] leading-5"}
        style={
          useCircleIcon
            ? { color: "#a8b9f4", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "16px" }
            : { color: danger ? "#d20344" : "#c8d4f0", fontFamily: "'Gilroy', sans-serif", fontWeight: 500 }
        }
      >
        {label}
      </p>
      {sublabel && (
        <p
          className={useCircleIcon ? "mt-1 leading-[16px]" : "text-[12px] mt-0.5 leading-[16px]"}
          style={
            useCircleIcon
              ? { color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "14px" }
              : { color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 400 }
          }
        >
          {sublabel}
        </p>
      )}
    </div>
    {right && <div className="flex-shrink-0">{right}</div>}
    {onClick && !right && !useCircleIcon && <ChevronRight color={danger ? "#6b1a2a" : "#414965"} />}
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

/* ─── Profile section (Figma 3695:38606 / 3695:39859 / 3695:40062) ─── */
const RowCircleIcon = ({ src, inset, innerInset, overflowClip }: { src: string; inset: string; innerInset: string; overflowClip?: boolean }) => (
  <div className="relative rounded-[100px] shrink-0 size-[40px]">
    <div className="absolute left-0 size-[40px] top-0">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.settings_row_circle_bg} />
    </div>
    <div className={`-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2${overflowClip ? " overflow-clip" : ""}`}>
      <div className="absolute" style={{ inset: inset.replace(/_/g, " ") }}>
        <div className="absolute" style={{ inset: innerInset.replace(/_/g, " ") }}>
          <img alt="" className="block max-w-none size-full" src={src} />
        </div>
      </div>
    </div>
  </div>
);

function ProfileSection({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [name, setName] = useState("Miles Anderson");
  const [email] = useState("milesand@mail.com");
  const [phone] = useState("+1 (415) 555-0192");
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      {/* Profile header card — borderless per Figma */}
      <Card noBorder>
        <div className="flex items-center gap-4 p-4">
          <img
            data-testid="img-avatar"
            src={ICONS.settings_avatar_miles}
            alt={name}
            className="size-[64px] rounded-full object-cover flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                data-testid="input-display-name"
                value={name}
                onChange={e => setName(e.target.value)}
                className="bg-transparent outline-none border-b w-full"
                style={{
                  borderColor: "#7631ee",
                  color: "#fff",
                  fontFamily: "'Gilroy', sans-serif",
                  fontWeight: 600,
                  fontSize: "20px",
                  lineHeight: "24px",
                }}
                autoFocus
              />
            ) : (
              <p
                data-testid="text-profile-name"
                style={{ color: "#fff", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "20px", lineHeight: "24px" }}
              >
                {name}
              </p>
            )}
            <p
              data-testid="text-profile-email"
              className="mt-1"
              style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "14px", lineHeight: "16px" }}
            >
              {email}
            </p>
          </div>

          {/* Edit button — Figma 3695:40062: amber pill #4a2300 / #ff9500 */}
          <button
            data-testid="button-edit-profile"
            onClick={() => {
              if (editing) toast({ title: "Profile saved", description: "Your display name has been updated." });
              setEditing(v => !v);
            }}
            className="flex items-center justify-center gap-[8px] px-[20px] py-[8px] rounded-[100px] hover:opacity-90 transition-opacity flex-shrink-0"
            style={{ background: "#4a2300" }}
          >
            <div className="overflow-clip relative shrink-0 size-[24px]">
              <div className="absolute" style={{ inset: "13.87% 13.87% 12.5% 12.5%" }}>
                <div className="absolute" style={{ inset: "-5.66%" }}>
                  <img alt="" className="block max-w-none size-full" src={ICONS.settings_edit_pencil1} />
                </div>
              </div>
              <div className="absolute" style={{ bottom: "56.25%", left: "56.25%", right: "25%", top: "25%" }}>
                <div className="absolute" style={{ inset: "-22.22%" }}>
                  <img alt="" className="block max-w-none size-full" src={ICONS.settings_edit_pencil2} />
                </div>
              </div>
            </div>
            <span
              style={{ color: "#ff9500", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "16px", lineHeight: "20px" }}
            >
              {editing ? "Save" : "Edit"}
            </span>
          </button>
        </div>
      </Card>

      {/* Identity card — borderless per Figma */}
      <div>
        <SectionLabel>Identity</SectionLabel>
        <Card noBorder>
          <SettingRow
            icon={<RowCircleIcon src={ICONS.settings_kyc_icon} inset="20.83% 12.5%" innerInset="-7.14% -5.56%" />}
            label="KYC Verification"
            sublabel="Identity Fully Verified"
            right={
              <span
                className="px-2 py-[3px] rounded-[22px]"
                style={{
                  background: "#123509",
                  color: "#42bf23",
                  fontFamily: "'Gilroy', sans-serif",
                  fontWeight: 600,
                  fontSize: "12px",
                  lineHeight: "14px",
                  border: "1px solid rgba(66,191,35,0.2)",
                }}
              >
                Verified
              </span>
            }
            useCircleIcon
          />
          <Divider />
          <SettingRow
            icon={
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.settings_row_circle_bg} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                  <div className="absolute" style={{ inset: "16.67%" }}>
                    <div className="absolute" style={{ inset: "-6.25%" }}>
                      <img alt="" className="block max-w-none size-full" src={ICONS.settings_wallet_icon1} />
                    </div>
                  </div>
                  <div className="absolute" style={{ inset: "56.77% 31.77% 35.94% 60.94%" }}>
                    <div className="absolute" style={{ inset: "-28.57%" }}>
                      <img alt="" className="block max-w-none size-full" src={ICONS.settings_wallet_icon2} />
                    </div>
                  </div>
                </div>
              </div>
            }
            label="Wallet Address"
            sublabel="0x48f9...9daf"
            right={
              <button
                data-testid="button-copy-wallet"
                onClick={() => { navigator.clipboard.writeText("0x48f9c2a17b9c1d9e7c0fd4b9c7e3f5a8b29c9daf"); toast({ title: "Copied", description: "Wallet address copied to clipboard." }); }}
                className="relative rounded-[100px] shrink-0 size-[40px] hover:opacity-80 transition-opacity"
                title="Copy wallet address"
              >
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.settings_action_circle_bg} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                  <div className="absolute" style={{ inset: "16.67%" }}>
                    <div className="absolute" style={{ inset: "-6.25%" }}>
                      <img alt="" className="block max-w-none size-full" src={ICONS.settings_copy_icon} />
                    </div>
                  </div>
                </div>
              </button>
            }
            useCircleIcon
          />
          <Divider />
          <SettingRow
            icon={<RowCircleIcon src={ICONS.settings_phone_icon} inset="8.33% 25%" innerInset="-5% -8.33%" overflowClip />}
            label="Phone Number"
            sublabel={phone}
            onClick={() => toast({ title: "Phone update", description: "An OTP has been sent to your current number." })}
            right={
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <div className="absolute left-0 size-[40px] top-0">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.settings_action_circle_bg} />
                </div>
                <div className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 size-[24px] top-1/2">
                  <img alt="" className="block size-full" src={ICONS.settings_chevron_right} />
                </div>
              </div>
            }
            useCircleIcon
          />
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
    security:      <SecurityFigma />,
    notifications: <NotificationsFigma />,
    payments:      <PaymentsFigma />,
    agents:        <AgentsFigma />,
    legal:         <LegalFigma />,
    account:       <AccountFigma />,
  }[section];

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
          {SectionContent}
        </div>
      </div>
    </div>
  );
}
