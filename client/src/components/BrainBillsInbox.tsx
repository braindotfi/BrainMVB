import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrency } from "@/lib/currencyContext";
import { BillDetailPopup, type BrainInvoiceDTO as BillDTO } from "@/components/BillDetailPopup";

// ─── brain-core shapes (subset rendered here; via the BFF proxy) ────────────────────────────────────────

interface BrainInvoiceDTO {
  id: string;
  invoice_number: string;
  counterparty_id: string;
  amount_due: string;
  currency: string;
  due_date?: string | null;
  status: string;
  metadata?: { scenario?: string; po?: string | null; flags?: string[] } | null;
}
interface InvoicesResponse {
  invoices: BrainInvoiceDTO[];
}

interface CounterpartyDTO {
  id: string;
  name?: string | null;
}
interface CounterpartiesResponse {
  counterparties: CounterpartyDTO[];
}

function fmtDue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── component ──────────────────────────────────────────────────────────────────────────────

const Divider = () => (
  <div className="h-px shrink-0 w-full" style={{ background: "#1d2132" }} />
);

export function BrainBillsInbox() {
  const { format } = useCurrency();
  const [openBill, setOpenBill] = useState<BrainInvoiceDTO | null>(null);

  const { data: invData } = useQuery<InvoicesResponse>({
    queryKey: ["/api/brain/ledger/invoices"],
    retry: false,
  });
  const { data: cpData } = useQuery<CounterpartiesResponse>({
    queryKey: ["/api/brain/ledger/counterparties"],
    retry: false,
  });

  // AP bills only (seed marks them scenario:"ap"); newest-largest first is fine as-is.
  const bills = (invData?.invoices ?? []).filter((i) => i.metadata?.scenario === "ap");

  const nameOf = (cpId: string): string => {
    const cp = cpData?.counterparties.find((c) => c.id === cpId);
    return cp?.name ?? "Unknown vendor";
  };

  return (
    <div className="bg-[#0a0c10] flex flex-col items-start overflow-clip relative rounded-[16px] shrink-0 w-full">
      {/* Header */}
      <div className="bg-[#0a0c10] border-[#1d2132] border-b border-solid flex items-center justify-between px-[16px] py-[14px] relative shrink-0 w-full">
        <div className="flex flex-1 gap-[8px] items-center min-w-px relative">
          <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[20px] whitespace-nowrap">Bills</p>
          <div className="bg-[#414965] flex flex-col items-center justify-center min-w-[16px] p-[2px] relative rounded-[4px] shrink-0">
            <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[12px] text-[#a8b9f4] text-[12px] text-center whitespace-nowrap">{bills.length}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-[8px] items-start p-[8px] relative shrink-0 w-full">
        {bills.length === 0 && (
          <div className="flex gap-[16px] items-center p-[8px] relative rounded-[8px] shrink-0 w-full bg-[#0a0c10]">
            <p className="flex-1 [font-family:'Gilroy',sans-serif] font-medium leading-[20px] min-w-px text-[#6c779d] text-[16px]">No bills waiting for payment right now.</p>
          </div>
        )}
        {bills.map((bill, idx) => {
          const flags = bill.metadata?.flags ?? [];

          return (
            <div key={bill.id} className="flex flex-col gap-[8px] w-full">
              {/* Bill row — entire card is tappable to open detail popup */}
              <div
                role="button"
                tabIndex={0}
                data-testid={`bill-${bill.invoice_number}`}
                onClick={() => setOpenBill(bill)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenBill(bill); }
                }}
                className="flex gap-[16px] items-center w-full p-[8px] relative rounded-[8px] shrink-0 bg-[#0a0c10] border border-transparent transition-colors hover:bg-[#11141b] hover:border-[#1d2132] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
              >
                <div className="flex flex-1 flex-col items-start justify-center min-w-px relative">
                  <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-[#a8b9f4] text-[16px]">
                    {nameOf(bill.counterparty_id)}
                  </p>
                  <div className="flex gap-[6px] items-center">
                    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[14px]">
                      {bill.invoice_number}
                      {bill.due_date ? ` · due ${fmtDue(bill.due_date)}` : ""}
                    </p>
                    {flags.length > 0 && (
                      <span className="[font-family:'Gilroy',sans-serif] font-semibold leading-[14px] text-[#ff9500] text-[12px]">
                        ⚠ {flags.join(", ").replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                </div>
                <p className="[font-family:'JetBrains_Mono',monospace] font-medium leading-[20px] text-[#a8b9f4] text-[18px] text-right whitespace-nowrap">
                  {format(Number(bill.amount_due))}
                </p>
              </div>
              {idx < bills.length - 1 && <Divider />}
            </div>
          );
        })}
      </div>

      <BillDetailPopup
        bill={openBill as BillDTO | null}
        vendorName={openBill ? nameOf(openBill.counterparty_id) : ""}
        bills={bills as BillDTO[]}
        onSelectBill={(b) => setOpenBill(b as BrainInvoiceDTO)}
        onClose={() => setOpenBill(null)}
      />
    </div>
  );
}
