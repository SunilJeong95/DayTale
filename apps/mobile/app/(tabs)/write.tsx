import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ko } from "@/i18n/ko";
import { DiaryEditor } from "@/features/diary/DiaryEditor";
import { todayLocalDateString } from "@/features/diary/date";

/**
 * app/(tabs)/write.tsx — OWNED BY WS-E (Diary).
 *
 * Today's diary editor: upsert on (author_id, entry_date) where entry_date
 * is "today" in the device's local timezone (plan §2.1 step 1, §4).
 */
export default function WriteScreen() {
  const { session } = useAuth();
  const today = useMemo(() => todayLocalDateString(), []);

  return (
    <DiaryEditor
      authorId={session?.user.id ?? null}
      entryDate={today}
      title={ko.diary.writeTitle}
    />
  );
}
