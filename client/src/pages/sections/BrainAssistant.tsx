import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus,
  ArrowUp,
  ChevronDown,
  Search,
  SquarePen,
} from "lucide-react";
import { TransactionDetailPopup } from "@/components/TransactionDetailPopup";
import { AccountDetailPopup } from "@/components/AccountDetailPopup";
import { BillDetailPopup, type BrainInvoiceDTO } from "@/components/BillDetailPopup";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/lib/currencyContext";
import { useAuth } from "@/lib/authContext";
import { queryClient } from "@/lib/queryClient";
import { openMemberDetail } from "@/lib/membersStore";
import { resolveVendor, openVendorDetail } from "@/lib/openVendorDetail";
import brainLogo from "@assets/Brain_1_1783374797129.png";
import timeIcon from "@assets/Time_1781821466642.png";
import expandBtnIcon from "@assets/Expand_Button_1781817819809.png";
import draftActiveIcon from "@assets/Draft_Active_1781886641614.png";
import draftInactiveIcon from "@assets/Draft_Inactive_1781886641614.png";
import historyActiveIcon from "@assets/History_Active_1781886641612.png";
import historyInactiveIcon from "@assets/History_Inactive_1781886641614.png";
import collapseBtnIcon from "@assets/Collapse_1781818197054.png";
import activeConvoIcon from "@assets/Active_1781818047007.png";
import deleteConvoIcon from "@assets/Delete_1781818067389.png";

interface BrainAssistantProps {
  collapsed: boolean;
  onToggle: () => void;
}

type MessageRole = "user" | "assistant";

/** One grounding record backing an assistant answer (a ledger row / raw artifact). */
interface EvidenceRecord {
  entityId: string;
  entityType: string | null;
  excerpt: string | null;
}

interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  dateTag?: string;
  /** Evidence records (ledger rows / raw artifacts) backing a grounded answer. */
  sources?: EvidenceRecord[];
  /** True when the assistant answered without access to live ledger data. */
  ungrounded?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  status?: "complete" | "fail";
  messages: ChatMessage[];
}

/** Derive the sidebar's grouping label from a session's creation time. */
function sessionGroup(createdAt: number): string {
  const now = new Date();
  const date = new Date(createdAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date >= startOfToday) return "Today";
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfToday.getDay());
  if (date >= startOfWeek) return "This week";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const SUGGESTED_QUESTIONS = [
  "Forecast cash flow",
  "Anything change overnight?",
  "What needs attention?",
  "Show last 10 transactions",
];

/** Post-process text so amounts get thousands separators and the active currency symbol.
 *  Matches:
 *    - $-prefixed or €-prefixed numbers (strips trailing .00000000 garbage)
 *    - "USD " or "EUR " + number (common in ledger excerpts)
 *    - "ETH " + number (native crypto units, trailing zeros stripped)
 *  Always fiat with exactly 2 decimal places; ETH left in native units. */
function formatAmountsInText(text: string, symbol: string): string {
  // 1. $/€-prefixed amounts (no \b — consume all trailing decimal digits).
  const prefixPattern = /(?:\$|€)(?:\d+(?:,\d{3})*|\d+)(?:\.\d+)?/g;

  let out = text.replace(prefixPattern, (match) => {
    // Already comma-formatted and clean — leave it alone.
    if (match.includes(",")) return match;
    const raw = match.slice(1); // strip leading $ or €
    const num = Number(raw);
    if (!Number.isFinite(num)) return match;
    const formatted = num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${symbol}${formatted}`;
  });

  // 2. USD / EUR code amounts → convert to active symbol.
  const fiatCodePattern = /(?:USD|EUR)\s+(\d+(?:,\d{3})*\.?\d*)/g;
  out = out.replace(fiatCodePattern, (_, rawNum: string) => {
    if (rawNum.includes(",")) return `${symbol}${rawNum}`;
    const num = Number(rawNum);
    if (!Number.isFinite(num)) return `${symbol}${rawNum}`;
    const formatted = num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${symbol}${formatted}`;
  });

  // 3. ETH amounts → strip trailing zeros, keep as ETH (native units).
  const ethPattern = /ETH\s+(\d+\.?\d*)/g;
  out = out.replace(ethPattern, (_, rawNum: string) => {
    const num = Number(rawNum);
    if (!Number.isFinite(num)) return `ETH ${rawNum}`;
    // Trim trailing zeros beyond 2 places, keep at least 2 if there's a decimal
    const formatted = num.toLocaleString("en-US", {
      minimumFractionDigits: rawNum.includes(".") ? 2 : 0,
      maximumFractionDigits: 8,
    });
    return `ETH ${formatted}`;
  });

  return out;
}

