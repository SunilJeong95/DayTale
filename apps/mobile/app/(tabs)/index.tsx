import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import type { PublicFeedSeriesRow } from "@daytale/shared";
import { useFeedQuery } from "@/features/feed/useFeed";
import { ko } from "@/i18n/ko";

/**
 * app/(tabs)/index.tsx — OWNED BY WS-H (Feed & reader).
 *
 * Feed home: list of authors with >=1 published episode, from the
 * `public_feed_series` view, sorted by most recently updated series first
 * (plan §1.5, §4). Tapping a row opens the series reader.
 */
export default function FeedScreen() {
  const { data, isLoading, isError, refetch, isRefetching } = useFeedQuery();

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
        <Text style={styles.errorText}>{ko.feed.loadFailed}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{ko.feed.title}</Text>
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.series_id}
        contentContainerStyle={styles.listContent}
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>{ko.feed.empty}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <FeedSeriesRow item={item} onPress={() => router.push(`/series/${item.series_id}`)} />
        )}
      />
    </View>
  );
}

function FeedSeriesRow({
  item,
  onPress,
}: {
  item: PublicFeedSeriesRow;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={styles.rowContent}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title ?? ko.feed.untitledSeries}
        </Text>
        <Text style={styles.author} numberOfLines={1}>
          {item.author_nickname ?? ko.feed.unknownAuthor}
        </Text>
      </View>
      <Text style={styles.count}>
        {item.published_episode_count}
        {ko.feed.episodeCount}
      </Text>
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
  header: {
    fontSize: 24,
    fontWeight: "700",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },
  rowContent: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 4,
  },
  author: {
    fontSize: 14,
    color: "#777777",
  },
  count: {
    fontSize: 14,
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
