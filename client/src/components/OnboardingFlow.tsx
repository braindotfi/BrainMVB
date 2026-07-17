import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import closeIcon from "@assets/Close_1783293571882.png";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata, type PlaidLinkError } from "react-plaid-link";

type ToolConnection = {
  userId: string;
  toolId: string;
  status: "connected" | "error";
  accountLabel?: string;
  connectedAt: string;
};

const TOTAL_STEPS = 8;

type UploadedFile = {
  id: string;
  name: string;
  size: number;
  status: "processing" | "done" | "warning";
  detail: string;
};

/* Step 3: Connect tools, third-party data sources */
type ToolCategory = "Accounting" | "Productivity" | "CRM & Sales" | "Payments" | "Communication" | "Crypto";

type Tool = {
  id: string;
  name: string;
  category: ToolCategory;
  /** Short text logo shown inside the colored disc (1–4 chars). */
  logo: string;
  /** Disc background color. */
  bg: string;
  /** When true, treat bg as light and use a dark glyph + thin border. */
  light?: boolean;
};

const TOOLS: Tool[] = [
  // Accounting
  { id: "quickbooks", name: "QuickBooks", category: "Accounting",     logo: "qb", bg: "#2CA01C" },
  { id: "xero",       name: "Xero",       category: "Accounting",     logo: "X",  bg: "#13B5EA" },
  { id: "wave",       name: "Wave",       category: "Accounting",     logo: "~",  bg: "#1F46FA" },
  // Productivity & docs
  { id: "notion",     name: "Notion",     category: "Productivity",   logo: "N",  bg: "#FFFFFF", light: true },
  { id: "gdrive",     name: "Google Drive", category: "Productivity", logo: "G",  bg: "#FFFFFF", light: true },
  { id: "dropbox",    name: "Dropbox",    category: "Productivity",   logo: "D",  bg: "#0061FF" },
  { id: "onedrive",   name: "OneDrive",   category: "Productivity",   logo: "OD", bg: "#0364B8" },
  // CRM & sales
  { id: "attio",      name: "Attio",      category: "CRM & Sales",    logo: "A",  bg: "#1d1d1f" },
  { id: "hubspot",    name: "HubSpot",    category: "CRM & Sales",    logo: "H",  bg: "#FF7A59" },
  { id: "salesforce", name: "Salesforce", category: "CRM & Sales",    logo: "SF", bg: "#00A1E0" },
  // Payments
  { id: "stripe",     name: "Stripe",     category: "Payments",       logo: "S",  bg: "#635BFF" },
  { id: "paypal",     name: "PayPal",     category: "Payments",       logo: "P",  bg: "#003087" },
  { id: "square",     name: "Square",     category: "Payments",       logo: "□",  bg: "#000000" },
  // Communication
  { id: "slack",      name: "Slack",      category: "Communication",  logo: "#",  bg: "#4A154B" },
  { id: "gmail",      name: "Gmail",      category: "Communication",  logo: "M",  bg: "#FFFFFF", light: true },
  // Crypto
  { id: "coinbase",   name: "Coinbase",   category: "Crypto",         logo: "C",  bg: "#0052FF" },
];

const TOOL_CATEGORY_ORDER: ToolCategory[] = [
  "Accounting",
  "Productivity",
  "CRM & Sales",
  "Payments",
  "Communication",
  "Crypto",
];

/* ─── Step 5: Business profile constants ─── */
const BUSINESS_KINDS: { id: string; label: string }[] = [
  { id: "services",   label: "Services/Agency" },
  { id: "trades",     label: "Trades/Construction" },
  { id: "retail",     label: "Retail/eCom" },
  { id: "restaurant", label: "Restaurant/Food" },
  { id: "saas",       label: "SaaS/Tech Startup" },
  { id: "other",      label: "Something Else" },
];

const TEAM_SIZES: { id: string; label: string }[] = [
  { id: "just-me", label: "Just Me" },
  { id: "2-5",     label: "2-5" },
  { id: "6-15",    label: "6-15" },
  { id: "16-50",   label: "16-50" },
  { id: "50+",     label: "50+" },
];

const HELP_AREAS: { id: string; label: string; sub: string }[] = [
  { id: "bills-vendors",     label: "Paying bills and vendors on time",     sub: "Recurring bills, vendor invoices, utilities." },
  { id: "overdue-invoices",  label: "Chasing overdue invoices from customers", sub: "Email reminders when an invoice is past due" },
  { id: "payroll",           label: "Running payroll smoothly",              sub: "Checking amounts look right before each pay run" },
  { id: "books-close",       label: "Month-end close and books",             sub: "Matching transactions, tax categorization, close prep" },
  { id: "cash-flow",         label: "Cash flow and runway tracking",         sub: "Knowing how long your cash will last" },
  { id: "crypto-treasury",   label: "Crypto treasury",                       sub: "Stablecoins, wallets, on-chain positions" },
];

type AutonomyLevel = "watch" | "routine" | "books";

type BookkeeperRole = "approver" | "viewer" | "editor";

/* ─── Step 7: People Brain found ─── */
type ContactGroupId = "you-pay" | "pays-you" | "on-chain" | "team";

type Contact = {
  id: string;
  name: string;
  meta: string;
  badge?: { label: string; tone: "muted" | "orange" };
  defaultSelected?: boolean;
  /** When true, this contact is hidden behind the "X more" expand affordance. */
  extra?: boolean;
};

type ContactGroup = {
  id: ContactGroupId;
  label: string;
  /** Total count Brain found (displayed as "X more" indicator). Includes hidden extras. */
  totalHidden: number;
  contacts: Contact[];
};

