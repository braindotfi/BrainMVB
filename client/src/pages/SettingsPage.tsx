import { useRef, useState, type ComponentType } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAppAlert, AppAlertLink } from "@/components/AppAlert";
import { PhoneNumberModal } from "@/components/PhoneNumberModal";
import { EmailModal } from "@/components/EmailModal";
import { useUserContact } from "@/lib/userContact";
import { ICONS } from "@/assets/figma-icons";
import acmeAvatar from "@assets/images_1777396125844.png";
import { NAV_ACTIVE } from "@/assets/nav-active-icons";
import SecurityFigma from "@/components/settings/figma/SecuritySection";
import NotificationsFigma from "@/components/settings/figma/NotificationsSection";
import PaymentsFigma from "@/components/settings/figma/PaymentsSectionFigma";
import AgentsFigma from "@/components/settings/figma/AgentsSection";
import LegalFigma from "@/components/settings/figma/LegalSection";
import AccountFigma from "@/components/settings/figma/AccountSection";

/* ─── Section type ───────────────────────────────────────── */
type Section =
  | "profile"
  | "billing"
  | "security"
  | "notifications"
  | "payments"
  | "agents"
  | "legal"
  | "account";

/* ─── Nav icon components (from Figma 3695:38606) ──────────── */
/* Profile is the only menu item with a custom "active" treatment
   in the Figma design (purple gradient + filled icon). The inactive
   variant uses the dedicated Figma "Subtract" mark (node 3957:44016).
   Other inactive nav items render their Figma vector at default gray. */
const ProfileNavIcon = ({ active }: { active: boolean }) =>
  active ? (
    <div className="relative shrink-0 size-[24px]">
      <div className="absolute inset-[4.17%_12.5%]">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.settings_profile_active_head} />
      </div>
      <div className="absolute inset-[33.33%_29.17%_16.67%_29.17%]">
        <div className="absolute inset-[-9.38%_-22.5%_-28.13%_-22.5%]">
          <img alt="" className="block max-w-none size-full" src={ICONS.settings_profile_active_body} />
        </div>
      </div>
    </div>
  ) : (
    <div className="relative shrink-0 size-[24px]">
      <div className="absolute inset-[4.17%_12.5%]">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.settings_profile_inactive} />
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

/* Active nav icons (from Figma 3697:40137, 3704:37874, 3706:38466,
   3709:39289, 3709:39914, 3716:40613). Inactive icons are simpler
   single-vector exports; active versions stack multiple sub-vectors
   from the local nav-active-icons registry. */
const SecurityNavIcon = ({ active }: { active: boolean }) =>
  active ? (
    <div className="relative shrink-0 size-[24px]">
      <div className="absolute inset-[4.17%_8.33%]">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={NAV_ACTIVE.security_vector} />
      </div>
      <div className="absolute inset-[17.5%_19.58%_21.67%_19.59%]">
        <div className="absolute inset-[-7.71%_-15.41%_-23.12%_-15.41%]">
          <img alt="" className="block max-w-none size-full" src={NAV_ACTIVE.security_stroke} />
        </div>
      </div>
    </div>
  ) : (
    <FigmaNavIcon src={ICONS.settings_security_inactive} />
  );

const NotifNavIcon = ({ active }: { active: boolean }) =>
  active ? (
    <FigmaNavIcon src={NAV_ACTIVE.notifications_union} />
  ) : (
    <FigmaNavIcon src={ICONS.settings_notif_inactive} />
  );

const PaymentsNavIcon = ({ active }: { active: boolean }) =>
  active ? (
    <div className="relative shrink-0 size-[24px]">
      <div className="absolute inset-[16.67%_4.17%]">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={NAV_ACTIVE.payments_subtract} />
      </div>
      <div className="absolute bottom-[33.33%] left-[41.67%] right-1/4 top-[33.33%]">
        <div className="absolute inset-[-14.06%_-28.13%_-42.19%_-28.13%]">
          <img alt="" className="block max-w-none size-full" src={NAV_ACTIVE.payments_arrow} />
        </div>
      </div>
      <div className="absolute bottom-[33.33%] left-1/4 right-[41.67%] top-[33.33%]">
        <div className="absolute inset-[-14.06%_-28.13%_-42.19%_-28.13%]">
          <img alt="" className="block max-w-none size-full" src={NAV_ACTIVE.payments_arrow} />
        </div>
      </div>
    </div>
  ) : (
    <FigmaNavIcon src={ICONS.settings_payments_inactive} inset="16.67%_4.17%" />
  );

