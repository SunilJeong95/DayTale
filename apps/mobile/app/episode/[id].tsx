import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { GENRE_LABEL_KO, TONE_LABEL_KO, type DiaryEntryRow } from "@daytale/shared";
import { useAuth } from "@/hooks/useAuth";
import {
  useEpisodeQuery,
  useEpisodeSourcesQuery,
  usePublishEpisode,
  useUpdateEpisode,
} from "@/features/episodes/useEpisode";
import { useBlockUser, useReportEpisode } from "@/features/moderation/useModeration";
import { ko } from "@/i18n/ko";

const REPORT_REASONS = [
  ko.moderation.reasonSpam,
  ko.moderation.reasonAbuse,
  ko.moderation.reasonInappropriate,
  ko.moderation.reasonOther,
];

/**
 * app/episode/[id].tsx — OWNED BY WS-H (Feed & reader), report/block by WS-I.
 *
 * Two modes (plan §2.1 steps 5-6, §4):
 *  - Read mode: viewer is not the author, or the episode is published.
 *  - Review/edit mode: viewer IS the author AND status !== 'published' —
 *    editable title/content, Save (persists without publishing), and an
 *    explicit Publish button calling the `publish_episode` RPC.
 *
 * Report/block (WS-I) render in the top/bottom action bars, gated on
 * `canModerate` (viewer is signed in and is not the episode's author).
 */
