import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { DIARY_RECOMMENDED_MIN_CHARS } from "@daytale/shared";
import { ko } from "@/i18n/ko";
import {
  useDiaryEntryEpisodeLink,
  useDiaryEntryQuery,
  useUpsertDiaryEntry,
} from "./useDiaryEntry";

interface DiaryEditorProps {
  authorId: string | null;
  entryDate: string | undefined;
  title: string;
}

/**
 * apps/mobile/src/features/diary/DiaryEditor.tsx — OWNED BY WS-E (Diary).
 *
 * Shared editor for app/(tabs)/write.tsx (today) and app/diary/[date].tsx
 * (arbitrary date) — same upsert-on-(author_id, entry_date) semantics, same
 * 50-char hint (hint only, never a hard block — plan §2.1 step 1), same
 * "already linked to an episode" note (plan §7).
 */
export function DiaryEditor({ authorId, entryDate, title }: DiaryEditorProps) {
  const entryQuery = useDiaryEntryQuery(authorId, entryDate);
  const upsertMutation = useUpsertDiaryEntry(authorId, entryDate);
  const linkQuery = useDiaryEntryEpisodeLink(entryQuery.data?.id);

  const [text, setText] = useState("");
  const [hasEdited, setHasEdited] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!hasEdited) {
      setText(entryQuery.data?.text ?? "");
    }
  }, [entryQuery.data, hasEdited]);

  const handleChangeText = (value: string) => {
    setText(value);
    setHasEdited(true);
    setJustSaved(false);
  };

  const handleSave = async () => {
    if (!authorId || !entryDate || text.trim().length === 0) return;
    try {
      await upsertMutation.mutateAsync(text);
      setHasEdited(false);
      setJustSaved(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[DiaryEditor] failed to save diary entry", err);
    }
  };

  const showMinCharsHint = text.length < DIARY_RECOMMENDED_MIN_CHARS;
  const canSave =
    !!authorId && !!entryDate && text.trim().length > 0 && !upsertMutation.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>{title}</Text>

      {linkQuery.data ? (
        <Text style={styles.linkedNote}>{ko.diary.linkedEpisodeNote}</Text>
      ) : null}

      {entryQuery.isLoading ? (
        <ActivityIndicator style={styles.loadingIndicator} />
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={handleChangeText}
            placeholder={ko.diary.placeholder}
            multiline
            textAlignVertical="top"
            editable={!upsertMutation.isPending}
          />

          <View style={styles.metaRow}>
            <Text style={styles.charCount}>
              {text.length}
              {ko.diary.charCountSuffix}
            </Text>
            {showMinCharsHint ? (
              <Text style={styles.hint}>{ko.diary.minCharsHint}</Text>
            ) : null}
          </View>

          {upsertMutation.isError ? (
            <Text style={styles.errorText}>{ko.diary.saveError}</Text>
          ) : null}
          {justSaved ? (
            <Text style={styles.successText}>{ko.diary.saveSuccess}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.button, !canSave && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={!canSave}
          >
            {upsertMutation.isPending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>{ko.common.save}</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
  },
  linkedNote: {
    fontSize: 13,
    color: "#8a6d00",
    backgroundColor: "#fff8e1",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  loadingIndicator: {
    marginTop: 40,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 200,
  },
  metaRow: {
    marginTop: 8,
    marginBottom: 8,
  },
  charCount: {
    fontSize: 12,
    color: "#999999",
  },
  hint: {
    fontSize: 12,
    color: "#e08a00",
    marginTop: 4,
  },
  errorText: {
    color: "#e0245e",
    fontSize: 13,
    marginBottom: 8,
  },
  successText: {
    color: "#2e7d32",
    fontSize: 13,
    marginBottom: 8,
  },
  button: {
    height: 52,
    borderRadius: 12,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  buttonDisabled: {
    backgroundColor: "#bbbbbb",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
