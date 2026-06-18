import { useState, useRef, useEffect, useMemo } from "react";
import {
  Plus,
  Mic,
  ArrowUp,
  ChevronDown,
  Search,
  Check,
  X,
  CalendarDays,
  SquarePen,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";
import brainLogo from "@assets/figma_icons/brain/brain_assistant_logo.png";

interface BrainAssistantProps {
  collapsed: boolean;
  onToggle: () => void;
}

type MessageRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  dateTag?: string;
}

interface ChatSession {
  id: string;
  title: string;
  group: string;
  status?: "complete" | "fail";
  messages: ChatMessage[];
}

const SUGGESTED_QUESTIONS = [
  "What is BTC?",
  "My wallet balance",
  "Show last 10 transactions",
];

const CANNED_REPLY =
  "I'm Brain, your finance assistant. Live answers are coming soon — for now this is a preview of how I'll help.";

let idCounter = 0;
const nextId = () => `m${++idCounter}`;

const SEED_SESSIONS: ChatSession[] = [
  {
    id: "balance-inquiry",
    title: "Balance Inquiry",
    group: "Today",
    messages: [
      { id: nextId(), role: "user", text: "What's was my balance three days ago?", dateTag: "Wed, 11 Sep" },
      { id: nextId(), role: "assistant", text: "Your balance on Wed, 8 Sept was $62,359.24" },
      { id: nextId(), role: "user", text: "Brain, can we afford to hire two more engineers this quarter?", dateTag: "Today" },
      {
        id: nextId(),
        role: "assistant",
        text: "Yes, but only if you keep monthly cloud spend under $42k and collect the $180k in overdue invoices by July 15. Otherwise, hiring both would shorten your runway from 11 months to 7 months. I recommend hiring one employee now, delaying the second hire by 45 days, and sending invoice follow-ups today.",
      },
    ],
  },
  {
    id: "explain-crypto",
    title: "Explain crypto currency in simple terms",
    group: "Today",
    status: "complete",
    messages: [
      { id: nextId(), role: "user", text: "Explain crypto currency in simple terms", dateTag: "Today" },
      { id: nextId(), role: "assistant", text: "Cryptocurrency is digital money secured by cryptography and recorded on a shared public ledger (the blockchain), so no single bank controls it." },
    ],
  },
  {
    id: "last-10-tx",
    title: "Show last 10 transactions",
    group: "Jun 2026",
    messages: [
      { id: nextId(), role: "user", text: "Show last 10 transactions", dateTag: "Jun 2026" },
      { id: nextId(), role: "assistant", text: "Here are your last 10 transactions across all connected accounts." },
    ],
  },
  {
    id: "send-btc",
    title: "Send 0.0012 BTC to @Jane9245",
    group: "Jun 2026",
    status: "fail",
    messages: [
      { id: nextId(), role: "user", text: "Send 0.0012 BTC to @Jane9245", dateTag: "Jun 2026" },
      { id: nextId(), role: "assistant", text: "That transfer could not be completed — the recipient handle could not be verified." },
    ],
  },
  {
    id: "market-today",
    title: "Whats the market looking like today, also ...",
    group: "Jun 2026",
    messages: [
      { id: nextId(), role: "user", text: "What's the market looking like today?", dateTag: "Jun 2026" },
      { id: nextId(), role: "assistant", text: "Markets are mixed today. BTC is up 1.2% and ETH is flat over the last 24 hours." },
    ],
  },
  {
    id: "assets-to-buy",
    title: "Which assets should I consider buying?",
    group: "Jun 2026",
    messages: [
      { id: nextId(), role: "user", text: "Which assets should I consider buying?", dateTag: "Jun 2026" },
      { id: nextId(), role: "assistant", text: "I can't give financial advice, but I can show you trending assets and your watchlist performance." },
    ],
  },
  {
    id: "meme-coins",
    title: "What are meme coins?",
    group: "Jun 2026",
    messages: [
      { id: nextId(), role: "user", text: "What are meme coins?", dateTag: "Jun 2026" },
      { id: nextId(), role: "assistant", text: "Meme coins are cryptocurrencies inspired by internet memes or jokes. They're highly volatile and largely driven by community hype." },
    ],
  },
];

const GROUP_ORDER = ["Today", "Jun 2026"];

function StatusBadge({ status }: { status: "complete" | "fail" }) {
  if (status === "complete") {
    return (
      <div className="flex-shrink-0 size-[20px] rounded-full flex items-center justify-center" style={{ background: "#1f3d2b" }}>
        <Check className="size-[12px]" strokeWidth={2.5} color="#34d27b" />
      </div>
    );
  }
  return (
    <div className="flex-shrink-0 size-[20px] rounded-full flex items-center justify-center" style={{ background: "#3d1f24" }}>
      <X className="size-[12px]" strokeWidth={2.5} color="#f4607a" />
    </div>
  );
}