export default function EpisodeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();

  const episodeQuery = useEpisodeQuery(id);
  const episode = episodeQuery.data;

  const isAuthor = !!session && !!episode && session.user.id === episode.author_id;
  const isReviewMode = !!episode && isAuthor && episode.status !== "published";
  const isPending = !!episode && episode.content === "";

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const hasEditedRef = useRef(false);

  useEffect(() => {
    if (!episode || hasEditedRef.current) return;
    setTitle(episode.title ?? "");
    setContent(episode.content);
  }, [episode]);

  const [showOriginal, setShowOriginal] = useState(false);
  const sourcesQuery = useEpisodeSourcesQuery(id, isAuthor && showOriginal);

  const updateMutation = useUpdateEpisode(id);
  const publishMutation = usePublishEpisode(id);

  const canModerate = !!session && !!episode && !isAuthor;
  const [showReportReasons, setShowReportReasons] = useState(false);
  const reportMutation = useReportEpisode(episode?.id);
  const blockMutation = useBlockUser(session?.user.id);

  const submitReport = (reason: string) => {
    Alert.alert(ko.moderation.reportConfirm, undefined, [
      { text: ko.common.cancel, style: "cancel" },
      {
        text: ko.common.confirm,
        onPress: async () => {
          if (!session) return;
          try {
            await reportMutation.mutateAsync({ reporterId: session.user.id, reason });
            setShowReportReasons(false);
            Alert.alert(ko.moderation.reportSuccess);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("[episode] report failed", err);
            Alert.alert(ko.common.error, ko.moderation.reportFailed);
          }
        },
      },
    ]);
  };

  const handleBlock = () => {
    Alert.alert(ko.moderation.blockConfirm, undefined, [
      { text: ko.common.cancel, style: "cancel" },
      {
        text: ko.common.confirm,
        onPress: async () => {
          if (!episode) return;
          try {
            const result = await blockMutation.mutateAsync(episode.author_id);
            Alert.alert(
              result.alreadyBlocked ? ko.moderation.blockAlreadyBlocked : ko.moderation.blockSuccess
            );
            router.back();
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("[episode] block failed", err);
            Alert.alert(ko.common.error, ko.moderation.blockFailed);
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ title: title.trim() || null, content });
      Alert.alert(ko.episode.saved);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[episode] save failed", err);
      Alert.alert(ko.common.error, ko.episode.saveFailed);
    }
  };

  const handlePublish = () => {
    Alert.alert(ko.episode.publish, ko.episode.publishConfirm, [
      { text: ko.common.cancel, style: "cancel" },
      {
        text: ko.common.confirm,
        onPress: async () => {
          try {
            await publishMutation.mutateAsync();
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("[episode] publish failed", err);
            Alert.alert(ko.common.error, ko.episode.publishFailed);
          }
        },
      },
    ]);
  };

  if (episodeQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (episodeQuery.isError || !episode) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{ko.episode.loadFailed}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        {canModerate ? (
          <TouchableOpacity onPress={handleBlock} disabled={blockMutation.isPending}>
            <Text style={styles.blockLink}>{ko.moderation.block}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.meta}>
          {GENRE_LABEL_KO[episode.genre]} · {TONE_LABEL_KO[episode.tone]} ·{" "}
          {episode.status === "published" ? ko.episode.published : ko.episode.draft}
        </Text>

        {isPending ? (
          <View style={styles.pendingBlock}>
            <ActivityIndicator />
            <Text style={styles.pendingText}>{ko.episode.generating}</Text>
          </View>
        ) : isReviewMode ? (
          <>
            <TextInput
              style={styles.titleInput}
              value={title}
              onChangeText={(text) => {
                hasEditedRef.current = true;
                setTitle(text);
              }}
              placeholder={ko.episode.titlePlaceholder}
            />
            <TextInput
              style={styles.contentInput}
              value={content}
              onChangeText={(text) => {
                hasEditedRef.current = true;
                setContent(text);
              }}
              placeholder={ko.episode.contentPlaceholder}
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <ActivityIndicator color="#1f1f1f" />
              ) : (
                <Text style={styles.saveButtonText}>{ko.episode.save}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.publishButton]}
              onPress={handlePublish}
              disabled={publishMutation.isPending}
            >
              {publishMutation.isPending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.publishButtonText}>{ko.episode.publish}</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.readTitle}>{episode.title ?? ko.library.untitledEpisode}</Text>
            <Text style={styles.readContent}>{episode.content}</Text>
          </>
        )}

        {isAuthor ? (
          <View style={styles.originalDiarySection}>
            <TouchableOpacity onPress={() => setShowOriginal((prev) => !prev)}>
              <Text style={styles.originalDiaryToggle}>
                {showOriginal ? ko.episode.hideOriginalDiary : ko.episode.readOriginalDiary}
              </Text>
            </TouchableOpacity>

            {showOriginal ? (
              <View style={styles.originalDiaryContent}>
                {sourcesQuery.isLoading ? (
                  <ActivityIndicator />
                ) : (sourcesQuery.data ?? []).length === 0 ? (
                  <Text style={styles.emptyText}>{ko.episode.originalDiaryEmpty}</Text>
                ) : (
                  (sourcesQuery.data ?? []).map((entry) => (
                    <OriginalDiaryEntry key={entry.id} entry={entry} />
                  ))
                )}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footerBar}>
        {canModerate ? (
          <View style={styles.moderationSection}>
            <TouchableOpacity
              style={styles.reportToggle}
              onPress={() => setShowReportReasons((prev) => !prev)}
            >
              <Text style={styles.reportToggleText}>{ko.moderation.report}</Text>
            </TouchableOpacity>

            {showReportReasons ? (
              <View style={styles.reportReasons}>
                <Text style={styles.reportReasonPrompt}>{ko.moderation.reportReasonPrompt}</Text>
                <View style={styles.reportReasonChips}>
                  {REPORT_REASONS.map((reason) => (
                    <TouchableOpacity
                      key={reason}
                      style={styles.reportReasonChip}
                      onPress={() => submitReport(reason)}
                      disabled={reportMutation.isPending}
                    >
                      <Text style={styles.reportReasonChipText}>{reason}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function OriginalDiaryEntry({ entry }: { entry: DiaryEntryRow }) {
  return (
    <View style={styles.diaryEntryBlock}>
      <Text style={styles.diaryEntryDate}>{entry.entry_date}</Text>
      <Text style={styles.diaryEntryText}>{entry.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  topBar: {
    minHeight: 0,
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  footerBar: {
    minHeight: 0,
  },
  blockLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#e0245e",
  },
  moderationSection: {
    borderTopWidth: 1,
    borderTopColor: "#eeeeee",
    padding: 20,
    gap: 12,
  },
  reportToggle: {
    alignSelf: "flex-start",
  },
  reportToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#777777",
  },
  reportReasons: {
    gap: 10,
  },
  reportReasonPrompt: {
    fontSize: 13,
    color: "#999999",
  },
  reportReasonChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  reportReasonChip: {
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  reportReasonChipText: {
    fontSize: 13,
    color: "#333333",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  meta: {
    fontSize: 13,
    color: "#999999",
    marginBottom: 16,
  },
  pendingBlock: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  pendingText: {
    fontSize: 14,
    color: "#777777",
    textAlign: "center",
  },
  titleInput: {
    fontSize: 20,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  contentInput: {
    fontSize: 16,
    lineHeight: 24,
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 10,
    padding: 12,
    minHeight: 240,
    marginBottom: 16,
  },
  button: {
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: "#f0f0f0",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f1f1f",
  },
  publishButton: {
    backgroundColor: "#000000",
  },
  publishButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  readTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
  },
  readContent: {
    fontSize: 16,
    lineHeight: 26,
  },
  originalDiarySection: {
    marginTop: 32,
    borderTopWidth: 1,
    borderTopColor: "#eeeeee",
    paddingTop: 16,
  },
  originalDiaryToggle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3366cc",
  },
  originalDiaryContent: {
    marginTop: 12,
    gap: 16,
  },
  diaryEntryBlock: {
    backgroundColor: "#f7f7f7",
    borderRadius: 10,
    padding: 12,
  },
  diaryEntryDate: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999999",
    marginBottom: 6,
  },
  diaryEntryText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#333333",
  },
  errorText: {
    fontSize: 15,
    color: "#e0245e",
  },
  emptyText: {
    fontSize: 14,
    color: "#999999",
  },
});
