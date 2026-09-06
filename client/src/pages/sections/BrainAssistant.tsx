import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus,
  ArrowUp,
  ChevronDown,
  Search,
  SquarePen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransactionDetailPopup } from "@/components/TransactionDetailPopup";
import { AccountDetailPopup } from "@/components/AccountDetailPopup";
import { BillDetailPopup, type BrainInvoiceDTO } from "@/components/BillDetailPopup";
import { useToast } from "@/hooks/use-toast";
import { reportRateLimit } from "@/lib/rateLimit";
import { useCurrency } from "@/lib/useCurrency";
import { useAuth } from "@/lib/authContext";
import { queryClient } from "@/lib/queryClient";
import {
  DOCUMENT_ACCEPT,
  isSupportedDocumentFile,
  sourceTypeForDocument,
} from "@/lib/documentUpload";
import { openMemberDetail } from "@/lib/membersStore";
import { useSuggestedQuestions, resolveSuggestionChips } from "@/lib/brainSuggestedQuestions";
import { resolveVendor, openVendorDetail } from "@/lib/openVendorDetail";
import { parseAssistantResponse, trimChatHistory, buildChatPayload, filterPayloadMessages, buildTruncationNote, ASSISTANT_GENERIC_ERROR, CHAT_HISTORY_LIMIT, MESSAGE_CONTENT_LIMIT } from "@/lib/assistantChat";
import { isAssistantBulletLine, stripAssistantBullet } from "@/lib/assistantFormatting";
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
  /** Evidence can be present even when the assistant could not produce an answer. */
  answerStatus?: "answered" | "no_answer" | "error";
  /** Operational failure, distinct from a valid no-answer result. */
  answerError?: boolean;
  /** True when the assistant answered without access to live ledger data. */
  ungrounded?: boolean;
  /** True for synthetic inline notes (e.g. truncation warnings) — rendered
   *  differently from user/assistant bubbles and never sent to the server. */
  isContextNote?: boolean;
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

/** Stand-in chips, used ONLY when brain-core returns nothing eligible for this
 *  tenant or the read fails. Deliberately the four strings this component
 *  already shipped — each was vetted against a real backend capability (note
 *  "Show recent cash flow", chosen over "Forecast cash flow" because
 *  /ledger/cash_flows is trailing-actuals only). No new suggestion copy may be
 *  added here: a hand-authored chip is exactly the failure mode the live
 *  endpoint exists to remove. Anything tenant-specific must come from
 *  useSuggestedQuestions(). */
const FALLBACK_QUESTIONS = [
  "Show recent cash flow",
  "Anything change overnight?",
  "What needs attention?",
  "Show last 10 transactions",
] as const;

/** Extra chips shown ONLY while a Developers subpage is active — they submit
 *  real prompts through the same assistant pipe as any typed message. */
