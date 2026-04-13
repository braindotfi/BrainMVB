import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

/* ─── Data ───────────────────────────────────────────────── */
type Category = "all" | "dining" | "travel" | "shopping" | "entertainment" | "health" | "crypto";

interface Perk {
  id: string;
  partner: string;
  logo: string;
  category: Exclude<Category, "all">;
  badge: string;
  badgeColor: string;
  badgeBg: string;
  title: string;
  description: string;
  expiry: string;
  featured?: boolean;
  new?: boolean;
  activated?: boolean;
}

const PERKS: Perk[] = [
  {
    id: "p1",
    partner: "Uber Eats",
    logo: "🍔",
    category: "dining",
    badge: "20% off",
    badgeColor: "#ff9500",
    badgeBg: "rgba(255,149,0,0.12)",
    title: "20% off every order",
    description: "Enjoy 20% off your first 5 orders each month when paying with your Brain card.",
    expiry: "Expires Dec 31",
    featured: true,
    activated: false,
  },
  {
    id: "p2",
    partner: "Airbnb",
    logo: "🏡",
    category: "travel",
    badge: "$50 credit",
    badgeColor: "#ff6b6b",
    badgeBg: "rgba(255,107,107,0.12)",
    title: "$50 travel credit",
    description: "Get $50 off your next Airbnb stay of $200 or more, booked with your Brain card.",
    expiry: "Expires Mar 31",
    featured: true,
    activated: true,
  },
  {
    id: "p3",
    partner: "Spotify",
    logo: "🎵",
    category: "entertainment",
    badge: "3 months free",
    badgeColor: "#42bf23",
    badgeBg: "rgba(66,191,35,0.12)",
    title: "3 months Spotify Premium",
    description: "New and returning Spotify users get 3 months of Premium free with your Brain card.",
    expiry: "Expires Jan 15",
    new: true,
    activated: false,
  },
  {
    id: "p4",
    partner: "Amazon",
    logo: "📦",
    category: "shopping",
    badge: "5% cashback",
    badgeColor: "#ff9500",
    badgeBg: "rgba(255,149,0,0.12)",
    title: "5% cashback on Amazon",
    description: "Earn 5% cashback on all Amazon purchases, up to $100/month with your Brain card.",
    expiry: "Ongoing",
    activated: true,
  },
  {
    id: "p5",
    partner: "Peloton",
    logo: "🚴",
    category: "health",
    badge: "2 months free",
    badgeColor: "#a78bfa",
    badgeBg: "rgba(167,139,250,0.12)",
    title: "2 months Peloton App+",
    description: "Get 2 months of Peloton App+ free, giving you unlimited fitness classes.",
    expiry: "Expires Feb 28",
    activated: false,
  },
  {
    id: "p6",
    partner: "Coinbase",
    logo: "🪙",
    category: "crypto",
    badge: "$10 BTC",
    badgeColor: "#f59e0b",
    badgeBg: "rgba(245,158,11,0.12)",
    title: "$10 in BTC on sign-up",
    description: "Sign up for Coinbase with your Brain card and earn $10 in Bitcoin after your first trade.",
    expiry: "Ongoing",
    new: true,
    activated: false,
  },
  {
    id: "p7",
    partner: "DoorDash",
    logo: "🛵",
    category: "dining",
    badge: "Free DashPass",
    badgeColor: "#ff6b6b",
    badgeBg: "rgba(255,107,107,0.12)",
    title: "1 year DashPass free",
    description: "Get a free DashPass membership (valued at $96/yr) and save on every order.",
    expiry: "Expires Dec 31",
    activated: false,
  },
  {
    id: "p8",
    partner: "Marriott",
    logo: "🏨",
    category: "travel",
    badge: "10x points",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56,189,248,0.12)",
    title: "10x Marriott Bonvoy points",
    description: "Earn 10x Bonvoy points on every stay when you pay with your Brain card.",
    expiry: "Expires Jun 30",
    activated: true,
  },
  {
    id: "p9",
    partner: "Apple TV+",
    logo: "📺",
    category: "entertainment",
    badge: "6 months free",
    badgeColor: "#a78bfa",
    badgeBg: "rgba(167,139,250,0.12)",
    title: "6 months Apple TV+ free",
    description: "Stream Apple Originals free for 6 months, exclusively for Brain cardholders.",
    expiry: "Expires Apr 30",
    new: true,
    activated: false,
  },
  {
    id: "p10",
    partner: "Nike",
    logo: "👟",
    category: "shopping",
    badge: "15% off",
    badgeColor: "#42bf23",
    badgeBg: "rgba(66,191,35,0.12)",
    title: "15% off Nike.com",
    description: "Save 15% on all full-price items at Nike.com when you pay with your Brain card.",
    expiry: "Expires Mar 15",
    activated: false,
  },
  {
    id: "p11",
    partner: "Calm",
    logo: "🧘",
    category: "health",
    badge: "Free Premium",
    badgeColor: "#38bdf8",
    badgeBg: "rgba(56,189,248,0.12)",
    title: "Calm Premium — 1 year free",
    description: "Reduce stress with unlimited guided meditations. 1 year free for Brain cardholders.",
    expiry: "Expires Dec 31",
    activated: false,
  },
  {
    id: "p12",
    partner: "Ledger",
    logo: "🔐",
    category: "crypto",
    badge: "20% off",
    badgeColor: "#f59e0b",
    badgeBg: "rgba(245,158,11,0.12)",
    title: "20% off Ledger hardware wallets",
    description: "Secure your crypto with a 20% discount on Ledger Nano X or S Plus devices.",
    expiry: "Expires Jan 31",
    activated: false,
  },
];

