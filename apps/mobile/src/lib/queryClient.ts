import { QueryClient } from "@tanstack/react-query";

/**
 * apps/mobile/src/lib/queryClient.ts
 *
 * TanStack Query client (plan §1.3 / §1.4). Generic boilerplate — no
 * workstream-specific logic lives here. Individual features configure their
 * own query keys/hooks (e.g. src/hooks/useGenerationStatus.ts owned by WS-F).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
