import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const TOTAL_STEPS = 6;

type UploadedFile = {
  id: string;
  name: string;
  size: number;
  status: "processing" | "done" | "warning";
  detail: string;
};

type Goal = {
  id: string;
  label: string;
};

const GOALS: Goal[] = [
  { id: "home",      label: "Buying a home" },
  { id: "emergency", label: "Emergency Fund" },
  { id: "vacation",  label: "A trip or Vacation" },
  { id: "debt",      label: "Paying Off Debt" },
  { id: "retire",    label: "Retirement" },
  { id: "other",     label: "Something Else" },
];

const BANKS: { id: string; name: string; logo: string; bg: string }[] = [
  { id: "chase",      name: "Chase Bank",      logo: "C",   bg: "#117ACA" },
  { id: "bofa",       name: "Bank of America", logo: "BA",  bg: "#FFFFFF" },
  { id: "wells",      name: "Wells Fargo",     logo: "WF",  bg: "#D71E28" },
  { id: "citi",       name: "Citibank",        logo: "citi",bg: "#FFFFFF" },
  { id: "ally",       name: "Ally",            logo: "a",   bg: "#7B1FA2" },
  { id: "capitalone", name: "Capital One",     logo: "C1",  bg: "#FFFFFF" },
];

type AutonomyLevel = "watch" | "small" | "most";

