import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Text, View } from "react-native";

import { api, formatSalary, label, timeAgo } from "@/src/api";
import { useBottomChrome } from "@/src/navigation";
import { makeStyles } from "@/src/theme";
import { Badge, Button, Card, Chip, ChipRow, EmptyView, ErrorView, Header, IconButton, LoadingView, useToast } from "@/src/ui";

const TONE: Record<string, any> = { published: "success", pending_approval: "warning", paused: "neutral", closed: "neutral", rejected: "error", draft: "info", expired: "neutral" };

export default function Postings() {
  const s = useStyles();
  const router = useRouter();
  const toast = useToast();
  const bottom = useBottomChrome();
  const [status, setStatus] = useState("");
  const q = useQuery({ queryKey: ["rjobs", status], queryFn: () => api(`/recruiter/jobs${status ? `?status=${status}` : ""}`) });
  const items = (q.data as any)?.items ?? [];

  const change = async (id: string, st: string) => {
    try {
      await api(`/recruiter/jobs/${id}/status`, { body: { status: st } });
      toast(`Job ${st === "published" ? "resumed" : st}`);
      q.refetch();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  return (
    <View style={s.root}>
      <Header title="Job postings" right={<IconButton name="add" onPress={() => router.push("/job-form")} testID="postings-add-button" />} />
      <ChipRow testID="postings-filter-row">
        {["", "published", "pending_approval", "paused", "draft", "closed", "rejected", "expired"].map((k) => (
          <Chip key={k || "all"} label={k ? label(k) : "All"} selected={status === k} onPress={() => setStatus(k)} testID={`postings-filter-${k || "all"}`} />
        ))}
      </ChipRow>
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={(q.error as Error).message} onRetry={q.refetch} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(j: any) => j.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: bottom + 24, flexGrow: 1 }}
          refreshing={q.isRefetching}
          onRefresh={q.refetch}
          ListEmptyComponent={<EmptyView icon="briefcase-outline" title="No active jobs" message="Post a job to start receiving candidates." action="Post job" onAction={() => router.push("/job-form")} />}
          renderItem={({ item: j }) => (
            <Card style={{ gap: 10 }} testID={`posting-card-${j.id}`}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{j.title}</Text>
                  <Text style={s.sub}>{j.location} · {label(j.work_mode)} · {formatSalary(j.salary_min, j.salary_max, j.salary_period)}</Text>
                </View>
                <Badge text={label(j.status)} tone={TONE[j.status]} testID={`posting-status-${j.id}`} />
              </View>
              <Text style={s.sub}>{j.applications_count} applications · {j.views ?? 0} views · created {timeAgo(j.created_at)}</Text>
              {j.status === "pending_approval" && <Text style={s.sub}>Awaiting admin review before going live.</Text>}
              <View style={s.actions}>
                <Button title="Applicants" small variant="secondary" onPress={() => router.push(`/candidates?job_id=${j.id}` as any)} testID={`posting-applicants-${j.id}`} />
                {j.status !== "rejected" && j.status !== "closed" && <Button title="Edit" small variant="outline" onPress={() => router.push(`/job-form?id=${j.id}`)} testID={`posting-edit-${j.id}`} />}
                {j.status === "published" && <Button title="Pause" small variant="outline" onPress={() => change(j.id, "paused")} testID={`posting-pause-${j.id}`} />}
                {j.status === "paused" && <Button title="Resume" small variant="outline" onPress={() => change(j.id, "published")} testID={`posting-resume-${j.id}`} />}
                {j.status !== "closed" && <Button title="Close" small variant="danger" onPress={() => change(j.id, "closed")} testID={`posting-close-${j.id}`} />}
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
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
}));
