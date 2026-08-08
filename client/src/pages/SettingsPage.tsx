import { useEffect, useRef, useState, type ComponentType } from "react";
import { useLocation, useSearch } from "wouter";
import { clearOnboarding } from "@/lib/onboarding";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAppAlert, AppAlertLink } from "@/components/AppAlert";
import { useAuth } from "@/lib/authContext";
import { ChangePlanModal, UpdateCardModal, CancelSubscriptionModal, type PlanId } from "@/components/BillingModals";
import { usePlanId, setPlanId } from "@/lib/planStore";
import { useUserContact, setUserEmail, setUserPhone } from "@/lib/userContact";
import { useCurrency } from "@/lib/useCurrency";
import { ICONS } from "@/assets/figma-icons";
import acmeAvatar from "@assets/images_1777396125844.png";
import { NAV_ACTIVE } from "@/assets/nav-active-icons";
import legalActiveIcon from "@assets/LegalActive_1782953679878.png";
import legalInactiveIcon from "@assets/LegalInactive_1782953679879.png";
import sourcesActiveIcon from "@assets/Sources_Active_1785554383441.png";
import sourcesInactiveIcon from "@assets/Sources_Inactive_1785554383442.png";
import developersActiveIcon from "@assets/developers_active_1785554383446.png";
import developersInactiveIcon from "@assets/developers_inactive_1785554383446.png";
import auditActiveIcon from "@assets/0_auditactive_1785598481541.png";
import auditInactiveIcon from "@assets/1_auditinactive_1785598481543.png";
import billingActiveIcon from "@assets/BillingActive_1782953915934.png";
import teamActiveIcon from "@assets/Active_1783634473571.png";
import teamInactiveIcon from "@assets/Normal_1783634473571.png";
import { ContactUpdateModal } from "@/components/ContactUpdateModal";
import { SourcesSection } from "@/components/settings/SourcesSection";
import { DevelopersSection } from "@/components/settings/DevelopersSection";
import { AuditLogSection } from "@/components/settings/AuditLogSection";
import { useNav } from "@/lib/navContext";
import { useBrainPolicy, autoApproveLimitFromPolicy, groupPolicyAmount } from "@/lib/brainPolicy";
import SecurityFigma from "@/components/settings/figma/SecuritySection";
import NotificationsFigma from "@/components/settings/figma/NotificationsSection";
import TeamFigma from "@/components/settings/figma/TeamSection";
import LegalFigma from "@/components/settings/figma/LegalSection";
import AccountFigma from "@/components/settings/figma/AccountSection";
import { SettingsDropdown } from "@/components/settings/SettingsDropdown";
import { Plus } from "lucide-react";

/* ─── Section type ───────────────────────────────────────── */
type Section =
  | "profile"
  | "billing"
  | "security"
  | "notifications"
  | "team"
  | "sources"
  | "developers"
  | "audit"
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

/* No Figma export exists for a Sources nav item, so this is drawn inline at the
   same 24px box and stroke weight as the exported icons rather than borrowing an
   unrelated asset. */
const SourcesNavIcon = ({ active }: { active: boolean }) => (
  <img
    src={active ? sourcesActiveIcon : sourcesInactiveIcon}
    alt=""
    className="shrink-0 size-[24px]"
    aria-hidden="true"
  />
);

const DevelopersNavIcon = ({ active }: { active: boolean }) => (
  <img
    src={active ? developersActiveIcon : developersInactiveIcon}
    alt=""
    className="shrink-0 size-[24px]"
    aria-hidden="true"
  />
);

/* The two supplied Audit Log exports do not share a canvas: the active one is
   49×55 because it carries a soft drop shadow, the inactive one is a plain
   48×48 like every other nav export. The glyph itself occupies identical pixels
   in both, so each state is pinned to half its own natural size from the same
   top-left origin — sizing both to a 24px square would squash the active state,
   and centring them would make the glyph jump on selection. The shadow spills
   past the 24px box on purpose; that is what the artwork draws. */
const AuditNavIcon = ({ active }: { active: boolean }) => (
  <span className="relative block size-[24px] shrink-0">
    <img
      src={active ? auditActiveIcon : auditInactiveIcon}
      alt=""
      aria-hidden="true"
      className="absolute left-0 top-0 max-w-none"
      style={active ? { width: 24.5, height: 27.5 } : { width: 24, height: 24 }}
    />
  </span>
);

