import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Linking, Text, View } from "react-native";

import { api, formatSalary, label, timeAgo } from "@/src/api";
import { useBottomChrome } from "@/src/navigation";
import { makeStyles } from "@/src/theme";
import { Badge, Button, Card, Chip, ChipRow, EmptyView, ErrorView, Header, Input, LoadingView, Segmented, useToast } from "@/src/ui";

export default function Review() {
  const s = useStyles();
  const router = useRouter();
  const toast = useToast();
  const bottom = useBottomChrome();
  const [tab, setTab] = useState<"companies" | "jobs">("companies");
  const [cStatus, setCStatus] = useState("pending");
  const [jStatus, setJStatus] = useState("pending_approval");
  const [note, setNote] = useState("");
  const comps = useQuery({ queryKey: ["admin-companies", cStatus], queryFn: () => api(`/admin/companies?status=${cStatus}`), enabled: tab === "companies" });
  const jobs = useQuery({ queryKey: ["admin-jobs", jStatus], queryFn: () => api(`/admin/jobs?status=${jStatus}`), enabled: tab === "jobs" });
  const q = tab === "companies" ? comps : jobs;
  const items = (q.data as any)?.items ?? [];

  const act = async (path: string, body: any, ok: string) => {
    try {
      await api(path, { body: { ...body, note: note || null } });
      toast(ok);
      setNote("");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  return (
    <View style={s.root}>
      <Header title="Review queue" subtitle="Verify companies and approve jobs" />
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
        <Segmented testIDPrefix="review-tab" value={tab} onChange={setTab} options={[{ key: "companies", label: "Companies" }, { key: "jobs", label: "Jobs" }]} />
        <Input value={note} onChangeText={setNote} placeholder="Optional note sent with your decision" testID="review-note-input" />
      </View>
      <ChipRow testID="review-status-row">
        {(tab === "companies" ? ["pending", "verified", "rejected", "suspended", ""] : ["pending_approval", "published", "paused", "rejected", "closed", ""]).map((k) => (
          <Chip key={k || "all"} label={k ? label(k) : "All"} selected={(tab === "companies" ? cStatus : jStatus) === k} onPress={() => (tab === "companies" ? setCStatus(k) : setJStatus(k))} testID={`review-status-${k || "all"}`} />
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
          ListEmptyComponent={<EmptyView icon="checkmark-done-outline" title="Queue is clear" message="Nothing to review in this status." />}
          renderItem={({ item: i }) =>
            tab === "companies" ? (
              <Card style={{ gap: 8 }} testID={`review-company-${i.id}`}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={[s.title, { flex: 1 }]}>{i.name}</Text>
                  <Badge text={label(i.verification_status)} tone={i.verification_status === "verified" ? "success" : i.verification_status === "pending" ? "warning" : "error"} />
                </View>
                <Text style={s.sub}>{[i.industry, i.size, i.location].filter(Boolean).join(" · ")}</Text>
                {i.website ? <Text style={s.link} onPress={() => Linking.openURL(i.website)}>{i.website}</Text> : <Text style={s.sub}>No website provided</Text>}
                <Text style={s.sub}>Recruiter: {i.owner?.name} · {i.owner?.email}</Text>
                <Text style={s.sub}>{i.jobs_count} jobs · {i.open_reports} open reports · joined {timeAgo(i.created_at)}</Text>
                <View style={s.actions}>
                  {i.verification_status !== "verified" && <Button title="Verify" small icon="shield-checkmark" onPress={() => act(`/admin/companies/${i.id}/verify`, { status: "verified" }, "Company verified")} testID={`review-verify-${i.id}`} />}
                  {i.verification_status !== "rejected" && <Button title="Reject" small variant="outline" onPress={() => act(`/admin/companies/${i.id}/verify`, { status: "rejected" }, "Company rejected")} testID={`review-reject-company-${i.id}`} />}
                  {i.verification_status !== "suspended" && <Button title="Suspend" small variant="danger" onPress={() => act(`/admin/companies/${i.id}/verify`, { status: "suspended" }, "Company suspended")} testID={`review-suspend-${i.id}`} />}
                </View>
              </Card>
            ) : (
              <Card style={{ gap: 8 }} testID={`review-job-${i.id}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={[s.title, { flex: 1 }]} onPress={() => router.push(`/job/${i.id}`)}>{i.title}</Text>
                  <Badge text={label(i.status)} tone={i.status === "published" ? "success" : i.status === "pending_approval" ? "warning" : "neutral"} />
                </View>
                <Text style={s.sub}>{i.company_name} {i.company_verified ? "· verified" : "· unverified"} · {i.location} · {formatSalary(i.salary_min, i.salary_max, i.salary_period)}</Text>
                {i.risk_flags?.length > 0 && (
                  <View style={{ gap: 4 }} testID={`review-risk-${i.id}`}>
                    <Text style={s.warn}>Automated checks flagged for review (not an accusation):</Text>
                    {i.risk_flags.map((f: string) => <Text key={f} style={s.warn}>• {f}</Text>)}
                  </View>
                )}
                <View style={s.actions}>
                  {i.status !== "published" && <Button title="Approve" small onPress={() => act(`/admin/jobs/${i.id}/moderate`, { action: "approve" }, "Job approved")} testID={`review-approve-${i.id}`} />}
                  {i.status === "pending_approval" && <Button title="Reject" small variant="outline" onPress={() => act(`/admin/jobs/${i.id}/moderate`, { action: "reject" }, "Job rejected")} testID={`review-reject-job-${i.id}`} />}
                  <Button title={i.featured ? "Unfeature" : "Feature"} small variant="secondary" onPress={() => act(`/admin/jobs/${i.id}/moderate`, { action: i.featured ? "unfeature" : "feature" }, "Updated")} testID={`review-feature-${i.id}`} />
                  <Button title="Edit" small variant="outline" onPress={() => router.push(`/job-form?id=${i.id}`)} testID={`review-edit-${i.id}`} />
                  {i.status !== "closed" && <Button title="Remove" small variant="danger" onPress={() => act(`/admin/jobs/${i.id}/moderate`, { action: "remove" }, "Job removed")} testID={`review-remove-${i.id}`} />}
                </View>
              </Card>
            )
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  title: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted },
  link: { fontSize: 13, color: c.brand },
  warn: { fontSize: 12, color: c.warningText },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
}));