const AgentsNavIcon = ({ active }: { active: boolean }) =>
  active ? (
    <div className="relative shrink-0 size-[24px]">
      <div className="absolute inset-[4.17%_8.33%]">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={NAV_ACTIVE.agents_vector} />
      </div>
      <div className="absolute bottom-1/4 left-1/4 right-[23.78%] top-1/4">
        <div className="absolute inset-[-9.38%_-18.3%_-28.13%_-18.3%]">
          <img alt="" className="block max-w-none size-full" src={NAV_ACTIVE.agents_union} />
        </div>
      </div>
    </div>
  ) : (
    <div className="relative shrink-0 size-[24px]">
      <div className="absolute h-[22px] left-[2px] top-px w-[20px]">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={ICONS.settings_agents_inactive} />
      </div>
    </div>
  );

const LegalNavIcon = ({ active }: { active: boolean }) =>
  active ? (
    <div className="relative shrink-0 size-[24px]">
      <div
        className="absolute border-[1.4px] border-solid border-transparent inset-[4.17%_12.5%] rounded-[4px]"
        style={{
          // Two stacked backgrounds: the brand-purple gradient fills the
          // padding-box (the icon body), while the second linear gradient is
          // clipped to the border-box, painting the 1.4px ring as a fading
          // stroke (white → light-purple). Matches the active Legal icon
          // shown in the user-attached reference image.
          background:
            "linear-gradient(121.6deg, rgb(150, 90, 255) 16.8%, rgb(118, 49, 238) 72.248%) padding-box, " +
            "linear-gradient(121.6deg, #ffffff 0%, #9f70ff 100%) border-box",
        }}
      />
      <div className="absolute inset-[20.83%_32.5%_68.98%_32.5%]">
        <div className="absolute inset-[-46.02%_-26.79%_-138.07%_-26.79%]">
          <img alt="" className="block max-w-none size-full" src={NAV_ACTIVE.legal_vector} />
        </div>
      </div>
      <div className="absolute inset-[37.5%_32.5%_52.31%_32.5%]">
        <div className="absolute inset-[-46.02%_-26.79%_-138.07%_-26.79%]">
          <img alt="" className="block max-w-none size-full" src={NAV_ACTIVE.legal_vector} />
        </div>
      </div>
      <div className="absolute bottom-0 left-1/2 right-[8.33%] top-[58.33%]">
        <div className="absolute inset-[-11.25%_-22.5%_-33.75%_-22.5%]">
          <img alt="" className="block max-w-none size-full" src={NAV_ACTIVE.legal_pencil} />
        </div>
      </div>
    </div>
  ) : (
    <FigmaNavIcon src={ICONS.settings_legal_inactive} inset="4.17%_8.33%_0_12.5%" />
  );

const AccountNavIcon = ({ active }: { active: boolean }) =>
  active ? (
    <div className="relative shrink-0 size-[24px]">
      <div className="absolute inset-[4.17%_8.33%_4.17%_53.16%]">
        <div className="absolute inset-[-5.11%_-24.35%_-15.34%_-24.35%]">
          <img alt="" className="block max-w-none size-full" src={NAV_ACTIVE.account_union_right} />
        </div>
      </div>
      <div className="absolute inset-[4.17%_53.16%_4.17%_8.33%]">
        <img alt="" className="absolute block inset-0 max-w-none size-full" src={NAV_ACTIVE.account_union_left} />
      </div>
    </div>
  ) : (
    <FigmaNavIcon src={ICONS.settings_account_inactive} />
  );

