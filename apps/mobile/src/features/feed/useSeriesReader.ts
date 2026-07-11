import { useQuery } from "@tanstack/react-query";
import type { EpisodeRow, PublicProfileRow, SeriesRow } from "@daytale/shared";
import { supabase } from "@/lib/supabase";

/**
 * apps/mobile/src/features/feed/useSeriesReader.ts — OWNED BY WS-H (Feed & reader).
 *
 * Data for app/series/[id].tsx: the series row + owner's public profile (for
 * a header) and its published episodes ordered 1..n by `episode_number`
 * (plan §1.5, §2.1 step 7). RLS on `episodes` already excludes blocked
 * authors' rows, so a blocked read simply comes back as an empty list —
 * no extra client-side filtering needed here.
 */
export function useSeriesHeaderQuery(seriesId: string | undefined) {
  return useQuery({
    queryKey: ["series", seriesId, "header"],
    queryFn: async (): Promise<{
      series: SeriesRow;
      author: PublicProfileRow | null;
    }> => {
      const { data: series, error: seriesError } = await supabase
        .from("series")
        .select("*")
        .eq("id", seriesId as string)
        .single();

      if (seriesError) throw seriesError;

      const { data: author, error: authorError } = await supabase
        .from("public_profiles")
        .select("*")
        .eq("id", series.owner_id)
        .maybeSingle();

      if (authorError) throw authorError;

      return { series, author };
    },
    enabled: !!seriesId,
  });
}

export function useSeriesEpisodesQuery(seriesId: string | undefined) {
  return useQuery({
    queryKey: ["series", seriesId, "episodes"],
    queryFn: async (): Promise<EpisodeRow[]> => {
      const { data, error } = await supabase
        .from("episodes")
        .select("*")
        .eq("series_id", seriesId as string)
        .eq("status", "published")
        .order("episode_number", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!seriesId,
  });
}