export function BrainAssistant({ collapsed, onToggle }: BrainAssistantProps) {
  const [sessions, setSessions] = useState<ChatSession[]>(SEED_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");

  const dropdownRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const messages = activeSession?.messages ?? [];

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

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (activeSession) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? {
                ...s,
                messages: [
                  ...s.messages,
                  { id: nextId(), role: "user", text: trimmed },
                  { id: nextId(), role: "assistant", text: CANNED_REPLY },
                ],
              }
            : s,
        ),
      );
    } else {
      const newSession: ChatSession = {
        id: `session-${nextId()}`,
        title: trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed,
        group: "Today",
        messages: [
          { id: nextId(), role: "user", text: trimmed, dateTag: "Today" },
          { id: nextId(), role: "assistant", text: CANNED_REPLY },
        ],
      };
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
    }
    setDraft("");
  };

  const selectSession = (id: string) => {
    setActiveSessionId(id);
    setDropdownOpen(false);
    setSearch("");
  };

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q
      ? sessions.filter((s) => s.title.toLowerCase().includes(q))
      : sessions;
    if (q) {
      return [{ label: "Search Results", items: matched }];
    }
    return GROUP_ORDER.map((label) => ({
      label,
      items: matched.filter((s) => s.group === label),
    })).filter((g) => g.items.length > 0);
  }, [sessions, search]);

  const triggerLabel = activeSession ? activeSession.title : "New Chat Session";

  // ── Collapsed rail ─────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="relative w-[56px] h-full rounded-[16px] border border-[#1d2132] bg-[#11141b] flex flex-col items-center py-[7px] gap-[12px]">
        <button
          data-testid="button-assistant-expand"
          onClick={onToggle}
          className="size-[40px] rounded-[12px] bg-[#222737] flex items-center justify-center transition-colors hover:bg-[#2a3145]"
          title="Expand Brain Assistant"
        >
          <PanelRightOpen className="size-[20px]" color="#a8b9f4" strokeWidth={1.8} />
        </button>
        <img src={brainLogo} alt="Brain" className="size-[32px] mt-[4px]" />
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
          className="flex-shrink-0 size-[40px] rounded-[12px] bg-[#222737] flex items-center justify-center transition-colors hover:bg-[#2a3145]"
          title="Collapse Brain Assistant"
        >
          <PanelRightClose className="size-[20px]" color="#a8b9f4" strokeWidth={1.8} />
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
              <div className="w-full flex items-center gap-[8px] p-[8px] rounded-[8px] bg-[#222737] border border-solid border-[#414965]">
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
                  No conversations found
                </div>
              )}
              {filteredGroups.map((group) => (
                <div key={group.label} className="flex flex-col gap-[8px] w-full">
                  <div className="pl-[8px] [font-family:'Gilroy',sans-serif] font-semibold text-[#414965] text-[14px] leading-[16px]">
                    {group.label}
                  </div>
                  {group.items.map((session) => (
                    <button
                      key={session.id}
                      data-testid={`button-session-${session.id}`}
                      onClick={() => selectSession(session.id)}
                      className={`w-full flex items-center gap-[8px] p-[8px] rounded-[8px] transition-colors ${session.id === activeSessionId ? "bg-[#222737]" : "hover:bg-[#11141b]"}`}
                    >
                      <span className="flex-1 min-w-0 text-left truncate [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] text-[16px] leading-[20px]">
                        {session.title}
                      </span>
                      {session.status && <StatusBadge status={session.status} />}
                    </button>
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
          <div className="h-full flex flex-col items-center justify-center gap-[16px] px-[16px]">
            <img src={brainLogo} alt="Brain" className="size-[48px]" />
            <div className="flex flex-col items-center text-center">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-[#a8b9f4] text-[24px] leading-[32px] tracking-[-0.96px]">
                Hi, I'm Brain
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-normal text-[#6c779d] text-[18px] leading-[24px] tracking-[-0.72px]">
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
                    <CalendarDays className="size-[12px]" color="#6c779d" strokeWidth={2} />
                    <span className="[font-family:'Gilroy',sans-serif] font-semibold text-[#6c779d] text-[12px] leading-[14px] tracking-[-0.48px]">
                      {msg.dateTag}
                    </span>
                  </div>
                )}
                <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[247px] px-[12px] py-[8px] rounded-[12px] [font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] tracking-[-0.56px] ${
                      msg.role === "user"
                        ? "bg-[#7631ee] text-white text-right"
                        : "bg-[#222737] text-[#6c779d] text-left"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
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
          className="w-full bg-transparent outline-none px-[8px] pt-[6px] [font-family:'Gilroy',sans-serif] font-medium text-[#a8b9f4] placeholder:text-[#6c779d] text-[16px] leading-[20px] tracking-[-0.64px]"
        />
        <div className="flex items-center justify-between">
          <button
            data-testid="button-assistant-attach"
            className="size-[32px] rounded-full bg-[#222737] flex items-center justify-center transition-colors hover:bg-[#2a3145]"
            title="Attach"
          >
            <Plus className="size-[18px]" color="#a8b9f4" strokeWidth={2} />
          </button>
          <div className="flex items-center gap-[8px]">
            <button
              data-testid="button-assistant-mic"
              className="size-[32px] rounded-full bg-[#222737] flex items-center justify-center transition-colors hover:bg-[#2a3145]"
              title="Voice"
            >
              <Mic className="size-[18px]" color="#a8b9f4" strokeWidth={2} />
            </button>
            <button
              data-testid="button-assistant-send"
              onClick={() => sendMessage(draft)}
              disabled={!draft.trim()}
              className="size-[32px] rounded-full bg-[#7631ee] flex items-center justify-center transition-opacity disabled:opacity-40 hover:opacity-90"
              title="Send"
            >
              <ArrowUp className="size-[18px]" color="#ffffff" strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BrainAssistant;
