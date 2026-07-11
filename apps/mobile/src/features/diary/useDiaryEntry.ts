import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiaryEntryRow } from "@daytale/shared";
import { supabase } from "@/lib/supabase";

/**
 * apps/mobile/src/features/diary/useDiaryEntry.ts — OWNED BY WS-E (Diary).
 *
 * Query/mutation hooks around `diary_entries`, shared by app/(tabs)/write.tsx
 * (today) and app/diary/[date].tsx (arbitrary past date) — both are the same
 * upsert-on-(author_id, entry_date) editor (plan §1.5, §2.1 step 1).
 */

function diaryEntryQueryKey(authorId: string | null, entryDate: string) {
  return ["diaryEntry", authorId, entryDate] as const;
}

export function useDiaryEntryQuery(
  authorId: string | null,
  entryDate: string | undefined
) {
  return useQuery({
    queryKey: diaryEntryQueryKey(authorId, entryDate ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("diary_entries")
        .select("*")
        .eq("author_id", authorId as string)
        .eq("entry_date", entryDate as string)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!authorId && !!entryDate,
  });
}

export function useUpsertDiaryEntry(
  authorId: string | null,
  entryDate: string | undefined
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (text: string): Promise<DiaryEntryRow> => {
      if (!authorId || !entryDate) {
        throw new Error("missing author or entry date");
      }

      const { data, error } = await supabase
        .from("diary_entries")
        .upsert(
          { author_id: authorId, entry_date: entryDate, text },
          { onConflict: "author_id,entry_date" }
        )
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (!authorId || !entryDate) return;
      queryClient.setQueryData(diaryEntryQueryKey(authorId, entryDate), data);
    },
  });
}

/**
 * Whether a diary entry already has an episode generated from it (plan §7 —
 * editing after generation does not retroactively regenerate). `diaryEntryId`
 * of `null`/`undefined` (fresh, unsaved entry) always resolves to "not linked".
 */
export function useDiaryEntryEpisodeLink(diaryEntryId: string | null | undefined) {
  return useQuery({
    queryKey: ["diaryEntryEpisodeLink", diaryEntryId ?? "none"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("episode_sources")
        .select("episode_id")
        .eq("diary_entry_id", diaryEntryId as string)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!diaryEntryId,
  });
}
