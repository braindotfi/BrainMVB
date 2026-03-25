import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMutation } from "@tanstack/react-query";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const suggestedQueries = [
  "What are the top trending AI agents?",
  "Explain how agent tokenomics work",
  "How do I evaluate an AI agent before investing?",
  "What is Brain Finance?",
];

export const AssistantPage = (): JSX.Element => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hello! I'm Brain AI, your intelligent assistant for navigating AI agent markets, DeFi protocols, and crypto trading. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: data.message,
          timestamp: new Date(),
        },
      ]);
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatMutation.isPending]);

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    chatMutation.mutate(
      newMessages.map((m) => ({ role: m.role, content: m.content }))
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-full bg-shared-colorsbaby-blue-5 rounded-3xl border border-solid border-[#1d2131] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#1d2131]">
        <div className="w-10 h-10 bg-brain-v1dark-purple rounded-full flex items-center justify-center flex-shrink-0">
          <div className="w-6 h-6 bg-brain-v1purple rounded-full opacity-80" />
        </div>
        <div>
          <div className="[font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1white text-base">
            Brain AI
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-brain-v1green rounded-full" />
            <span className="[font-family:'Gilroy-Medium',Helvetica] font-medium text-brain-v1baby-blue-60 text-xs">
              Online
            </span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() =>
              setMessages([
                {
                  id: "welcome",
                  role: "assistant",
                  content:
                    "Hello! I'm Brain AI, your intelligent assistant for navigating AI agent markets, DeFi protocols, and crypto trading. How can I help you today?",
                  timestamp: new Date(),
                },
              ])
            }
            className="px-3 py-1.5 bg-brain-v1baby-blue-15 rounded-full [font-family:'Gilroy-SemiBold',Helvetica] font-semibold text-brain-v1baby-blue-60 text-xs hover:bg-brain-v1baby-blue-30 transition-colors"
          >
            New Chat
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            {/* Avatar */}
            {message.role === "assistant" && (
              <div className="w-8 h-8 bg-brain-v1dark-purple rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <div className="w-4 h-4 bg-brain-v1purple rounded-full" />
              </div>
            )}
            {message.role === "user" && (
              <div className="w-8 h-8 bg-brain-v1dark-orange rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="[font-family:'Gilroy-SemiBold',Helvetica] text-white text-xs">
                  A
                </span>
              </div>
            )}

            {/* Bubble */}
            <div className={`flex flex-col max-w-[75%] ${message.role === "user" ? "items-end" : "items-start"}`}>
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed [font-family:'Gilroy-Medium',Helvetica] ${
                  message.role === "user"
                    ? "bg-brain-v1dark-orange text-white rounded-tr-sm"
                    : "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-100 rounded-tl-sm"
                }`}
              >
                {message.content}
              </div>
              <span className="mt-1 text-[10px] text-brain-v1baby-blue-30 [font-family:'Gilroy-Medium',Helvetica]">
                {formatTime(message.timestamp)}
              </span>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
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

        {/* Suggested queries — only on first load */}
        {messages.length === 1 && (
          <div className="flex flex-col gap-2 mt-4">
            <span className="text-xs text-brain-v1baby-blue-30 [font-family:'Gilroy-SemiBold',Helvetica] px-1">
              Suggested questions
            </span>
            <div className="flex flex-wrap gap-2">
              {suggestedQueries.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInput(q);
                    inputRef.current?.focus();
                  }}
                  className="px-3 py-2 bg-brain-v1baby-blue-15 border border-[#1d2131] rounded-xl text-xs [font-family:'Gilroy-Medium',Helvetica] text-brain-v1baby-blue-60 hover:bg-brain-v1baby-blue-30 hover:text-brain-v1white transition-colors text-left"
                >
                  {q}
                </button>
              ))}
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

      {/* Input bar */}
      <div className="px-4 py-4 border-t border-[#1d2131]">
        <div className="flex items-end gap-3 bg-brain-v1baby-blue-15 rounded-2xl border border-[#1d2131] px-4 py-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Brain AI anything about agents, DeFi, or crypto..."
            rows={1}
            className="flex-1 bg-transparent text-brain-v1white text-sm [font-family:'Gilroy-Medium',Helvetica] placeholder-brain-v1baby-blue-30 outline-none resize-none leading-5 max-h-32 overflow-y-auto"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
            className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
              input.trim() && !chatMutation.isPending
                ? "bg-brain-v1dark-orange hover:opacity-80"
                : "bg-brain-v1baby-blue-30 opacity-50 cursor-not-allowed"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M14 8L2 2L5 8L2 14L14 8Z"
                fill="white"
                stroke="white"
                strokeWidth="0.5"
              />
            </svg>
          </button>
        </div>
        <p className="text-center text-[10px] text-brain-v1baby-blue-30 mt-2 [font-family:'Gilroy-Medium',Helvetica]">
          Brain AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
};