interface OnboardingFlowProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function OnboardingFlow({ open, onClose, onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [bankSearch, setBankSearch] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>(["home", "emergency"]);
  const [autonomy, setAutonomy] = useState<AutonomyLevel>("small");

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
      setSelectedBank(null);
      setBankSearch("");
      setFiles([]);
      setSelectedGoals(["home", "emergency"]);
      setAutonomy("small");
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
          {/* Header — back, step dots, close */}
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
              className="absolute right-[11px] top-[11px] size-[32px] rounded-full bg-[#222737] flex items-center justify-center hover:bg-[#2c3247] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7631EE]"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1L11 11M11 1L1 11" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </DialogPrimitive.Close>

            <DialogPrimitive.Title className="sr-only">Brain onboarding</DialogPrimitive.Title>
            <DialogPrimitive.Description id="onboarding-description" className="sr-only">
              Step {step + 1} of {TOTAL_STEPS}
            </DialogPrimitive.Description>
          </div>

          {/* Body */}
          <ScrollArea className="w-full max-h-[calc(100vh-32px-56px)]">
            <div className="flex flex-col gap-[24px] p-[24px] w-full">
              {step === 0 && <StepWelcome />}
              {step === 1 && (
                <StepConnectBank
                  selected={selectedBank}
                  onSelect={setSelectedBank}
                  search={bankSearch}
                  onSearchChange={setBankSearch}
                />
              )}
              {step === 2 && <StepUpload files={files} setFiles={setFiles} />}
              {step === 3 && <StepReading files={files} setFiles={setFiles} />}
              {step === 4 && (
                <StepGoals selected={selectedGoals} onChange={setSelectedGoals} />
              )}
              {step === 5 && <StepAutonomy value={autonomy} onChange={setAutonomy} />}

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
          </ScrollArea>
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
function StepConnectBank({
  selected, onSelect, search, onSearchChange,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const filtered = BANKS.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          Let's connect your main account.
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          Brain needs to see your checking account to understand what's coming in and going out. You can add savings, credit cards, and more in a minute.
        </p>
      </div>

      {/* Search */}
      <div className="flex items-center gap-[12px] bg-[#0a0c10] rounded-[12px] px-[16px] h-[44px] border border-[#1d2132]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="#6c779d" strokeWidth="2" />
          <path d="M20 20L17 17" stroke="#6c779d" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search for your bank..."
          data-testid="input-bank-search"
          className="flex-1 bg-transparent outline-none [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] placeholder:text-[#6c779d] text-[16px]"
        />
      </div>

      {/* Bank grid */}
      <div className="grid grid-cols-2 gap-[12px]" role="radiogroup" aria-label="Choose your bank">
        {filtered.map((b) => (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={selected === b.id}
            onClick={() => onSelect(b.id)}
            data-testid={`button-bank-${b.id}`}
            className={`flex items-center gap-[12px] bg-[#0a0c10] rounded-[12px] p-[12px] border transition-colors text-left ${
              selected === b.id
                ? "border-[#7631EE]"
                : "border-[#1d2132] hover:border-[#2c3247]"
            }`}
          >
            <BankLogo bank={b} />
            <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[14px] leading-[18px] truncate">
              {b.name}
            </span>
          </button>
        ))}
      </div>

      <InfoNotice
        title="Secure by default"
        body={
          <>
            Brain never sees or stores your bank password. We connect through Plaid, the same company trusted by Venmo, Robinhood, and American Express. <span className="text-[#a8b9f4] font-semibold">Brain only reads your account</span> — it can't move money unless you later tell it to, per account.
          </>
        }
      />
    </div>
  );
}

function BankLogo({ bank }: { bank: { id: string; name: string; logo: string; bg: string } }) {
  // Solid-color circle with stylized letter — keeps the design self-contained.
  const isLight = ["#FFFFFF"].includes(bank.bg.toUpperCase());
  return (
    <div
      className="size-[32px] rounded-full flex items-center justify-center shrink-0"
      style={{ background: bank.bg, border: isLight ? "1px solid #1d2132" : undefined }}
    >
      <span
        className="[font-family:'Gilroy',sans-serif] font-bold text-[11px] leading-none"
        style={{ color: isLight ? "#11141b" : "#FFFFFF" }}
      >
        {bank.logo}
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
      detail: "Queued — will process when you continue",
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
        title="Brain reads, doesn't share."
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
        title="Brain reads, doesn't share."
        body="Files are encrypted, used only to understand your business, and never shown to anyone else. You can delete any file at any time."
      />
    </div>
  );
}

/* ─── Step 5: Goals ─── */
function StepGoals({
  selected, onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[8px]">
        <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[28px] text-[#a8b9f4] text-[20px]">
          Who are you setting this up for?
        </p>
        <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[20px] text-[#6c779d] text-[16px]">
          This changes a few things about how Brain talks to you and what it focuses on. You can change your mind any time.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-[12px]" role="group" aria-label="Goals">
        {GOALS.map((g) => {
          const isSel = selected.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={isSel}
              onClick={() => toggle(g.id)}
              data-testid={`button-goal-${g.id}`}
              className={`flex items-center gap-[12px] bg-[#0a0c10] rounded-[12px] p-[12px] border transition-colors text-left ${
                isSel ? "border-[#7631EE]/50" : "border-[#1d2132] hover:border-[#2c3247]"
              }`}
            >
              <span className={`size-[24px] rounded-full flex items-center justify-center shrink-0 ${
                isSel ? "bg-[#123509]" : "border-2 border-[#2c3247]"
              }`}>
                {isSel && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6.5L4.8 9L10 3" stroke="#42bf23" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[14px]">
                {g.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-[12px] bg-[rgba(118,49,238,0.15)] border border-[rgba(118,49,238,0.4)] p-[14px]">
        <p className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[13px] leading-[20px]">
          You picked <span className="font-semibold underline">{selected.length} goal{selected.length === 1 ? "" : "s"}</span>. After you finish setup, Brain will suggest starter amounts and timelines based on your income and spending. You can adjust everything.
        </p>
      </div>
    </div>
  );
}

/* ─── Step 6: Autonomy ─── */
function StepAutonomy({
  value, onChange,
}: {
  value: AutonomyLevel;
  onChange: (v: AutonomyLevel) => void;
}) {
  const options: { id: AutonomyLevel; title: string; badge?: { label: string; tone: "muted" | "orange" }; body: string }[] = [
    {
      id: "watch",
      title: "Just watch",
      badge: { label: "Most Cautious", tone: "muted" },
      body: "Brain tracks everything and tells me what's happening, but never moves money or pays anything unless I tap yes.",
    },
    {
      id: "small",
      title: "Handle the small stuff",
      badge: { label: "Recommended", tone: "orange" },
      body: "Brain pays recurring bills I've paid before, moves money toward my goals, and asks me before anything big or new.",
    },
    {
      id: "most",
      title: "Handle most things",
      body: "Brain also moves larger amounts, cancels subscriptions I don't use, and negotiates bills when it can. Only asks about unusual or high-stakes stuff.",
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
              <span className={`size-[20px] rounded-full flex items-center justify-center shrink-0 mt-[2px] border-2 ${
                isSel ? "border-[#7631EE]" : "border-[#2c3247]"
              }`}>
                {isSel && <span className="size-[10px] rounded-full bg-[#7631EE]" />}
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
    </div>
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
