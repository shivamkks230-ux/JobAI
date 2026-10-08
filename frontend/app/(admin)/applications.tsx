import { useInfiniteQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { FlatList, Text, View } from "react-native";

import { api, label, timeAgo } from "@/src/api";
import { makeStyles } from "@/src/theme";
import { Badge, Card, Chip, ChipRow, EmptyView, ErrorView, Header, LoadingView, MatchBadge } from "@/src/ui";

const STAGES = ["", "applied", "screening", "shortlisted", "interview", "selected", "hired", "rejected"];

export default function AdminApplications() {
  const s = useStyles();
  const [stage, setStage] = useState("");
  const q = useInfiniteQuery({
    queryKey: ["admin-applications", stage],
    queryFn: ({ pageParam }) => api(`/admin/applications?stage=${stage}&page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (last: any, all) => (last.has_more ? all.length + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p: any) => p.items) ?? [];
  const total = (q.data?.pages[0] as any)?.total ?? 0;
  return (
    <View style={s.root}>
      <Header title="Applications" subtitle={`${total} total`} />
      <ChipRow testID="admin-app-stage-row">
        {STAGES.map((st) => <Chip key={st || "all"} label={st ? label(st) : "All"} selected={stage === st} onPress={() => setStage(st)} testID={`admin-app-stage-${st || "all"}`} />)}
      </ChipRow>
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={(q.error as Error).message} onRetry={q.refetch} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a: any) => a.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24, flexGrow: 1, maxWidth: 1000, width: "100%", alignSelf: "center" }}
          refreshing={q.isRefetching && !q.isFetchingNextPage}
          onRefresh={q.refetch}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          ListEmptyComponent={<EmptyView icon="document-text-outline" title="No applications yet" />}
          renderItem={({ item: a }) => (
            <Card style={{ gap: 4 }} testID={`admin-app-${a.id}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[s.title, { flex: 1 }]}>{a.candidate_name} → {a.job_title}</Text>
                <MatchBadge score={a.match_score} />
              </View>
              <Text style={s.sub}>{a.company_name} · Recruiter: {a.recruiter_name ?? "—"} · applied {timeAgo(a.applied_at)}</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Badge text={label(a.stage)} tone={a.stage === "rejected" ? "error" : a.stage === "hired" ? "success" : "brand"} />
                <Badge text={label(a.candidate_status)} tone="neutral" />
                {a.ai_resume_score != null && <Badge text={`Resume ${a.ai_resume_score}/100`} tone="neutral" />}
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  title: { fontSize: 15, fontWeight: "700", color: c.onSurface, flexShrink: 1 },
  sub: { fontSize: 13, color: c.muted },
}));
