import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

const DEMO_USER = "demo-user";

export function useNotifications(userId = DEMO_USER) {
  const qc = useQueryClient();
  const [sseConnected, setSseConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const { data: rawNotifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", userId],
    queryFn: () =>
      fetch(`/api/notifications?userId=${userId}`).then(r => r.json()),
    refetchInterval: false,
  });

  const notifications: Notification[] = Array.isArray(rawNotifications)
    ? (rawNotifications as any[]).filter((n): n is Notification => n != null && typeof n === "object" && "id" in n)
    : [];

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/count", userId],
    queryFn: () =>
      fetch(`/api/notifications/count?userId=${userId}`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications", userId] });
      qc.invalidateQueries({ queryKey: ["/api/notifications/count", userId] });
    },
  });

  const deleteNotif = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/notifications/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications", userId] });
      qc.invalidateQueries({ queryKey: ["/api/notifications/count", userId] });
    },
  });

  // SSE connection for real-time notifications
  useEffect(() => {
    const es = new EventSource(`/api/notifications/stream?userId=${userId}`);
    esRef.current = es;

    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "notification" && msg.payload != null && typeof msg.payload === "object" && "id" in msg.payload) {
          // Prepend new notification to the list
          qc.setQueryData<Notification[]>(
            ["/api/notifications", userId],
            (old = []) => [msg.payload, ...(old ?? []).filter(n => n != null)]
          );
          qc.setQueryData<{ count: number }>(
            ["/api/notifications/count", userId],
            (old) => ({ count: (old?.count ?? 0) + 1 })
          );
        }
      } catch { /* ignore parse errors */ }
    };

    return () => {
      es.close();
      setSseConnected(false);
    };
  }, [userId, qc]);

  const unreadCount = countData?.count ?? notifications.filter(n => !n.read).length;

  const markAllRead = useCallback(async () => {
    const unread = notifications.filter(n => !n.read);
    await Promise.all(unread.map(n => markRead.mutateAsync(n.id)));
  }, [notifications, markRead]);

  return {
    notifications,
    unreadCount,
    isLoading,
    sseConnected,
    markRead: (id: string) => markRead.mutate(id),
    deleteNotif: (id: string) => deleteNotif.mutate(id),
    markAllRead,
  };
}