const CONTACT_GROUPS: ContactGroup[] = [
  {
    id: "you-pay",
    label: "You Pay These Vendors",
    totalHidden: 12,
    contacts: [
      { id: "aws",       name: "Amazon Web Services", meta: "Recurring · Hosting · ~$8K/mo", defaultSelected: true },
      { id: "anthropic", name: "Anthropic",           meta: "Recurring · API · ~$1.8K/mo",   defaultSelected: true },
      { id: "stripe-fees",  name: "Stripe",         meta: "Recurring · Payment fees · ~$2.4K/mo", extra: true },
      { id: "linear",       name: "Linear",         meta: "Recurring · SaaS · $480/mo",          extra: true },
    ],
  },
  {
    id: "pays-you",
    label: "Your Customers",
    totalHidden: 36,
    contacts: [
      { id: "peterson", name: "Peterson Legal Group", meta: "Top Customer · ~$240K/yr · Stripe",            defaultSelected: true },
      { id: "northstar", name: "Northstar Design Co",  meta: "$72K/yr · Pays from Base 0x8c3a...1f9e",       defaultSelected: true },
      { id: "willow",    name: "Willow Creek Dental", meta: "$54K/yr · ACH · 2 invoices outstanding",       extra: true },
      { id: "brookside", name: "Brookside Consulting",meta: "$48K/yr · Stripe · Pays Net-30",                extra: true },
    ],
  },
  {
    id: "on-chain",
    label: "On-Chain",
    totalHidden: 36,
    contacts: [
      { id: "aave",      name: "Aave",            meta: "Lending · $1M USDC Position · Earning 4.2% APY", badge: { label: "Protocol", tone: "muted" }, defaultSelected: true },
      { id: "aerodrome", name: "Aerodrome DEX",   meta: "Swapping · 8 Swaps in 90d · USDC – DAI",         badge: { label: "Protocol", tone: "muted" }, defaultSelected: true },
      { id: "0x4a7e",    name: "0x4a7e...c812",   meta: "Frequent Recipient · $4,880 Total",              badge: { label: "Unknown",  tone: "orange" } },
      { id: "morpho",    name: "Morpho Blue",     meta: "Lending · $250K USDC · Earning 5.1% APY",        badge: { label: "Protocol", tone: "muted" }, extra: true },
    ],
  },
  {
    id: "team",
    label: "Your Team (Payroll)",
    totalHidden: 7,
    contacts: [
      { id: "jane-doe", name: "Jane Doe", meta: "Salary · Equity · Joined Jan 2024", badge: { label: "Founding Engineer", tone: "muted" }, defaultSelected: true },
      { id: "j-smith",  name: "J. Smith", meta: "Salary · Joined Feb 2024",          badge: { label: "Engineering",       tone: "muted" }, extra: true },
    ],
  },
];

const PEOPLE_TABS: { id: "all" | ContactGroupId; label: string; count: number }[] = [
  { id: "all",      label: "All",      count: 67 },
  { id: "you-pay",  label: "You Pay",  count: 14 },
  { id: "pays-you", label: "Pays You", count: 38 },
  { id: "on-chain", label: "On-Chain", count: 7  },
  { id: "team",     label: "Team",     count: 8  },
];

