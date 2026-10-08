import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";

import { api, label, timeAgo } from "@/src/api";
import { useBottomChrome } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { Badge, Card, Chip, ChipRow, EmptyView, ErrorView, Header, Icon, LoadingView, MatchBadge } from "@/src/ui";

const STAGES = ["", "applied", "screening", "shortlisted", "interview", "selected", "hired", "rejected"];

export default function Candidates() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const bottom = useBottomChrome();
  const { job_id } = useLocalSearchParams<{ job_id?: string }>();
  const [stage, setStage] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [minMatch, setMinMatch] = useState(0);
  const qs = `job_id=${job_id ?? ""}&stage=${stage}&q=${encodeURIComponent(search)}&min_match=${minMatch}`;
  const list = useInfiniteQuery({
    queryKey: ["pipeline", qs],
    queryFn: ({ pageParam }) => api(`/recruiter/applications?${qs}&page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (last: any, all) => (last.has_more ? all.length + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((p: any) => p.items) ?? [];
  const counts = (list.data?.pages[0] as any)?.counts ?? {};

  return (
    <View style={s.root}>
      <Header title="Candidates" subtitle={job_id ? "Filtered by job" : "All applicants"} right={job_id ? <Text style={s.clear} onPress={() => router.setParams({ job_id: "" })} testID="candidates-clear-job">Clear</Text> : null} />
      <View style={s.searchBox}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput testID="candidates-search-input" style={s.input} value={q} onChangeText={setQ} onSubmitEditing={() => setSearch(q)} returnKeyType="search" placeholder="Search name, headline or job" placeholderTextColor={colors.muted} />
      </View>
      <ChipRow testID="candidates-stage-row">
        {STAGES.map((st) => (
          <Chip key={st || "all"} label={`${st ? label(st) : "All"}${st && counts[st] ? ` (${counts[st]})` : ""}`} selected={stage === st} onPress={() => setStage(st)} testID={`candidates-stage-${st || "all"}`} />
        ))}
        {[70, 80, 90].map((m) => (
          <Chip key={m} label={`${m}%+ match`} selected={minMatch === m} onPress={() => setMinMatch(minMatch === m ? 0 : m)} testID={`candidates-match-${m}`} />
        ))}
      </ChipRow>
      {list.isLoading ? (
        <LoadingView />
      ) : list.isError ? (
        <ErrorView message={(list.error as Error).message} onRetry={list.refetch} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a: any) => a.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: bottom + 24, flexGrow: 1 }}
          refreshing={list.isRefetching && !list.isFetchingNextPage}
          onRefresh={list.refetch}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          ListEmptyComponent={<EmptyView icon="people-outline" title="No candidates yet" message={stage ? "No candidates in this stage yet." : "Applications to your jobs will appear here."} />}
          renderItem={({ item: a }) => (
            <Card testID={`candidate-card-${a.id}`} onPress={() => router.push(`/applicant/${a.id}`)} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{a.candidate_name}</Text>
                  <Text style={s.sub} numberOfLines={1}>{a.candidate_headline || "—"}</Text>
                </View>
                <MatchBadge score={a.match_score} />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Badge text={label(a.stage)} tone={a.stage === "rejected" ? "error" : a.stage === "hired" ? "success" : "brand"} />
                {!a.viewed_at && <Badge text="New" tone="success" />}
                {a.ai_resume_score != null && <Badge text={`AI ${a.ai_resume_score}`} tone="neutral" />}
                <Text style={s.sub} numberOfLines={1}>{a.job_title} · {timeAgo(a.applied_at)}</Text>
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
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 12, height: 48, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 15, color: c.onSurface, height: 46 },
  clear: { color: c.brand, fontWeight: "700" },
  title: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted, flexShrink: 1 },
}));
