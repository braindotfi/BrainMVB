import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCurrency } from "@/lib/currencyContext";
import { useAuth } from "@/lib/authContext";

import { ICONS } from "@/assets/figma-icons";
const IMG_DOT = ICONS.activity_dot;
import { INLINE_FIGMA } from "@/assets/inline-figma-icons";
const IMG_INVOICE_BG = INLINE_FIGMA.invoiceBg;
const IMG_INVOICE_ICON = INLINE_FIGMA.invoiceIcon;

function truncateAddress(addr: string): string {
  return addr.length > 16 ? addr.slice(0, 6) + "..." + addr.slice(-4) : addr;
}

const STATIC_ACCOUNTS = [
  { name: "Chase Business Checking", sub: "Your main account",            sub2: "Pays most bills from here",            balance: "$32,523" },
  { name: "Chase Savings",           sub: "Earnings 4.2%",                 sub2: "Brains tops this up from checking",    balance: "$15,000" },
  { name: "Bank Account",            sub: "AE07033...6789",                sub2: "USD operating account via Wirex",      balance: "$12,500" },
  { name: "Yield Agent",             sub: "Auto-deploys idle USDC",        sub2: "Earning ~5.1% APY",                    balance: "$8,250"  },
  { name: "TraderPro",               sub: "Active swing strategy",         sub2: "Up 3.4% this month",                   balance: "$4,180"  },
  { name: "Treasury AI Agent",       sub: "Cash reserves and T-bills",       sub2: "Conservative, capital preservation",   balance: "$12,500" },
  { name: "Account Totals",          sub: "Across bank, crypto and agents",sub2: "",                                     balance: "$86,993" },
];

// ─── brain-core Ledger accounts (via the BFF proxy) ──────────────────────────
// Shape mirrors brain-core's Account schema (subset we render).
type AccountKind = "bank_checking" | "bank_savings" | "card" | "loan" | "line_of_credit" | "onchain" | "payment_processor";
interface BrainAccountDTO {
  id: string;
  name: string;
  account_type: AccountKind;
  currency: string;
  institution?: string | null;
  current_balance?: string | null;
}
interface BrainAccountsResponse {
  accounts: BrainAccountDTO[];
  next_cursor?: string | null;
}

const KIND_LABEL: Record<AccountKind, string> = {
  bank_checking: "Bank checking",
  bank_savings: "Savings",
  card: "Card",
  loan: "Loan",
  line_of_credit: "Line of credit",
  onchain: "On-chain balance",
  payment_processor: "Payment processor",
};

type AccountRow = { name: string; sub: string; sub2: string; balance: string | number };

/** Map brain-core Ledger accounts to the widget's row shape, appending a totals row.
 *  Balances are treated as USD (the demo tenant's source currency); useCurrency().format
 *  converts to the active display currency. */
function mapBrainAccounts(list: BrainAccountDTO[]): AccountRow[] {
  const rows: AccountRow[] = list.map((a) => {
    const label = KIND_LABEL[a.account_type] ?? a.account_type;
    const value = a.current_balance != null ? Number(a.current_balance) : 0;
    return {
      name: a.name,
      sub: a.institution ?? label,
      sub2: a.institution ? label : "",
      balance: Number.isFinite(value) ? value : 0,
    };
  });
  const total = list.reduce((sum, a) => sum + (a.current_balance != null ? Number(a.current_balance) || 0 : 0), 0);
  rows.push({ name: "Account Totals", sub: "Across bank, crypto and agents", sub2: "", balance: total });
  return rows;
}

const EXPENSES = [
  { category: "Payroll (8 people, twice a month)", amount: "$4,800" },
  { category: "Software and Subscriptions", amount: "$1,250" },
  { category: "Rent", amount: "$1,100" },
  { category: "Utilities and Phone", amount: "$380" },
  { category: "Miscellaneous", amount: "$280" },
];

const Divider = () => (
  <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />
);

const WidgetHeader = ({ title }: { title: string }) => (
  <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
    <div className="flex flex-1 items-center min-w-px relative">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">{title}</p>
    </div>
  </div>
);

const WidgetCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
    <WidgetHeader title={title} />
    <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
      <div className="flex flex-col gap-[8px] items-start relative shrink-0 w-full">
        {children}
      </div>
    </div>
  </div>
);

const InvoicesLateBanner = ({ format }: { format: (a: string | number) => string }) => (
  <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
    <div className="border border-[#1d2132] border-solid flex items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
      <div className="flex flex-1 gap-[8px] items-start min-w-px relative">
        <div className="relative shrink-0 size-[16px]">
          <div className="absolute flex items-center justify-center left-0 size-[16px] top-0">
            <div className="-rotate-90 flex-none">
              <div className="relative size-[16px]">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_INVOICE_BG} />
              </div>
            </div>
          </div>
          <div className="absolute left-[2px] size-[12px] top-[2px]">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_INVOICE_ICON} />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-[4px] items-start justify-center min-w-px relative">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-[#ff9500] text-[14px] w-full">2 Invoices are late!</p>
          <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#6c779d] text-[14px] w-full">{format("$4,200")} from Brookside Consulting (12 days late) and {format("$1,800")} from Hartwell Group (8 days late).</p>
        </div>
      </div>
    </div>
  </div>
);

