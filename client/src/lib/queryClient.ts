import { QueryClient, QueryFunction } from "@tanstack/react-query";
import {
  BrainRateLimitError,
  brainReadFamilyForUrl,
  getBrainReadCooldownDeadline,
  throwBrainRateLimitIfNeeded,
} from "./rateLimit";

async function throwIfResNotOk(res: Response, requestUrl?: string) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const url = requestUrl ?? (res.url ? new URL(res.url, "http://app.local").pathname : "");
    const family = brainReadFamilyForUrl(url);
    if (res.status === 429 && family) {
      await throwBrainRateLimitIfNeeded(res, text, family);
    }
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res, url);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const family = brainReadFamilyForUrl(url);
    const cooldownUntil = family ? getBrainReadCooldownDeadline(family) : 0;
    if (family && cooldownUntil > Date.now()) {
      throw new BrainRateLimitError(
        family,
        Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000)),
        cooldownUntil,
      );
    }

    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res, url);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
