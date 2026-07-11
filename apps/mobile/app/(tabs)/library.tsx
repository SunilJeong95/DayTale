import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import type { DiaryEntryRow, EpisodeRow, EpisodeStatus } from "@daytale/shared";
import { useAuth } from "@/hooks/useAuth";
import { ko } from "@/i18n/ko";
import {
  useDeleteDiaryEntry,
  useDeleteEpisode,
  useMyDiaryEntries,
  useMyEpisodes,
} from "@/features/library/useLibrary";

/**
 * app/(tabs)/library.tsx — OWNED BY WS-G (Library).
 *
 * The user's own content library (plan §4, §6 "라이브러리 조회·삭제
 * (초안/비공개/공개+원본)"): episodes grouped by status (draft/private/
 * published) plus a fourth tab listing the original diary entries. A
 * segmented control switches between the four sections rather than showing
 * everything at once, since the plan leaves the exact UI to our judgment.
 */
type LibraryTab = EpisodeStatus | "diary";

const EPISODE_TABS: EpisodeStatus[] = ["draft", "private", "published"];

export default function LibraryScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [tab, setTab] = useState<LibraryTab>("draft");

  const episodesQuery = useMyEpisodes(userId);
  const diaryQuery = useMyDiaryEntries(userId);
  const deleteEpisode = useDeleteEpisode(userId);
  const deleteDiaryEntry = useDeleteDiaryEntry(userId);

  const episodesByTab = useMemo(() => {
    const episodes = episodesQuery.data ?? [];
    return episodes.filter((episode) => episode.status === tab);
  }, [episodesQuery.data, tab]);

  const handleDeleteEpisode = (episode: EpisodeRow) => {
    Alert.alert(ko.common.delete, ko.library.deleteEpisodeConfirm, [
      { text: ko.common.cancel, style: "cancel" },
      {
        text: ko.common.delete,
        style: "destructive",
        onPress: () => {
          deleteEpisode.mutate(episode.id, {
            onError: (err) => {
              // eslint-disable-next-line no-console
              console.warn("[library] failed to delete episode", err);
              Alert.alert(ko.common.error, ko.library.deleteFailed);
            },
          });
        },
      },
    ]);
  };

  const handleDeleteDiaryEntry = (entry: DiaryEntryRow) => {
    Alert.alert(ko.common.delete, ko.library.deleteDiaryConfirm, [
      { text: ko.common.cancel, style: "cancel" },
      {
        text: ko.common.delete,
        style: "destructive",
        onPress: () => {
          deleteDiaryEntry.mutate(entry.id, {
            onError: (err) => {
              // eslint-disable-next-line no-console
              console.warn("[library] failed to delete diary entry", err);
              Alert.alert(ko.common.error, ko.library.deleteFailed);
            },
          });
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{ko.library.title}</Text>

      <View style={styles.tabBar}>
        {EPISODE_TABS.map((status) => (
          <TouchableOpacity
            key={status}
            style={[styles.tabButton, tab === status && styles.tabButtonActive]}
            onPress={() => setTab(status)}
          >
            <Text style={[styles.tabLabel, tab === status && styles.tabLabelActive]}>
              {tabLabel(status)}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.tabButton, tab === "diary" && styles.tabButtonActive]}
          onPress={() => setTab("diary")}
        >
          <Text style={[styles.tabLabel, tab === "diary" && styles.tabLabelActive]}>
            {ko.library.tabDiary}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === "diary" ? (
        <FlatList
          data={diaryQuery.data ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={diaryQuery.isRefetching}
              onRefresh={() => void diaryQuery.refetch()}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            diaryQuery.isLoading ? (
              <ActivityIndicator style={styles.loading} />
            ) : (
              <Text style={styles.emptyText}>{ko.library.emptyDiary}</Text>
            )
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/diary/${item.entry_date}`)}
            >
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{item.entry_date}</Text>
                <Text style={styles.rowSubtitle} numberOfLines={2}>
                  {item.text}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteDiaryEntry(item)}
              >
                <Text style={styles.deleteButtonText}>{ko.common.delete}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={episodesByTab}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={episodesQuery.isRefetching}
              onRefresh={() => void episodesQuery.refetch()}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            episodesQuery.isLoading ? (
              <ActivityIndicator style={styles.loading} />
            ) : (
              <Text style={styles.emptyText}>{ko.library.emptyEpisodes}</Text>
            )
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/episode/${item.id}`)}
            >
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>
                  {item.title ?? ko.library.untitledEpisode}
                </Text>
                <Text style={styles.rowSubtitle}>{item.sort_date}</Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteEpisode(item)}
              >
                <Text style={styles.deleteButtonText}>{ko.common.delete}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function tabLabel(status: EpisodeStatus): string {
  switch (status) {
    case "draft":
      return ko.library.tabDraft;
    case "private":
      return ko.library.tabPrivate;
    case "published":
      return ko.library.tabPublished;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 56,
  },
  header: {
    fontSize: 22,
    fontWeight: "700",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#f0f0f0",
  },
  tabButtonActive: {
    backgroundColor: "#1f1f1f",
  },
  tabLabel: {
    fontSize: 13,
    color: "#666666",
    fontWeight: "600",
  },
  tabLabelActive: {
    color: "#ffffff",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  loading: {
    marginTop: 32,
  },
  emptyText: {
    marginTop: 32,
    textAlign: "center",
    color: "#999999",
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#dddddd",
    gap: 12,
  },
  rowMain: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  rowSubtitle: {
    fontSize: 13,
    color: "#888888",
  },
  deleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteButtonText: {
    color: "#d33",
    fontSize: 13,
    fontWeight: "600",
  },
});
