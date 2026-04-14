const KNOWN_AGENTS: { names: string[]; avatar: string }[] = [
  { names: ["alphaflow", "alpha flow"],           avatar: "/figmaAssets/avatars-3.svg" },
  { names: ["yield pilot", "yieldpilot"],         avatar: "/figmaAssets/avatars-9.svg" },
  { names: ["risk sentinel", "risksentinel"],     avatar: "/figmaAssets/base.png" },
  { names: ["signal seer", "signalseer"],         avatar: "/figmaAssets/avatars.svg" },
  { names: ["trendradar", "trend radar"],         avatar: "/figmaAssets/avatars-5.svg" },
  { names: ["taskforge", "task forge"],           avatar: "/figmaAssets/avatars-6.svg" },
  { names: ["inboxzero", "inbox zero"],           avatar: "/figmaAssets/avatars-2.svg" },
  { names: ["ops commander", "opscommander"],     avatar: "/figmaAssets/avatars-8.svg" },
  { names: ["pay stream", "paystream"],           avatar: "/figmaAssets/avatars-1.svg" },
  { names: ["invoice bot", "invoicebot"],         avatar: "/figmaAssets/avatars-4.svg" },
  { names: ["deal closer", "dealcloser"],         avatar: "/figmaAssets/pexels-fauxels-3184418.png" },
  { names: ["swarmalpha", "swarm alpha"],         avatar: "/figmaAssets/avatars-7.svg" },
];

export function NotifAvatar({ type, title }: { type: string; title?: string }) {
  const t = type.toLowerCase();
  const combined = `${t} ${(title ?? "").toLowerCase()}`;

  for (const agent of KNOWN_AGENTS) {
    if (agent.names.some((n) => combined.includes(n))) {
      return (
        <img
          src={agent.avatar}
          alt=""
          className="flex-shrink-0 size-[40px] rounded-full object-cover"
        />
      );
    }
  }

  if (combined.includes("deposit")) {
    return (
      <div className="flex-shrink-0 size-[40px] rounded-full flex items-center justify-center" style={{ background: "#123509" }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M16 4L4 16M4 16H10M4 16V10" stroke="#42bf23" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    );
  }

  if (combined.includes("withdraw")) {
    return (
      <div className="flex-shrink-0 size-[40px] rounded-full flex items-center justify-center" style={{ background: "#350011" }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M4 16L16 4M16 4H10M16 4V10" stroke="#d20344" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    );
  }

  if (combined.includes("send")) {
    return (
      <div className="flex-shrink-0 size-[40px] rounded-full flex items-center justify-center" style={{ background: "#091a37" }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M4 10H16M11 5L16 10L11 15" stroke="#5b8def" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    );
  }

  if (combined.includes("exchange") || combined.includes("swap")) {
    return (
      <div className="flex-shrink-0 size-[40px] rounded-full flex items-center justify-center" style={{ background: "#1a1035" }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M4 7H16M16 7L12 3M16 7L12 11" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M16 13H4M4 13L8 9M4 13L8 17" stroke="#a8b9f4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    );
  }

  if (combined.includes("trade") || combined.includes("alpha") || combined.includes("trend") || combined.includes("buy") || combined.includes("sell")) {
    return (
      <div className="flex-shrink-0 size-[40px] rounded-full flex items-center justify-center" style={{ background: "#091a09" }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M3 14l4-5 3 3 4-6 3 3" stroke="#42bf23" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="14" cy="6" r="1.5" fill="#42bf23"/>
        </svg>
      </div>
    );
  }

  if (combined.includes("launch") || combined.includes("swarm") || combined.includes("launchpad") || combined.includes("rocket") || combined.includes("bonding") || combined.includes("install")) {
    return (
      <div className="flex-shrink-0 size-[40px] rounded-full flex items-center justify-center" style={{ background: "#1a1035" }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 2C10 2 6 6 6 11c0 2 1.5 4 4 4s4-2 4-4c0-5-4-9-4-9Z" stroke="#7631ee" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M7.5 12.5C6.5 13 5.5 13.5 5 15" stroke="#7631ee" strokeWidth="1.4" strokeLinecap="round"/>
          <path d="M12.5 12.5C13.5 13 14.5 13.5 15 15" stroke="#7631ee" strokeWidth="1.4" strokeLinecap="round"/>
          <circle cx="10" cy="10" r="1.5" fill="#7631ee"/>
        </svg>
      </div>
    );
  }

  if (combined.includes("risk") || combined.includes("anomaly") || combined.includes("alert") || combined.includes("pause") || combined.includes("threshold") || combined.includes("sentinel") || combined.includes("seer")) {
    return (
      <div className="flex-shrink-0 size-[40px] rounded-full flex items-center justify-center" style={{ background: "#2a1200" }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 3L17.5 16H2.5L10 3Z" stroke="#ff9500" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M10 9v3" stroke="#ff9500" strokeWidth="1.4" strokeLinecap="round"/>
          <circle cx="10" cy="13.5" r="0.75" fill="#ff9500"/>
        </svg>
      </div>
    );
  }

  if (combined.includes("payment") || combined.includes("pay") || combined.includes("transfer") || combined.includes("tx") || combined.includes("transaction")) {
    return (
      <div className="flex-shrink-0 size-[40px] rounded-full flex items-center justify-center" style={{ background: "#0a1929" }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="3" y="5" width="14" height="10" rx="2" stroke="#5b8def" strokeWidth="1.4"/>
          <path d="M3 8.5h14" stroke="#5b8def" strokeWidth="1.4"/>
          <circle cx="7" cy="12" r="1" fill="#5b8def"/>
        </svg>
      </div>
    );
  }

  if (combined.includes("yield") || combined.includes("rebalance") || combined.includes("aave") || combined.includes("compound") || combined.includes("defi") || combined.includes("pilot")) {
    return (
      <div className="flex-shrink-0 size-[40px] rounded-full flex items-center justify-center" style={{ background: "#091818" }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M4 16c1-2 2-4 4-5 2-1 4 0 6-2 1.5-1.5 1.5-4 1.5-4" stroke="#00d4aa" strokeWidth="1.4" strokeLinecap="round"/>
          <path d="M14 5h2v2" stroke="#00d4aa" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="8" cy="13" r="1.2" fill="#00d4aa" opacity="0.6"/>
        </svg>
      </div>
    );
  }

  if (combined.includes("system") || combined.includes("feature") || combined.includes("update") || combined.includes("communit") || combined.includes("reply") || combined.includes("platform")) {
    return (
      <div className="flex-shrink-0 size-[40px] rounded-full flex items-center justify-center" style={{ background: "#141928" }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 3a5 5 0 0 1 3.5 8.5c-.5.5-.8 1.2-.8 1.8V14H7.3v-.7c0-.6-.3-1.3-.8-1.8A5 5 0 0 1 10 3Z" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M7.3 14.5h5.4" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 size-[40px] rounded-full flex items-center justify-center" style={{ background: "#1a1035" }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <ellipse cx="10" cy="10" rx="7" ry="7" stroke="#7631ee" strokeWidth="1.4"/>
        <path d="M7 10c0-1.66 1.34-3 3-3s3 1.34 3 3" stroke="#7631ee" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M10 13v1M10 7V6" stroke="#7631ee" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

export function formatNotifTime(ts: string): string {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs  = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1)  return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24)  return `${hrs}h ago`;
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  } catch {
    return "just now";
  }
}
