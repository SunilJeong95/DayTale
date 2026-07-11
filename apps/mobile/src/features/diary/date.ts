/**
 * apps/mobile/src/features/diary/date.ts — OWNED BY WS-E (Diary).
 *
 * Diary entry dates are `YYYY-MM-DD` in the device's local timezone (plan
 * §2.1 step 1) — never UTC, so "today" lines up with the user's actual
 * calendar day regardless of timezone offset.
 */

export function todayLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Formats a `YYYY-MM-DD` entry_date as a Korean date string, e.g. "2026년 7월 10일". */
export function formatDateKo(entryDate: string): string {
  const [year, month, day] = entryDate.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}
