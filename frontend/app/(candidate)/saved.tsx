import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, View } from "react-native";

import { api } from "@/src/api";
import { JobCard } from "@/src/JobCard";
import { useBottomChrome } from "@/src/navigation";
import { useTheme } from "@/src/theme";
import { EmptyView, ErrorView, Header, LoadingView } from "@/src/ui";

export default function Saved() {
  const { colors } = useTheme();
  const router = useRouter();
  const bottom = useBottomChrome();
  const q = useQuery({ queryKey: ["saved"], queryFn: () => api("/saved") });
  const items = (q.data as any)?.items ?? [];
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <Header title="Saved jobs" subtitle={items.length ? `${items.length} saved` : undefined} />
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={(q.error as Error).message} onRetry={q.refetch} />
      ) : (
        <FlatList
          testID="saved-list"
          data={items}
          keyExtractor={(j: any) => j.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: bottom + 24, flexGrow: 1 }}
          refreshing={q.isRefetching}
          onRefresh={q.refetch}
          renderItem={({ item }) => <JobCard key={`${item.id}-${item.saved}`} job={item} />}
          ListEmptyComponent={<EmptyView icon="bookmark-outline" title="No saved jobs" message="Tap the bookmark on any job to save it for later." action="Browse jobs" onAction={() => router.push("/jobs")} />}
        />
      )}
    </View>
  );
}
