import { useLocalSearchParams } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { ko } from "@/i18n/ko";
import { DiaryEditor } from "@/features/diary/DiaryEditor";
import { formatDateKo } from "@/features/diary/date";

/**
 * app/diary/[date].tsx — OWNED BY WS-E (Diary).
 *
 * View/edit a specific day's diary entry, addressed by an explicit `date`
 * (YYYY-MM-DD) route param instead of "today" — same upsert editor as
 * app/(tabs)/write.tsx. If none exists yet for that date, it's treated as a
 * fresh entry. Editing after an episode was already generated from this
 * entry does not retroactively regenerate it (plan §7); the shared
 * DiaryEditor surfaces `ko.diary.linkedEpisodeNote` when that's detected.
 */
export default function DiaryByDateScreen() {
  const { date: rawDate } = useLocalSearchParams<{ date: string }>();
  const date = Array.isArray(rawDate) ? rawDate[0] : rawDate;
  const { session } = useAuth();

  return (
    <DiaryEditor
      authorId={session?.user.id ?? null}
      entryDate={date}
      title={date ? `${formatDateKo(date)} ${ko.diary.entryLabel}` : ko.diary.entryLabel}
    />
  );
}
