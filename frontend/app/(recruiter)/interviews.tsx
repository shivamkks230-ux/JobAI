import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Text, View } from "react-native";

import { api, formatDateTime, label } from "@/src/api";
import { useBottomChrome } from "@/src/navigation";
import { makeStyles } from "@/src/theme";
import { Badge, Button, Card, Chip, ChipRow, EmptyView, ErrorView, Header, LoadingView, useToast } from "@/src/ui";

export default function Interviews() {
  const s = useStyles();
  const router = useRouter();
  const toast = useToast();
  const bottom = useBottomChrome();
  const [status, setStatus] = useState("scheduled");
  const q = useQuery({ queryKey: ["rinterviews", status], queryFn: () => api(`/recruiter/interviews?status=${status}`) });
  const items = (q.data as any)?.items ?? [];
  const set = async (id: string, st: string) => {
    try {
      await api(`/recruiter/interviews/${id}/status`, { body: { status: st } });
      toast(`Interview marked ${label(st)}`);
      q.refetch();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  return (
    <View style={s.root}>
      <Header title="Interviews" />
      <ChipRow testID="interviews-filter-row">
        {["scheduled", "completed", "cancelled", "no_show", ""].map((k) => (
          <Chip key={k || "all"} label={k ? label(k) : "All"} selected={status === k} onPress={() => setStatus(k)} testID={`interviews-filter-${k || "all"}`} />
        ))}
      </ChipRow>
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={(q.error as Error).message} onRetry={q.refetch} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i: any) => i.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: bottom + 24, flexGrow: 1 }}
          refreshing={q.isRefetching}
          onRefresh={q.refetch}
          ListEmptyComponent={<EmptyView icon="calendar-outline" title="No interviews" message="Schedule interviews from a candidate's profile." />}
          renderItem={({ item: iv }) => (
            <Card style={{ gap: 8 }} testID={`interview-card-${iv.id}`} onPress={() => router.push(`/applicant/${iv.application_id}`)}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={[s.title, { flex: 1 }]}>{iv.candidate_name}</Text>
                <Badge text={label(iv.status)} tone={iv.status === "scheduled" ? "brand" : "neutral"} />
              </View>
              <Text style={s.sub}>{iv.job_title}</Text>
              <Text style={s.sub}>{formatDateTime(iv.scheduled_at)} · {iv.duration_minutes} min · {label(iv.mode)}{iv.location_or_link ? ` · ${iv.location_or_link}` : ""}</Text>
              {iv.status === "scheduled" && (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button title="Completed" small variant="secondary" onPress={() => set(iv.id, "completed")} testID={`interview-complete-${iv.id}`} />
                  <Button title="No-show" small variant="outline" onPress={() => set(iv.id, "no_show")} testID={`interview-noshow-${iv.id}`} />
                  <Button title="Cancel" small variant="danger" onPress={() => set(iv.id, "cancelled")} testID={`interview-cancel-${iv.id}`} />
                </View>
              )}
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
  sub: { fontSize: 13, color: c.muted },
}));
