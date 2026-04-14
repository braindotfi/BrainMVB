export function NotifAvatar({ type }: { type: string }) {
  const t = type.toLowerCase();

  if (t.includes("trade") || t.includes("alpha") || t.includes("trend") || t.includes("buy") || t.includes("sell")) {
    return (
      <div className="flex-shrink-0 size-[40px] rounded-full flex items-center justify-center" style={{ background: "#091a09" }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M3 14l4-5 3 3 4-6 3 3" stroke="#42bf23" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="14" cy="6" r="1.5" fill="#42bf23"/>
        </svg>
      </div>
    );
  }

  if (t.includes("launch") || t.includes("swarm") || t.includes("launchpad") || t.includes("rocket") || t.includes("bonding") || t.includes("install")) {
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

  if (t.includes("risk") || t.includes("anomaly") || t.includes("alert") || t.includes("pause") || t.includes("threshold") || t.includes("sentinel") || t.includes("seer")) {
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

  if (t.includes("payment") || t.includes("pay") || t.includes("deposit") || t.includes("withdraw") || t.includes("transfer") || t.includes("tx") || t.includes("transaction")) {
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

  if (t.includes("yield") || t.includes("rebalance") || t.includes("aave") || t.includes("compound") || t.includes("defi") || t.includes("pilot")) {
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

  if (t.includes("system") || t.includes("feature") || t.includes("update") || t.includes("communit") || t.includes("reply") || t.includes("platform")) {
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
