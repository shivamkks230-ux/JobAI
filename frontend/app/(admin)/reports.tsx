import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Text, View } from "react-native";

import { api, label, timeAgo } from "@/src/api";
import { useBottomChrome } from "@/src/navigation";
import { makeStyles } from "@/src/theme";
import { Badge, Button, Card, Chip, ChipRow, EmptyView, ErrorView, Header, LoadingView, useToast } from "@/src/ui";

export default function Reports() {
  const s = useStyles();
  const router = useRouter();
  const toast = useToast();
  const bottom = useBottomChrome();
  const [status, setStatus] = useState("open");
  const q = useQuery({ queryKey: ["admin-reports", status], queryFn: () => api(`/admin/reports?status=${status}`) });
  const items = (q.data as any)?.items ?? [];
  const resolve = async (id: string, st: string, action: string) => {
    try {
      await api(`/admin/reports/${id}/resolve`, { body: { status: st, action } });
      toast("Report updated");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  return (
    <View style={s.root}>
      <Header title="Reported content" subtitle="Every report is reviewed by a human" />
      <ChipRow testID="reports-status-row">
        {["open", "resolved", "dismissed", ""].map((k) => <Chip key={k || "all"} label={k ? label(k) : "All"} selected={status === k} onPress={() => setStatus(k)} testID={`reports-status-${k || "all"}`} />)}
      </ChipRow>
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={(q.error as Error).message} onRetry={q.refetch} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r: any) => r.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: bottom + 24, flexGrow: 1 }}
          refreshing={q.isRefetching}
          onRefresh={q.refetch}
          ListEmptyComponent={<EmptyView icon="flag-outline" title="No reports" message="Reported jobs appear here for review." />}
          renderItem={({ item: r }) => (
            <Card style={{ gap: 8 }} testID={`report-card-${r.id}`}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Text style={[s.title, { flex: 1 }]} onPress={() => router.push(`/job/${r.job_id}`)}>{r.job_title}</Text>
                <Badge text={label(r.category)} tone="error" />
              </View>
              <Text style={s.sub}>{r.company_name} · job {label(r.job_status)} · {r.report_count} report(s) · {timeAgo(r.created_at)}</Text>
              {r.details ? <Text style={s.body}>{`“${r.details}”`}</Text> : null}
              {r.risk_flags.length > 0 && <Text style={s.warn}>Automated flags: {r.risk_flags.join(", ")}</Text>}
              {r.status === "open" ? (
                <View style={s.actions}>
                  <Button title="Dismiss" small variant="outline" onPress={() => resolve(r.id, "dismissed", "none")} testID={`report-dismiss-${r.id}`} />
                  <Button title="Pause job" small variant="secondary" onPress={() => resolve(r.id, "resolved", "pause_job")} testID={`report-pause-${r.id}`} />
                  <Button title="Remove job" small variant="danger" onPress={() => resolve(r.id, "resolved", "remove_job")} testID={`report-remove-${r.id}`} />
                </View>
              ) : (
                <Badge text={`${label(r.status)} · ${label(r.action)}`} tone="neutral" />
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
  body: { fontSize: 14, color: c.onSurfaceSecondary, fontStyle: "italic" },
  warn: { fontSize: 12, color: c.warningText },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
}));
