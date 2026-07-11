import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiaryEntryRow, EpisodeRow } from "@daytale/shared";
import { supabase } from "@/lib/supabase";

/**
 * apps/mobile/src/features/library/useLibrary.ts — OWNED BY WS-G (Library).
 *
 * Fetch/delete hooks for the current user's own `episodes` (all statuses)
 * and `diary_entries` (originals), backing app/(tabs)/library.tsx (plan §4,
 * §6 "라이브러리 조회·삭제 (초안/비공개/공개+원본)"). RLS already restricts
 * these queries/mutations to the caller's own rows.
 */

export const libraryEpisodesKey = (userId: string) => ["library", "episodes", userId];
export const libraryDiaryEntriesKey = (userId: string) => ["library", "diary", userId];

export function useMyEpisodes(userId: string | null) {
  return useQuery({
    queryKey: libraryEpisodesKey(userId ?? ""),
    enabled: !!userId,
    queryFn: async (): Promise<EpisodeRow[]> => {
      const { data, error } = await supabase
        .from("episodes")
        .select("*")
        .eq("author_id", userId as string)
        .order("sort_date", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useMyDiaryEntries(userId: string | null) {
  return useQuery({
    queryKey: libraryDiaryEntriesKey(userId ?? ""),
    enabled: !!userId,
    queryFn: async (): Promise<DiaryEntryRow[]> => {
      const { data, error } = await supabase
        .from("diary_entries")
        .select("*")
        .eq("author_id", userId as string)
        .order("entry_date", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useDeleteEpisode(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (episodeId: string) => {
      const { error } = await supabase.from("episodes").delete().eq("id", episodeId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: libraryEpisodesKey(userId) });
      }
    },
  });
}

export function useDeleteDiaryEntry(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (diaryEntryId: string) => {
      const { error } = await supabase
        .from("diary_entries")
        .delete()
        .eq("id", diaryEntryId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: libraryDiaryEntriesKey(userId) });
        // Deleting a diary entry cascades to episode_sources (and dependent
        // generation_jobs), which can affect the episode list too.
        void queryClient.invalidateQueries({ queryKey: libraryEpisodesKey(userId) });
      }
    },
  });
}