const CATEGORIES: { id: Category; label: string; emoji: string }[] = [
  { id: "all", label: "All", emoji: "✦" },
  { id: "dining", label: "Dining", emoji: "🍽" },
  { id: "travel", label: "Travel", emoji: "✈️" },
  { id: "shopping", label: "Shopping", emoji: "🛍" },
  { id: "entertainment", label: "Entertainment", emoji: "🎬" },
  { id: "health", label: "Health", emoji: "💪" },
  { id: "crypto", label: "Crypto", emoji: "🪙" },
];

/* ─── Perk Card ──────────────────────────────────────────── */
function PerkCard({
  perk,
  onActivate,
}: {
  perk: Perk;
  onActivate: (id: string) => void;
}) {
  return (
    <div
      data-testid={`perk-card-${perk.id}`}
      className="flex flex-col rounded-[16px] overflow-hidden transition-all hover:border-[#2d3450]"
      style={{
        background: "#0a0c10",
        border: `1px solid ${perk.featured ? "#2a1a5e" : "#1d2132"}`,
        boxShadow: perk.featured ? "0 0 0 1px rgba(118,49,238,0.15), 0 8px 24px rgba(0,0,0,0.3)" : undefined,
      }}
    >
      {/* Card top */}
      <div className="flex flex-col gap-3 p-4">
        {/* Partner row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: "#161b28", border: "1px solid #1d2132" }}
            >
              {perk.logo}
            </div>
            <div>
              <p
                className="text-[11px] leading-none"
                style={{ color: "#414965", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
              >
                {perk.partner}
              </p>
              {perk.new && (
                <span
                  className="inline-block mt-0.5 text-[9px] px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(118,49,238,0.2)", color: "#9d5cf5", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
                >
                  NEW
                </span>
              )}
            </div>
          </div>

          {/* Discount badge */}
          <span
            className="px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
            style={{
              background: perk.badgeBg,
              color: perk.badgeColor,
              border: `1px solid ${perk.badgeColor}22`,
              fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
            }}
          >
            {perk.badge}
          </span>
        </div>

        {/* Title + description */}
        <div>
          <p
            className="text-sm leading-snug mb-1"
            style={{ color: "#c8d4f0", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
          >
            {perk.title}
          </p>
          <p
            className="text-[12px] leading-relaxed"
            style={{ color: "#414965", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
          >
            {perk.description}
          </p>
        </div>
      </div>

      {/* Card footer */}
      <div
        className="flex items-center justify-between px-4 py-3 mt-auto"
        style={{ borderTop: "1px solid #1d2132" }}
      >
        <span
          className="text-[11px]"
          style={{ color: "#414965", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
        >
          {perk.expiry}
        </span>

        <button
          data-testid={`button-activate-${perk.id}`}
          onClick={() => onActivate(perk.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] transition-all hover:opacity-80"
          style={
            perk.activated
              ? {
                  background: "rgba(66,191,35,0.1)",
                  color: "#42bf23",
                  border: "1px solid rgba(66,191,35,0.25)",
                  fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
                }
              : {
                  background: "#4a2300",
                  color: "#ff9500",
                  border: "1px solid rgba(255,149,0,0.15)",
                  fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
                }
          }
        >
          {perk.activated ? (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="#42bf23" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Activated
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 2v8M2 6h8" stroke="#ff9500" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Activate
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ─── Stats strip ────────────────────────────────────────── */
function StatsStrip({ perks }: { perks: Perk[] }) {
  const activated = perks.filter((p) => p.activated).length;
  const total = perks.length;
  return (
    <div
      className="flex items-center gap-6 px-5 py-3 flex-shrink-0"
      style={{ borderBottom: "1px solid #1d2132" }}
    >
      <div className="flex flex-col">
        <span className="text-[11px]" style={{ color: "#414965", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}>Active perks</span>
        <span className="text-base" style={{ color: "#42bf23", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}>{activated} / {total}</span>
      </div>
      <div className="w-px h-8 bg-[#1d2132] flex-shrink-0" />
      <div className="flex flex-col">
        <span className="text-[11px]" style={{ color: "#414965", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}>Est. monthly value</span>
        <span className="text-base" style={{ color: "#c8d4f0", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}>$186</span>
      </div>
      <div className="w-px h-8 bg-[#1d2132] flex-shrink-0" />
      <div className="flex flex-col">
        <span className="text-[11px]" style={{ color: "#414965", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}>Partners</span>
        <span className="text-base" style={{ color: "#c8d4f0", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}>12</span>
      </div>
      <div className="flex-1" />
      {/* New tag */}
      <span
        className="px-2.5 py-1 rounded-full text-[11px]"
        style={{ background: "rgba(118,49,238,0.15)", color: "#9d5cf5", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif", border: "1px solid rgba(118,49,238,0.25)" }}
      >
        3 new this month
      </span>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────── */
export const PerksPage = (): JSX.Element => {
  const [category, setCategory] = useState<Category>("all");
  const [perks, setPerks] = useState<Perk[]>(PERKS);
  const { toast } = useToast();

  const filtered = category === "all" ? perks : perks.filter((p) => p.category === category);

  const handleActivate = (id: string) => {
    const perk = perks.find((p) => p.id === id);
    if (!perk) return;
    setPerks((prev) =>
      prev.map((p) => (p.id === id ? { ...p, activated: !p.activated } : p))
    );
    if (!perk.activated) {
      toast({
        title: `${perk.partner} perk activated!`,
        description: `${perk.title} is now active on your Brain card.`,
      });
    } else {
      toast({ title: `Perk deactivated`, description: `${perk.partner} removed from your active perks.` });
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">

      {/* ── Top bar ── */}
      <div
        className="flex items-center justify-between px-5 py-4 flex-shrink-0"
        style={{ borderBottom: "1px solid #1d2132" }}
      >
        <div className="flex items-center gap-3">
          {/* Gift icon */}
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(118,49,238,0.15)", border: "1px solid rgba(118,49,238,0.25)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M13 7H3v7h10V7Z" stroke="#9d5cf5" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 4H2v3h12V4Z" stroke="#9d5cf5" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 4C8 4 6 4 6 2.5S7 1 8 2c1-1 2 0 2 1.5S8 4 8 4Z" stroke="#9d5cf5" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 4v10" stroke="#9d5cf5" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <h2
              className="text-base leading-tight"
              style={{ color: "#f1f5f9", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
            >
              Perks & Benefits
            </h2>
            <p
              className="text-[11px]"
              style={{ color: "#414965", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
            >
              Exclusive deals for Brain cardholders
            </p>
          </div>
        </div>

        {/* Cardholder badge */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{ background: "rgba(118,49,238,0.12)", border: "1px solid rgba(118,49,238,0.25)" }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1l1.5 3H11L8.25 6l1 3L6 7.25 2.75 9l1-3L1 4h3.5L6 1Z" fill="#9d5cf5"/>
          </svg>
          <span
            className="text-[11px]"
            style={{ color: "#9d5cf5", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
          >
            Premium Cardholder
          </span>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <StatsStrip perks={perks} />

      {/* ── Category tabs ── */}
      <div
        className="flex items-center gap-1 px-4 py-3 flex-shrink-0 overflow-x-auto"
        style={{ borderBottom: "1px solid #1d2132" }}
      >
        {CATEGORIES.map((cat) => {
          const active = category === cat.id;
          return (
            <button
              key={cat.id}
              data-testid={`perks-tab-${cat.id}`}
              onClick={() => setCategory(cat.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all flex-shrink-0"
              style={{
                background: active ? "#240757" : "transparent",
                color: active ? "#9d5cf5" : "#414965",
                border: active ? "1px solid #4a1a9e" : "1px solid transparent",
                fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif",
              }}
            >
              <span>{cat.emoji}</span>
              {cat.label}
              {cat.id !== "all" && (
                <span
                  className="ml-0.5 text-[10px] px-1 py-0.5 rounded-full"
                  style={{
                    background: active ? "rgba(118,49,238,0.3)" : "#161b28",
                    color: active ? "#c4b5fd" : "#414965",
                  }}
                >
                  {perks.filter((p) => p.category === cat.id).length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Perk grid ── */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <span className="text-4xl">🎁</span>
              <p
                className="text-sm"
                style={{ color: "#414965", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
              >
                No perks in this category yet
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((perk) => (
                <PerkCard key={perk.id} perk={perk} onActivate={handleActivate} />
              ))}
            </div>
          )}
        </div>

        {/* Bottom notice */}
        <div className="px-5 pb-5">
          <p
            className="text-[11px] text-center"
            style={{ color: "#2a2f46", fontFamily: "'Plus Jakarta Sans', Helvetica, sans-serif" }}
          >
            Perks are available exclusively to Brain cardholders. Terms and conditions apply for each partner offer.
          </p>
        </div>
      </ScrollArea>
    </div>
  );
};
