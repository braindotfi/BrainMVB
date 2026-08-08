import { createRoot } from "react-dom/client";
import "./index.css";

/* Throwaway visual harness for task #133 (typography scale).
   Renders BEFORE (pre-#133 classes) beside AFTER (current classes) so the
   vertical-rhythm change is judgeable, not just assertable. Delete before commit. */

const Col = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="flex-1 min-w-0 flex flex-col gap-[16px]">
    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-brain-v1purple uppercase tracking-wide">
      {title}
    </p>
    {children}
  </div>
);

const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-brain-v1highlight-dropdown-bg flex flex-col gap-[8px] items-start justify-start p-[16px] relative rounded-panel border border-transparent">
    {children}
  </div>
);

/* ── Overview: KPI card ───────────────────────────────────────────── */
const KpiBefore = () => (
  <Card>
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-30 text-[13px] uppercase">Cash on hand</p>
    <p className="[font-family:'JetBrains_Mono',monospace] leading-[0] relative shrink-0 text-brain-v1baby-blue-100 text-[0px] w-full whitespace-nowrap">
      <span className="font-medium leading-[36px] text-[28px]">$482,915</span>
      <span className="font-medium leading-[36px] text-brain-v1baby-blue-60 text-[18px]">.40</span>
    </p>
    <p className="[font-family:'Gilroy',sans-serif] font-normal leading-[18px] text-[13px] w-full text-brain-v1baby-blue-30">
      Across 4 connected accounts, last synced 12 minutes ago.
    </p>
  </Card>
);

const KpiAfter = () => (
  <Card>
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[16px] text-brain-v1baby-blue-30 text-[12px] uppercase">Cash on hand</p>
    <p className="[font-family:'JetBrains_Mono',monospace] leading-[0] relative shrink-0 text-brain-v1baby-blue-100 text-[0px] w-full whitespace-nowrap">
      <span className="font-medium leading-[36px] text-[28px]">$482,915</span>
      <span className="font-medium leading-[36px] text-brain-v1baby-blue-60 text-[18px]">.40</span>
    </p>
    <p className="[font-family:'Gilroy',sans-serif] font-medium leading-[16px] text-[13px] w-full text-brain-v1baby-blue-30">
      Across 4 connected accounts, last synced 12 minutes ago.
    </p>
  </Card>
);

/* ── Overview: header stack ───────────────────────────────────────── */
const HeaderStack = ({ updatedLeading }: { updatedLeading: string }) => (
  <div className="flex flex-col items-start gap-[4px] relative shrink-0 w-full">
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[24px] text-brain-v1baby-blue-60 text-[20px]">
      Good afternoon, <span className="text-brain-v1baby-blue-100">Damon</span>.
    </p>
    <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[40px] text-brain-v1baby-blue-100 text-[32px]">
      Here's your financial snapshot for today.
    </p>
    <p className={`[font-family:'Gilroy',sans-serif] font-medium ${updatedLeading} text-brain-v1baby-blue-30 text-[16px]`}>
      Updated 3 minutes ago
    </p>
  </div>
);

/* ── Overview: goal progress row ──────────────────────────────────── */
const GoalRow = ({ leading }: { leading: string }) => (
  <div className="flex flex-col gap-[8px] w-full">
    <div className="flex items-center justify-between gap-[12px] w-full">
      <p className="[font-family:'Gilroy',sans-serif] font-semibold leading-[20px] text-brain-v1baby-blue-100 text-[14px] truncate">
        <span>Runway buffer</span>
        <span className="text-brain-v1baby-blue-60 font-medium"> · Reserve</span>
      </p>
      <div className="flex items-center gap-[12px] shrink-0 [font-family:'JetBrains_Mono',monospace] tabular-nums">
        <p className={`text-brain-v1baby-blue-100 text-[14px] ${leading}`}>
          <span className="font-medium">$120,000</span>
          <span className="text-brain-v1baby-blue-60"> of </span>
          <span className="font-medium">$200,000</span>
        </p>
        <p className={`text-brain-v1baby-blue-60 text-[14px] ${leading} w-[36px] text-right`}>60%</p>
      </div>
    </div>
    <div className="h-[6px] w-full rounded-full bg-brain-v1stroke-2 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: "60%", background: "#7631ee" }} />
    </div>
  </div>
);

/* ── The real risk: wrapping 13px prose at leading-16 vs today's 18/20 ── */
const Prose = ({ leading }: { leading: string }) => (
  <Card>
    <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[16px] leading-[20px] text-brain-v1baby-blue-100">
      Payment to Northwind Supply
    </p>
    <p className={`[font-family:'Gilroy',sans-serif] font-medium ${leading} text-brain-v1baby-blue-60 text-[13px] w-full`}>
      This vendor has been paid on the same terms for eleven consecutive months, and
      the amount falls within the range your policy clears automatically. Brain will
      hold it for a second approver because it crosses the review threshold you set
      for this counterparty.
    </p>
    <p className={`[font-family:'Gilroy',sans-serif] font-medium ${leading} text-brain-v1baby-blue-60 text-[13px] w-full`}>
      Matched on counterparty, amount and due day.
    </p>
  </Card>
);

const App = () => (
  <div className="bg-brain-v1baby-blue-5 min-h-screen p-[24px]">
    {/* 420px each — the real width of the centre column between nav and chat panel.
        Inline widths, not Tailwind arbitrary classes: the harness must not depend
        on a CSS rebuild picking up a one-off class. */}
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start", zoom: 0.9 }}>
      <div style={{ width: 420, flexShrink: 0 }}>
        <Col title="Before (pre-#133)">
          <HeaderStack updatedLeading="leading-[22px]" />
          <KpiBefore />
          <Card><GoalRow leading="" /></Card>
          <Prose leading="leading-[18px]" />
        </Col>
      </div>
      <div style={{ width: 420, flexShrink: 0 }}>
        <Col title="After — 13px / leading-16">
          <HeaderStack updatedLeading="leading-[20px]" />
          <KpiAfter />
          <Card><GoalRow leading="leading-[20px]" /></Card>
          <Prose leading="leading-[16px]" />
        </Col>
      </div>
      <div style={{ width: 420, flexShrink: 0 }}>
        <Col title="Alt — 13px / leading-18">
          <div style={{ height: 104 }} />
          <KpiAfter />
          <Card><GoalRow leading="leading-[20px]" /></Card>
          <Prose leading="leading-[18px]" />
        </Col>
      </div>
    </div>
  </div>
);

createRoot(document.getElementById("root")!).render(<App />);
