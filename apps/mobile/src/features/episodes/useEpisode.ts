import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiaryEntryRow, EpisodeRow, EpisodeUpdate } from "@daytale/shared";
import { supabase } from "@/lib/supabase";

/**
 * apps/mobile/src/features/episodes/useEpisode.ts — OWNED BY WS-H (Feed & reader).
 *
 * Data/mutations for app/episode/[id].tsx: fetch the episode, fetch its
 * original source diary entries (author-only per `episode_sources_owner_select`
 * RLS — plan §1.5), save edits, and publish (plan §2.1 steps 5-6).
 */

function episodeQueryKey(episodeId: string | undefined) {
  return ["episode", episodeId] as const;
}

export function useEpisodeQuery(episodeId: string | undefined) {
  return useQuery({
    queryKey: episodeQueryKey(episodeId),
    queryFn: async (): Promise<EpisodeRow> => {
      const { data, error } = await supabase
        .from("episodes")
        .select("*")
        .eq("id", episodeId as string)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!episodeId,
    // The worker fills in `content` asynchronously; poll while it's still
    // an empty placeholder so the pending state clears on its own.
    refetchInterval: (query) =>
      query.state.data?.content === "" ? 3000 : false,
  });
}

/**
 * Original source diary text(s) for this episode. Only ever returns rows for
 * the owning author — `episode_sources_owner_select` RLS (0002_rls.sql)
 * restricts reads to `author_id = auth.uid()`, so a non-author caller simply
 * gets an empty array back (not an error). Callers should gate on
 * `author_id === session.user.id` before rendering this to avoid showing an
 * empty "original diary" section to readers.
 */
export function useEpisodeSourcesQuery(episodeId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["episode", episodeId, "sources"],
    queryFn: async (): Promise<DiaryEntryRow[]> => {
      const { data: sources, error: sourcesError } = await supabase
        .from("episode_sources")
        .select("diary_entry_id")
        .eq("episode_id", episodeId as string);

      if (sourcesError) throw sourcesError;
      if (sources.length === 0) return [];

      const { data: entries, error: entriesError } = await supabase
        .from("diary_entries")
        .select("*")
        .in(
          "id",
          sources.map((s) => s.diary_entry_id)
        )
        .order("entry_date", { ascending: true });

      if (entriesError) throw entriesError;
      return entries;
    },
    enabled: !!episodeId && enabled,
  });
}

export function useUpdateEpisode(episodeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (update: EpisodeUpdate): Promise<EpisodeRow> => {
      if (!episodeId) throw new Error("missing episode id");

      const { data, error } = await supabase
        .from("episodes")
        .update(update)
        .eq("id", episodeId)
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (!episodeId) return;
      queryClient.setQueryData(episodeQueryKey(episodeId), data);
    },
  });
}

export function usePublishEpisode(episodeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (!episodeId) throw new Error("missing episode id");

      const { error } = await supabase.rpc("publish_episode", {
        episode_id: episodeId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      if (!episodeId) return;
      void queryClient.invalidateQueries({ queryKey: episodeQueryKey(episodeId) });
      void queryClient.invalidateQueries({ queryKey: ["feed", "publicSeries"] });
      void queryClient.invalidateQueries({ queryKey: ["series"] });
    },
  });
}
