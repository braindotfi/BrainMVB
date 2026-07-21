import { useEffect, useRef, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAppAlert, AppAlertLink } from "@/components/AppAlert";
import { useAuth } from "@/lib/authContext";
import { ChangePlanModal, UpdateCardModal, CancelSubscriptionModal, type PlanId } from "@/components/BillingModals";
import { usePlanId, setPlanId } from "@/lib/planStore";
import { useUserContact } from "@/lib/userContact";
import { useCurrency } from "@/lib/currencyContext";
import { ICONS } from "@/assets/figma-icons";
import acmeAvatar from "@assets/images_1777396125844.png";
import { NAV_ACTIVE } from "@/assets/nav-active-icons";
import legalActiveIcon from "@assets/LegalActive_1782953679878.png";
import legalInactiveIcon from "@assets/LegalInactive_1782953679879.png";
import billingActiveIcon from "@assets/BillingActive_1782953915934.png";
import teamActiveIcon from "@assets/Active_1783634473571.png";
import teamInactiveIcon from "@assets/Normal_1783634473571.png";
import SecurityFigma from "@/components/settings/figma/SecuritySection";
import NotificationsFigma from "@/components/settings/figma/NotificationsSection";
import TeamFigma from "@/components/settings/figma/TeamSection";
import LegalFigma from "@/components/settings/figma/LegalSection";
import AccountFigma from "@/components/settings/figma/AccountSection";

/* ─── Section type ───────────────────────────────────────── */
type Section =
  | "profile"
  | "billing"
  | "security"
  | "notifications"
  | "team"
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


