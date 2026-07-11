import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  GENRES,
  GENRE_LABEL_KO,
  TONES,
  TONE_LABEL_KO,
  type ClarifyingAnswer,
  type DiaryEntryRow,
  type GenreCode,
  type ToneCode,
} from "@daytale/shared";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useGenerationStatus } from "@/hooks/useGenerationStatus";
import { ko } from "@/i18n/ko";

/**
 * app/generate.tsx — OWNED BY WS-F (Generation UX).
 *
 * Batch date picker (excluding dates already consumed by another episode,
 * plan §1.5 CRITIC FIX #5) + genre/tone -> `enqueue_generation` RPC (plan
 * §1.5 CRITIC FIX #4, §2.1 step 2) -> live status via
 * src/hooks/useGenerationStatus.ts, including the clarify sub-flow
 * (plan §2.2).
 */

/** Postgres unique-violation error code — a duplicate enqueue for the same
 * author+diary-batch while one is already in flight (partial unique index
 * on `active_job_key`, plan §1.5 CRITIC FIX #4). */
const POSTGRES_UNIQUE_VIOLATION = "23505";

function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface ActiveJob {
  jobId: string;
  episodeId: string;
}

export default function GenerateScreen() {
  const { session } = useAuth();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [genre, setGenre] = useState<GenreCode>("daily");
  const [tone, setTone] = useState<ToneCode>("warm");
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const didInitSelection = useRef(false);

  const authorId = session?.user.id ?? null;

  const diaryEntriesQuery = useQuery({
    queryKey: ["generate", "availableDiaryEntries", authorId],
    enabled: !!authorId,
    queryFn: async (): Promise<DiaryEntryRow[]> => {
      const { data: entries, error: entriesError } = await supabase
        .from("diary_entries")
        .select("*")
        .eq("author_id", authorId as string)
        .order("entry_date", { ascending: false })
        .limit(60);
      if (entriesError) throw entriesError;
      if (!entries || entries.length === 0) return [];

      const ids = entries.map((entry) => entry.id);
      const { data: sources, error: sourcesError } = await supabase
        .from("episode_sources")
        .select("diary_entry_id")
        .in("diary_entry_id", ids);
      if (sourcesError) throw sourcesError;

      const consumedIds = new Set(
        (sources ?? []).map((source) => source.diary_entry_id)
      );
      return entries.filter((entry) => !consumedIds.has(entry.id));
    },
  });

  useEffect(() => {
    if (didInitSelection.current) return;
    if (!diaryEntriesQuery.data) return;
    didInitSelection.current = true;
    const today = getLocalDateString();
    const todayEntry = diaryEntriesQuery.data.find(
      (entry) => entry.entry_date === today
    );
    if (todayEntry) setSelectedIds(new Set([todayEntry.id]));
  }, [diaryEntriesQuery.data]);

  const toggleEntry = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enqueueMutation = useMutation({
    mutationFn: async () => {
      const diary_entry_ids = Array.from(selectedIds);
      const { data, error } = await supabase.rpc("enqueue_generation", {
        diary_entry_ids,
        genre,
        tone,
      });
      if (error) throw error;
      const row = data?.[0];
      if (!row) throw new Error("enqueue_generation returned no row");
      return row;
    },
    onSuccess: (row) => {
      setActiveJob({ jobId: row.job_id, episodeId: row.episode_id });
    },
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.warn("[generate] enqueue_generation failed", err);
    },
  });

  if (activeJob) {
    return (
      <GenerationStatusPanel
        jobId={activeJob.jobId}
        episodeId={activeJob.episodeId}
        onReset={() => setActiveJob(null)}
      />
    );
  }

  const availableEntries = diaryEntriesQuery.data ?? [];
  const enqueueErrorText = enqueueMutation.isError
    ? (enqueueMutation.error as { code?: string })?.code ===
      POSTGRES_UNIQUE_VIOLATION
      ? ko.generate.duplicateInProgress
      : ko.common.error
    : null;
  const canSubmit = selectedIds.size > 0 && !enqueueMutation.isPending;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{ko.generate.cta}</Text>

      <Text style={styles.sectionLabel}>{ko.generate.pickDates}</Text>
      {diaryEntriesQuery.isLoading ? (
        <ActivityIndicator />
      ) : availableEntries.length === 0 ? (
        <Text style={styles.emptyText}>{ko.generate.noEntriesAvailable}</Text>
      ) : (
        <View style={styles.entryList}>
          {availableEntries.map((entry) => {
            const isSelected = selectedIds.has(entry.id);
            return (
              <TouchableOpacity
                key={entry.id}
                style={[styles.entryRow, isSelected && styles.entryRowSelected]}
                onPress={() => toggleEntry(entry.id)}
              >
                <View
                  style={[styles.checkbox, isSelected && styles.checkboxChecked]}
                />
                <View style={styles.entryTextWrap}>
                  <Text style={styles.entryDate}>{entry.entry_date}</Text>
                  <Text style={styles.entryPreview} numberOfLines={1}>
                    {entry.text}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <Text style={styles.sectionLabel}>{ko.generate.pickGenre}</Text>
      <View style={styles.chipRow}>
        {GENRES.map((code) => (
          <TouchableOpacity
            key={code}
            style={[styles.chip, genre === code && styles.chipSelected]}
            onPress={() => setGenre(code)}
          >
            <Text
              style={[
                styles.chipText,
                genre === code && styles.chipTextSelected,
              ]}
            >
              {GENRE_LABEL_KO[code]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>{ko.generate.pickTone}</Text>
      <View style={styles.chipRow}>
        {TONES.map((code) => (
          <TouchableOpacity
            key={code}
            style={[styles.chip, tone === code && styles.chipSelected]}
            onPress={() => setTone(code)}
          >
            <Text
              style={[styles.chipText, tone === code && styles.chipTextSelected]}
            >
              {TONE_LABEL_KO[code]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {enqueueErrorText ? (
        <Text style={styles.errorText}>{enqueueErrorText}</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={() => enqueueMutation.mutate()}
        disabled={!canSubmit}
      >
        {enqueueMutation.isPending ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>{ko.generate.cta}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function GenerationStatusPanel({
  jobId,
  episodeId,
  onReset,
}: {
  jobId: string;
  episodeId: string;
  onReset: () => void;
}) {
  const { job, isLoading } = useGenerationStatus(jobId);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmittingAnswers, setIsSubmittingAnswers] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const didNavigate = useRef(false);

  useEffect(() => {
    if (job?.status === "completed" && !didNavigate.current) {
      didNavigate.current = true;
      router.replace(`/episode/${episodeId}`);
    }
  }, [job?.status, episodeId]);

  if (isLoading && !job) {
    return (
      <View style={styles.statusContainer}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!job) return null;

  if (job.status === "awaiting_input" && job.clarifying_questions) {
    const questions = job.clarifying_questions;
    const canSubmitAnswers =
      questions.every((q) => (answers[q.id] ?? "").trim().length > 0) &&
      !isSubmittingAnswers;

    const handleSubmitAnswers = async () => {
      setIsSubmittingAnswers(true);
      setSubmitError(null);
      const clarifying_answers: ClarifyingAnswer[] = questions.map((q) => ({
        question_id: q.id,
        answer_ko: (answers[q.id] ?? "").trim(),
      }));
      const { error } = await supabase
        .from("generation_jobs")
        .update({
          clarifying_answers,
          status: "queued",
          mode: "generate",
        })
        .eq("id", jobId);
      setIsSubmittingAnswers(false);
      if (error) {
        // eslint-disable-next-line no-console
        console.warn(
          "[generate] failed to submit clarifying answers",
          error.message
        );
        setSubmitError(ko.common.error);
      }
    };

    return (
      <ScrollView contentContainerStyle={styles.statusContainer}>
        <Text style={styles.statusText}>{ko.generate.statusAwaitingInput}</Text>
        <Text style={styles.sectionLabel}>{ko.generate.clarifyTitle}</Text>
        {questions.map((q) => (
          <View key={q.id} style={styles.clarifyQuestion}>
            <Text style={styles.clarifyQuestionText}>{q.question_ko}</Text>
            <TextInput
              style={styles.input}
              value={answers[q.id] ?? ""}
              onChangeText={(text) =>
                setAnswers((prev) => ({ ...prev, [q.id]: text }))
              }
              editable={!isSubmittingAnswers}
            />
          </View>
        ))}
        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        <TouchableOpacity
          style={[styles.button, !canSubmitAnswers && styles.buttonDisabled]}
          onPress={handleSubmitAnswers}
          disabled={!canSubmitAnswers}
        >
          {isSubmittingAnswers ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>{ko.generate.clarifySubmit}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (job.status === "failed") {
    return (
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>{ko.generate.statusFailed}</Text>
        {job.error ? <Text style={styles.errorText}>{job.error}</Text> : null}
        <TouchableOpacity style={styles.button} onPress={onReset}>
          <Text style={styles.buttonText}>{ko.generate.retry}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusLabel =
    job.status === "processing"
      ? ko.generate.statusProcessing
      : job.status === "completed"
        ? ko.generate.statusCompleted
        : job.status === "awaiting_input"
          ? ko.generate.statusAwaitingInput
          : ko.generate.statusQueued;

  return (
    <View style={styles.statusContainer}>
      <ActivityIndicator />
      <Text style={styles.statusText}>{statusLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    marginTop: 20,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#666666",
  },
  entryList: {
    gap: 8,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dddddd",
  },
  entryRowSelected: {
    borderColor: "#000000",
    backgroundColor: "#f5f5f5",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bbbbbb",
  },
  checkboxChecked: {
    backgroundColor: "#000000",
    borderColor: "#000000",
  },
  entryTextWrap: {
    flex: 1,
  },
  entryDate: {
    fontSize: 14,
    fontWeight: "600",
  },
  entryPreview: {
    fontSize: 13,
    color: "#666666",
    marginTop: 2,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#dddddd",
  },
  chipSelected: {
    backgroundColor: "#000000",
    borderColor: "#000000",
  },
  chipText: {
    fontSize: 14,
    color: "#1f1f1f",
  },
  chipTextSelected: {
    color: "#ffffff",
    fontWeight: "600",
  },
  errorText: {
    color: "#e0245e",
    fontSize: 13,
    marginTop: 12,
  },
  button: {
    height: 52,
    borderRadius: 12,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  buttonDisabled: {
    backgroundColor: "#bbbbbb",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  statusContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "600",
  },
  clarifyQuestion: {
    width: "100%",
    marginBottom: 12,
  },
  clarifyQuestionText: {
    fontSize: 14,
    marginBottom: 6,
  },
  input: {
    width: "100%",
    height: 48,
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
  },
});
