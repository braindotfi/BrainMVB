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

const WELCOME_MSG: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Hello! I'm Brain, your AI assistant. How can I help you today?",
  timestamp: new Date().toISOString(),
};

const newSession = (): ChatSession => ({
  id: `session-${Date.now()}`,
  title: "New Chat",
  messages: [WELCOME_MSG],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// ── Brain avatar SVG ──
const BrainAvatar = () => (
  <div className="w-6 h-6 rounded-full bg-[#1e1b38] flex items-center justify-center flex-shrink-0">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#2a1f4e" />
      <ellipse cx="12" cy="12" rx="5" ry="5" fill="#7631ee" opacity="0.9" />
      <ellipse cx="12" cy="12" rx="2.5" ry="2.5" fill="#b084ff" />
    </svg>
  </div>
);

// ── Action icon buttons below AI messages ──
const ActionButtons = ({ onCopy, content }: { onCopy: () => void; content: string }) => {
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState<null | "up" | "down">(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onCopy();
  };

  return (
    <div className="flex items-center gap-2 mt-3">
      {/* Copy */}
      <button
        onClick={handleCopy}
        title="Copy"
        className="w-6 h-6 rounded-full bg-[#1a1f30] flex items-center justify-center hover:bg-[#222840] transition-colors"
      >
        {copied ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#7631ee" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="3" y="1" width="6" height="7" rx="1" stroke="#6c779d" strokeWidth="1"/>
            <rect x="1" y="3" width="6" height="7" rx="1" fill="#1a1f30" stroke="#6c779d" strokeWidth="1"/>
          </svg>
        )}
      </button>
      {/* Thumbs up */}
      <button
        onClick={() => setLiked(liked === "up" ? null : "up")}
        title="Good response"
        className="w-6 h-6 rounded-full bg-[#1a1f30] flex items-center justify-center hover:bg-[#222840] transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M3 9V4.5L5.5 1L6.5 1.5L5 4.5H9L8.5 9H3ZM1 4.5H2.5V9H1V4.5Z"
            fill={liked === "up" ? "#7631ee" : "none"}
            stroke={liked === "up" ? "#7631ee" : "#6c779d"}
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {/* Thumbs down */}
      <button
        onClick={() => setLiked(liked === "down" ? null : "down")}
        title="Bad response"
        className="w-6 h-6 rounded-full bg-[#1a1f30] flex items-center justify-center hover:bg-[#222840] transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M7 1V5.5L4.5 9L3.5 8.5L5 5.5H1L1.5 1H7ZM9 5.5H7.5V1H9V5.5Z"
            fill={liked === "down" ? "#f97316" : "none"}
            stroke={liked === "down" ? "#f97316" : "#6c779d"}
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {/* Regenerate */}
      <button
        title="Regenerate"
        className="w-6 h-6 rounded-full bg-[#1a1f30] flex items-center justify-center hover:bg-[#222840] transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1.5 5A3.5 3.5 0 0 1 8.5 3M8.5 5A3.5 3.5 0 0 1 1.5 7"
            stroke="#6c779d" strokeWidth="1" strokeLinecap="round"
          />
          <path d="M7 2L8.5 3L7 4" stroke="#6c779d" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3 6L1.5 7L3 8" stroke="#6c779d" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {/* Share */}
      <button
        title="Share"
        className="w-6 h-6 rounded-full bg-[#1a1f30] flex items-center justify-center hover:bg-[#222840] transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <circle cx="8" cy="2" r="1.2" stroke="#6c779d" strokeWidth="0.9"/>
          <circle cx="2" cy="5" r="1.2" stroke="#6c779d" strokeWidth="0.9"/>
          <circle cx="8" cy="8" r="1.2" stroke="#6c779d" strokeWidth="0.9"/>
          <path d="M3.1 4.4L6.9 2.6M3.1 5.6L6.9 7.4" stroke="#6c779d" strokeWidth="0.9"/>
        </svg>
      </button>
    </div>
  );
};

// ── Date separator ──
const DateSeparator = ({ label }: { label: string }) => (
  <div className="flex items-center justify-center gap-1.5 py-1">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="5" stroke="#6c779d" strokeWidth="1"/>
      <path d="M6 3.5V6L7.5 7.5" stroke="#6c779d" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    <span className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-[12px] tracking-[-0.48px]">
      {label}
    </span>
  </div>
);

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

  useEffect(() => {
    const handleNewChat = () => {
      setSession(newSession());
      setInput("");
    };
    window.addEventListener("new-chat", handleNewChat);
    return () => window.removeEventListener("new-chat", handleNewChat);
  }, []);

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
    window.dispatchEvent(new Event("chat-sessions-updated"));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#11141b] rounded-[16px] border border-solid border-[#1d2132] overflow-hidden">

      {/* ── Landing / empty state ── */}
      {isOnlyWelcome ? (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex flex-col flex-1 items-center justify-center gap-10 px-16">
            <div className="w-full max-w-[560px]">
              <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white leading-[40px] text-[32px]">Hi. I'm Brain.</p>
              <p className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#7631ee] leading-[40px] text-[32px]">What can I help you with today?</p>
            </div>

            <div className="flex flex-col gap-2 w-full max-w-[560px]">
              <ChatInputBox
                input={input}
                setInput={setInput}
                onSend={handleSend}
                onKeyDown={handleKeyDown}
                inputRef={inputRef}
                isPending={chatMutation.isPending}
                placeholder="Ask me a question..."
                large
              />
              {/* Quick chips */}
              <div className="flex flex-wrap gap-2 items-center justify-center mt-1">
                {["Send USDT to", "Show last 10 transactions", "Review subscriptions", "My wallet balance"].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleSend(chip)}
                    className="bg-[#1a1f2e] flex items-center justify-center px-[10px] py-1.5 rounded-full hover:bg-[#222840] transition-colors"
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
          {/* ── Active chat header ── */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[#1d2132] flex-shrink-0">
            <BrainAvatar />
            <div className="flex-1 min-w-0">
              <div className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-white text-sm truncate">
                {session.title}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                <span className="[font-family:'Gilroy-Medium',Helvetica] text-[#6c779d] text-[11px]">Online</span>
              </div>
            </div>
            <button
              onClick={handleNewChat}
              className="px-3 py-1.5 bg-[#1a1f30] rounded-full [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-[#6c779d] text-xs hover:bg-[#222840] hover:text-white transition-colors"
            >
              + New Chat
            </button>
          </div>

          {/* ── Message list ── */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pt-4 pb-2 flex flex-col gap-5">

            {/* Date separator at top */}
            <DateSeparator label="Today" />

            {session.messages.map((message) => (
              <div key={message.id}>
                {message.role === "user" ? (
                  /* ── User bubble ── */
                  <div className="flex justify-end">
                    <div
                      className="max-w-[70%] bg-[#7631ee] rounded-xl rounded-tr-sm px-3 py-2"
                    >
                      <p className="[font-family:'Gilroy-Medium',Helvetica] text-white text-[14px] leading-[20px] text-right">
                        {message.content}
                      </p>
                    </div>
                  </div>
                ) : (
                  /* ── AI response ── */
                  <div className="flex items-start gap-3">
                    <BrainAvatar />
                    <div className="flex-1 min-w-0">
                      <div
                        className="[font-family:'Gilroy-Medium',Helvetica] text-[#a8b9f4] text-[14px] leading-[24px] tracking-[-0.64px]"
                        style={{ wordBreak: "break-word" }}
                      >
                        {message.content}
                      </div>
                      {/* Only show action buttons for non-welcome messages */}
                      {message.id !== "welcome" && (
                        <ActionButtons onCopy={() => {}} content={message.content} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {chatMutation.isPending && (
              <div className="flex items-start gap-3">
                <BrainAvatar />
                <div className="flex items-center gap-1 pt-1">
                  <div className="w-1.5 h-1.5 bg-[#6c779d] rounded-full animate-bounce [animation-delay:0ms]" />
                  <div className="w-1.5 h-1.5 bg-[#6c779d] rounded-full animate-bounce [animation-delay:150ms]" />
                  <div className="w-1.5 h-1.5 bg-[#6c779d] rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}

            {chatMutation.isError && (
              <div className="flex justify-center">
                <span className="px-3 py-1 bg-[#3a1020] rounded-full text-[#f87171] text-xs [font-family:'Gilroy-Medium',Helvetica]">
                  Failed to get response. Please try again.
                </span>
              </div>
            )}
          </div>

          {/* ── Input bar ── */}
          <div className="px-4 py-4 border-t border-[#1d2132]">
            <ChatInputBox
              input={input}
              setInput={setInput}
              onSend={handleSend}
              onKeyDown={handleKeyDown}
              inputRef={inputRef}
              isPending={chatMutation.isPending}
              placeholder="Ask Brain anything..."
            />
          </div>
        </>
      )}
    </div>
  );
};

// ── Shared input box ──
const ChatInputBox = ({
  input,
  setInput,
  onSend,
  onKeyDown,
  inputRef,
  isPending,
  placeholder,
  large = false,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: (text?: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  isPending: boolean;
  placeholder: string;
  large?: boolean;
}) => (
  <div className={`bg-[#0d1018] rounded-2xl border border-[#1d2132] focus-within:border-[#2d3350] transition-colors relative overflow-hidden ${large ? "min-h-[96px]" : ""}`}>
    {/* Textarea */}
    <textarea
      ref={inputRef}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      rows={large ? 2 : 1}
      className={`w-full bg-transparent text-white text-[14px] [font-family:'Gilroy-Medium',Helvetica] placeholder-[#6c779d] outline-none resize-none leading-6 px-4 pt-3 ${large ? "pb-12" : "pb-12"}`}
      style={{ fieldSizing: "content" } as React.CSSProperties}
    />
    {/* Bottom action row */}
    <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between">
      {/* Paperclip */}
      <button className="w-8 h-8 rounded-full bg-[#1a1f2e] flex items-center justify-center hover:bg-[#222840] transition-colors flex-shrink-0">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M12 6.5L6.5 12C5.12 13.38 2.88 13.38 1.5 12C0.12 10.62 0.12 8.38 1.5 7L7.5 1C8.46 0.04 10.04 0.04 11 1C11.96 1.96 11.96 3.54 11 4.5L5 10.5C4.45 11.05 3.55 11.05 3 10.5C2.45 9.95 2.45 9.05 3 8.5L8.5 3"
            stroke="#6c779d" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </button>
      {/* Right buttons */}
      <div className="flex items-center gap-2">
        {/* Mic — orange */}
        <button className="w-8 h-8 rounded-full bg-[#4a2300] flex items-center justify-center hover:opacity-80 transition-opacity">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="4.5" y="1" width="5" height="7" rx="2.5" fill="#f97316"/>
            <path d="M2 7.5C2 10.26 4.24 12.5 7 12.5C9.76 12.5 12 10.26 12 7.5" stroke="#f97316" strokeWidth="1.2" strokeLinecap="round"/>
            <line x1="7" y1="12.5" x2="7" y2="13.5" stroke="#f97316" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
        {/* Send — purple */}
        <button
          onClick={() => onSend()}
          disabled={!input.trim() || isPending}
          className="w-8 h-8 rounded-full bg-[#7631ee] flex items-center justify-center hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 7H12M8 3L12 7L8 11" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
);