/**
 * Lightweight markdown-to-JSX for assistant replies.
 * Handles:
 *   - **bold**
 *   - bullet lists (- / *)
 *   - numbered lists (1. / 2.)
 *   - inline code `` `code` ``
 *   - headers (# ## ###)
 *   - paragraph breaks and single-newline line-breaks
 *   - currency amount formatting
 */
function renderRichText(text: string, symbol: string): React.ReactNode {
  const formatted = formatAmountsInText(text, symbol);
  const lines = formatted.split("\n");

  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line -> skip
    if (!trimmed) {
      i++;
      continue;
    }

    // Header (# ## ###)
    const headerMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const sizes = ["text-[15px]", "text-[14px]", "text-[13px]"];
      elements.push(
        <h3 key={i} className={`${sizes[level - 1]} font-semibold text-inherit mt-2 mb-1 [font-family:'Gilroy',sans-serif]`}>
          {renderInlineRich(headerMatch[2])}
        </h3>
      );
      i++;
      continue;
    }

    // Numbered list start
    const numListMatch = trimmed.match(/^(\d+)\.\s+/);
    if (numListMatch) {
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        if (!l) { i++; continue; }
        if (!/^\d+\.\s+/.test(l)) break;
        items.push(l.replace(/^\d+\.\s+/, ""));
        i++;
      }
      elements.push(
        <ol key={`num-${i}`} className="list-decimal pl-4 my-1 space-y-0.5">
          {items.map((item, idx) => (
            <li key={idx} className="text-inherit">
              {renderInlineRich(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Bullet list start
    const bulletMatch = trimmed.match(/^[-*]\s+/);
    if (bulletMatch) {
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        if (!l) { i++; continue; }
        if (!/^[-*]\s+/.test(l)) break;
        items.push(l.replace(/^[-*]\s+/, ""));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc pl-4 my-1 space-y-0.5">
          {items.map((item, idx) => (
            <li key={idx} className="text-inherit">
              {renderInlineRich(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Mixed paragraph that may contain inline bullet-like lines
    // Collect consecutive non-list, non-header lines
    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l) break;
      if (/^#{1,3}\s+/.test(l)) break;
      if (/^\d+\.\s+/.test(l)) break;
      if (/^[-*]\s+/.test(l)) break;
      paraLines.push(l);
      i++;
    }

    if (paraLines.length > 0) {
      const content = paraLines.join(" ");
      elements.push(
        <p key={`p-${i}`} className="mb-1 last:mb-0 text-inherit">
          {renderInlineRich(content)}
        </p>
      );
    }
  }

  return <>{elements}</>;
}

/** Inline rich text: bold, inline code, no block-level processing. */
function renderInlineRich(text: string): React.ReactNode {
  // Process inline code first so `**` inside code isn't treated as bold
  const codeParts = text.split(/(`[^`]+`)/g);
  return codeParts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="bg-[#1a1e2e] px-1 py-[1px] rounded-[4px] text-[#a8b9f4] text-[12px] [font-family:'JetBrains_Mono',monospace]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return renderInlineBold(part, i);
  });
}

/** Convert **bold** segments to <strong> elements. */
function renderInlineBold(text: string, keyBase = 0): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold text-inherit">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

const CANNED_REPLY =
  "I'm Brain, your finance assistant. Live answers are coming soon — for now this is a preview of how I'll help.";

let idCounter = 0;
const nextId = () => `m${++idCounter}`;

export function BrainAssistant({ collapsed, onToggle }: BrainAssistantProps) {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const storageKey = `brain.chat.${user?.id ?? "anon"}`;
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  // Evidence-trail UI: which message has its evidence list expanded, and which
  // record popup is open (null = closed).
  const [openEvidenceFor, setOpenEvidenceFor] = useState<string | null>(null);
  const [openTxId, setOpenTxId] = useState<string | null>(null);
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);
  const [openBillId, setOpenBillId] = useState<string | null>(null);

  // Recent ledger data caches (shared with Finances/Bills) for resolving ids.
  const { data: txData } = useQuery<{ transactions: { id: string }[] }>({
    queryKey: ["/api/brain/ledger/transactions"],
    retry: false,
  });
  const txIds = useMemo(
    () => new Set((txData?.transactions ?? []).map((t) => t.id)),
    [txData],
  );
  const { data: acctData } = useQuery<{ accounts: { id: string; name: string }[] }>({
    queryKey: ["/api/brain/ledger/accounts"],
    retry: false,
  });
  const acctIds = useMemo(
    () => new Set((acctData?.accounts ?? []).map((a) => a.id)),
    [acctData],
  );
  const { data: invData } = useQuery<{ invoices: BrainInvoiceDTO[] }>({
    queryKey: ["/api/brain/ledger/invoices"],
    retry: false,
  });
  const invIds = useMemo(
    () => new Set((invData?.invoices ?? []).map((i) => i.id)),
    [invData],
  );

  const dropdownRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { symbol } = useCurrency();

  const uploadDoc = useMutation({
    mutationFn: async (file: File) => {
      const params = new URLSearchParams({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        category: "general",
        sourceType: "pdf_upload",
      });
      const res = await fetch(`/api/integrations/documents/ingest?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || json?.error || `Upload failed (${res.status})`);
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/documents"] });
      toast({ title: "Document uploaded", description: "Brain will read it and extract what it can." });
    },
    onError: (err: Error) => {
      toast({
        title: "Upload failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const messages = activeSession?.messages ?? [];

  // Hydrate from localStorage whenever the per-user key changes (e.g. login resolves).
  // Gated on auth settling so this never reads/writes the "anon" key mid-resolve and
  // orphans a session created during the auth window (Opus review finding).
  useEffect(() => {
    if (authLoading) return;
    try {
      const raw = localStorage.getItem(storageKey);
      setSessions(raw ? (JSON.parse(raw) as ChatSession[]) : []);
    } catch {
      setSessions([]);
    }
  }, [storageKey, authLoading]);

  // ponytail: localStorage per-device history; move to DB when cross-device history is asked for
  useEffect(() => {
    if (authLoading) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(sessions));
    } catch (err) {
      console.warn("Failed to persist chat sessions", err);
    }
  }, [storageKey, sessions, authLoading]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages.length, activeSessionId]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const startNewSession = () => {
    setActiveSessionId(null);
    setDropdownOpen(false);
    setSearch("");
    setDraft("");
  };

  // Collapsed rail: start a fresh chat and expand the panel.
  const startNewSessionExpanded = () => {
    startNewSession();
    if (collapsed) onToggle();
  };

  // Collapsed rail: expand the panel into the most recent (last) conversation,
  // keeping the current one if one is already active.
  const expandToLastSession = () => {
    setActiveSessionId((cur) => cur ?? sessions[0]?.id ?? null);
    if (collapsed) onToggle();
  };

  // Collapsed rail: expand the panel and open the session history dropdown.
  const openHistoryExpanded = () => {
    if (collapsed) onToggle();
    setDropdownOpen(true);
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setDraft("");

    const userMsg: ChatMessage = { id: nextId(), role: "user", text: trimmed };
    let sessionId = activeSession?.id ?? null;

    // History to send to Claude (messages BEFORE this turn + the new user msg).
    const priorMessages = sessionId
      ? sessions.find((s) => s.id === sessionId)?.messages ?? []
      : [];
    const history = [...priorMessages, userMsg].map((m) => ({
      role: m.role,
      content: m.text,
    }));

    // Optimistically append the user message (creating a session if needed).
    if (sessionId) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, messages: [...s.messages, userMsg] } : s,
        ),
      );
    } else {
      const newSession: ChatSession = {
        id: `session-${nextId()}`,
        title: trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed,
        createdAt: Date.now(),
        messages: [{ ...userMsg, dateTag: "Today" }],
      };
      sessionId = newSession.id;
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
    }

    // Append an empty assistant placeholder (renders a typing indicator).
    const assistantId = nextId();
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? { ...s, messages: [...s.messages, { id: assistantId, role: "assistant", text: "" }] }
          : s,
      ),
    );

    setSending(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json().catch(() => null);
      const reply = (data?.reply as string)?.trim() || CANNED_REPLY;
      const isUngrounded = data?.ungrounded === true;
      // Tolerate both the structured `{entityId,entityType,excerpt}` shape and the
      // legacy bare-string-id shape.
      const sources: EvidenceRecord[] = Array.isArray(data?.sources)
        ? (data.sources as unknown[])
            .map((x): EvidenceRecord | null => {
              if (typeof x === "string") return { entityId: x, entityType: null, excerpt: null };
              if (x && typeof x === "object") {
                const o = x as Record<string, unknown>;
                const id = typeof o.entityId === "string" ? o.entityId : null;
                if (!id) return null;
                return {
                  entityId: id,
                  entityType: typeof o.entityType === "string" ? o.entityType : null,
                  excerpt: typeof o.excerpt === "string" ? o.excerpt : null,
                };
              }
              return null;
            })
            .filter((x): x is EvidenceRecord => x !== null)
        : [];
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, messages: s.messages.map((m) => (m.id === assistantId ? { ...m, text: reply, sources, ungrounded: isUngrounded } : m)) }
            : s,
        ),
      );
    } catch {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantId
                    ? { ...m, text: "Something went wrong reaching the assistant. Please try again." }
                    : m,
                ),
              }
            : s,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const selectSession = (id: string) => {
    setActiveSessionId(id);
    setDropdownOpen(false);
    setSearch("");
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setActiveSessionId((cur) => (cur === id ? null : cur));
  };

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q
      ? sessions.filter((s) => s.title.toLowerCase().includes(q))
      : sessions;
    if (q) {
      return [{ label: "Search Results", items: matched }];
    }
    // Sessions are prepended newest-first, so labels are naturally encountered
    // in the right display order (Today, This week, then months descending).
    const order: string[] = [];
    const seen = new Set<string>();
    for (const s of matched) {
      const label = sessionGroup(s.createdAt);
      if (!seen.has(label)) { seen.add(label); order.push(label); }
    }
    return order.map((label) => ({
      label,
      items: matched.filter((s) => sessionGroup(s.createdAt) === label),
    }));
  }, [sessions, search]);

  const triggerLabel = activeSession ? activeSession.title : "New Chat Session";

  // ── Collapsed rail ─────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="relative w-[54px] h-full rounded-[16px] border border-solid border-[#1d2132] bg-[#11141b] overflow-hidden">
        <div className="flex flex-col gap-[16px] items-start absolute left-[7px] top-[7px] w-[40px]">
          {/* Expand button */}
          <button
            data-testid="button-assistant-expand"
            onClick={expandToLastSession}
            className="size-[40px]"
            title="Expand Brain Assistant"
          >
            <img src={expandBtnIcon} alt="Expand" className="size-[40px] block" />
          </button>

          {/* Divider */}
          <div className="w-full h-px bg-[#1d2132]" />

          {/* Chat group */}
          <div className="flex flex-col gap-[4px] items-start w-full">
            <div className="flex items-center justify-center px-[8px] w-[40px]">
              <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[12px] leading-[16px]">
                Chat
              </span>
            </div>

            <div className="flex flex-col gap-[4px] items-start">
              {/* New chat */}
              <button
                data-testid="button-collapsed-new-session"
                onClick={startNewSessionExpanded}
                className="group relative size-[40px]"
                title="New Chat"
              >
                <img
                  src={draftInactiveIcon}
                  alt=""
                  className="absolute inset-0 size-[40px] block transition-opacity group-hover:opacity-0"
                />
                <img
                  src={draftActiveIcon}
                  alt="New Chat"
                  className="absolute inset-0 size-[40px] block opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>

              {/* History */}
              <button
                data-testid="button-collapsed-history"
                onClick={openHistoryExpanded}
                className="group relative size-[40px]"
                title="History"
              >
                <img
                  src={historyInactiveIcon}
                  alt=""
                  className="absolute inset-0 size-[40px] block transition-opacity group-hover:opacity-0"
                />
                <img
                  src={historyActiveIcon}
                  alt="History"
                  className="absolute inset-0 size-[40px] block opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Expanded panel ─────────────────────────────────────────────
  return (
    <div className="relative w-[390px] h-full rounded-[16px] border border-solid border-[#1d2132] bg-[#11141b] overflow-hidden flex flex-col">
      {/* Header: collapse button + session dropdown */}
      <div className="flex items-center gap-[8px] p-[7px]">
        <button
          data-testid="button-assistant-collapse"
          onClick={onToggle}
          className="flex-shrink-0 size-[40px]"
          title="Collapse Brain Assistant"
        >
          <img src={collapseBtnIcon} alt="Collapse" className="size-[40px] block" />
        </button>

        <div className="relative flex-1 min-w-0" ref={dropdownRef}>
          <button
            data-testid="button-session-dropdown"
            onClick={() => setDropdownOpen((v) => !v)}
            className={`w-full h-[40px] pl-[16px] pr-[4px] flex items-center gap-[8px] rounded-[40px] bg-[#222737] border border-solid transition-colors ${dropdownOpen ? "border-[#414965]" : "border-transparent"}`}
          >
            {!activeSession && (
              <SquarePen className="flex-shrink-0 size-[20px]" color="#a8b9f4" strokeWidth={1.8} />
            )}
            <span className="flex-1 min-w-0 text-left truncate [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[24px]">
              {triggerLabel}
            </span>
            <span className="flex-shrink-0 size-[32px] rounded-full bg-[#1d2132] flex items-center justify-center">
              <ChevronDown className={`size-[18px] transition-transform ${dropdownOpen ? "rotate-180" : ""}`} color="#a8b9f4" strokeWidth={2} />
            </span>
          </button>

          {/* Sessions dropdown */}
          {dropdownOpen && (
            <div className="absolute left-0 top-[calc(100%+4px)] w-full z-[60] bg-[#0a0c10] border border-solid border-[#1d2132] rounded-[12px] p-[8px] flex flex-col gap-[8px] shadow-[0px_68px_13.5px_rgba(0,0,0,0.06),0px_38px_11.5px_rgba(0,0,0,0.2),0px_17px_8.5px_rgba(0,0,0,0.34),0px_4px_4.5px_rgba(0,0,0,0.39)] max-h-[520px] overflow-y-auto">
              {/* New chat session */}
              <button
                data-testid="button-new-session"
                onClick={startNewSession}
                className="w-full flex items-center gap-[8px] p-[8px] rounded-[8px] transition-colors hover:bg-[#11141b]"
              >
                <SquarePen className="flex-shrink-0 size-[24px]" color="#a8b9f4" strokeWidth={1.8} />
                <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[24px]">
                  New Chat Session
                </span>
              </button>

              <div className="h-px w-full bg-[#1d2132]" />

              {/* Search */}
              <div className="w-full flex items-center gap-[8px] p-[8px] rounded-[8px] bg-[#222737]">
                <Search className="flex-shrink-0 size-[24px]" color="#6c779d" strokeWidth={1.8} />
                <input
                  data-testid="input-session-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  className="flex-1 min-w-0 bg-transparent outline-none [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] placeholder:text-[#6c779d] text-[16px] leading-[20px]"
                />
              </div>

              {/* Grouped sessions */}
              {filteredGroups.length === 0 && (
                <div className="px-[8px] py-[6px] [font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[14px]">
                  {sessions.length === 0 ? "No conversations yet" : "No conversations found"}
                </div>
              )}
              {filteredGroups.map((group) => (
                <div key={group.label} className="flex flex-col gap-[8px] w-full">
                  <div className="pl-[8px] [font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[14px] leading-[16px]">
                    {group.label}
                  </div>
                  {group.items.map((session) => (
                    <div
                      key={session.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open conversation: ${session.title}`}
                      data-testid={`button-session-${session.id}`}
                      onClick={() => selectSession(session.id)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectSession(session.id);
                        }
                      }}
                      className={`group w-full flex items-center gap-[8px] p-[8px] rounded-[8px] cursor-pointer transition-colors ${session.id === activeSessionId ? "bg-[#222737]" : "hover:bg-[#222737]"}`}
                    >
                      <span className="flex-1 min-w-0 text-left truncate [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px]">
                        {session.title}
                      </span>

                      {/* Right icon: delete on hover/focus; otherwise active check or status */}
                      <div className="relative flex-shrink-0 size-[20px] flex items-center justify-center">
                        <button
                          type="button"
                          aria-label={`Delete conversation: ${session.title}`}
                          data-testid={`button-delete-session-${session.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.id);
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          title="Delete conversation"
                          className="absolute size-[20px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto transition-opacity"
                        >
                          <img src={deleteConvoIcon} alt="" className="size-[20px] block" />
                        </button>
                        <span className="block group-hover:opacity-0 group-focus-within:opacity-0 transition-opacity">
                          {session.id === activeSessionId ? (
                            <img src={activeConvoIcon} alt="Active conversation" className="size-[20px] block" />
                          ) : null}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div
        ref={bodyRef}
        className="flex-1 min-h-0 mx-[7px] rounded-[12px] bg-[#0a0c10] overflow-y-auto"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-[4px] px-[16px]">
            <img src={brainLogo} alt="Brain" className="size-[72px]" />
            <div className="flex flex-col items-center text-center">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[24px] leading-[32px]">
                Hi, I'm Brain
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-normal text-[#6c779d] text-[18px] leading-[24px]">
                What can I help you with today?
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-[12px] p-[12px]">
            {messages.map((msg) => (
              <div key={msg.id} className="flex flex-col gap-[12px]">
                {msg.dateTag && (
                  <div className="flex items-center justify-center gap-[4px] py-[2px]">
                    <img src={timeIcon} alt="" className="size-[12px] block" />
                    <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[14px]">
                      {msg.dateTag}
                    </span>
                  </div>
                )}
                <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[247px] px-[12px] py-[8px] rounded-[12px] [font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] ${
                      msg.role === "user"
                        ? "bg-[#7631ee] text-white text-right"
                        : "bg-[#222737] text-[#6c779d] text-left"
                    }`}
                  >
                    {msg.role === "assistant" && msg.text === "" ? (
                      <span className="inline-flex gap-[3px] py-[2px]" aria-label="Brain is typing">
                        <span className="size-[6px] rounded-full bg-[#6c779d] animate-bounce [animation-delay:-0.3s]" />
                        <span className="size-[6px] rounded-full bg-[#6c779d] animate-bounce [animation-delay:-0.15s]" />
                        <span className="size-[6px] rounded-full bg-[#6c779d] animate-bounce" />
                      </span>
                    ) : (
                      renderRichText(msg.text, symbol)
                    )}
                  </div>
                </div>
                {msg.role === "assistant" && msg.ungrounded && (
                  <div className="flex items-center gap-[4px] px-[4px] w-full">
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#ff9500] text-[11px] leading-[14px]">
                      Data unavailable
                    </span>
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-[#414965] text-[11px] leading-[14px]">
                      — live ledger connection not ready
                    </span>
                  </div>
                )}
                {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-col items-start gap-[6px] w-full">
                    <button
                      type="button"
                      data-testid="assistant-sources"
                      onClick={() => setOpenEvidenceFor((cur) => (cur === msg.id ? null : msg.id))}
                      className="[font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[11px] leading-[14px] px-[4px] cursor-pointer hover:underline text-left"
                    >
                      Grounded in {msg.sources.length} record{msg.sources.length === 1 ? "" : "s"} from your ledger
                      {openEvidenceFor === msg.id ? " ▾" : " ▸"}
                    </button>
                    {openEvidenceFor === msg.id && (
                      <div className="flex flex-col gap-[4px] w-full pl-[4px]">
                        {msg.sources.map((s, i) => {
                          const text = formatAmountsInText(s.excerpt ?? s.entityId, symbol);
                          const isClickable =
                            (s.entityType === "account" && acctIds.has(s.entityId)) ||
                            (s.entityType === "transaction" && txIds.has(s.entityId)) ||
                            (s.entityType === "invoice" && invIds.has(s.entityId)) ||
                            s.entityType === "member" ||
                            (s.entityType === "counterparty" && !!resolveVendor(s.entityId));
                          return isClickable ? (
                            <button
                              key={`${s.entityId}-${i}`}
                              type="button"
                              data-testid={`evidence-link-${i}`}
                              onClick={() => {
                                if (s.entityType === "account") setOpenAccountId(s.entityId);
                                else if (s.entityType === "transaction") setOpenTxId(s.entityId);
                                else if (s.entityType === "invoice") setOpenBillId(s.entityId);
                                else if (s.entityType === "member") openMemberDetail(s.entityId);
                                else if (s.entityType === "counterparty") openVendorDetail(s.entityId, navigate);
                              }}
                              title={s.entityId}
                              className="[font-family:'Gilroy',sans-serif] font-medium text-[#7631ee] text-[11px] leading-[15px] text-left hover:underline break-words"
                            >
                              {text}
                            </button>
                          ) : (
                            <span
                              key={`${s.entityId}-${i}`}
                              title={s.entityId}
                              className="[font-family:'Gilroy',sans-serif] font-medium text-[#6c779d] text-[11px] leading-[15px] break-words"
                            >
                              {text}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suggested questions */}
      <div className="flex items-center gap-[8px] px-[7px] pt-[12px] pb-[8px] overflow-x-auto">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            data-testid={`button-suggested-${q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`}
            onClick={() => sendMessage(q)}
            className="flex-shrink-0 bg-[#222737] px-[12px] py-[8px] rounded-[100px] transition-colors hover:bg-[#2a3145] [font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[12px] leading-[16px] whitespace-nowrap"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input field */}
      <div className="mx-[7px] mb-[7px] rounded-[12px] bg-[#0a0c10] p-[8px] flex flex-col gap-[10px]">
        <input
          data-testid="input-assistant-message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(draft);
            }
          }}
          placeholder="Ask me a question..."
          className="w-full bg-transparent outline-none px-[8px] pt-[6px] [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] placeholder:text-[#6c779d] text-[16px] leading-[20px]"
        />
        <div className="flex items-center justify-between">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadDoc.mutate(file);
              e.target.value = "";
            }}
          />
          <button
            data-testid="button-assistant-attach"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadDoc.isPending}
            className="size-[32px] rounded-full bg-[#222737] flex items-center justify-center transition-colors hover:bg-[#2a3145] disabled:opacity-50"
            title="Attach a document"
          >
            <Plus className="size-[18px]" color="#a8b9f4" strokeWidth={2} />
          </button>
          <div className="flex items-center gap-[8px]">
            <button
              data-testid="button-assistant-send"
              onClick={() => sendMessage(draft)}
              disabled={!draft.trim() || sending}
              className="size-[32px] rounded-full bg-[#7631ee] flex items-center justify-center transition-opacity disabled:opacity-40 hover:opacity-90"
              title="Send"
            >
              <ArrowUp className="size-[18px]" color="#ffffff" strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>
      <TransactionDetailPopup txId={openTxId} onClose={() => setOpenTxId(null)} hidePager />
      <AccountDetailPopup
        accountId={openAccountId}
        onClose={() => setOpenAccountId(null)}
        onOpenTransaction={(txId) => setOpenTxId(txId)}
        hidePager
      />
      <BillDetailPopup
        bill={invData?.invoices.find((i) => i.id === openBillId) ?? null}
        vendorName="Unknown vendor"
        onClose={() => setOpenBillId(null)}
        hidePager
      />
    </div>
  );
}

export default BrainAssistant;