/* ─── Nav items definition ───────────────────────────────── */
const BillingNavIcon = ({ active: _active }: { active: boolean }) => (
  <FigmaNavIcon src={ICONS.settings_billing_icon} inset="20.83% 12.5%" />
);

const NAV_ITEMS: { id: Section; label: string; Icon: ComponentType<{ active: boolean }> }[] = [
  { id: "profile",       label: "Profile",           Icon: ProfileNavIcon  },
  { id: "billing",       label: "Billing",           Icon: BillingNavIcon  },
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
            ? { color: "#a8b9f4", fontFamily: "'Gilroy', 'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 500, fontSize: "16px" }
            : { color: danger ? "#d20344" : "#c8d4f0", fontFamily: "'Gilroy', 'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 500 }
        }
      >
        {label}
      </p>
      {sublabel && (
        <p
          className={useCircleIcon ? "mt-1 leading-[16px]" : "text-[12px] mt-0.5 leading-[16px]"}
          style={
            useCircleIcon
              ? { color: "#6c779d", fontFamily: "'Gilroy', 'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 500, fontSize: "14px" }
              : { color: "#6c779d", fontFamily: "'Gilroy', 'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 400 }
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
    style={{ color: "#414965", fontFamily: "'Gilroy', 'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 600 }}
  >
    {children}
  </p>
);

/* ─── Profile section (Figma 3695:38606 / 3957:43974) ─── */
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

/* Single-image circle icon: SVG centered in 40px circle at explicit
   width/height to preserve its aspect ratio (the Figma exports use
   preserveAspectRatio="none", so we size the wrapper exactly). */
const ProfileRowCircle = ({ src, w, h }: { src: string; w: number; h: number }) => (
  <div className="relative rounded-[100px] shrink-0 size-[40px]">
    <img alt="" className="absolute inset-0 block size-full" src={ICONS.settings_row_circle_bg} />
    <img
      alt=""
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 block"
      src={src}
      style={{ width: `${w}px`, height: `${h}px` }}
    />
  </div>
);

/* Briefcase icon — 4-layer composite for the "Add Business Account" row
   (Figma node within 3957:43975 misc section). */
const BriefcaseRowCircle = () => (
  <div className="relative rounded-[100px] shrink-0 size-[40px]">
    <img alt="" className="absolute inset-0 block size-full" src={ICONS.settings_row_circle_bg} />
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[24px]">
      {/* body 20×15 */}
      <img alt="" className="absolute block" src={ICONS.settings_briefcase_body} style={{ width: 20, height: 15, left: 2, top: 7 }} />
      {/* handle 10×6 */}
      <img alt="" className="absolute block" src={ICONS.settings_briefcase_handle} style={{ width: 10, height: 6, left: 7, top: 2 }} />
      {/* divider 20×4 */}
      <img alt="" className="absolute block" src={ICONS.settings_briefcase_div} style={{ width: 20, height: 4, left: 2, top: 11 }} />
      {/* plus 2×4 */}
      <img alt="" className="absolute block" src={ICONS.settings_briefcase_plus} style={{ width: 2, height: 4, left: 11, top: 13 }} />
    </div>
  </div>
);

/* Right-side action button: 40px circle with chevron-right glyph.
   Stops click propagation so the parent SettingRow's onClick doesn't
   also fire (preventing duplicate toast notifications). */
const ChevronActionButton = ({ onClick, label, testId }: { onClick?: () => void; label: string; testId?: string }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onClick?.(); }}
    aria-label={label}
    data-testid={testId}
    className="relative rounded-[100px] shrink-0 size-[40px] hover:opacity-80 transition-opacity"
  >
    <img alt="" className="absolute inset-0 block size-full" src={ICONS.settings_action_circle_bg} />
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[24px]">
      <div
        className="absolute bottom-1/4 flex items-center justify-center left-[40.09%] right-[37.5%] top-1/4"
        style={{ containerType: "size" }}
      >
        <div className="-rotate-90 -scale-x-100 flex-none h-[100cqw] w-[100cqh]">
          <div className="relative size-full">
            <div className="absolute inset-[-18.59%_-8.33%]">
              <img alt="" className="block max-w-none size-full" src={ICONS.settings_chevron_right} />
            </div>
          </div>
        </div>
      </div>
    </div>
  </button>
);

function ProfileSection({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const alert = useAppAlert();
  const { email, phone } = useUserContact();
  const [name, setName] = useState("ACME Inc.");
  const [editing, setEditing] = useState(false);
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string>(acmeAvatar);
  const avatarFileRef = useRef<HTMLInputElement | null>(null);

  const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert.error("Unsupported file", "Please choose an image file (PNG, JPG, GIF, or WebP).");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert.error("Image too large", "Please choose an image smaller than 5MB.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAvatarSrc(reader.result);
        alert.success("Profile photo updated", "Your new profile photo is now in use.");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Profile header card — borderless per Figma */}
      <Card noBorder>
        <div className="flex items-center gap-4 p-4">
          <button
            type="button"
            data-testid="button-avatar"
            onClick={() => avatarFileRef.current?.click()}
            aria-label="Change profile photo"
            className="relative size-[64px] rounded-full flex-shrink-0 group focus:outline-none focus:ring-2 focus:ring-[#7631ee] hover-elevate"
          >
            <img
              data-testid="img-avatar"
              src={avatarSrc}
              alt={name}
              className="size-[64px] rounded-full object-cover"
            />
            <span
              className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
              style={{ background: "rgba(10,12,16,0.55)" }}
              aria-hidden="true"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"
                  stroke="#a8b9f4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                />
                <circle cx="12" cy="13" r="3.25" stroke="#a8b9f4" strokeWidth="1.6"/>
              </svg>
            </span>
          </button>
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="input-avatar-file"
            onChange={handleAvatarPick}
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
                  fontFamily: "'Gilroy', 'Plus Jakarta Sans', system-ui, sans-serif",
                  fontWeight: 600,
                  fontSize: "20px",
                  lineHeight: "24px",
                }}
                autoFocus
              />
            ) : (
              <p
                data-testid="text-profile-name"
                style={{ color: "#fff", fontFamily: "'Gilroy', 'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 600, fontSize: "20px", lineHeight: "24px" }}
              >
                {name}
              </p>
            )}
          </div>

          {/* Edit button — Figma 3695:40062: amber pill #4a2300 / #ff9500 */}
          <button
            data-testid="button-edit-profile"
            onClick={() => {
              if (editing) toast({ title: "Profile saved", description: "Your display name has been updated." });
              setEditing(v => !v);
            }}
            className="bg-[#4a2300] flex gap-[8px] items-center justify-center px-[20px] py-[8px] rounded-[100px] hover:opacity-90 transition-opacity flex-shrink-0"
          >
            <div className="overflow-clip relative shrink-0 size-[24px]">
              <div className="absolute inset-[13.87%_13.87%_12.5%_12.5%]">
                <div className="absolute inset-[-5.66%]">
                  <img alt="" className="block max-w-none size-full" src={ICONS.settings_edit_pencil1} />
                </div>
              </div>
              <div className="absolute bottom-[56.25%] left-[56.25%] right-1/4 top-1/4">
                <div className="absolute inset-[-22.22%]">
                  <img alt="" className="block max-w-none size-full" src={ICONS.settings_edit_pencil2} />
                </div>
              </div>
            </div>
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[16px] leading-[20px] whitespace-nowrap">
              {editing ? "Save" : "Edit"}
            </span>
          </button>
        </div>
      </Card>

      {/* Identity card — borderless per Figma 3957:43974 */}
      <div>
        <SectionLabel>Identity</SectionLabel>
        <Card noBorder>
          <SettingRow
            icon={<RowCircleIcon src={ICONS.settings_kyc_icon} inset="20.83% 12.5%" innerInset="-7.14% -5.56%" />}
            label="Email"
            sublabel={email}
            onClick={() => setEmailModalOpen(true)}
            right={<ChevronActionButton label="Edit email" testId="button-edit-email" onClick={() => setEmailModalOpen(true)} />}
            useCircleIcon
          />
          <Divider />
          <SettingRow
            icon={<RowCircleIcon src={ICONS.settings_phone_icon} inset="8.33% 25%" innerInset="-5% -8.33%" overflowClip />}
            label="Phone Number"
            sublabel={phone}
            onClick={() => setPhoneModalOpen(true)}
            right={<ChevronActionButton label="Edit phone number" testId="button-edit-phone" onClick={() => setPhoneModalOpen(true)} />}
            useCircleIcon
          />
          <Divider />
          <SettingRow
            icon={<RowCircleIcon src={ICONS.settings_kyc_icon} inset="20.83% 12.5%" innerInset="-7.14% -5.56%" />}
            label="KYC Verification"
            right={
              <span
                className="px-2 py-[3px] rounded-[22px]"
                style={{
                  background: "#123509",
                  color: "#42bf23",
                  fontFamily: "'Gilroy', 'Plus Jakarta Sans', system-ui, sans-serif",
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
        </Card>
      </div>

      <PhoneNumberModal open={phoneModalOpen} onOpenChange={setPhoneModalOpen} currentPhone={phone} />
      <EmailModal open={emailModalOpen} onOpenChange={setEmailModalOpen} currentEmail={email} />
    </div>
  );
}

/* ─── Billing section ──────────────────────────────────────
   Plan summary, payment method, upcoming invoice and history. */
const INVOICES: { id: string; date: string; description: string; amount: string; status: "paid" | "due" }[] = [
  { id: "INV-2026-04", date: "Apr 1, 2026",  description: "Pro plan — April 2026",    amount: "$24.00", status: "paid" },
  { id: "INV-2026-03", date: "Mar 1, 2026",  description: "Pro plan — March 2026",    amount: "$24.00", status: "paid" },
  { id: "INV-2026-02", date: "Feb 1, 2026",  description: "Pro plan — February 2026", amount: "$24.00", status: "paid" },
  { id: "INV-2026-01", date: "Jan 1, 2026",  description: "Pro plan — January 2026",  amount: "$24.00", status: "paid" },
];

function StatusPill({ status }: { status: "paid" | "due" }) {
  const isPaid = status === "paid";
  return (
    <span
      className="px-2 py-[3px] rounded-[22px]"
      style={{
        background: isPaid ? "#123509" : "#4a2300",
        color:      isPaid ? "#42bf23" : "#ff9500",
        fontFamily: "'Gilroy', sans-serif",
        fontWeight: 600,
        fontSize: "12px",
        lineHeight: "14px",
        border: `1px solid ${isPaid ? "rgba(66,191,35,0.2)" : "rgba(255,149,0,0.2)"}`,
      }}
    >
      {isPaid ? "Paid" : "Due"}
    </span>
  );
}

function BillingSection() {
  const alert = useAppAlert();
  const { email } = useUserContact();

  return (
    <div className="flex flex-col gap-5">
      {/* Current plan summary card */}
      <div>
        <SectionLabel>Current Plan</SectionLabel>
        <Card noBorder>
          <div className="p-4 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p
                    data-testid="text-plan-name"
                    style={{ color: "#fff", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "20px", lineHeight: "24px" }}
                  >
                    Pro plan
                  </p>
                  <span
                    className="px-2 py-[3px] rounded-[22px]"
                    style={{
                      background: "#240757",
                      color: "#a8b9f4",
                      fontFamily: "'Gilroy', sans-serif",
                      fontWeight: 600,
                      fontSize: "12px",
                      lineHeight: "14px",
                      border: "1px solid rgba(118,49,238,0.3)",
                    }}
                  >
                    Active
                  </span>
                </div>
                <p style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "14px", lineHeight: "20px" }}>
                  Unlimited agents, $5M monthly volume cap, priority support.
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p
                  data-testid="text-plan-price"
                  style={{ color: "#fff", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "24px", lineHeight: "28px" }}
                >
                  $24
                </p>
                <p style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "12px", lineHeight: "16px" }}>
                  per month
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="button-upgrade-plan"
                onClick={() => alert.info("Plan upgrade", "Upgrading takes effect immediately. You'll be prorated for the remainder of the current period.")}
                className="flex-1 rounded-full px-4 py-2 hover-elevate"
                style={{ background: "#240757", color: "#a8b9f4", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "14px", lineHeight: "20px" }}
              >
                Change plan
              </button>
              <button
                type="button"
                data-testid="button-cancel-plan"
                onClick={() => alert.info("Cancel subscription", "You can cancel anytime. Your plan stays active until the end of the billing period.")}
                className="flex-1 rounded-full px-4 py-2 hover-elevate"
                style={{ background: "transparent", color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "14px", lineHeight: "20px", border: "1px solid #1d2132" }}
              >
                Cancel subscription
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Payment method card */}
      <div>
        <SectionLabel>Payment Method</SectionLabel>
        <Card noBorder>
          <div className="p-4 flex items-center gap-4">
            <div
              className="size-[40px] rounded-[8px] flex items-center justify-center flex-shrink-0"
              style={{ background: "#1d2132" }}
            >
              <svg width="24" height="16" viewBox="0 0 24 16" fill="none" aria-hidden="true">
                <rect width="24" height="16" rx="2" fill="#7631ee"/>
                <rect y="4" width="24" height="2" fill="#0a0c10"/>
                <rect x="2" y="10" width="6" height="3" rx="0.5" fill="#a8b9f4"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p
                data-testid="text-card-brand"
                style={{ color: "#fff", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "16px", lineHeight: "20px" }}
              >
                Visa •••• 4242
              </p>
              <p
                data-testid="text-card-meta"
                style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "14px", lineHeight: "16px", marginTop: 2 }}
              >
                Expires 08/29 · Receipts to {email}
              </p>
            </div>
            <button
              type="button"
              data-testid="button-update-card"
              onClick={() => alert.info("Update card", "Tap the chevron to securely update your card on file via your bank.")}
              className="rounded-full px-4 py-2 hover-elevate flex-shrink-0"
              style={{ background: "#240757", color: "#a8b9f4", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "14px", lineHeight: "20px" }}
            >
              Update
            </button>
          </div>
        </Card>
      </div>

      {/* Next invoice card */}
      <div>
        <SectionLabel>Next Invoice</SectionLabel>
        <Card noBorder>
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1 min-w-0">
              <p
                data-testid="text-next-invoice-date"
                style={{ color: "#fff", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "16px", lineHeight: "20px" }}
              >
                Due May 1, 2026
              </p>
              <p style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "14px", lineHeight: "16px" }}>
                Pro plan — May 2026
              </p>
            </div>
            <p
              data-testid="text-next-invoice-amount"
              style={{ color: "#fff", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "20px", lineHeight: "24px" }}
            >
              $24.00
            </p>
          </div>
        </Card>
      </div>

      {/* Invoice history */}
      <div>
        <SectionLabel>Invoice History</SectionLabel>
        <Card noBorder>
          {INVOICES.map((inv, i) => (
            <div key={inv.id}>
              {i > 0 && <Divider />}
              <button
                type="button"
                data-testid={`row-invoice-${inv.id}`}
                onClick={() => alert.success("Invoice downloaded", `${inv.id} (${inv.description}) was sent to ${email}.`)}
                className="w-full flex items-center justify-between gap-4 p-4 text-left hover-elevate"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <p style={{ color: "#fff", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "16px", lineHeight: "20px" }}>
                    {inv.description}
                  </p>
                  <p style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "14px", lineHeight: "16px" }}>
                    {inv.date} · {inv.id}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <p style={{ color: "#fff", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "16px", lineHeight: "20px" }}>
                    {inv.amount}
                  </p>
                  <StatusPill status={inv.status} />
                </div>
              </button>
            </div>
          ))}
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
    billing:       <BillingSection />,
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
                    fontFamily: "'Gilroy', 'Plus Jakarta Sans', system-ui, sans-serif",
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