const DEVELOPER_QUESTIONS = [
  "Run a test call",
  "Show my usage this month",
];

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
function renderRichText(text: string, formatText: (t: string) => string): React.ReactNode {
  const formatted = formatText(text);
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
      // Markdown headings ride the same scale as the rest of the app: a
      // standalone title at 16/24, then the label and dense-description steps.
      const sizes = [
        "text-[16px] leading-[24px]",
        "text-[14px] leading-[20px]",
        "text-[13px] leading-[18px]",
      ];
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
    if (isAssistantBulletLine(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        if (!l) { i++; continue; }
        if (!isAssistantBulletLine(l)) break;
        items.push(stripAssistantBullet(l));
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
      if (isAssistantBulletLine(l)) break;
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
        <code key={i} className="bg-brain-v1stroke-2 px-1 py-[1px] rounded-[4px] text-brain-v1baby-blue-100 text-[12px] leading-[16px] [font-family:'JetBrains_Mono',monospace]">
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

/**
 * Width of the widest laid-out line inside `el`.
 *
 * Rects are grouped by their `top` coordinate so a line split across several
 * text nodes (e.g. "total is **$4,200** due") is measured as one line rather
 * than as its separate fragments.
 */
function widestLineWidth(el: HTMLElement): number {
  const range = document.createRange();
  const lines = new Map<number, { left: number; right: number }>();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue || !node.nodeValue.trim()) continue;
    range.selectNodeContents(node);
    for (const r of Array.from(range.getClientRects())) {
      if (r.width === 0) continue;
      const key = Math.round(r.top);
      const cur = lines.get(key);
      if (cur) {
        cur.left = Math.min(cur.left, r.left);
        cur.right = Math.max(cur.right, r.right);
      } else {
        lines.set(key, { left: r.left, right: r.right });
      }
    }
  }
  let widest = 0;
  for (const { left, right } of lines.values()) {
    widest = Math.max(widest, right - left);
  }
  return widest;
}

/**
 * Chat bubble that hugs its text the way iMessage does.
 *
 * CSS cannot do this on its own: once text wraps, a box with `max-width`
 * keeps the full max-width even when every laid-out line is shorter, and
 * `fit-content` / `inline-block` / `display:table` all resolve to
 * `min(max-content, available)` — the same 75%. So we let the browser wrap
 * at max-width, measure the resulting line boxes, then pin the box to the
 * widest one. Pinning to the widest line does not move the break points in
 * normal prose (every line still fits), so this settles in one pass.
 *
 * `measureKey` must change whenever the *rendered* content changes, not just
 * when the raw message text does — the currency symbol is interpolated during
 * render, so it belongs in the key too.
 */
function ChatBubble({
  className,
  measureKey,
  measure = true,
  children,
}: {
  className: string;
  measureKey: string;
  measure?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!measure) {
      el.style.width = "";
      return;
    }
    const parent = el.parentElement;
    if (!parent) return;

    let lastParentWidth = -1;
    let disposed = false;

    const apply = () => {
      if (disposed) return;
      // Release the pin so wrapping is recomputed against max-width.
      el.style.width = "";
      const widest = widestLineWidth(el);
      if (widest <= 0) return;
      const cs = getComputedStyle(el);
      const pad =
        parseFloat(cs.paddingLeft || "0") + parseFloat(cs.paddingRight || "0");
      // +1px absorbs sub-pixel rounding so the last word can't re-wrap.
      el.style.width = `${Math.ceil(widest + pad) + 1}px`;
      lastParentWidth = parent.getBoundingClientRect().width;
    };

    apply();

    // Re-measure when the panel is resized. The observer also fires on height
    // changes — which re-wrapping itself causes — so ignore anything that
    // didn't actually change the available width, otherwise each measurement
    // schedules another one.
    const ro = new ResizeObserver(() => {
      if (parent.getBoundingClientRect().width === lastParentWidth) return;
      apply();
    });
    ro.observe(parent);

    // Gilroy is a webfont: text measured with the fallback face has different
    // metrics, so anything measured before it swaps in is stale.
    if (typeof document !== "undefined" && document.fonts?.status !== "loaded") {
      document.fonts?.ready.then(apply).catch(() => {});
    }

    return () => {
      disposed = true;
      ro.disconnect();
    };
  }, [measureKey, measure]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

let idCounter = 0;
const nextId = () => `m${++idCounter}`;

export function BrainAssistant({ collapsed, onToggle }: BrainAssistantProps) {
  const [location, navigate] = useLocation();
  /* Developers is a Settings section now, not its own page — the old
     pathname check would silently go quiet there. */
  const devSearch = useSearch();
  const onDevelopersPage =
    location.startsWith("/settings") && new URLSearchParams(devSearch).get("section") === "developers";
  const { user, isLoading: authLoading, isTransitioning } = useAuth();

  /* Suggestion chips come from brain-core (GET /wiki/suggested-questions),
     already filtered and ranked upstream, rendered in the order it returns
     them. NOT /assistant/questions — that legacy route is always empty; see
     brainSuggestedQuestions.ts. The fallback below is only reached when this
     tenant has nothing eligible or the read fails. */
  const {
    questions: tenantQuestions,
    isLoading: questionsLoading,
    isError: questionsError,
  } = useSuggestedQuestions();

  const suggestionChips = useMemo(
    () =>
      resolveSuggestionChips({
        questions: tenantQuestions,
        isLoading: questionsLoading,
        isError: questionsError,
        fallback: FALLBACK_QUESTIONS,
      }),
    [tenantQuestions, questionsLoading, questionsError],
  );

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
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatGenerationRef = useRef(0);
  const assistantInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Grow the composer as its text wraps, while keeping very long drafts from
  // pushing the rest of the assistant panel off-screen.
  useLayoutEffect(() => {
    const input = assistantInputRef.current;
    if (!input) return;

    input.style.height = "auto";
    const maxHeight = 120;
    const nextHeight = Math.min(input.scrollHeight, maxHeight);
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [draft]);

  // Demo-fresh rotates the session cookie. Stop any request that started under
  // the previous principal, and ignore its result even if the server already
  // began processing it.
  useEffect(() => {
    if (!isTransitioning && user?.id) {
      // A user change is handled by the same generation bump below; this branch
      // only documents that new sends are safe after the transition settles.
      return;
    }
    chatGenerationRef.current += 1;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setSending(false);
  }, [isTransitioning, user?.id]);

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
  const { symbol, formatText } = useCurrency();

  const uploadDoc = useMutation({
    mutationFn: async (file: File) => {
      const params = new URLSearchParams({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        category: "general",
        sourceType: sourceTypeForDocument(file),
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
    if (!trimmed || sending || authLoading || isTransitioning || !user) return;

    setDraft("");

    const userMsg: ChatMessage = { id: nextId(), role: "user", text: trimmed };
    let sessionId = activeSession?.id ?? null;

    // History to send to the assistant (messages BEFORE this turn + the new user msg).
    // Context notes (isContextNote) are UI-only and must never be sent to the server:
    // strip them first so they don't consume the CHAT_HISTORY_LIMIT budget or appear
    // as conversation turns in the request body.
    const rawPrior = sessionId
      ? sessions.find((s) => s.id === sessionId)?.messages ?? []
      : [];
    const priorMessages = filterPayloadMessages(rawPrior);
    const allMessages = [...priorMessages, userMsg];

    const history = buildChatPayload(allMessages);

    // Inject a one-off inline note just before the user turn describing what
    // buildChatPayload silently dropped or shortened. Delegated to the pure
    // buildTruncationNote helper so the logic is unit-testable in isolation.
    const priorMsgMaxLength = priorMessages.reduce(
      (max, m) => Math.max(max, m.text.length),
      0,
    );
    const noteText = buildTruncationNote({
      allMessagesCount: allMessages.length,
      currentMsgLength: userMsg.text.length,
      priorMsgMaxLength,
    });
    const noteMsg: ChatMessage | null = noteText
      ? {
          id: nextId(),
          role: "assistant",
          text: noteText,
          isContextNote: true,
        }
      : null;

    // Optimistically append the user message (creating a session if needed).
    // Any prior context notes are removed first — only the most-recent note is
    // meaningful; stale ones from earlier trims clutter the conversation and
    // confuse the user about which send was affected (#223).
    if (sessionId) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                messages: [
                  ...s.messages.filter((m) => !m.isContextNote),
                  ...(noteMsg ? [noteMsg] : []),
                  userMsg,
                ],
              }
            : s,
        ),
      );
    } else {
      const newSession: ChatSession = {
        id: `session-${nextId()}`,
        title: trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed,
        createdAt: Date.now(),
        messages: [...(noteMsg ? [noteMsg] : []), { ...userMsg, dateTag: "Today" }],
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
    const requestGeneration = chatGenerationRef.current;
    const controller = new AbortController();
    chatAbortRef.current = controller;
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({ messages: history }),
      });
      const parsed = await parseAssistantResponse(res);
      if (res.status === 429) {
        reportRateLimit({ "retry-after": res.headers.get("retry-after"), body: parsed });
      }
      if (requestGeneration !== chatGenerationRef.current) return;
      const { data, reply } = parsed;
      const isUngrounded = data?.ungrounded === true;
      const answerError = parsed.answerError || data?.answerError === true;
      const answerStatus =
        answerError
          ? ("error" as const)
          : data?.answered === false
            ? ("no_answer" as const)
          : data?.answered === true
            ? ("answered" as const)
            : undefined;
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
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantId
                    ? { ...m, text: reply, sources, answerStatus, answerError, ungrounded: isUngrounded }
                    : m,
                ),
              }
            : s,
        ),
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (requestGeneration !== chatGenerationRef.current) return;
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantId
                    ? { ...m, text: ASSISTANT_GENERIC_ERROR, answerStatus: "error", answerError: true }
                    : m,
                ),
              }
            : s,
        ),
      );
    } finally {
      if (requestGeneration === chatGenerationRef.current) {
        chatAbortRef.current = null;
        setSending(false);
      }
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
      <div className="relative w-[54px] h-full rounded-panel border border-solid border-brain-v1stroke-2 bg-brain-v1baby-blue-5 overflow-hidden">
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
          <div className="w-full h-px bg-brain-v1stroke-2" />

          {/* Chat group */}
          <div className="flex flex-col gap-[4px] items-start w-full">
            <div className="flex items-center justify-center px-[8px] w-[40px]">
              <span className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-30 text-[12px] leading-[16px]">
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
    <div className="relative w-full max-w-[390px] h-full rounded-panel border border-solid border-brain-v1stroke-2 bg-brain-v1baby-blue-5 overflow-hidden flex flex-col">
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
            className={`w-full h-[40px] pl-[16px] pr-[4px] flex items-center gap-[8px] rounded-[40px] bg-brain-v1baby-blue-15 border border-solid transition-colors ${dropdownOpen ? "border-brain-v1baby-blue-30" : "border-transparent"}`}
          >
            {!activeSession && (
              <SquarePen className="flex-shrink-0 size-[20px]" color="#a8b9f4" strokeWidth={1.8} />
            )}
            <span className="flex-1 min-w-0 text-left truncate [font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 text-[16px] leading-[24px]">
              {triggerLabel}
            </span>
            <span className="flex-shrink-0 size-[32px] rounded-full bg-brain-v1stroke-2 flex items-center justify-center">
              <ChevronDown className={`size-[18px] transition-transform ${dropdownOpen ? "rotate-180" : ""}`} color="#a8b9f4" strokeWidth={2} />
            </span>
          </button>

          {/* Sessions dropdown */}
          {dropdownOpen && (
            <div className="absolute left-0 top-[calc(100%+4px)] w-full z-[60] bg-brain-v1highlight-dropdown-bg border border-solid border-brain-v1stroke-2 rounded-row p-[8px] flex flex-col gap-[8px] shadow-[0px_68px_13.5px_rgba(0,0,0,0.06),0px_38px_11.5px_rgba(0,0,0,0.2),0px_17px_8.5px_rgba(0,0,0,0.34),0px_4px_4.5px_rgba(0,0,0,0.39)] max-h-[520px] overflow-y-auto">
              {/* New chat session */}
              <button
                data-testid="button-new-session"
                onClick={startNewSession}
                className="w-full flex items-center gap-[8px] p-[8px] rounded-[8px] transition-colors hover:bg-brain-v1baby-blue-5"
              >
                <SquarePen className="flex-shrink-0 size-[24px]" color="#a8b9f4" strokeWidth={1.8} />
                <span className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 text-[16px] leading-[24px]">
                  New Chat Session
                </span>
              </button>

              <div className="h-px w-full bg-brain-v1stroke-2" />

              {/* Search */}
              <div className="w-full flex items-center gap-[8px] p-[8px] rounded-[8px] bg-brain-v1baby-blue-15">
                <Search className="flex-shrink-0 size-[24px]" color="#6c779d" strokeWidth={1.8} />
                <input
                  data-testid="input-session-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  className="flex-1 min-w-0 bg-transparent outline-none [font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 placeholder:text-brain-v1baby-blue-60 text-[16px] leading-[20px]"
                />
              </div>

              {/* Grouped sessions */}
              {filteredGroups.length === 0 && (
                <div className="px-[8px] py-[6px] [font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[14px] leading-[20px]">
                  {sessions.length === 0 ? "Nothing here yet." : "Nothing matches."}
                </div>
              )}
              {filteredGroups.map((group) => (
                <div key={group.label} className="flex flex-col gap-[8px] w-full">
                  <div className="pl-[8px] [font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-30 text-[14px] leading-[16px]">
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
                      className={`group w-full flex items-center gap-[8px] p-[8px] rounded-[8px] cursor-pointer transition-colors ${session.id === activeSessionId ? "bg-brain-v1baby-blue-15" : "hover:bg-brain-v1baby-blue-15"}`}
                    >
                      <span className="flex-1 min-w-0 text-left truncate [font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 text-[16px] leading-[20px]">
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
        className="flex-1 min-h-0 mx-[7px] rounded-row bg-brain-v1highlight-dropdown-bg overflow-y-auto"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-[4px] px-[16px]">
            <img src={brainLogo} alt="Brain" className="size-[72px]" />
            <div className="flex flex-col items-center text-center">
              <p className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-100 text-[24px] leading-[32px]">
                Hi, I'm Robo
              </p>
              <p className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[18px] leading-[24px]">
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
                    <span className="[font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-60 text-[12px] leading-[16px]">
                      {msg.dateTag}
                    </span>
                  </div>
                )}
                {msg.isContextNote ? (
                  /* Subtle inline note — not a chat bubble. Informs the user
                     that older context was dropped from this send. When the
                     note mentions "start a new conversation" that phrase is
                     rendered as a button so the user can act immediately. */
                  <div
                    className="flex items-center justify-center py-[2px] px-[4px]"
                    data-testid="context-truncation-note"
                  >
                    {(() => {
                      const ACTION = "start a new conversation";
                      const idx = msg.text.indexOf(ACTION);
                      const cls =
                        "[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[11px] leading-[14px] text-center";
                      if (idx === -1) {
                        return <span className={cls}>{msg.text}</span>;
                      }
                      return (
                        <span className={cls}>
                          {msg.text.slice(0, idx)}
                          <button
                            type="button"
                            onClick={startNewSession}
                            className="underline hover:text-brain-v1baby-blue-100 transition-colors cursor-pointer"
                          >
                            {ACTION}
                          </button>
                          {msg.text.slice(idx + ACTION.length)}
                        </span>
                      );
                    })()}
                  </div>
                ) : (
                <>
                {/* items-end/start keeps the bubble off full width; max-w-[75%]
                    caps where the text wraps. ChatBubble then pins the box to
                    the widest laid-out line so it hugs the text — max-width
                    alone leaves the box at 75% no matter how short the lines
                    end up. */}
                <div
                  className={`flex flex-col w-full ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <ChatBubble
                    measureKey={`${symbol}${msg.text}`}
                    measure={msg.text !== ""}
                    className={`max-w-[75%] break-words px-[12px] py-[8px] rounded-row [font-family:'Gilroy',sans-serif] font-medium text-[14px] leading-[20px] ${
                      msg.role === "user"
                        ? "bg-brain-v1purple text-white text-right"
                        : msg.answerStatus === "no_answer"
                          ? "bg-brain-v1stroke-2 border border-dashed border-brain-v1baby-blue-60 text-brain-v1baby-blue-80 text-left"
                          : msg.answerStatus === "error"
                            ? "bg-brain-v1dark-pink-red border border-dashed border-brain-v1pink-red text-brain-v1error-text text-left"
                          : "bg-brain-v1baby-blue-15 text-brain-v1baby-blue-60 text-left"
                    }`}
                  >
                    {msg.role === "assistant" && msg.text === "" ? (
                      <span className="inline-flex gap-[3px] py-[2px]" aria-label="Brain is typing">
                        <span className="size-[6px] rounded-full bg-brain-v1baby-blue-60 animate-bounce [animation-delay:-0.3s]" />
                        <span className="size-[6px] rounded-full bg-brain-v1baby-blue-60 animate-bounce [animation-delay:-0.15s]" />
                        <span className="size-[6px] rounded-full bg-brain-v1baby-blue-60 animate-bounce" />
                      </span>
                    ) : (
                      renderRichText(msg.text, formatText)
                    )}
                  </ChatBubble>
                </div>
                {msg.role === "assistant" && msg.answerStatus === "no_answer" && (
                  <div
                    className="flex items-center gap-[4px] px-[4px] w-full"
                    data-testid="assistant-no-answer"
                  >
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1light-orange text-[11px] leading-[14px]">
                      No grounded answer
                    </span>
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-30 text-[11px] leading-[14px]">
                      {msg.sources && msg.sources.length > 0
                        ? "evidence was found, but it was not sufficient to answer"
                        : "no supporting records were available"}
                    </span>
                  </div>
                )}
                {msg.role === "assistant" && msg.answerStatus === "error" && (
                  <div
                    className="flex items-center gap-[4px] px-[4px] w-full"
                    data-testid="assistant-error"
                  >
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1light-orange text-[11px] leading-[14px]">
                      Assistant unavailable
                    </span>
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-30 text-[11px] leading-[14px]">
                      this response was not generated from your ledger
                    </span>
                  </div>
                )}
                {msg.role === "assistant" && msg.ungrounded && (
                  <div className="flex items-center gap-[4px] px-[4px] w-full">
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1light-orange text-[11px] leading-[14px]">
                      Data unavailable
                    </span>
                    <span className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-30 text-[11px] leading-[14px]">
                      live ledger connection not ready
                    </span>
                  </div>
                )}
                {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-col items-start gap-[6px] w-full">
                    {/* Toggle — NOT a wrapper for the evidence list (nested buttons
                       are invalid and suppress inner click events). */}
                    <button
                      type="button"
                      data-testid="assistant-sources"
                      onClick={() => setOpenEvidenceFor((cur) => (cur === msg.id ? null : msg.id))}
                      className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 text-[11px] leading-[14px] px-[4px] cursor-pointer hover:underline text-left"
                    >
                      {msg.answerStatus === "error"
                        ? `${msg.sources.length} record${msg.sources.length === 1 ? "" : "s"} available as context — answer unavailable`
                        : msg.answerStatus === "no_answer"
                        ? msg.sources.length > 0
                          ? `${msg.sources.length} record${msg.sources.length === 1 ? "" : "s"} found as evidence — no answer returned`
                          : "No supporting records found — no answer returned"
                        : `Grounded in ${msg.sources.length} record${msg.sources.length === 1 ? "" : "s"} from your ledger`}
                      {openEvidenceFor === msg.id ? " ▾" : " ▸"}
                    </button>
                    {/* Evidence list — sibling of the toggle, never nested inside it */}
                    {openEvidenceFor === msg.id && (
                      <div className="flex flex-col gap-[4px] w-full pl-[4px]">
                        {msg.sources.map((s, i) => {
                          const text = formatText(s.excerpt ?? s.entityId);
                          /* Brain-core wiki/question returns a variety of entityType values.
                             Normalize aliases (user → member, vendor → counterparty) and,
                             when the type is missing entirely, infer it from the id by
                             matching against the local caches — every resolvable record
                             should be tappable. */
                          const raw =
                            s.entityType === "user" ? "member" :
                            s.entityType === "vendor" ? "counterparty" :
                            s.entityType;
                          const resolvedType = raw ?? (
                            acctIds.has(s.entityId) ? "account"
                            : txIds.has(s.entityId) ? "transaction"
                            : invIds.has(s.entityId) ? "invoice"
                            : resolveVendor(s.entityId) ? "counterparty"
                            : null
                          );
                          const isClickable =
                            (resolvedType === "account" && acctIds.has(s.entityId)) ||
                            (resolvedType === "transaction" && txIds.has(s.entityId)) ||
                            (resolvedType === "invoice" && invIds.has(s.entityId)) ||
                            resolvedType === "member" ||
                            (resolvedType === "counterparty" && !!resolveVendor(s.entityId)) ||
                            resolvedType === "audit_event" ||
                            resolvedType === "obligation" ||
                            resolvedType === "payment_intent" ||
                            resolvedType === "wiki.question";
                          return isClickable ? (
                            <button
                              key={`${s.entityId}-${i}`}
                              type="button"
                              data-testid={`evidence-link-${i}`}
                              onClick={() => {
                                if (resolvedType === "account") setOpenAccountId(s.entityId);
                                else if (resolvedType === "transaction") setOpenTxId(s.entityId);
                                else if (resolvedType === "invoice") setOpenBillId(s.entityId);
                                else if (resolvedType === "member") openMemberDetail(s.entityId);
                                else if (resolvedType === "counterparty") openVendorDetail(s.entityId, navigate);
                                else if (resolvedType === "audit_event") navigate(`/audit-log?record=${s.entityId}`);
                                /* Payables is the itemized "what we owe" list, so a citation
                                   about one obligation lands beside the rest of them. It went to
                                   Cash Flow only because that list did not exist yet — there is
                                   still no /bills route (navigating there hit NotFound). */
                                else if (resolvedType === "obligation") navigate("/ledger?tab=payables");
                                else if (resolvedType === "payment_intent") navigate("/review");
                                else if (resolvedType === "wiki.question") navigate(`/audit-log?record=${s.entityId}`);
                              }}
                              title={s.entityId}
                              className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1purple text-[11px] leading-[14px] text-left hover:underline block w-full min-w-0 truncate"
                            >
                              {text}
                            </button>
                          ) : (
                            <span
                              key={`${s.entityId}-${i}`}
                              title={s.entityId}
                              className="[font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-60 text-[11px] leading-[14px] block w-full min-w-0 truncate"
                            >
                              {text}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suggested questions */}
      <div className="flex items-center gap-[8px] px-[7px] pt-[12px] pb-[8px] overflow-x-auto">
        {(onDevelopersPage
          ? [...DEVELOPER_QUESTIONS, ...suggestionChips.chips]
          : suggestionChips.chips
        ).map((q, i) => (
          <button
            /* Index-prefixed: tenant chip text is upstream-controlled, so it can
               coincide with a DEVELOPER_QUESTIONS string and collide on a bare
               text key. */
            key={`${i}-${q}`}
            data-testid={`button-suggested-${q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`}
            onClick={() => sendMessage(q)}
            className="flex-shrink-0 bg-brain-v1baby-blue-15 px-[12px] py-[8px] rounded-pill transition-colors hover:bg-brain-v1baby-blue-15-hover [font-family:'Gilroy',sans-serif] font-semibold text-brain-v1baby-blue-100 text-[12px] leading-[16px] whitespace-nowrap"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input field */}
      <div className="mx-[7px] mb-[7px] rounded-row bg-brain-v1highlight-dropdown-bg p-[8px] flex flex-col gap-[10px]">
        <textarea
          ref={assistantInputRef}
          data-testid="input-assistant-message"
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(draft);
            }
          }}
          placeholder="Ask me a question..."
          className="w-full resize-none bg-transparent outline-none px-[8px] pt-[6px] [font-family:'Gilroy',sans-serif] font-medium text-brain-v1baby-blue-100 placeholder:text-brain-v1baby-blue-60 text-[16px] leading-[20px] overflow-x-hidden"
        />
        <div className="flex items-center justify-between">
          <input
            ref={fileInputRef}
            type="file"
            accept={DOCUMENT_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (isSupportedDocumentFile(file)) {
                  uploadDoc.mutate(file);
                } else {
                  toast({
                    title: "Unsupported file",
                    description: "ZIP files can't be uploaded. Choose PDF, CSV, XLSX, DOCX, or another supported document.",
                    variant: "destructive",
                  });
                }
              }
              e.target.value = "";
            }}
          />
          <button
            data-testid="button-assistant-attach"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadDoc.isPending}
            className="size-[32px] rounded-full bg-brain-v1baby-blue-15 flex items-center justify-center transition-colors hover:bg-brain-v1baby-blue-15-hover disabled:opacity-60 disabled:cursor-not-allowed"
            title="Attach a document"
          >
            <Plus className="size-[18px]" color="#a8b9f4" strokeWidth={2} />
          </button>
          <div className="flex items-center gap-[8px]">
            <Button
              variant="cta"
              size="iconCompact"
              data-testid="button-assistant-send"
              onClick={() => sendMessage(draft)}
              disabled={!draft.trim() || sending || authLoading || isTransitioning || !user}
              title="Send"
            >
              <ArrowUp color="#ffffff" strokeWidth={2.4} />
            </Button>
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
