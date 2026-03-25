import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  getChatSession,
  saveChatSession,
  generateSessionTitle,
  type ChatSession,
  type ChatMessage,
} from "@/lib/chatHistory";

const suggestedQueries = [
  { icon: "⚡", label: "Top trending AI agents", prompt: "What are the top trending AI agents right now?" },
  { icon: "📊", label: "How agent tokenomics work", prompt: "Explain how agent tokenomics work in simple terms" },
  { icon: "🔍", label: "Evaluate an AI agent", prompt: "How do I evaluate an AI agent before investing?" },
  { icon: "🧠", label: "What is Brain Finance?", prompt: "What is Brain Finance and how does it work?" },
  { icon: "🚀", label: "Launch my own agent", prompt: "How do I create and launch my own AI agent on Brain Finance?" },
  { icon: "🛡", label: "Risk management tips", prompt: "What are the best risk management strategies for AI agent portfolios?" },
];

const WELCOME_MSG: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Hello! I'm Brain AI, your intelligent assistant for navigating AI agent markets, DeFi protocols, and crypto trading. How can I help you today?",
  timestamp: new Date().toISOString(),
};

const newSession = (): ChatSession => ({
  id: `session-${Date.now()}`,
  title: "New Chat",
  messages: [WELCOME_MSG],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const AssistantPage = (): JSX.Element => {
  const [location] = useLocation();
  const [session, setSession] = useState<ChatSession>(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session");
    if (sid) {
      const existing = getChatSession(sid);
      if (existing) return existing;
    }
    return newSession();
  });

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isOnlyWelcome = session.messages.length === 1 && session.messages[0].id === "welcome";

  // Reload session when URL changes (e.g. from history submenu)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session");
    if (sid) {
      const existing = getChatSession(sid);
      if (existing && existing.id !== session.id) {
        setSession(existing);
      }
    }
  }, [location]);

  // Reset to landing state when "new-chat" event is fired
  useEffect(() => {
    const handleNewChat = () => {
      setSession(newSession());
      setInput("");
    };
    window.addEventListener("new-chat", handleNewChat);
    return () => window.removeEventListener("new-chat", handleNewChat);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session.messages]);

  const chatMutation = useMutation({
    mutationFn: async (msgs: { role: string; content: string }[]) => {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs }),
      });
      if (!res.ok) throw new Error("Failed to get response");
      return res.json() as Promise<{ message: string }>;
    },
    onSuccess: (data) => {
      setSession((prev) => {
        const aiMsg: ChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: data.message,
          timestamp: new Date().toISOString(),
        };
        const updated = { ...prev, messages: [...prev.messages, aiMsg], updatedAt: new Date().toISOString() };
        saveChatSession(updated);
        return updated;
      });
    },
  });

  const handleSend = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || chatMutation.isPending) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: msg,
      timestamp: new Date().toISOString(),
    };

    setSession((prev) => {
      const isFirstUserMsg = prev.messages.filter((m) => m.role === "user").length === 0;
      const title = isFirstUserMsg ? generateSessionTitle(msg) : prev.title;
      const updated = {
        ...prev,
        title,
        messages: [...prev.messages, userMsg],
        updatedAt: new Date().toISOString(),
      };
      saveChatSession(updated);
      chatMutation.mutate(updated.messages.map((m) => ({ role: m.role, content: m.content })));
      return updated;
    });

    setInput("");
  };

  const handleNewChat = () => {
    if (!isOnlyWelcome) saveChatSession(session);
    setSession(newSession());
    setInput("");
    // Dispatch event so nav history panel updates
    window.dispatchEvent(new Event("chat-sessions-updated"));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div className="flex flex-col h-full bg-shared-colorsbaby-blue-5 rounded-3xl border border-solid border-[#1d2131] overflow-hidden">

      {/* Landing / empty state */}
      {isOnlyWelcome ? (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Landing header */}
          <div className="flex items-center justify-between px-4 py-4 flex-shrink-0">
            <div className="flex items-center gap-2">
              <button className="w-8 h-8 rounded-full bg-[#0a0c10] flex items-center justify-center hover:bg-[#1d2131] transition-colors flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8L10 12" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button
                onClick={() => inputRef.current?.focus()}
                className="flex items-center gap-2 bg-[#0a0c10] pl-1 pr-3 py-1 rounded-full hover:bg-[#1d2131] transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-brain-v1dark-purple flex items-center justify-center flex-shrink-0">
                  <div className="w-3 h-3 bg-brain-v1purple rounded-full opacity-80" />
                </div>
                <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#6c779d] text-sm whitespace-nowrap">Ask BRAIN...</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleNewChat}
                className="bg-[#240757] px-3 py-2 rounded-full [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#7631ee] text-xs hover:opacity-80 transition-opacity"
              >
                New Chat
              </button>
              <button className="w-8 h-8 rounded-full bg-[#0a0c10] flex items-center justify-center hover:bg-[#1d2131] transition-colors">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="#6c779d"/>
                  <rect x="2" y="7.25" width="8" height="1.5" rx="0.75" fill="#6c779d"/>
                  <rect x="2" y="11.5" width="10" height="1.5" rx="0.75" fill="#6c779d"/>
                </svg>
              </button>
              <button className="w-8 h-8 rounded-full bg-[#0a0c10] flex items-center justify-center hover:bg-[#1d2131] transition-colors">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="4" cy="8" r="1.5" fill="#6c779d"/>
                  <circle cx="12" cy="4" r="1.5" fill="#6c779d"/>
                  <circle cx="12" cy="12" r="1.5" fill="#6c779d"/>
                  <path d="M5.5 7.5L10.5 4.5M5.5 8.5L10.5 11.5" stroke="#6c779d" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Centered content */}
          <div className="flex flex-col flex-1 items-center justify-center gap-10 px-16">
            {/* Headline */}
            <div className="w-full max-w-[560px]">
              <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white leading-[40px] text-[32px]">Hi. I'm Brain.</p>
              <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#7631ee] leading-[40px] text-[32px]">What can I help you with today?</p>
            </div>

            {/* Input + chips */}
            <div className="flex flex-col gap-2 w-full max-w-[560px]">
              {/* Big input field */}
              <div className="bg-[#0a0c10] h-[100px] rounded-2xl relative overflow-hidden">
                {!input && (
                  <div className="absolute left-4 top-[14px] flex items-center gap-1 pointer-events-none">
                    <div className="w-0.5 h-[18px] bg-white/70 rounded-full animate-pulse" />
                    <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#6c779d] text-base ml-1">Ask me a question...</span>
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  className="absolute inset-0 bg-transparent text-white text-base [font-family:'Gilroy-Medium',Helvetica] outline-none resize-none px-4 pt-[14px] pb-12 w-full"
                />
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                  <button className="w-8 h-8 rounded-full bg-[#1d2131] flex items-center justify-center hover:bg-[#222737] transition-colors">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M9.5 5.5A3.5 3.5 0 1 0 5.5 9.5V11a1 1 0 0 0 2 0V9.5A3.5 3.5 0 0 0 9.5 5.5Z" stroke="#6c779d" strokeWidth="1.2"/>
                    </svg>
                  </button>
                  <div className="flex items-center gap-2">
                    <button className="w-8 h-8 rounded-full bg-[#1d2131] flex items-center justify-center hover:bg-[#222737] transition-colors">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 7h10M7 2v10" stroke="#6c779d" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => handleSend()}
                      disabled={!input.trim() || chatMutation.isPending}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${input.trim() && !chatMutation.isPending ? "bg-brain-v1dark-orange hover:opacity-80" : "bg-[#1d2131]"}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M12 7L2 2L4.5 7L2 12L12 7Z" fill={input.trim() && !chatMutation.isPending ? "white" : "#414965"} />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Suggested chips */}
              <div className="flex flex-wrap gap-2 items-center justify-center">
                {["Send USDT to", "Show last 10 transactions", "Review subscriptions", "My wallet balance"].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleSend(chip)}
                    className="bg-[#222737] flex items-center justify-center px-[10px] py-1 rounded-full hover:bg-[#2d3347] transition-colors"
                  >
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#a8b9f4] text-xs whitespace-nowrap">{chip}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Active chat header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[#1d2131] flex-shrink-0">
            <div className="w-10 h-10 bg-brain-v1dark-purple rounded-full flex items-center justify-center flex-shrink-0">
              <div className="w-5 h-5 bg-brain-v1purple rounded-full opacity-80" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-base truncate">
                {session.title}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-brain-v1green rounded-full" />
                <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1baby-blue-60 text-xs">Online</span>
              </div>
            </div>
            <button
              onClick={handleNewChat}
              className="px-3 py-1.5 bg-brain-v1baby-blue-15 rounded-full [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs hover:bg-brain-v1baby-blue-30 transition-colors"
            >
              + New Chat
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {session.messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                {message.role === "assistant" && (
                  <div className="w-8 h-8 bg-brain-v1dark-purple rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <div className="w-4 h-4 bg-brain-v1purple rounded-full" />
                  </div>
                )}
                {message.role === "user" && (
                  <div className="w-8 h-8 bg-brain-v1dark-orange rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-xs">A</span>
                  </div>
                )}
                <div className={`flex flex-col max-w-[75%] ${message.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed [font-family:'Gilroy-Medium',Helvetica] ${
                    message.role === "user"
                      ? "bg-brain-v1dark-orange text-white rounded-tr-sm"
                      : "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-100 rounded-tl-sm"
                  }`}>
                    {message.content}
                  </div>
                  <span className="mt-1 text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
                    {formatTime(message.timestamp)}
                  </span>
                </div>
              </div>
            ))}

            {chatMutation.isPending && (
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-brain-v1dark-purple rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <div className="w-4 h-4 bg-brain-v1purple rounded-full" />
                </div>
                <div className="bg-brain-v1baby-blue-15 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center h-4">
                    <div className="w-1.5 h-1.5 bg-brain-v1baby-blue-60 rounded-full animate-bounce [animation-delay:0ms]" />
                    <div className="w-1.5 h-1.5 bg-brain-v1baby-blue-60 rounded-full animate-bounce [animation-delay:150ms]" />
                    <div className="w-1.5 h-1.5 bg-brain-v1baby-blue-60 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            {chatMutation.isError && (
              <div className="flex justify-center">
                <span className="px-3 py-1 bg-brain-v1dark-pink-red rounded-full text-brain-v1pink-red text-xs [font-family:'Gilroy-Medium',Helvetica]">
                  Failed to get response. Please try again.
                </span>
              </div>
            )}
          </div>

          {/* Input bar in active chat */}
          <div className="px-4 py-4 border-t border-[#1d2131]">
            <LandingInput input={input} setInput={setInput} onSend={handleSend} onKeyDown={handleKeyDown} inputRef={inputRef} isPending={chatMutation.isPending} />
          </div>
        </>
      )}
    </div>
  );
};

const LandingInput = ({
  input,
  setInput,
  onSend,
  onKeyDown,
  inputRef,
  isPending,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  isPending: boolean;
}) => (
  <>
    <div className="flex items-end gap-3 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] px-4 py-3 focus-within:border-[#414965] transition-colors">
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask Brain AI anything about agents, DeFi, or crypto..."
        rows={1}
        className="flex-1 bg-transparent text-brain-v1white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-30 outline-none resize-none leading-5 max-h-32 overflow-y-auto"
        style={{ fieldSizing: "content" } as React.CSSProperties}
      />
      <button
        onClick={onSend}
        disabled={!input.trim() || isPending}
        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
          input.trim() && !isPending
            ? "bg-brain-v1dark-orange hover:opacity-80"
            : "bg-brain-v1baby-blue-30 opacity-50 cursor-not-allowed"
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M14 8L2 2L5 8L2 14L14 8Z" fill="white" stroke="white" strokeWidth="0.5" />
        </svg>
      </button>
    </div>
    <p className="text-center text-[10px] text-brain-v1baby-blue-30 mt-2 [font-family:'Gilroy-Medium',Helvetica]">
      Brain AI can make mistakes. Verify important information.
    </p>
  </>
);