/* Order follows the design's tab sequence. The tabs themselves are the design's;
   the vertical layout is not — nine horizontal tabs do not fit the centre column
   at the widths this shell actually renders (see the item-7 notes). */
const NAV_ITEMS: { id: Section; label: string; Icon: ComponentType<{ active: boolean }> }[] = [
  { id: "profile",       label: "Profile",           Icon: ProfileNavIcon  },
  { id: "team",          label: "Team",              Icon: TeamNavIcon     },
  { id: "billing",       label: "Billing",           Icon: BillingNavIcon  },
  { id: "sources",       label: "Sources",           Icon: SourcesNavIcon  },
  { id: "developers",    label: "Developers",        Icon: DevelopersNavIcon },
  { id: "security",      label: "Security",          Icon: SecurityNavIcon },
  { id: "audit",         label: "Audit Log",         Icon: AuditNavIcon    },
  { id: "legal",         label: "Legal",             Icon: LegalNavIcon    },
  { id: "account",       label: "Account",           Icon: AccountNavIcon  },
];

/* ─── Shared primitives ─────────────────────────────────── */
const Card = ({ children, noBorder }: { children: React.ReactNode; noBorder?: boolean }) => (
  <div
    className={`rounded-panel overflow-hidden ${noBorder ? "" : "border border-brain-v1stroke-2"}`}
    style={{ background: "#0a0c10" }}
  >
    {children}
  </div>
);

const Divider = () => <div className="h-px bg-brain-v1stroke-2 mx-4" />;