const LegalNavIcon = ({ active }: { active: boolean }) => (
  <img alt="" className="shrink-0 size-[24px]" src={active ? legalActiveIcon : legalInactiveIcon} />
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
const BillingNavIcon = ({ active }: { active: boolean }) => (
  active ? (
    <img alt="" className="shrink-0 size-[24px]" src={billingActiveIcon} />
  ) : (
    <FigmaNavIcon src={ICONS.settings_billing_icon} inset="20.83% 12.5%" />
  )
);

const TeamNavIcon = ({ active }: { active: boolean }) => (
  <img alt="" className="shrink-0 size-[24px]" src={active ? teamActiveIcon : teamInactiveIcon} />
);

const NAV_ITEMS: { id: Section; label: string; Icon: ComponentType<{ active: boolean }> }[] = [
  { id: "profile",       label: "Profile",           Icon: ProfileNavIcon  },
  { id: "billing",       label: "Billing",           Icon: BillingNavIcon  },
  { id: "security",      label: "Security",          Icon: SecurityNavIcon },
  { id: "notifications", label: "Notifications",     Icon: NotifNavIcon    },
  { id: "team",          label: "Team",              Icon: TeamNavIcon     },
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

/* 16px/24 semibold #414965. Spacing to the card below comes from the
   parent flex container (flex flex-col gap-[4px]), NOT margin here. */
const SectionLabel = ({ children }: { children: string }) => (
  <p
    style={{ color: "#414965", fontFamily: "'Gilroy', 'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 600, fontSize: "16px", lineHeight: "24px" }}
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

/* Briefcase icon: 4-layer composite for the "Add Business Account" row
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

/* Right-side action button: 40px circle with chevron-right glyph,
   dimmed and inert. There is no backend endpoint to update email yet
   (see server/routes.ts), so this renders disabled rather than opening
   a fake OTP-verification flow. */
const ChevronActionButton = ({ label, testId }: { label: string; testId?: string }) => (
  <button
    type="button"
    disabled
    aria-label={label}
    aria-disabled="true"
    data-testid={testId}
    className="relative rounded-[100px] shrink-0 size-[40px] opacity-40 cursor-not-allowed"
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

function ProfileSection() {
  const alert = useAppAlert();
  const { user } = useAuth();
  const { email, phone } = useUserContact();
  // Real company name from the tenancy link, falling back to the user's own display name.
  // A locally-saved override (from the "Edit" button below) always wins once set.
  const { data: tenancy } = useQuery<{ mode: string; linked: boolean; tenantId?: string; companyName?: string }>({
    queryKey: ["/api/brain/tenancy"],
  });
  const liveName = tenancy?.companyName || user?.name || "";
  const [nameOverride, setNameOverride] = useState<string | null>(() => {
    try { return localStorage.getItem("brain_profile_name"); } catch { return null; }
  });
  const name = nameOverride ?? liveName;
  const setName = setNameOverride;
  const [editing, setEditing] = useState(false);
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

  const { currency, setCurrency } = useCurrency();
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const currencyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currencyOpen) return;
    const handler = (e: MouseEvent) => {
      if (currencyRef.current && !currencyRef.current.contains(e.target as Node)) {
        setCurrencyOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [currencyOpen]);

  const CURRENCY_OPTIONS = ["USD", "EUR"] as const;

  return (
    <div className="flex flex-col gap-5">
      {/* Profile header card, borderless per Figma */}
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

          {/* Edit button, Figma 3695:40062: amber pill #4a2300 / #ff9500 */}
          <button
            data-testid="button-edit-profile"
            onClick={() => {
              if (editing) {
                alert.success("Profile saved", "Your display name has been updated.");
                try { localStorage.setItem("brain_profile_name", name); } catch {}
              }
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

      {/* Identity card, borderless per Figma 3957:43974 */}
      <div className="flex flex-col gap-[4px]">
        <SectionLabel>Identity</SectionLabel>
        <Card noBorder>
          <SettingRow
            icon={<RowCircleIcon src={ICONS.settings_kyc_icon} inset="20.83% 12.5%" innerInset="-7.14% -5.56%" />}
            label="Email"
            sublabel={email}
            right={<ChevronActionButton label="Edit email" testId="button-edit-email" />}
            useCircleIcon
          />
          <Divider />
          {/* No phone field or SMS provider exists yet — read-only, no fake verification flow. */}
          <SettingRow
            icon={<RowCircleIcon src={ICONS.settings_phone_icon} inset="8.33% 25%" innerInset="-5% -8.33%" overflowClip />}
            label="Phone Number"
            sublabel={phone}
            useCircleIcon
          />
        </Card>
      </div>

      <div className="flex flex-col gap-[4px]">
        <SectionLabel>Currency</SectionLabel>
        {/* overflow-visible so the dropdown isn’t clipped by the card */}
        <div className="rounded-[16px]" style={{ background: "#0a0c10" }}>
          <SettingRow
            icon={
              <div className="relative rounded-[100px] shrink-0 size-[40px]">
                <img alt="" className="absolute inset-0 block size-full" src={ICONS.settings_row_circle_bg} />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[24px]">
                  <div className="absolute inset-[12.5%]">
                    <div className="absolute inset-[-5.56%]">
                      <img alt="" className="block max-w-none size-full" src={ICONS.settings_wallet_icon1} />
                    </div>
                  </div>
                </div>
              </div>
            }
            label="Default Currency"
            sublabel="Used for balance display"
            right={
              <div ref={currencyRef} className="relative shrink-0 w-[120px]">
                <button
                  type="button"
                  onClick={() => setCurrencyOpen((v) => !v)}
                  className="bg-[#222737] content-stretch flex gap-[8px] items-center p-[8px] rounded-[8px] w-full text-left hover:bg-[#2a3045] transition-colors"
                  data-testid="button-default-currency"
                >
                  <div className="content-stretch flex flex-[1_0_0] items-center min-w-px relative">
                    <p className="font-['Gilroy',sans-serif] font-medium leading-[20px] not-italic relative shrink-0 text-[16px] text-white whitespace-nowrap">
                      {currency}
                    </p>
                  </div>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="relative shrink-0 size-[24px]">
                    <path d="M7 10l5 5 5-5" stroke="#6c779d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {currencyOpen && (
                  <div className="absolute right-0 top-[calc(100%+4px)] z-50 bg-[#222737] border border-[#414965] rounded-[8px] overflow-hidden w-full shadow-lg">
                    {CURRENCY_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setCurrency(opt);
                          setCurrencyOpen(false);
                        }}
                        className={`w-full text-left px-[12px] py-[8px] font-['Gilroy',sans-serif] font-medium text-[16px] leading-[20px] hover:bg-[#2a3045] transition-colors ${
                          currency === opt ? "text-white" : "text-[#a8b9f4]"
                        }`}
                        data-testid={`option-default-currency-${opt}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            }
            useCircleIcon
          />
        </div>
      </div>

    </div>
  );
}

/* ─── Billing section ──────────────────────────────────────
   Plan summary, payment method, and billing history. There is no billing
   backend yet, so plan / card / history all start honestly empty rather
   than defaulting to a fabricated subscription. */
const PLAN_META: Record<PlanId, { label: string; tagline: string; price: string; cadence: string }> = {
  free:     { label: "Free plan",     tagline: "Try Brain: 1 agent, $10k monthly cap.",                  price: "$0",   cadence: "per month" },
  pro:      { label: "Pro plan",      tagline: "Unlimited agents, $5M monthly volume cap, priority support.", price: "$24",  cadence: "per month" },
  business: { label: "Business plan", tagline: "Dedicated infra, SLAs, custom policy signers.",           price: "$199", cadence: "per month" },
};

function BillingSection() {
  const alert = useAppAlert();
  const { email } = useUserContact();
  // Plan lives in the shared plan store (SSOT) — the Developers Usage & Limits
  // page reads the same source for its rate-limit tier.
  const planId = usePlanId();
  const [cardLast4, setCardLast4] = useState<string | null>(null);
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [updateCardOpen, setUpdateCardOpen] = useState(false);
  const [cancelSubOpen, setCancelSubOpen] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const plan = planId ? PLAN_META[planId] : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Current plan summary card */}
      <div className="flex flex-col gap-[4px]">
        <SectionLabel>Current Plan</SectionLabel>
        <Card noBorder>
          <div className="p-4 flex flex-col gap-4">
            {plan ? (
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      data-testid="text-plan-name"
                      style={{ color: "#fff", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "20px", lineHeight: "24px" }}
                    >
                      {plan.label}
                    </p>
                    <span
                      className="px-2 py-[3px] rounded-[22px]"
                      style={{
                        background: cancelled ? "#4a2300" : "#240757",
                        color:      cancelled ? "#ff9500" : "#a8b9f4",
                        fontFamily: "'Gilroy', sans-serif",
                        fontWeight: 600,
                        fontSize: "12px",
                        lineHeight: "14px",
                        border: `1px solid ${cancelled ? "rgba(255,149,0,0.2)" : "rgba(118,49,238,0.3)"}`,
                      }}
                    >
                      {cancelled ? "Cancelling" : "Active"}
                    </span>
                  </div>
                  <p style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "14px", lineHeight: "20px" }}>
                    {plan.tagline}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p
                    data-testid="text-plan-price"
                    style={{ color: "#fff", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "24px", lineHeight: "28px" }}
                  >
                    {plan.price}
                  </p>
                  <p style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "12px", lineHeight: "16px" }}>
                    {plan.cadence}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1 min-w-0">
                <p
                  data-testid="text-plan-name"
                  style={{ color: "#fff", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "20px", lineHeight: "24px" }}
                >
                  Not configured
                </p>
                <p style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "14px", lineHeight: "20px" }}>
                  No plan selected yet.
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="button-upgrade-plan"
                onClick={() => setChangePlanOpen(true)}
                className="flex-1 rounded-full px-4 py-2 hover-elevate"
                style={{ background: "#240757", color: "#a8b9f4", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "14px", lineHeight: "20px" }}
              >
                {plan ? "Change plan" : "Choose a plan"}
              </button>
              {plan && (
                <button
                  type="button"
                  data-testid="button-cancel-plan"
                  onClick={() => setCancelSubOpen(true)}
                  className="flex-1 rounded-full px-4 py-2 hover-elevate"
                  style={{ background: "transparent", color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "14px", lineHeight: "20px", border: "1px solid #1d2132" }}
                >
                  Cancel subscription
                </button>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Payment method card */}
      <div className="flex flex-col gap-[4px]">
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
              {cardLast4 ? (
                <>
                  <p
                    data-testid="text-card-brand"
                    style={{ color: "#fff", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "16px", lineHeight: "20px" }}
                  >
                    Visa •••• {cardLast4}
                  </p>
                  <p
                    data-testid="text-card-meta"
                    style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "14px", lineHeight: "16px", marginTop: 2 }}
                  >
                    Receipts to {email}
                  </p>
                </>
              ) : (
                <p
                  data-testid="text-card-brand"
                  style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "16px", lineHeight: "20px" }}
                >
                  No payment method on file
                </p>
              )}
            </div>
            <button
              type="button"
              data-testid="button-update-card"
              onClick={() => setUpdateCardOpen(true)}
              className="rounded-full px-4 py-2 hover-elevate flex-shrink-0"
              style={{ background: "#240757", color: "#a8b9f4", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "14px", lineHeight: "20px" }}
            >
              {cardLast4 ? "Update" : "Add card"}
            </button>
          </div>
        </Card>
      </div>

      {/* Invoice history */}
      <div className="flex flex-col gap-[4px]">
        <SectionLabel>Invoice History</SectionLabel>
        <Card noBorder>
          <div className="p-4">
            <p style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "14px", lineHeight: "20px" }}>
              No billing history yet.
            </p>
          </div>
        </Card>
      </div>

      <ChangePlanModal
        open={changePlanOpen}
        onOpenChange={setChangePlanOpen}
        currentPlan={planId ?? "free"}
        onConfirm={(next) => {
          setPlanId(next);
          setCancelled(false);
          setChangePlanOpen(false);
          alert.success("Plan changed", `You're now on the ${PLAN_META[next].label}. Your next invoice will reflect the new rate.`);
        }}
      />
      <UpdateCardModal
        open={updateCardOpen}
        onOpenChange={setUpdateCardOpen}
        onConfirm={(last4) => {
          setCardLast4(last4);
          setUpdateCardOpen(false);
          alert.success("Card updated", `Your card on file is now Visa •••• ${last4}.`);
        }}
      />
      <CancelSubscriptionModal
        show={cancelSubOpen}
        onCancel={() => setCancelSubOpen(false)}
        onConfirm={() => {
          setCancelled(true);
          setCancelSubOpen(false);
          alert.success("Subscription cancelled", "Your plan stays active until the end of the current billing period.");
        }}
      />
    </div>
  );
}

/* ─── Main SettingsPage ──────────────────────────────────── */
export function SettingsPage() {
  const [section, setSection] = useState<Section>("profile");
  const { toast } = useToast();

  const SectionContent = {
    profile:       <ProfileSection />,
    billing:       <BillingSection />,
    security:      <SecurityFigma />,
    notifications: <NotificationsFigma />,
    team:          <TeamFigma />,
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
