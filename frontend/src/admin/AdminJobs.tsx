import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Text, View } from "react-native";

import { api, formatExp, formatSalary, label, timeAgo } from "@/src/api";
import { makeStyles } from "@/src/theme";
import { Badge, Button, Card, EmptyView, ErrorView, Header, Input, LoadingView, Sheet, useToast } from "@/src/ui";

export function AdminJobs({ status, title, subtitle }: { status: string; title: string; subtitle: string }) {
  const s = useStyles();
  const router = useRouter();
  const toast = useToast();
  const [reject, setReject] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const q = useInfiniteQuery({
    queryKey: ["admin-jobs", status],
    queryFn: ({ pageParam }) => api(`/admin/jobs?status=${status}&page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (last: any, all) => (last.has_more ? all.length + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p: any) => p.items) ?? [];
  const total = (q.data?.pages[0] as any)?.total ?? 0;

  const act = async (id: string, action: string, note?: string) => {
    if (busy) return;
    setBusy(id + action);
    try {
      await api(`/admin/jobs/${id}/moderate`, { body: { action, note: note || null } });
      toast(action === "approve" ? "Job approved and published" : action === "reject" ? "Job rejected" : "Job updated");
      setReject(null);
      setReason("");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <View style={s.root}>
      <Header title={title} subtitle={`${subtitle} · ${total}`} />
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={(q.error as Error).message} onRetry={q.refetch} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(j: any) => j.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24, flexGrow: 1, maxWidth: 1000, width: "100%", alignSelf: "center" }}
          refreshing={q.isRefetching && !q.isFetchingNextPage}
          onRefresh={q.refetch}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          ListEmptyComponent={<EmptyView icon="checkmark-done-outline" title="Nothing here" message="No jobs in this status right now." />}
          renderItem={({ item: j }) => (
            <Card style={{ gap: 8 }} testID={`admin-job-${j.id}`}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Text style={[s.title, { flex: 1 }]}>{j.title}</Text>
                <Badge text={label(j.status)} tone={j.status === "published" ? "success" : j.status === "pending_approval" ? "warning" : j.status === "rejected" ? "error" : "neutral"} />
              </View>
              <Text style={s.sub}>{j.company_name} · {j.location} · {label(j.work_mode)} · {formatSalary(j.salary_min, j.salary_max, j.salary_period)} · {formatExp(j.min_experience, j.max_experience)}</Text>
              <Text style={s.sub}>Recruiter: {j.recruiter_name ?? "Admin/External"}{j.recruiter_email ? ` · ${j.recruiter_email}` : ""} · created {timeAgo(j.created_at)}</Text>
              {j.risk_flags?.length > 0 && <Text style={s.warn}>Automated checks (needs review, not an accusation): {j.risk_flags.join(", ")}</Text>}
              {j.moderation_note ? <Text style={s.sub}>Note: {j.moderation_note}</Text> : null}
              <View style={s.actions}>
                <Button title="View" small variant="outline" onPress={() => router.push(`/job/${j.id}`)} testID={`admin-job-view-${j.id}`} />
                {j.status !== "published" && <Button title="Approve" small icon="checkmark" loading={busy === j.id + "approve"} onPress={() => act(j.id, "approve")} testID={`admin-job-approve-${j.id}`} />}
                {j.status !== "rejected" && <Button title="Reject" small variant="danger" onPress={() => setReject(j)} testID={`admin-job-reject-${j.id}`} />}
                {j.status === "published" && <Button title={j.featured ? "Unfeature" : "Feature"} small variant="secondary" onPress={() => act(j.id, j.featured ? "unfeature" : "feature")} testID={`admin-job-feature-${j.id}`} />}
                <Button title="Edit" small variant="outline" onPress={() => router.push(`/job-form?id=${j.id}`)} testID={`admin-job-edit-${j.id}`} />
              </View>
            </Card>
          )}
        />
      )}
      <Sheet visible={!!reject} onClose={() => setReject(null)} title="Reject job" testID="reject-job-sheet">
        <Text style={s.sub}>{reject?.title} — the recruiter will see this reason.</Text>
        <Input label="Rejection reason" value={reason} onChangeText={setReason} multiline testID="reject-reason-input" />
        <Button title="Reject job" variant="danger" loading={!!busy} onPress={() => act(reject.id, "reject", reason)} testID="reject-job-confirm" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  title: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted },
  warn: { fontSize: 12, color: c.warningText },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
}));
