import { useState, useRef, useEffect, useMemo } from "react";
import {
  Plus,
  Mic,
  ArrowUp,
  ChevronDown,
  Search,
  SquarePen,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import brainLogo from "@assets/figma_icons/brain/brain_assistant_logo.png";
import timeIcon from "@assets/Time_1781819514942.png";
import expandBtnIcon from "@assets/Expand_Button_1781817819809.png";
import newSessionActiveIcon from "@assets/New_Session_Active_1781817819809.png";
import newSessionInactiveIcon from "@assets/New_Session_Inactive_1781817819807.png";
import historyActiveIcon from "@assets/History_Active_1781817819805.png";
import historyInactiveIcon from "@assets/History_Inactive_1781817819808.png";
import collapseBtnIcon from "@assets/Collapse_1781818197054.png";
import activeConvoIcon from "@assets/Active_1781818047007.png";
import deleteConvoIcon from "@assets/Delete_1781818067389.png";

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

export function BrainAssistant({ collapsed, onToggle }: BrainAssistantProps) {
  const [sessions, setSessions] = useState<ChatSession[]>(SEED_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);

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
        group: "Today",
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
      const res = await apiRequest("POST", "/api/assistant/chat", { messages: history });
      const data = await res.json();
      const reply = (data?.reply as string)?.trim() || CANNED_REPLY;
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, messages: s.messages.map((m) => (m.id === assistantId ? { ...m, text: reply } : m)) }
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
    return GROUP_ORDER.map((label) => ({
      label,
      items: matched.filter((s) => s.group === label),
    })).filter((g) => g.items.length > 0);
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

            <div className="flex flex-col gap-[8px] items-start">
              {/* New chat session */}
              <button
                data-testid="button-collapsed-new-session"
                onClick={startNewSessionExpanded}
                className="group relative size-[40px]"
                title="New Chat Session"
              >
                <img
                  src={newSessionInactiveIcon}
                  alt=""
                  className="absolute inset-0 size-[40px] block transition-opacity group-hover:opacity-0"
                />
                <img
                  src={newSessionActiveIcon}
                  alt="New Chat Session"
                  className="absolute inset-0 size-[40px] block opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>

              {/* Session history */}
              <button
                data-testid="button-collapsed-history"
                onClick={openHistoryExpanded}
                className="group relative size-[40px]"
                title="Chat History"
              >
                <img
                  src={historyInactiveIcon}
                  alt=""
                  className="absolute inset-0 size-[40px] block transition-opacity group-hover:opacity-0"
                />
                <img
                  src={historyActiveIcon}
                  alt="Chat History"
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
                  No conversations found
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
                    <img src={timeIcon} alt="" className="size-[12px] block" />
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
                    {msg.role === "assistant" && msg.text === "" ? (
                      <span className="inline-flex gap-[3px] py-[2px]" aria-label="Brain is typing">
                        <span className="size-[6px] rounded-full bg-[#6c779d] animate-bounce [animation-delay:-0.3s]" />
                        <span className="size-[6px] rounded-full bg-[#6c779d] animate-bounce [animation-delay:-0.15s]" />
                        <span className="size-[6px] rounded-full bg-[#6c779d] animate-bounce" />
                      </span>
                    ) : (
                      msg.text
                    )}
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
              disabled={!draft.trim() || sending}
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