interface OnboardingFlowProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function OnboardingFlow({ open, onClose, onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [toolSearch, setToolSearch] = useState("");
  const [connectingTool, setConnectingTool] = useState<string | null>(null);
  const [toolError, setToolError] = useState<{ id: string; msg: string } | null>(null);

  /* Real third-party connections fetched from the backend */
  const connectionsQuery = useQuery<ToolConnection[]>({
    queryKey: ["/api/integrations/connections"],
    enabled: open,
  });
  const connections = connectionsQuery.data ?? [];
  const connectionsByTool = new Map(connections.map(c => [c.toolId, c]));

  const stripeConnect = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/stripe/connect");
      return (await res.json()) as ToolConnection;
    },
    onSuccess: () => {
      setToolError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/connections"] });
    },
    onError: (err: Error) => {
      setToolError({ id: "stripe", msg: err.message.replace(/^\d+:\s*/, "") });
    },
    onSettled: () => setConnectingTool(null),
  });

  const disconnectTool = useMutation({
    mutationFn: async (toolId: string) => {
      const res = await apiRequest("POST", `/api/integrations/${toolId}/disconnect`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/integrations/connections"] }),
  });

  const handleToolClick = useCallback((toolId: string) => {
    setToolError(null);
    // If already connected → disconnect
    if (connectionsByTool.has(toolId)) {
      disconnectTool.mutate(toolId);
      setSelectedTools(prev => {
        const next = new Set(prev); next.delete(toolId); return next;
      });
      return;
    }
    // Stripe → trigger real OAuth-backed connect
    if (toolId === "stripe") {
      setConnectingTool("stripe");
      stripeConnect.mutate();
      return;
    }
    // Other tools → just record interest locally (coming soon)
    setSelectedTools(prev => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId); else next.add(toolId);
      return next;
    });
  }, [connectionsByTool, disconnectTool, stripeConnect]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [businessKind, setBusinessKind] = useState<string>("services");
  const [teamSize, setTeamSize] = useState<string>("just-me");
  const [helpAreas, setHelpAreas] = useState<string[]>(["bills-vendors", "overdue-invoices"]);
  const [autonomy, setAutonomy] = useState<AutonomyLevel>("routine");
  const [shareWithBookkeeper, setShareWithBookkeeper] = useState<boolean>(true);
  const [bookkeeperEmail, setBookkeeperEmail] = useState<string>("");
  const [bookkeeperRole, setBookkeeperRole] = useState<BookkeeperRole>("approver");
  const [peopleTab, setPeopleTab] = useState<"all" | ContactGroupId>("all");
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(() => {
    const init = new Set<string>();
    CONTACT_GROUPS.forEach((g) => g.contacts.forEach((c) => { if (c.defaultSelected) init.add(c.id); }));
    return init;
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<ContactGroupId>>(new Set());

  const goNext = useCallback(() => {
    setStep((s) => {
      if (s >= TOTAL_STEPS - 1) {
        onComplete();
        return s;
      }
      return s + 1;
    });
  }, [onComplete]);

  const goBack = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  // Reset state every time the flow re-opens
  useEffect(() => {
    if (open) {
      setStep(0);
      setSelectedTools(new Set());
      setToolSearch("");
      setFiles([]);
      setBusinessKind("services");
      setTeamSize("just-me");
      setHelpAreas(["bills-vendors", "overdue-invoices"]);
      setAutonomy("routine");
      setShareWithBookkeeper(true);
      setBookkeeperEmail("");
      setBookkeeperRole("approver");
      setPeopleTab("all");
      const init = new Set<string>();
      CONTACT_GROUPS.forEach((g) => g.contacts.forEach((c) => { if (c.defaultSelected) init.add(c.id); }));
      setSelectedPeople(init);
      setExpandedGroups(new Set());
    }
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          data-testid="onboarding-backdrop"
        />
        <DialogPrimitive.Content
          aria-describedby="onboarding-description"
          className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] bg-[#11141b] border border-[#1d2132] border-solid flex flex-col items-start overflow-hidden rounded-[24px] w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] shadow-[0_24px_60px_rgba(0,0,0,0.6)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          data-testid="onboarding-modal"
        >
          {/* Header - back, step dots, close */}
          <div className="backdrop-blur-[10px] bg-[rgba(17,20,27,0.8)] border-b border-[#1d2132] border-solid h-[56px] relative shrink-0 w-full">
            {step > 0 && (
              <button
                type="button"
                onClick={goBack}
                aria-label="Back"
                data-testid="button-onboarding-back"
                className="absolute left-[11px] top-[11px] size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M7.5 1.5L3 6L7.5 10.5" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            <StepDots total={TOTAL_STEPS} current={step} />

            <DialogPrimitive.Close
              data-testid="button-onboarding-close"
              aria-label="Close"
              className="absolute right-[11px] top-[11px] size-[32px] p-0 hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              <img src={closeIcon} alt="" className="size-[32px] rounded-full" />
            </DialogPrimitive.Close>

            <DialogPrimitive.Title className="sr-only">Brain onboarding</DialogPrimitive.Title>
            <DialogPrimitive.Description id="onboarding-description" className="sr-only">
              Step {step + 1} of {TOTAL_STEPS}
            </DialogPrimitive.Description>
          </div>

          {/* Body */}
          <div
            className="w-full flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
            data-testid="onboarding-scroll"
          >
            <div className="flex flex-col gap-[24px] p-[24px] w-full">
              {step === 0 && <StepWelcome />}
              {step === 1 && <StepConnectBank />}
              {step === 2 && (
                <StepConnectTools
                  selected={selectedTools}
                  connectionsByTool={connectionsByTool}
                  connectingTool={connectingTool}
                  toolError={toolError}
                  onToolClick={handleToolClick}
                  search={toolSearch}
                  onSearchChange={setToolSearch}
                />
              )}
              {step === 3 && <StepUpload files={files} setFiles={setFiles} />}
              {step === 4 && <StepReading files={files} setFiles={setFiles} />}
              {step === 5 && (
                <StepBusinessProfile
                  businessKind={businessKind}
                  onBusinessKindChange={setBusinessKind}
                  teamSize={teamSize}
                  onTeamSizeChange={setTeamSize}
                  helpAreas={helpAreas}
                  onHelpAreasChange={setHelpAreas}
                />
              )}
              {step === 6 && (
                <StepAutonomy
                  value={autonomy}
                  onChange={setAutonomy}
                  shareWithBookkeeper={shareWithBookkeeper}
                  onShareChange={setShareWithBookkeeper}
                  bookkeeperEmail={bookkeeperEmail}
                  onBookkeeperEmailChange={setBookkeeperEmail}
                  bookkeeperRole={bookkeeperRole}
                  onBookkeeperRoleChange={setBookkeeperRole}
                />
              )}
              {step === 7 && (
                <StepPeople
                  activeTab={peopleTab}
                  onTabChange={setPeopleTab}
                  selected={selectedPeople}
                  onToggle={(id) => {
                    setSelectedPeople((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id); else next.add(id);
                      return next;
                    });
                  }}
                  expandedGroups={expandedGroups}
                  onToggleExpand={(gid) => {
                    setExpandedGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(gid)) next.delete(gid); else next.add(gid);
                      return next;
                    });
                  }}
                />
              )}

              {/* Footer buttons */}
              {step < TOTAL_STEPS - 1 ? (
                <div className="flex gap-[16px] items-stretch w-full">
                  <button
                    type="button"
                    onClick={goNext}
                    data-testid="button-onboarding-skip"
                    className="flex flex-1 items-center justify-center px-[20px] py-[10px] rounded-[100px] bg-[#222737] hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
                  >
                    <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">
                      {step === 0 ? "Skip for Now" : "Skip for now"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    data-testid="button-onboarding-continue"
                    className="flex flex-1 items-center justify-center px-[20px] py-[10px] rounded-[100px] bg-[#4a2300] hover:bg-[#5a2c00] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9500]"
                  >
                    <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#ff9500] text-[16px] whitespace-nowrap">
                      Continue
                    </span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onComplete()}
                  data-testid="button-onboarding-finish"
                  className="flex w-full items-center justify-center px-[20px] py-[14px] rounded-[100px] bg-[#123509] hover:bg-[#174710] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#42bf23]"
                >
                  <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#42bf23] text-[16px] whitespace-nowrap">
                    Finish Setup
                  </span>
                </button>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ─── Step indicator ─── */
function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-[8px] px-[12px] py-[6px] rounded-full bg-[#1a0d33]">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`block rounded-full transition-colors ${
            i === current ? "bg-[#7631EE] size-[8px]" : "bg-[rgba(118,49,238,0.3)] size-[6px]"
          }`}
        />
      ))}
    </div>
  );
}

/* ─── Step 1: Welcome ─── */
function StepWelcome() {
  return (
    <div className="flex flex-col gap-[8px]">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
        Welcome to Brain
      </p>
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
        Let's start by connecting your business systems.
      </p>
      <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px] mt-[8px]">
        Brain reads your authorized financial activity, structures it into a verified ledger, and gives your company a financial memory that agents can use safely within your rules.
      </p>
    </div>
  );
}

/* ─── Step 2: Connect bank ─── */
type BankAccountInfo = {
  accountId: string;
  name: string;
  mask: string | null;
  subtype: string | null;
  type: string | null;
};
type BankConnectionInfo = {
  itemId: string;
  institutionId: string | null;
  institutionName: string;
  accounts: BankAccountInfo[];
  connectedAt: string;
};

function StepConnectBank() {
  const [error, setError] = useState<string | null>(null);

  const statusQuery = useQuery<{ configured: boolean; env: string }>({
    queryKey: ["/api/integrations/plaid/status"],
  });
  const isConfigured = statusQuery.data?.configured ?? false;

  const connectionsQuery = useQuery<BankConnectionInfo[]>({
    queryKey: ["/api/integrations/plaid/connections"],
  });
  const connections = connectionsQuery.data ?? [];

  // Lazily fetch a Plaid Link token only when ready to connect
  const linkTokenQuery = useQuery<{ link_token: string }>({
    queryKey: ["/api/integrations/plaid/link-token"],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/plaid/link-token");
      return res.json();
    },
    enabled: isConfigured,
    retry: false,
    staleTime: 25 * 60 * 1000, // Plaid link tokens last ~30 minutes
  });

  const exchangeMut = useMutation({
    mutationFn: async (vars: { public_token: string; institution?: { id: string | null; name: string } }) => {
      const res = await apiRequest("POST", "/api/integrations/plaid/exchange", vars);
      return res.json();
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/plaid/connections"] });
    },
    onError: (err: Error) => setError(err.message.replace(/^\d+:\s*/, "")),
  });

  const disconnectMut = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiRequest("POST", "/api/integrations/plaid/disconnect", { itemId });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/integrations/plaid/connections"] }),
  });

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          Let&apos;s connect your main account.
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          Brain can add your additional financial accounts to understand what&apos;s coming in and going out. You can add savings, credit cards, and more in a minute.
        </p>
      </div>

      {/* Connected banks */}
      {connections.length > 0 && (
        <div className="flex flex-col gap-[8px]">
          {connections.map((c) => (
            <div
              key={c.itemId}
              data-testid={`card-bank-${c.itemId}`}
              className="flex items-center gap-[12px] bg-[#0a0c10] rounded-[12px] p-[12px] border"
              style={{ borderColor: "#22c55e" }}
            >
              <div
                className="size-[32px] rounded-full flex items-center justify-center shrink-0 font-bold text-[12px] [font-family:'Gilroy',sans-serif]"
                style={{ background: "#22c55e", color: "#062b13" }}
              >
                {c.institutionName.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[14px] leading-[18px] truncate">
                  {c.institutionName}
                </span>
                <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#22c55e] text-[11px] leading-[14px] truncate">
                  {c.accounts.length} account{c.accounts.length === 1 ? "" : "s"} connected
                  {c.accounts[0]?.mask ? ` · ····${c.accounts[0].mask}` : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() => disconnectMut.mutate(c.itemId)}
                disabled={disconnectMut.isPending}
                data-testid={`button-disconnect-bank-${c.itemId}`}
                className="px-[10px] py-[6px] rounded-[8px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px] text-[#fca5a5] hover:bg-[rgba(239,68,68,0.1)] transition-colors"
              >
                Disconnect
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div
          data-testid="alert-bank-error"
          className="rounded-[12px] px-[12px] py-[10px] [font-family:'Gilroy',sans-serif] text-[13px] leading-[18px]"
          style={{ background: "rgba(239,68,68,0.08)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)" }}
        >
          {error}
        </div>
      )}

      {/* Connect CTA */}
      {!isConfigured ? (
        <div
          data-testid="alert-plaid-not-configured"
          className="rounded-[12px] px-[14px] py-[12px] [font-family:'Gilroy',sans-serif] text-[13px] leading-[18px]"
          style={{ background: "rgba(118,49,238,0.08)", color: "#a8b9f4", border: "1px solid rgba(118,49,238,0.25)" }}
        >
          Bank connections require Plaid credentials. Add{" "}
          <code className="text-[#7631EE]">PLAID_CLIENT_ID</code> and{" "}
          <code className="text-[#7631EE]">PLAID_SECRET</code> to enable this step.
        </div>
      ) : (
        <PlaidConnectButton
          token={linkTokenQuery.data?.link_token ?? null}
          isLoading={linkTokenQuery.isLoading}
          isExchanging={exchangeMut.isPending}
          loadError={linkTokenQuery.error?.message ?? null}
          hasExisting={connections.length > 0}
          onSuccess={(public_token, metadata) => {
            exchangeMut.mutate({
              public_token,
              institution: metadata.institution
                ? { id: metadata.institution.institution_id, name: metadata.institution.name }
                : undefined,
            });
          }}
          onExit={(err) => { if (err) setError(err.display_message ?? err.error_message ?? "Bank connection cancelled"); }}
        />
      )}

      <InfoNotice
        title="Secure by Default"
        body={
          <>
            Brain never sees or stores your bank password. We connect through Plaid, the same company trusted by Venmo, Robinhood, and American Express. Brain only reads your account with your permission. It can not move money unless you grant permission to.
          </>
        }
      />
    </div>
  );
}

function PlaidConnectButton({
  token, isLoading, isExchanging, loadError, hasExisting, onSuccess, onExit,
}: {
  token: string | null;
  isLoading: boolean;
  isExchanging: boolean;
  loadError: string | null;
  hasExisting: boolean;
  onSuccess: (public_token: string, metadata: PlaidLinkOnSuccessMetadata) => void;
  onExit: (err: PlaidLinkError | null) => void;
}) {
  const { open, ready } = usePlaidLink({
    token: token ?? "",
    onSuccess: (public_token, metadata) => onSuccess(public_token, metadata),
    onExit: (err) => onExit(err),
  });

  const disabled = !token || !ready || isLoading || isExchanging;
  const label = isExchanging
    ? "Linking accounts…"
    : isLoading
    ? "Preparing secure connection…"
    : hasExisting
    ? "+ Connect another bank"
    : "Connect with Plaid";

  return (
    <div className="flex flex-col gap-[8px]">
      <button
        type="button"
        onClick={() => open()}
        disabled={disabled}
        data-testid="button-plaid-connect"
        className="flex items-center justify-center gap-[10px] h-[48px] rounded-[12px] [font-family:'Gilroy',sans-serif] font-semibold text-[15px] leading-[18px] transition-opacity disabled:opacity-60"
        style={{ background: "#7631EE", color: "#FFFFFF" }}
      >
        {isExchanging || isLoading ? (
          <span className="size-[16px] rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M3 7h18M3 12h18M3 17h12" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        )}
        {label}
      </button>
      {loadError && !isLoading && (
        <p className="[font-family:'Gilroy',sans-serif] text-[12px] text-[#fca5a5] text-center">
          {loadError.replace(/^\d+:\s*/, "")}
        </p>
      )}
      <p className="[font-family:'Gilroy',sans-serif] text-[11px] leading-[14px] text-[#6c779d] text-center">
        Search 12,000+ institutions &middot; bank-grade encryption
      </p>
    </div>
  );
}

/* ─── Step 3: Connect tools ─── */
function StepConnectTools({
  selected,
  connectionsByTool,
  connectingTool,
  toolError,
  onToolClick,
  search,
  onSearchChange,
}: {
  selected: Set<string>;
  connectionsByTool: Map<string, ToolConnection>;
  connectingTool: string | null;
  toolError: { id: string; msg: string } | null;
  onToolClick: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const connectedCount = connectionsByTool.size;
  const totalSelectedish = connectedCount + selected.size;
  const q = search.trim().toLowerCase();
  const filtered = q
    ? TOOLS.filter((t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
    : TOOLS;
  const grouped = TOOL_CATEGORY_ORDER.map((cat) => ({
    cat,
    items: filtered.filter((t) => t.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          What else should Brain plug into?
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          Connect your accounting, CRM, docs, and other tools so Brain has the full picture from day one. You can pick more than one, or skip and add them later.
        </p>
      </div>

      {/* Search */}
      <div className="flex items-center gap-[12px] bg-[#0a0c10] rounded-[12px] px-[16px] h-[44px] border border-[#1d2132]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="7" stroke="#6c779d" strokeWidth="2" />
          <path d="M20 20L17 17" stroke="#6c779d" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search tools or categories..."
          data-testid="input-tool-search"
          className="flex-1 bg-transparent outline-none [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] placeholder:text-[#6c779d] text-[16px]"
        />
        {totalSelectedish > 0 && (
          <span
            data-testid="badge-tools-selected"
            className="px-[8px] py-[3px] rounded-[22px] [font-family:'Gilroy',sans-serif] font-semibold text-[12px] leading-[14px]"
            style={{ background: "#240757", color: "#7631EE", border: "1px solid rgba(118,49,238,0.2)" }}
          >
            {connectedCount > 0 ? `${connectedCount} connected` : `${selected.size} selected`}
          </span>
        )}
      </div>

      {toolError && (
        <div
          data-testid="alert-tool-error"
          className="rounded-[12px] px-[12px] py-[10px] [font-family:'Gilroy',sans-serif] text-[13px] leading-[18px]"
          style={{ background: "rgba(239,68,68,0.08)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)" }}
        >
          <span className="font-semibold capitalize">{toolError.id}:</span> {toolError.msg}
        </div>
      )}

      {/* Grouped grid */}
      {grouped.length === 0 ? (
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] text-center py-[16px]">
          No tools match &ldquo;{search}&rdquo;.
        </p>
      ) : (
        grouped.map(({ cat, items }) => (
          <div key={cat} className="flex flex-col gap-[8px]">
            <div className="flex items-center gap-[8px]">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[14px] uppercase whitespace-nowrap">
                {cat}
              </p>
              <div className="flex-1 h-px bg-[#1d2132]" />
            </div>
            <div className="grid grid-cols-2 gap-[12px]">
              {items.map((t) => {
                const conn = connectionsByTool.get(t.id);
                const isConnected = !!conn;
                const isSelected = selected.has(t.id);
                const isConnecting = connectingTool === t.id;
                const isLive = t.id === "stripe"; // tools that have real OAuth wired

                const borderColor = isConnected
                  ? "#22c55e"
                  : isSelected
                  ? "#7631EE"
                  : "#1d2132";

                return (
                  <button
                    key={t.id}
                    type="button"
                    role="checkbox"
                    aria-checked={isConnected || isSelected}
                    disabled={isConnecting}
                    onClick={() => onToolClick(t.id)}
                    data-testid={`button-tool-${t.id}`}
                    title={
                      isConnected
                        ? `Connected as ${conn?.accountLabel ?? t.name}. Click to disconnect`
                        : isLive
                        ? `Connect your ${t.name} account`
                        : `${t.name} integration coming soon`
                    }
                    className="flex items-center gap-[12px] bg-[#0a0c10] rounded-[12px] p-[12px] border transition-colors text-left disabled:opacity-70"
                    style={{ borderColor }}
                  >
                    <ToolLogo tool={t} />
                    <div className="flex-1 min-w-0 flex flex-col">
                      <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[14px] leading-[18px] truncate">
                        {t.name}
                      </span>
                      {isConnected ? (
                        <span
                          data-testid={`text-connected-${t.id}`}
                          className="[font-family:'Gilroy',sans-serif] font-medium text-[#22c55e] text-[11px] leading-[14px] truncate"
                        >
                          {conn?.accountLabel ? `Connected · ${conn.accountLabel}` : "Connected"}
                        </span>
                      ) : isConnecting ? (
                        <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[11px] leading-[14px]">
                          Connecting…
                        </span>
                      ) : !isLive ? (
                        <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[11px] leading-[14px]">
                          Coming soon
                        </span>
                      ) : null}
                    </div>
                    {isConnected ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <circle cx="8" cy="8" r="8" fill="#22c55e" />
                        <path d="M4.5 8L7 10.5L11.5 6" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : isConnecting ? (
                      <span className="size-[14px] rounded-full border-2 border-[#7631EE] border-t-transparent animate-spin" aria-hidden />
                    ) : isSelected ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <circle cx="8" cy="8" r="8" fill="#7631EE" />
                        <path d="M4.5 8L7 10.5L11.5 6" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}

      <InfoNotice
        title="Read-only by Default"
        body={
          <>
            Brain only reads from each tool you connect. It never writes back without your explicit approval. Disconnect any source any time from Settings.
          </>
        }
      />
    </div>
  );
}

function ToolLogo({ tool }: { tool: Tool }) {
  return (
    <div
      className="size-[32px] rounded-full flex items-center justify-center shrink-0"
      style={{ background: tool.bg, border: tool.light ? "1px solid #1d2132" : undefined }}
    >
      <span
        className="[font-family:'Gilroy',sans-serif] font-bold text-[12px] leading-none"
        style={{ color: tool.light ? "#11141b" : "#FFFFFF" }}
      >
        {tool.logo}
      </span>
    </div>
  );
}

/* ─── Step 3: Upload files ─── */
function StepUpload({
  files, setFiles,
}: {
  files: UploadedFile[];
  setFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback((list: FileList | File[]) => {
    const incoming: UploadedFile[] = Array.from(list).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: f.name,
      size: f.size,
      status: "processing",
      detail: "Queued. Will process when you continue",
    }));
    setFiles((prev) => [...prev, ...incoming]);
  }, [setFiles]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          Want Brain to be smarter on day one?
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          If you have older statements, contracts, or anything else that explains how your business works, drop them here. The more Brain knows, the better it can help.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        data-testid="dropzone-onboarding"
        className={`flex flex-col items-center justify-center gap-[8px] px-[24px] py-[40px] rounded-[16px] border-2 border-dashed cursor-pointer transition-colors ${
          dragOver ? "border-[#7631EE] bg-[rgba(118,49,238,0.05)]" : "border-[#1d2132] hover:border-[#2c3247] bg-[#0a0c10]"
        }`}
      >
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[16px] leading-[24px]">
          Drop files here, or <span className="text-[#ff9500]">click to browse</span>
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px] leading-[20px]">
          PDF, CSV, Excel, images, ZIPs · Up to 5MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
          className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.currentTarget.value = ""; }}
          data-testid="input-file-upload"
        />
      </div>

      {/* Already-attached preview */}
      {files.length > 0 && (
        <div className="flex flex-col gap-[6px]">
          {files.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-[12px] bg-[#0a0c10] rounded-[10px] px-[12px] py-[8px] border border-[#1d2132]">
              <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[13px] truncate flex-1 min-w-0">{f.name}</span>
              <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[12px] shrink-0">{formatSize(f.size)}</span>
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((p) => p.id !== f.id))}
                aria-label={`Remove ${f.name}`}
                data-testid={`button-remove-file-${f.id}`}
                className="shrink-0 size-[24px] rounded-[6px] flex items-center justify-center text-[#6c779d] hover:text-[#a8b9f4] hover:bg-[#1d2132] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <InfoNotice
        title="Brain Reads but Doesn't Share"
        body="Files are encrypted, used only to understand your business, and never shown to anyone else. You can delete any file at any time."
      />
    </div>
  );
}

/* ─── Step 4: Reading files ─── */
function StepReading({
  files, setFiles,
}: {
  files: UploadedFile[];
  setFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timersRef = useRef<number[]>([]);

  const scheduleProcessing = useCallback((id: string, name: string, delay: number, asWarning: boolean) => {
    const t = window.setTimeout(() => {
      setFiles((prev) =>
        prev.map((ff) => {
          if (ff.id !== id) return ff;
          return asWarning
            ? { ...ff, status: "warning" as const, detail: "Hard to read" }
            : { ...ff, status: "done" as const, detail: processedDetail(name) };
        }),
      );
    }, delay);
    timersRef.current.push(t);
  }, [setFiles]);

  // Simulate processing: as soon as we land on this step, schedule outcomes
  // for anything still "processing". Uses functional state updates so the
  // latest list is always seen, and tears down timers on unmount.
  useEffect(() => {
    const pending = files.filter(f => f.status === "processing");
    pending.forEach((f, idx) => {
      // Mark the last of more than 2 files as "warning" for visual variety.
      const isLast = idx === pending.length - 1 && pending.length > 2;
      scheduleProcessing(f.id, f.name, 800 + idx * 600, isLast);
    });
    return () => {
      timersRef.current.forEach(window.clearTimeout);
      timersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (list: FileList | File[]) => {
    const incoming: UploadedFile[] = Array.from(list).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: f.name,
      size: f.size,
      status: "processing",
      detail: "Reading…",
    }));
    setFiles((prev) => [...prev, ...incoming]);
    incoming.forEach((nf, idx) => {
      scheduleProcessing(nf.id, nf.name, 1500 + idx * 600, false);
    });
  };

  const doneCount    = files.filter(f => f.status === "done").length;
  const warningCount = files.filter(f => f.status === "warning").length;

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          Reading your files
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          This usually takes 1 to 3 minutes. You can keep using Brain while it finishes.
        </p>
      </div>

      {files.length === 0 ? (
        <div className="bg-[#0a0c10] rounded-[16px] p-[20px] border border-[#1d2132]">
          <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px]">
            No files attached. You can add some now or skip this step.
          </p>
        </div>
      ) : (
        <div className="bg-[#0a0c10] rounded-[16px] border border-[#1d2132] overflow-hidden">
          {files.map((f, i) => (
            <div
              key={f.id}
              className={`flex items-start gap-[12px] p-[16px] ${i > 0 ? "border-t border-[#1d2132]" : ""}`}
            >
              <FileStatusIcon status={f.status} />
              <div className="flex-1 min-w-0">
                <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[15px] leading-[20px] truncate">{f.name}</p>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px] mt-[2px]">
                  {fileStatusLabel(f)}
                </p>
              </div>
              <span className="shrink-0 px-[8px] py-[2px] rounded-[8px] bg-[#1d2132] [font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[11px]">
                {formatSize(f.size)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between px-[16px] py-[12px] border-t border-[#1d2132] bg-[rgba(0,0,0,0.2)]">
            <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px]">
              {doneCount} of {files.length} files done{warningCount ? ` · ${warningCount} needs your help` : ""}
            </span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              data-testid="button-add-more-files"
              className="px-[12px] py-[6px] rounded-[100px] bg-[#222737] hover:bg-[#2c3247] [font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[12px]"
            >
              Add More
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
              className="hidden"
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.currentTarget.value = ""; }}
            />
          </div>
        </div>
      )}

      {files.length > 0 && (
        <>
          <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[13px] uppercase tracking-wide pt-[8px]">
            What Brain Learned So Far
          </p>
          <div className="grid grid-cols-2 gap-[8px]">
            <StatCell value={`${Math.max(2, doneCount * 8)}`} label="Vendors Identified" />
            <StatCell value={`${Math.max(1, doneCount * 4)}`} label="Recurring Bills Found" />
            <StatCell value={`$${(doneCount * 240 + 12)}K`}    label="In Transactions Read" />
            <StatCell value={doneCount >= 2 ? "2 Years" : "6 Mo"} label="History Covered" />
          </div>
        </>
      )}

      <InfoNotice
        title="Brain Reads but Doesn't Share"
        body="Files are encrypted, used only to understand your business, and never shown to anyone else. You can delete any file at any time."
      />
    </div>
  );
}

/* ─── Step 5: Tell me about your business ─── */
function StepBusinessProfile({
  businessKind,
  onBusinessKindChange,
  teamSize,
  onTeamSizeChange,
  helpAreas,
  onHelpAreasChange,
}: {
  businessKind: string;
  onBusinessKindChange: (id: string) => void;
  teamSize: string;
  onTeamSizeChange: (id: string) => void;
  helpAreas: string[];
  onHelpAreasChange: (ids: string[]) => void;
}) {
  const toggleHelp = (id: string) =>
    onHelpAreasChange(helpAreas.includes(id) ? helpAreas.filter(s => s !== id) : [...helpAreas, id]);

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          Tell me about your business
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          This helps Brain set the right defaults so you don't have to configure everything yourself.
        </p>
      </div>

      {/* What kind of business? */}
      <div className="flex flex-col gap-[10px]">
        <SectionLabel>What kind of business?</SectionLabel>
        <div className="grid grid-cols-2 gap-[12px]" role="radiogroup" aria-label="Business kind">
          {BUSINESS_KINDS.map((k) => {
            const isSel = businessKind === k.id;
            return (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={isSel}
                onClick={() => onBusinessKindChange(k.id)}
                data-testid={`button-business-kind-${k.id}`}
                className={`flex items-center gap-[12px] bg-[#0a0c10] rounded-[12px] px-[14px] py-[14px] border transition-colors text-left ${
                  isSel ? "border-[#7631EE]" : "border-[#1d2132] hover:border-[#2c3247]"
                }`}
              >
                <PurpleRadio selected={isSel} />
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[14px] leading-[18px]">
                  {k.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* How many people */}
      <div className="flex flex-col gap-[10px]">
        <SectionLabel>How many people, including you?</SectionLabel>
        <div className="grid grid-cols-3 gap-[12px]" role="radiogroup" aria-label="Team size">
          {TEAM_SIZES.map((s) => {
            const isSel = teamSize === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={isSel}
                onClick={() => onTeamSizeChange(s.id)}
                data-testid={`button-team-size-${s.id}`}
                className={`flex items-center gap-[10px] bg-[#0a0c10] rounded-[12px] px-[12px] py-[12px] border transition-colors text-left ${
                  isSel ? "border-[#7631EE]" : "border-[#1d2132] hover:border-[#2c3247]"
                }`}
              >
                <PurpleRadio selected={isSel} />
                <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[14px] leading-[18px]">
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* What would you most want Brain to help with first? */}
      <div className="flex flex-col gap-[10px]">
        <SectionLabel>What would you most want Brain to help with first?</SectionLabel>
        <div className="flex flex-col gap-[10px]" role="group" aria-label="Help areas">
          {HELP_AREAS.map((h) => {
            const isSel = helpAreas.includes(h.id);
            return (
              <button
                key={h.id}
                type="button"
                aria-pressed={isSel}
                onClick={() => toggleHelp(h.id)}
                data-testid={`button-help-${h.id}`}
                className={`flex items-start gap-[12px] bg-[#0a0c10] rounded-[12px] px-[14px] py-[12px] border transition-colors text-left ${
                  isSel ? "border-[#7631EE]" : "border-[#1d2132] hover:border-[#2c3247]"
                }`}
              >
                <GreenCheckCircle selected={isSel} />
                <div className="flex-1 min-w-0">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[14px] leading-[18px]">
                    {h.label}
                  </p>
                  <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[12px] leading-[16px] mt-[2px]">
                    {h.sub}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-[#240757] border border-[rgba(118,49,238,0.2)] border-solid flex items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
        <div className="flex flex-1 items-start min-w-px relative">
          <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#7631ee] text-[14px] w-full">
              Based on your answers, Brain will set up vendor payment rules, overdue invoice reminders, and a cash runway view ready to go on your Home screen. You can change everything later.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 6: Autonomy ─── */
function StepAutonomy({
  value,
  onChange,
  shareWithBookkeeper,
  onShareChange,
  bookkeeperEmail,
  onBookkeeperEmailChange,
  bookkeeperRole,
  onBookkeeperRoleChange,
}: {
  value: AutonomyLevel;
  onChange: (v: AutonomyLevel) => void;
  shareWithBookkeeper: boolean;
  onShareChange: (v: boolean) => void;
  bookkeeperEmail: string;
  onBookkeeperEmailChange: (v: string) => void;
  bookkeeperRole: BookkeeperRole;
  onBookkeeperRoleChange: (v: BookkeeperRole) => void;
}) {
  const options: { id: AutonomyLevel; title: string; badge?: { label: string; tone: "muted" | "orange" }; body: string }[] = [
    {
      id: "watch",
      title: "Just watch",
      badge: { label: "Most Cautious", tone: "muted" },
      body: "Brain tracks everything and flags what needs attention, but I approve every payment and transfer myself.",
    },
    {
      id: "routine",
      title: "Handle the routine stuff",
      badge: { label: "Recommended", tone: "orange" },
      body: "Brain pays recurring bills under $500, sends invoice reminders, reconciles transactions, and asks me for anything new or unusual.",
    },
    {
      id: "books",
      title: "Run my books for me",
      body: "Brain also approves vendor payments up to my set limits, runs payroll on payday, handles month-end close, and only escalates the exceptions.",
    },
  ];

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          How much should Brain do on it's own?
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          You can always change this. Most people start in the middle and move the dial over time as they get comfortable.
        </p>
      </div>

      <div className="flex flex-col gap-[10px]" role="radiogroup" aria-label="Autonomy level">
        {options.map((o) => {
          const isSel = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={isSel}
              onClick={() => onChange(o.id)}
              data-testid={`button-autonomy-${o.id}`}
              className={`flex items-start gap-[12px] bg-[#0a0c10] rounded-[14px] p-[16px] border transition-colors text-left ${
                isSel ? "border-[#7631EE]" : "border-[#1d2132] hover:border-[#2c3247]"
              }`}
            >
              <span className="mt-[2px]">
                <PurpleRadio selected={isSel} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-[8px] flex-wrap">
                  <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[15px] leading-[20px]">
                    {o.title}
                  </span>
                  {o.badge && (
                    <span
                      className="[font-family:'Gilroy',sans-serif] font-semibold text-[11px] px-[8px] py-[2px] rounded-[8px]"
                      style={
                        o.badge.tone === "orange"
                          ? { background: "#4a2300", color: "#ff9500" }
                          : { background: "#1d2132", color: "#6c779d" }
                      }
                    >
                      {o.badge.label}
                    </span>
                  )}
                </div>
                <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px] mt-[4px]">
                  {o.body}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bookkeeper card */}
      <div className="bg-[#0a0c10] rounded-[14px] border border-[#1d2132] p-[16px] flex flex-col gap-[12px]">
        <div className="flex items-start gap-[12px]">
          <div className="flex-1 min-w-0">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[15px] leading-[20px]">
              Copy your bookkeeper or accountant?
            </p>
            <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px] mt-[2px]">
              They'll get an email when Brain does something important. They can also approve things for you.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={shareWithBookkeeper}
            aria-label="Copy your bookkeeper or accountant"
            onClick={() => onShareChange(!shareWithBookkeeper)}
            data-testid="switch-bookkeeper-share"
            className="relative shrink-0 h-[24px] w-[40px] flex-shrink-0 transition-all"
            style={{ borderRadius: shareWithBookkeeper ? "100px" : "12px" }}
          >
            <span
              className="absolute h-[20px] left-[2px] rounded-[100px] top-[2px] w-[36px] transition-colors"
              style={{ background: shareWithBookkeeper ? "#123509" : "#222737" }}
            />
            <span
              className="absolute rounded-[100px] size-[16px] top-[4px] transition-all"
              style={{
                background: shareWithBookkeeper ? "#42bf23" : "#06070a",
                left: shareWithBookkeeper ? "20px" : "4px",
              }}
            />
          </button>
        </div>

        {shareWithBookkeeper && (
          <div className="flex gap-[10px]">
            <input
              type="email"
              value={bookkeeperEmail}
              onChange={(e) => onBookkeeperEmailChange(e.target.value)}
              placeholder="e.g. janet@mail.com"
              data-testid="input-bookkeeper-email"
              className="flex-1 min-w-0 bg-[#06070a] border border-[#1d2132] rounded-[10px] px-[12px] py-[10px] [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[14px] placeholder:text-[#414965] focus:outline-none focus:border-[#7631EE]"
            />
            <select
              value={bookkeeperRole}
              onChange={(e) => onBookkeeperRoleChange(e.target.value as BookkeeperRole)}
              data-testid="select-bookkeeper-role"
              className="bg-[#06070a] border border-[#1d2132] rounded-[10px] px-[12px] py-[10px] [font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[14px] focus:outline-none focus:border-[#7631EE]"
            >
              <option value="approver">Approver</option>
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
          </div>
        )}
      </div>

      <div className="bg-[#240757] border border-[rgba(118,49,238,0.2)] border-solid flex items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
        <div className="flex flex-1 items-start min-w-px relative">
          <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#7631ee] text-[14px] w-full">
              You're always in control. Every automatic action shows up in your activity feed with a 60-second window to reverse it. You can also freeze Brain's autonomy any time with one tap.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 7: Here's everyone Brain found ─── */
function StepPeople({
  activeTab,
  onTabChange,
  selected,
  onToggle,
  expandedGroups,
  onToggleExpand,
}: {
  activeTab: "all" | ContactGroupId;
  onTabChange: (id: "all" | ContactGroupId) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  expandedGroups: Set<ContactGroupId>;
  onToggleExpand: (id: ContactGroupId) => void;
}) {
  const visibleGroups = activeTab === "all"
    ? CONTACT_GROUPS
    : CONTACT_GROUPS.filter((g) => g.id === activeTab);

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          Here's everyone Brain found.
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          Pulled from your bank, QuickBooks, Gusto, Ramp, Coinbase Prime and your Base wallet. Brain matched the same people across sources so you see one entry per contact.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-[8px] flex-wrap" role="tablist" aria-label="People filters">
        {PEOPLE_TABS.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(t.id)}
              data-testid={`tab-people-${t.id}`}
              className={`flex items-center gap-[6px] px-[12px] py-[6px] rounded-full border transition-colors ${
                isActive
                  ? "bg-[#4a2300] border-[#ff9500]"
                  : "bg-[#0a0c10] border-[#1d2132] hover:border-[#2c3247]"
              }`}
            >
              <span className={`[font-family:'Gilroy',sans-serif] font-semibold text-[13px] leading-[18px] ${
                isActive ? "text-[#ff9500]" : "text-[#a8b9f4]"
              }`}>
                {t.label}
              </span>
              <span className={`[font-family:'Gilroy',sans-serif] font-semibold text-[11px] leading-none px-[6px] py-[2px] rounded-full ${
                isActive ? "bg-[#06070a] text-[#ff9500]" : "bg-[#1d2132] text-[#6c779d]"
              }`}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-[16px]">
        {visibleGroups.map((g) => {
          const isExpanded = expandedGroups.has(g.id);
          const visibleContacts = isExpanded
            ? g.contacts
            : g.contacts.filter((c) => !c.extra);
          const extraCount = g.contacts.filter((c) => c.extra).length;
          const moreCount = isExpanded
            ? Math.max(0, g.totalHidden - extraCount)
            : g.totalHidden;
          return (
            <div key={g.id} className="flex flex-col gap-[10px]">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold uppercase text-[#6c779d] text-[11px]">
                {g.label}
              </p>
              <div className="flex flex-col gap-[8px]">
                {visibleContacts.map((c) => {
                  const isSel = selected.has(c.id);
                  return (
                    <div
                      key={c.id}
                      className="flex items-start gap-[12px] bg-[#0a0c10] rounded-[12px] px-[14px] py-[12px] border border-[#1d2132]"
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isSel}
                        aria-label={`Select ${c.name}`}
                        onClick={() => onToggle(c.id)}
                        data-testid={`checkbox-contact-${c.id}`}
                        className="shrink-0 mt-[2px]"
                      >
                        <PurpleCheckSquare selected={isSel} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-[8px] flex-wrap">
                          <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[14px] leading-[18px]">
                            {c.name}
                          </span>
                          {c.badge && (
                            <span
                              className="[font-family:'Gilroy',sans-serif] font-semibold text-[10px] px-[6px] py-[1px] rounded-[6px]"
                              style={
                                c.badge.tone === "orange"
                                  ? { background: "#4a2300", color: "#ff9500" }
                                  : { background: "#1d2132", color: "#6c779d" }
                              }
                            >
                              {c.badge.label}
                            </span>
                          )}
                        </div>
                        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[12px] leading-[16px] mt-[2px]">
                          {c.meta}
                        </p>
                      </div>
                      {c.badge?.tone === "orange" && c.badge.label === "Unknown" && (
                        <button
                          type="button"
                          data-testid={`button-add-label-${c.id}`}
                          className="shrink-0 px-[10px] py-[6px] rounded-full bg-[#1d2132] hover:bg-[#2c3247] [font-family:'Gilroy',sans-serif] font-semibold text-[11px] text-[#a8b9f4]"
                        >
                          Add Label
                        </button>
                      )}
                    </div>
                  );
                })}
                {moreCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onToggleExpand(g.id)}
                    data-testid={`button-expand-${g.id}`}
                    className="flex items-center justify-center gap-[6px] bg-[#0a0c10] rounded-[10px] py-[8px] border border-[#1d2132] hover:border-[#2c3247] transition-colors"
                  >
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[12px]">
                      {moreCount} more
                    </span>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={isExpanded ? "rotate-180 transition-transform" : "transition-transform"}>
                      <path d="M2 4L5 7L8 4" stroke="#6c779d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-[#240757] border border-[rgba(118,49,238,0.2)] border-solid flex items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
        <div className="flex flex-1 items-start min-w-px relative">
          <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#7631ee] text-[14px] w-full">
              You're always in control. Every automatic action shows up in your activity feed with a 60-second window to reverse it. You can also freeze Brain's autonomy any time with one tap.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Small shared bits for the new steps ─── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-[10px]">
      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px] whitespace-nowrap">
        {children}
      </p>
      <span className="flex-1 h-px bg-[#1d2132]" />
    </div>
  );
}

function PurpleRadio({ selected }: { selected: boolean }) {
  return (
    <span className={`size-[20px] rounded-full flex items-center justify-center shrink-0 border-2 ${
      selected ? "border-[#7631EE]" : "border-[#2c3247]"
    }`}>
      {selected && <span className="size-[10px] rounded-full bg-[#7631EE]" />}
    </span>
  );
}

function GreenCheckCircle({ selected }: { selected: boolean }) {
  return (
    <span className={`size-[22px] rounded-full flex items-center justify-center shrink-0 mt-[1px] ${
      selected ? "bg-[#123509]" : "border-2 border-[#2c3247]"
    }`}>
      {selected && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6.5L4.8 9L10 3" stroke="#42bf23" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function PurpleCheckSquare({ selected }: { selected: boolean }) {
  return (
    <span className={`size-[20px] rounded-[6px] flex items-center justify-center border-2 ${
      selected ? "bg-[#7631EE] border-[#7631EE]" : "border-[#2c3247]"
    }`}>
      {selected && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6.5L4.8 9L10 3" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/* ─── Shared bits ─── */
function InfoNotice({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="flex items-start gap-[10px] rounded-[12px] border border-[rgba(255,149,0,0.25)] bg-[rgba(74,35,0,0.25)] p-[14px]">
      <span className="size-[18px] rounded-full bg-[#4a2300] flex items-center justify-center shrink-0 mt-[1px]">
        <span className="[font-family:'Gilroy',sans-serif] font-bold text-[11px] text-[#ff9500] leading-none">!</span>
      </span>
      <div className="flex-1 min-w-0">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#ff9500] text-[13px] leading-[18px]">
          {title}
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[13px] leading-[18px] mt-[2px]">
          {body}
        </p>
      </div>
    </div>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-[#0a0c10] rounded-[12px] p-[12px] border border-[#1d2132]">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[20px] leading-[24px]">{value}</p>
      <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[12px] leading-[16px] mt-[2px]">{label}</p>
    </div>
  );
}

function FileStatusIcon({ status }: { status: UploadedFile["status"] }) {
  if (status === "done") {
    return (
      <span className="size-[24px] rounded-full bg-[#123509] flex items-center justify-center shrink-0 mt-[2px]">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6.5L4.8 9L10 3" stroke="#42bf23" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="size-[24px] rounded-full bg-[#4a2300] flex items-center justify-center shrink-0 mt-[2px]">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1L11 10H1L6 1Z" stroke="#ff9500" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M6 5V7" stroke="#ff9500" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="6" cy="8.5" r="0.5" fill="#ff9500" />
        </svg>
      </span>
    );
  }
  // processing
  return (
    <span className="size-[24px] rounded-full border-2 border-[#7631EE] border-t-transparent animate-spin shrink-0 mt-[2px]" />
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileStatusLabel(f: UploadedFile): string {
  const prefix =
    f.status === "done" ? "Processed" :
    f.status === "warning" ? "Needs review" :
    "Reading";
  return f.detail ? `${prefix} · ${f.detail}` : prefix;
}

function processedDetail(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".xls") || lower.endsWith(".xlsx"))
    return "Rows parsed, recurring patterns found";
  if (lower.endsWith(".pdf")) return "Text extracted, key fields detected";
  if (lower.endsWith(".zip")) return "Contents unpacked and read";
  if (lower.match(/\.(png|jpe?g)$/)) return "Image read with OCR";
  return "Read successfully";
}
