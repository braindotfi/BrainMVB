export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "brain_chat_sessions";

export const getChatSessions = (): ChatSession[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};

export const saveChatSession = (session: ChatSession): void => {
  const sessions = getChatSessions().filter((s) => s.id !== session.id);
  const updated = [session, ...sessions].slice(0, 30);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

export const deleteChatSession = (id: string): void => {
  const sessions = getChatSessions().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
};

export const getChatSession = (id: string): ChatSession | null => {
  return getChatSessions().find((s) => s.id === id) ?? null;
};

export const generateSessionTitle = (firstUserMessage: string): string => {
  const cleaned = firstUserMessage.replace(/[^a-zA-Z0-9 ]/g, "").trim();
  return cleaned.length > 48 ? cleaned.slice(0, 48) + "…" : cleaned || "New Chat";
};

export const formatSessionTime = (isoString: string): string => {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};