export function FinancesPage() {
  const { format } = useCurrency();
  const { user } = useAuth();

  // Real accounts from brain-core's Ledger (via the BFF proxy at /api/brain/*).
  // The browser never sees a brain-core JWT — the BFF mints it server-side.
  const { data: brainData } = useQuery<BrainAccountsResponse>({
    queryKey: ["/api/brain/ledger/accounts"],
    retry: false,
  });

  // Static fallback (kept so the page renders if brain-core is unreachable or
  // not yet configured). See deliverables/DEAD-CODE-INVENTORY.md.
  const staticAccounts = (() => {
    const walletAddress = user?.walletAddress;
    const cryptoAccount = walletAddress
      ? { name: "Crypto Account", sub: truncateAddress(walletAddress), sub2: "On-chain USDC balance", balance: "$2,040" }
      : { name: "Crypto Account", sub: "0x7cB5...86A8", sub2: "On-chain USDC balance", balance: "$2,040" };
    return [
      STATIC_ACCOUNTS[0], // Chase Business Checking
      STATIC_ACCOUNTS[1], // Chase Savings
      STATIC_ACCOUNTS[2], // Bank Account
      cryptoAccount,
      STATIC_ACCOUNTS[3], // Yield Agent
      STATIC_ACCOUNTS[4], // TraderPro
      STATIC_ACCOUNTS[5], // Treasury AI Agent
      STATIC_ACCOUNTS[6], // Account Totals
    ];
  })();

  const accounts: AccountRow[] =
    brainData?.accounts && brainData.accounts.length > 0
      ? mapBrainAccounts(brainData.accounts)
      : staticAccounts;

  return (
    <div className="bg-[#11141b] border border-[#1d2132] border-solid overflow-hidden relative rounded-[16px] size-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-[40px] items-start pb-[16px] pt-[40px] px-[16px] w-full">

          {/* Header */}
          <div className="flex flex-col items-start relative shrink-0 w-full">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#6c779d] text-[20px] whitespace-nowrap">Your Finances</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-[#a8b9f4] text-[32px] whitespace-nowrap">Here's your financial snapshot right now.</p>
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-[#414965] text-[16px] whitespace-nowrap">Updated 2 minutes ago...</p>
          </div>

          <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">

            {/* Accounts */}
            <WidgetCard title="Accounts">
              {accounts.map((acc, idx) => (
                <div key={acc.name} className="flex flex-col gap-[8px] w-full">
                  <div
                    data-testid={`row-account-${idx}`}
                    className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer"
                  >
                    <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px] whitespace-nowrap">{acc.name}</p>
                      <div className="flex gap-[4px] items-center relative shrink-0">
                        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] whitespace-nowrap">{acc.sub}</p>
                        {acc.sub2 && (
                          <>
                            <div className="relative shrink-0 size-[4px]"><img alt="" className="absolute block inset-0 max-w-none size-full" src={IMG_DOT} /></div>
                            <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px] whitespace-nowrap">{acc.sub2}</p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-center relative shrink-0">
                      <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">{format(acc.balance)}</p>
                    </div>
                  </div>
                  {idx < accounts.length - 1 && <Divider />}
                </div>
              ))}
            </WidgetCard>

            {/* Income */}
            <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
              <WidgetHeader title="Income" />
              <div className="flex flex-col gap-[8px] items-start p-[8px] relative shrink-0 w-full">
                <div className="bg-[#0a0c10] flex flex-col items-start justify-center p-[8px] relative rounded-[8px] shrink-0 w-full">
                  <p className="[font-family:'Gilroy',sans-serif] font-normal leading-[24px] text-[#a8b9f4] text-[16px] w-full">
                    About {format("$18,000")} a month from 12 customers. Your biggest three are Northstar Design, Peterson Legal, and Willow Creek Dental, together about half your revenue.
                  </p>
                </div>
                <Divider />
                <InvoicesLateBanner format={format} />
              </div>
            </div>

            {/* Expenses */}
            <WidgetCard title="Expenses">
              {EXPENSES.map((item, idx) => (
                <div key={item.category} className="flex flex-col gap-[8px] w-full">
                  <div
                    data-testid={`row-expense-${idx}`}
                    className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer"
                  >
                    <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">{item.category}</p>
                    </div>
                    <div className="flex flex-col items-end justify-center relative shrink-0 w-[140px]">
                      <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">{format(item.amount)}</p>
                    </div>
                  </div>
                  <Divider />
                </div>
              ))}
              <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
                <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#6c779d] text-[16px] whitespace-nowrap">Total</p>
                </div>
                <div className="flex flex-col items-end justify-center relative shrink-0 w-[140px]">
                  <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#d20344] text-[18px] text-right whitespace-nowrap">{format("-$7,810")}</p>
                </div>
              </div>
            </WidgetCard>

            {/* Liabilities */}
            <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
              <WidgetHeader title="Liabilities" />
              <div className="flex flex-col items-start p-[8px] relative shrink-0 w-full">
                <div className="bg-[#0a0c10] flex items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
                  <p className="flex-1 [font-family:'Gilroy',sans-serif] font-normal leading-[20px] min-w-px text-[#a8b9f4] text-[16px]">
                    Nothing overdue. Your next bill is the Verizon phone bill for {format("$189")}, due Friday. Brain is asking you about it on the home screen.
                  </p>
                </div>
              </div>
            </div>

            {/* Tip */}
            <div className="bg-[#240757] border border-[rgba(118,49,238,0.2)] border-solid flex items-center p-[8px] relative rounded-[8px] shrink-0 w-full">
              <div className="flex flex-1 items-start min-w-px relative">
                <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                  <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[#7631ee] text-[14px] w-full">
                    Would you like to view the transactions, invoices, or details behind any of the information above? Tap any line above for more information.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
