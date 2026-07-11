import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { GENRE_LABEL_KO, TONE_LABEL_KO, type EpisodeRow } from "@daytale/shared";
import { useSeriesEpisodesQuery, useSeriesHeaderQuery } from "@/features/feed/useSeriesReader";
import { ko } from "@/i18n/ko";

/**
 * app/series/[id].tsx — OWNED BY WS-H (Feed & reader).
 *
 * Serial reader: episode list 1..n for one author's series, ordered by
 * `episode_number asc` (plan §1.5, §2.1 step 7, §4). RLS on `episodes`
 * already excludes blocked authors, so a blocked read simply yields an
 * empty list here with no extra client-side filtering.
 */
export default function SeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const header = useSeriesHeaderQuery(id);
  const episodes = useSeriesEpisodesQuery(id);

  const isLoading = header.isLoading || episodes.isLoading;
  const isError = header.isError || episodes.isError;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{ko.feed.seriesLoadFailed}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBlock}>
        <Text style={styles.title}>{header.data?.series.title ?? ko.feed.untitledSeries}</Text>
        <Text style={styles.author}>{header.data?.author?.nickname ?? ko.feed.unknownAuthor}</Text>
      </View>
      <FlatList
        data={episodes.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>{ko.feed.seriesEmpty}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <EpisodeListRow episode={item} onPress={() => router.push(`/episode/${item.id}`)} />
        )}
      />
    </View>
  );
}

function EpisodeListRow({
  episode,
  onPress,
}: {
  episode: EpisodeRow;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <Text style={styles.episodeNumber}>
        {episode.episode_number}
        {ko.episode.episodeNumber}
      </Text>
      <View style={styles.rowContent}>
        <Text style={styles.episodeTitle} numberOfLines={1}>
          {episode.title ?? ko.library.untitledEpisode}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {GENRE_LABEL_KO[episode.genre]} · {TONE_LABEL_KO[episode.tone]}
        </Text>
      </View>
    </TouchableOpacity>
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
  headerBlock: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
  },
  author: {
    fontSize: 14,
    color: "#777777",
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },
  episodeNumber: {
    fontSize: 15,
    fontWeight: "700",
    width: 48,
    color: "#444444",
  },
  rowContent: {
    flex: 1,
  },
  episodeTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  meta: {
    fontSize: 13,
    color: "#999999",
  },
  errorText: {
    fontSize: 15,
    color: "#e0245e",
  },
  emptyText: {
    fontSize: 15,
    color: "#999999",
    marginTop: 48,
  },
});
