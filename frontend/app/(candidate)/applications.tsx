import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Text, View } from "react-native";

import { api, label, timeAgo } from "@/src/api";
import { useBottomChrome } from "@/src/navigation";
import { makeStyles } from "@/src/theme";
import { Badge, Card, ChipRow, Chip, EmptyView, ErrorView, Header, LoadingView, Logo, MatchBadge } from "@/src/ui";

export const TRACK = ["applied", "screening", "shortlisted", "interview", "selected"];

export function StageDots({ stage }: { stage: string }) {
  const s = useStyles();
  const idx = TRACK.indexOf(stage === "hired" ? "selected" : stage);
  const rejected = stage === "rejected";
  return (
    <View style={s.dots}>
      {TRACK.map((t, i) => (
        <View key={t} style={[s.dot, i <= idx && s.dotOn, rejected && s.dotRej]} />
      ))}
    </View>
  );
}

export default function Applications() {
  const s = useStyles();
  const router = useRouter();
  const bottom = useBottomChrome();
  const [filter, setFilter] = useState("all");
  const q = useQuery({ queryKey: ["applications"], queryFn: () => api("/applications") });
  const items = ((q.data as any)?.items ?? []).filter((a: any) =>
    filter === "all" ? true : filter === "active" ? !["rejected", "hired"].includes(a.stage) : filter === "interview" ? a.stage === "interview" : a.stage === filter,
  );
  return (
    <View style={s.root}>
      <Header title="Applications" subtitle="Track every step of your journey" />
      <ChipRow testID="applications-filter-row">
        {["all", "active", "interview", "hired", "rejected"].map((k) => (
          <Chip key={k} label={label(k)} selected={filter === k} onPress={() => setFilter(k)} testID={`applications-filter-${k}`} />
        ))}
      </ChipRow>
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={(q.error as Error).message} onRetry={q.refetch} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a: any) => a.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: bottom + 24, flexGrow: 1 }}
          refreshing={q.isRefetching}
          onRefresh={q.refetch}
          ListEmptyComponent={<EmptyView icon="paper-plane-outline" title="No applications yet" message="Start applying to see your progress here!" action="Find jobs" onAction={() => router.push("/jobs")} />}
          renderItem={({ item: a }) => (
            <Card testID={`application-card-${a.id}`} onPress={() => router.push(`/application/${a.id}`)} style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Logo fileId={a.company_logo_id} name={a.company_name} />
                <View style={{ flex: 1 }}>
                  <Text style={s.title} numberOfLines={1}>
                    {a.job_title}
                  </Text>
                  <Text style={s.sub} numberOfLines={1}>
                    {a.company_name} · {a.location}
                  </Text>
                </View>
                <MatchBadge score={a.match_score} />
              </View>
              <StageDots stage={a.stage} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Badge testID={`application-stage-${a.id}`} text={label(a.stage)} tone={a.stage === "rejected" ? "error" : a.stage === "hired" || a.stage === "selected" ? "success" : "brand"} />
                {a.candidate_status === "withdrawn" && <Badge text="Withdrawn" tone="neutral" />}
                <Text style={s.time}>Updated {timeAgo(a.updated_at)}</Text>
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
  title: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted, marginTop: 2 },
  time: { fontSize: 12, color: c.muted, marginLeft: "auto" },
  dots: { flexDirection: "row", gap: 4 },
  dot: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.surfaceTertiary },
  dotOn: { backgroundColor: c.brandPrimary },
  dotRej: { backgroundColor: c.errorSoft },
}));
