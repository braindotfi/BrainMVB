import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseBrainSources, isConnectedBrainSource, type BrainSource } from "./brainSources";

/**
 * brain-core's connector registry (GET /v1/sources), relayed verbatim by the BFF's
 * generic GET passthrough - hence the `unknown` and the defensive parse in
 * lib/brainSources.ts. This is a different population from BrainMVB's three local
 * surfaces (bank connections, tool connections, uploaded documents).
 *
 * The read's state is returned alongside its rows on purpose: a failed or
 * still-running sources read must not be indistinguishable from a tenant that has
 * connected nothing.
 */
export function useBrainSources(enabled: boolean): {
  sources: BrainSource[];
  isLoading: boolean;
  isError: boolean;
  data: unknown;
} {
  const query = useQuery<unknown>({ queryKey: ["/api/brain/sources"], enabled });
  const sources = useMemo(
    () => parseBrainSources(query.data).filter(isConnectedBrainSource),
    [query.data],
  );
  return { sources, isLoading: query.isLoading, isError: query.isError, data: query.data };
}
