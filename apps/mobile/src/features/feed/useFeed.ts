import { useQuery } from "@tanstack/react-query";
import type { PublicFeedSeriesRow } from "@daytale/shared";
import { supabase } from "@/lib/supabase";

/**
 * apps/mobile/src/features/feed/useFeed.ts — OWNED BY WS-H (Feed & reader).
 *
 * Feed home data: one row per author-with->=1-published-episode, from the
 * `public_feed_series` view (plan §1.5, §4). Sorted by `latest_published_at`
 * desc (most recently updated series first) since the plan does not specify
 * an exact ordering.
 */
export function useFeedQuery() {
  return useQuery({
    queryKey: ["feed", "publicSeries"],
    queryFn: async (): Promise<PublicFeedSeriesRow[]> => {
      const { data, error } = await supabase
        .from("public_feed_series")
        .select("*")
        .order("latest_published_at", { ascending: false, nullsFirst: false });

      if (error) throw error;
      return data;
    },
  });
}