const RowIcon = ({ children, danger }: { children: React.ReactNode; danger?: boolean }) => (
  <div
    className="size-[40px] rounded-row flex items-center justify-center flex-shrink-0"
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
  children,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
  testId?: string;
  useCircleIcon?: boolean;
  children?: React.ReactNode;
}) => (
  <div
    data-testid={testId ?? `setting-row-${label.toLowerCase().replace(/\s+/g, "-")}`}
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-3 ${onClick ? "cursor-pointer hover:bg-brain-v1row-hover transition-colors" : ""}`}
  >
    {useCircleIcon ? icon : <RowIcon danger={danger}>{icon}</RowIcon>}
    <div className="flex-1 min-w-0">
      {/* One type ramp for every row, regardless of which icon treatment it
          uses. `useCircleIcon` used to fork the typography too, which left
          Auto-Approve Limit and Welcome Walkthrough on an older 15px/12px pair
          with a 2px gap while the Identity rows — and every row record on
          Overview, Inbox and Ledger — were 16px/14px with a 4px gap. The icon
          treatment is a visual choice; the text ramp is not. */}
      <p
        className="leading-5"
        style={{
          color: danger ? "#d20344" : "#a8b9f4",
          fontFamily: "'Gilroy', 'Plus Jakarta Sans', system-ui, sans-serif",
          fontWeight: 500,
          fontSize: "16px",
        }}
      >
        {label}
      </p>
      {sublabel && (
        <p
          className="mt-1 leading-[16px]"
          style={{
            color: "#6c779d",
            fontFamily: "'Gilroy', 'Plus Jakarta Sans', system-ui, sans-serif",
            fontWeight: 500,
            fontSize: "14px",
          }}
        >
          {sublabel}
        </p>
      )}
      {children}
    </div>
    {right && <div className="flex-shrink-0">{right}</div>}
    {onClick && !right && !useCircleIcon && <ChevronRight color={danger ? "#6b1a2a" : "#414965"} />}
  </div>
);

/* 16px/24 semibold #6c779d. Spacing to the card below comes from the
   parent flex container (flex flex-col gap-[4px]), NOT margin here. */
const SectionLabel = ({ children }: { children: string }) => (
  <div className="flex items-center min-h-[36px]">
    <p
      style={{ color: "#6c779d", fontFamily: "'Gilroy', 'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 600, fontSize: "16px", lineHeight: "24px" }}
    >
      {children}
    </p>
  </div>
);

/* ─── Profile section (Figma 3695:38606 / 3957:43974) ─── */
const RowCircleIcon = ({ src, inset, innerInset, overflowClip }: { src: string; inset: string; innerInset: string; overflowClip?: boolean }) => (
  <div className="relative rounded-pill shrink-0 size-[40px]">
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
  <div className="relative rounded-pill shrink-0 size-[40px]">
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
  <div className="relative rounded-pill shrink-0 size-[40px]">
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
   When `onClick` is provided the button is active and fully opaque,
   matching the Legal section row buttons. When omitted it falls back
   to dimmed/inert (no backend endpoint to persist the change). */
const ChevronActionButton = ({ label, testId, onClick }: { label: string; testId?: string; onClick?: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    aria-label={label}
    aria-disabled={!onClick}
    data-testid={testId}
    className={`relative rounded-pill shrink-0 size-[40px] transition-opacity ${onClick ? "cursor-pointer hover:opacity-90" : "opacity-40 cursor-not-allowed"}`}
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
  const navigate = useLocation()[1];
  const { email, phone } = useUserContact(user?.email);
  // Real company name from the tenancy link, falling back to the user's own display name.
  // A locally-saved override (from the "Edit" button below) always wins once set.
  const { data: tenancy } = useQuery<{ mode: string; linked: boolean; tenantId?: string; companyName?: string }>({
    queryKey: ["/api/brain/tenancy"],
  });
  const liveName = tenancy?.companyName || user?.name || "";
  const [nameOverride, setNameOverride] = useState<string | null>(() => {
    // Demo users must never inherit a prior real user's saved display name.
    if (user?.isDemo) return null;
    try { return localStorage.getItem("brain_profile_name"); } catch { return null; }
  });
  // Re-sync nameOverride when the user identity changes (auth transitions don't
  // remount this component, so useState initializer above only runs on first mount).
  useEffect(() => {
    if (user?.isDemo) {
      setNameOverride(null);
    } else if (user?.id) {
      try { setNameOverride(localStorage.getItem("brain_profile_name")); } catch { setNameOverride(null); }
    }
  }, [user?.id, user?.isDemo]);
  const name = nameOverride ?? liveName;
  const setName = setNameOverride;
  const [editing, setEditing] = useState(false);
  const [contactModal, setContactModal] = useState<"email" | "phone" | null>(null);
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

  /* Auto-approve limit. This is a money-authorization figure, so the three
     states below are kept apart on purpose: an unreachable policy must never
     render as "no limit configured", which reads as "nothing is automated" and
     is the most dangerous thing this row could get wrong. */
  const policy = useBrainPolicy();
  const autoLimit = autoApproveLimitFromPolicy(policy.facts);
  /* A policy that answered but cannot be interpreted is unreadable, not empty.
     It joins the error treatment rather than falling through to "None", which
     would assert the one thing we do not know. */
  const limitUnreadable = policy.isError || autoLimit?.kind === "unknown";

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
            className="relative size-[64px] rounded-full flex-shrink-0 group focus:outline-none focus:ring-2 focus:ring-brain-v1purple hover-elevate"
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
            className="bg-brain-v1dark-orange flex gap-[8px] items-center justify-center px-[14px] py-[8px] rounded-pill hover:opacity-90 transition-opacity flex-shrink-0"
          >
            <div className="overflow-clip relative shrink-0 size-[16px]">
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
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1light-orange text-[14px] leading-[20px] whitespace-nowrap">
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
            right={
              <ChevronActionButton
                label="Edit Email"
                testId="button-edit-email"
                onClick={() => setContactModal("email")}
              />
            }
            useCircleIcon
          />
          <Divider />
          <SettingRow
            icon={<RowCircleIcon src={ICONS.settings_phone_icon} inset="8.33% 25%" innerInset="-5% -8.33%" overflowClip />}
            label="Phone Number"
            sublabel={phone}
            right={
              <ChevronActionButton
                label="Edit Phone"
                testId="button-edit-phone"
                onClick={() => setContactModal("phone")}
              />
            }
            useCircleIcon
          />
        </Card>
      </div>

      {/* Two-step email / phone update modals */}
      <ContactUpdateModal
        open={contactModal === "email"}
        onOpenChange={(o) => !o && setContactModal(null)}
        type="email"
        onComplete={(v) => {
          setUserEmail(v);
          alert.success("Email updated", "Your email has been verified and saved.");
        }}
      />
      <ContactUpdateModal
        open={contactModal === "phone"}
        onOpenChange={(o) => !o && setContactModal(null)}
        type="phone"
        onComplete={(v) => {
          setUserPhone(v);
          alert.success("Phone updated", "Your phone number has been verified and saved.");
        }}
      />

      <div className="flex flex-col gap-[4px]">
        <SectionLabel>Currency</SectionLabel>
        {/* overflow-visible so the dropdown isn’t clipped by the card */}
        <div className="rounded-panel" style={{ background: "#0a0c10" }}>
          <SettingRow
            icon={
              <div className="relative rounded-pill shrink-0 size-[40px]">
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
            sublabel="Fallback for accounts that don't specify their own display currency"
            right={
              <div ref={currencyRef} className="relative shrink-0 w-[80px]">
                <SettingsDropdown
                  value={currency}
                  options={CURRENCY_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                  onChange={setCurrency}
                  testId="button-default-currency"
                  ariaLabel="Default currency"
                  open={currencyOpen}
                  onOpenChange={setCurrencyOpen}
                  matchMenuWidth
                />
              </div>
            }
            useCircleIcon
          />
        </div>
      </div>

      {/* Approvals — read from the live policy, and read-only.
          Changing it needs `policy/compose` + `policy/sign`, scopes this app's
          token does not hold, so there is no control here pretending otherwise. */}
      <div className="flex flex-col gap-[4px]">
        <SectionLabel>Approvals</SectionLabel>
        <Card noBorder>
          <SettingRow
            icon={
              <RowIcon>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 3.5l7 3v5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9v-5l7-3z" stroke="#a8b9f4" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M9 12l2.2 2.2L15.5 10" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </RowIcon>
            }
            label="Auto-Approve Limit"
            sublabel={
              policy.isLoading
                ? "Reading your approval policy…"
                : limitUnreadable
                  ? "Brain could not read your approval policy. This limit is unknown, not absent."
                  : autoLimit === null
                    ? "No approval policy is active on this tenant yet."
                    : autoLimit.kind === "limit"
                      ? "Payments at or below this run without waiting for a person."
                      : autoLimit.kind === "conditional"
                        ? "Automatic approval applies only under specific conditions, not a flat amount."
                        : "Nothing runs automatically. Every payment waits for an approver."
            }
            testId="setting-row-auto-approve-limit"
            right={
              /* The error state keeps its own fill and stroke so "Unknown" cannot be
                 mistaken for a real figure. Alpha values are spelled raw because
                 Tailwind 3 cannot apply an alpha channel to a var() colour; both
                 base colours are tokens (brain-v1light-orange). */
              <div
                className={`shrink-0 rounded-[8px] px-[12px] py-[8px] border border-solid ${
                  limitUnreadable
                    ? "bg-[rgba(255,149,0,0.1)] border-[rgba(255,149,0,0.3)]"
                    : "bg-brain-v1baby-blue-15 border-transparent"
                }`}
                data-testid="text-auto-approve-limit"
              >
                <p
                  className={`[font-family:'Gilroy',sans-serif] font-medium text-[16px] leading-[20px] whitespace-nowrap ${
                    limitUnreadable
                      ? "text-brain-v1light-orange"
                      : policy.isLoading
                        ? "text-brain-v1baby-blue-60"
                        : "text-brain-v1white"
                  }`}
                >
                  {policy.isLoading
                    ? "Checking…"
                    : limitUnreadable
                      ? "Unknown"
                      : autoLimit === null
                        ? "No policy"
                        : autoLimit.kind === "limit"
                          ? `${groupPolicyAmount(autoLimit.value)} ${autoLimit.currency}`
                          : autoLimit.kind === "conditional"
                            ? "Conditional"
                            : "None"}
                </p>
              </div>
            }
          />
        </Card>
        <p
          className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[13px] leading-[18px] px-1"
          data-testid="text-auto-approve-readonly"
        >
          Shown as your Brain policy has it. Editing an approval limit requires a signed
          policy change, which cannot be made from this screen yet.
        </p>
      </div>

      {/* Replay the first-run walkthrough. Clearing the flag and returning Home
          reuses first-visit detection rather than adding a second way to open
          the flow, so the two paths can never drift apart. */}
      <div className="flex flex-col gap-[4px]">
        <SectionLabel>Getting Started</SectionLabel>
        <Card noBorder>
          <SettingRow
            icon={
              <RowIcon>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 12a8 8 0 1 1 2.6 5.9" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M4 8.5V13h4.5" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </RowIcon>
            }
            label="Welcome Walkthrough"
            sublabel="How your rules decide what runs automatically, and what always waits for you."
            testId="setting-row-replay-onboarding"
            right={
              <button
                type="button"
                data-testid="button-replay-onboarding"
                onClick={() => {
                  clearOnboarding(user?.id);
                  navigate("/");
                }}
                className="shrink-0 rounded-pill px-[14px] py-[8px] bg-brain-v1baby-blue-15 hover:bg-brain-v1baby-blue-15-hover transition-colors [font-family:'Gilroy',sans-serif] font-semibold text-[14px] leading-[20px] text-brain-v1baby-blue-100 whitespace-nowrap"
              >
                Replay
              </button>
            }
          />
        </Card>
      </div>

    </div>
  );
}

/* ─── Billing section ──────────────────────────────────────
   Plan summary, payment method, and billing history. There is no billing
   backend yet, so plan / card / history all start honestly empty rather
   than defaulting to a fabricated subscription. */
const PLAN_META: Record<PlanId, { label: string; tagline: string; price: string; cadence: string }> = {
  free:         { label: "Free plan",         tagline: "Try Brain: 1 agent, 1 source.",                 price: "$0",     cadence: "per month" },
  personal:     { label: "Personal plan",     tagline: "6 agents, 3 sources.",                          price: "$49",    cadence: "per month" },
  professional: { label: "Professional plan", tagline: "Unlimited agents, unlimited sources.",          price: "$99",    cadence: "per month" },
  business:     { label: "Business plan",     tagline: "Dedicated infra, SLAs, custom policy signers.", price: "Custom", cadence: "contact us" },
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
          <div className="p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0 flex flex-col gap-[4px] justify-center">
              <div className="flex items-center gap-2">
                <p style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "16px", lineHeight: "20px" }}>
                  {plan ? plan.tagline : "No plan selected yet."}
                </p>
                {plan && cancelled && (
                  <span
                    className="px-2 py-[3px] rounded-pill"
                    style={{
                      background: "#4a2300",
                      color: "#ff9500",
                      fontFamily: "'Gilroy', sans-serif",
                      fontWeight: 600,
                      fontSize: "12px",
                      lineHeight: "14px",
                      border: "1px solid rgba(255,149,0,0.2)",
                    }}
                  >
                    Cancelling
                  </span>
                )}
              </div>
              {plan && (
                <p
                  data-testid="text-plan-name"
                  style={{ color: "#a8b9f4", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "24px", lineHeight: "32px" }}
                >
                  {plan.label}
                </p>
              )}
              {plan && (
                <p
                  data-testid="text-plan-price"
                  style={{ color: "#6c779d", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "14px", lineHeight: "20px" }}
                >
                  {plan.price} {plan.cadence}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <button
                type="button"
                data-testid="button-upgrade-plan"
                onClick={() => setChangePlanOpen(true)}
                className="rounded-pill px-[14px] py-[8px] hover-elevate"
                style={{ background: "#240757", color: "#7631ee", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "14px", lineHeight: "20px", whiteSpace: "nowrap" }}
              >
                  {plan ? "Change Plan" : "Choose A Plan"}
              </button>
              {plan && !cancelled && (
                <button
                  type="button"
                  data-testid="button-cancel-plan"
                  onClick={() => setCancelSubOpen(true)}
                  className="rounded-full px-[20px] py-[10px] hover-elevate"
                  style={{ background: "transparent", color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "14px", lineHeight: "20px", border: "1px solid #1d2132", whiteSpace: "nowrap" }}
                >
                  Cancel Subscription
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
            <div className="flex-1 min-w-0 flex items-center gap-[12px]">
              <div
                className="size-[40px] rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "#161b28" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="5.5" width="18" height="13" rx="2.5" stroke="#a8b9f4" strokeWidth="1.5"/>
                  <rect x="3" y="9" width="18" height="2" fill="#a8b9f4"/>
                  <rect x="6" y="14" width="5" height="1.6" rx="0.8" fill="#a8b9f4"/>
                </svg>
              </div>
              <div className="min-w-0">
                {cardLast4 ? (
                  <>
                    <p
                      data-testid="text-card-brand"
                      style={{ color: "#a8b9f4", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "16px", lineHeight: "20px" }}
                    >
                      Card •••• {cardLast4}
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
                    No Payment Method on File
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              data-testid="button-update-card"
              onClick={() => setUpdateCardOpen(true)}
              className="rounded-pill px-[14px] py-[8px] hover-elevate flex-shrink-0 flex items-center justify-center gap-[2px]"
              style={{ background: "#240757", color: "#7631ee", fontFamily: "'Gilroy', sans-serif", fontWeight: 600, fontSize: "14px", lineHeight: "20px", whiteSpace: "nowrap" }}
            >
              {!cardLast4 && <Plus className="relative shrink-0 size-[16px] text-brain-v1purple" />}
              {cardLast4 ? "Update Card" : "Add Card"}
            </button>
          </div>
        </Card>
      </div>

      {/* Invoice history */}
      <div className="flex flex-col gap-[4px]">
        <SectionLabel>Invoice History</SectionLabel>
        <Card noBorder>
          <div className="p-4 flex flex-col items-center justify-center gap-[12px]">
            <div
              className="size-[40px] rounded-full flex items-center justify-center"
              style={{ background: "#161b28" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 3.5h7.5L18.5 7v13a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" stroke="#a8b9f4" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M14.5 3.5V7H18" stroke="#a8b9f4" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M9.5 12h5.5M9.5 15.5h5.5" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <p style={{ color: "#6c779d", fontFamily: "'Gilroy', sans-serif", fontWeight: 500, fontSize: "16px", lineHeight: "20px", textAlign: "center" }}>
              No billing history
            </p>
          </div>
        </Card>
      </div>

      <ChangePlanModal
        open={changePlanOpen}
        onOpenChange={setChangePlanOpen}
        currentPlan={planId}
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
          alert.success("Card updated", `Your card on file now ends in ${last4}.`);
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
const VALID_SECTIONS: Section[] = ["profile", "billing", "security", "notifications", "team", "sources", "developers", "audit", "legal", "account"];

export function SettingsPage() {
  // Deep-link support: /settings?section=billing opens that section directly.
  const [section, setSection] = useState<Section>(() => {
    const s = new URLSearchParams(window.location.search).get("section");
    return VALID_SECTIONS.includes(s as Section) ? (s as Section) : "profile";
  });
  const search = useSearch();
  const navigate = useLocation()[1];

  /* Clicking a tab moves the URL, not just local state. Settings → Developers
     owns a second parameter (`?tab=`), and writing that parameter re-runs the
     effect below: if the URL still carried an older `?section=`, a sub-tab click
     would bounce the user back to that section. Keeping the URL authoritative
     removes the conflict rather than special-casing it. `tab` is dropped when
     leaving Developers so it cannot resurface on an unrelated section. */
  const selectSection = (id: Section) => {
    setSection(id);
    const url = new URL(window.location.href);
    url.searchParams.set("section", id);
    if (id !== "developers") url.searchParams.delete("tab");
    navigate(url.pathname + url.search, { replace: true });
  };

  /* Re-read on every change to the query string, not just on mount. Settings is
     already mounted when an in-app link points at another tab, and a mount-only
     initializer swallows that navigation with no error - the URL changes and the
     page does not. */
  useEffect(() => {
    const s = new URLSearchParams(search).get("section");
    if (s && VALID_SECTIONS.includes(s as Section)) setSection(s as Section);
  }, [search]);

  const { toast } = useToast();

  const SectionContent = {
    profile:       <ProfileSection />,
    billing:       <BillingSection />,
    security:      <SecurityFigma />,
    notifications: <NotificationsFigma />,
    team:          <TeamFigma />,
    sources:       <SourcesSection />,
    developers:    <DevelopersSection />,
    audit:         <AuditLogSection />,
    legal:         <LegalFigma />,
    account:       <AccountFigma />,
  }[section];

  return (
    <div
      className="flex h-full rounded-panel border border-brain-v1stroke-2 overflow-hidden"
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
                onClick={() => selectSection(id)}
                className="flex items-center gap-2 p-2 w-full rounded-row transition-colors text-left"
                style={{ background: active ? "#0a0c10" : "transparent" }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(168,185,244,0.05)"; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div className="size-[24px] flex-shrink-0 flex items-center justify-center">
                  <Icon active={active} />
                </div>
                <span
                  className="flex-1 text-[14px] leading-[20px] whitespace-nowrap"
                  style={{
                    fontFamily: "'Gilroy', 'Plus Jakarta Sans', system-ui, sans-serif",
                    fontWeight: 600,
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
