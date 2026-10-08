import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useBottomChrome } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { Badge, Button, Card, ErrorView, IconButton, LoadingView, SectionTitle, Sheet, useToast } from "@/src/ui";

function Bars({ data, testID }: { data: { date?: string; label?: string; value: number }[]; testID: string }) {
  const { colors } = useTheme();
  const s = useStyles();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "flex-end", height: 90, gap: 3 }}>
      {data.map((d, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center", gap: 2 }}>
          <Text style={s.tiny}>{d.value || ""}</Text>
          <View style={{ width: "100%", height: Math.max(2, (d.value / max) * 64), borderRadius: 3, backgroundColor: d.value ? colors.brand : colors.surfaceTertiary }} />
        </View>
      ))}
    </View>
  );
}

function HBars({ data, testID }: { data: { label: string; value: number }[]; testID: string }) {
  const { colors } = useTheme();
  const s = useStyles();
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <Text style={s.sub}>No data yet</Text>;
  return (
    <View testID={testID} style={{ gap: 8 }}>
      {data.map((d) => (
        <View key={d.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={s.body} numberOfLines={1}>{d.label}</Text>
            <Text style={s.body}>{d.value}</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary }}>
            <View style={{ width: `${(d.value / max) * 100}%`, height: 6, borderRadius: 3, backgroundColor: colors.brand }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function Overview() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const bottom = useBottomChrome();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { logout } = useAuth();
  const [purge, setPurge] = useState(false);
  const m = useQuery({ queryKey: ["admin-metrics"], queryFn: () => api("/admin/metrics") });
  const an = useQuery({ queryKey: ["admin-analytics"], queryFn: () => api("/admin/analytics") });
  const integ = useQuery({ queryKey: ["admin-integrations"], queryFn: () => api("/admin/integrations") });
  const d: any = m.data;
  const a: any = an.data;

  const doPurge = async () => {
    try {
      const r = await api("/admin/test-data", { method: "DELETE" });
      toast(`Removed ${r.users} users, ${r.jobs} jobs, ${r.applications} applications`, "info");
      setPurge(false);
      qc.invalidateQueries();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const METRICS = [
    ["total_users", "Total users"], ["candidates", "Candidates"], ["recruiters", "Recruiters"], ["active_users", "Active (30d)"],
    ["total_jobs", "Total jobs"], ["pending_jobs", "Pending approvals"], ["active_jobs", "Published jobs"], ["rejected_jobs", "Rejected jobs"],
    ["applications", "Applications"], ["shortlisted", "Shortlisted"], ["interviews", "Interviews"], ["hires", "Hired"],
    ["total_companies", "Companies"], ["verified_companies", "Verified cos."], ["open_reports", "Open reports"], ["revenue_inr", "Revenue (₹)"],
  ];

  return (
    <View style={s.root}>
      <View style={[s.top, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.h1}>Admin console</Text>
          <Text style={s.sub}>JobMatch AI platform overview</Text>
        </View>
        <IconButton name="log-out-outline" onPress={() => logout()} testID="admin-logout-button" />
      </View>
      {m.isLoading ? (
        <LoadingView />
      ) : m.isError ? (
        <ErrorView message={(m.error as Error).message} onRetry={m.refetch} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: bottom + 24 }} refreshControl={<RefreshControl refreshing={m.isRefetching} onRefresh={() => { m.refetch(); an.refetch(); }} />}>
          <View style={s.grid}>
            {METRICS.map(([k, l]) => (
              <Card key={k} style={s.metric} testID={`admin-metric-${k}`}>
                <Text style={s.mv}>{k === "revenue_inr" ? Number(d[k]).toLocaleString("en-IN") : d[k]}</Text>
                <Text style={s.ml}>{l}</Text>
              </Card>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Button title="Add verified job" small icon="add" onPress={() => router.push("/job-form")} testID="admin-add-job" />
            <Button title="Categories & skills" small variant="secondary" onPress={() => router.push("/admin-taxonomy")} testID="admin-taxonomy-link" />
            <Button title="Plans" small variant="secondary" onPress={() => router.push("/admin-plans")} testID="admin-plans-link" />
            <Button title="Applications" small variant="outline" onPress={() => router.push("/applications" as any)} testID="admin-applications-link" />
          </View>

          {an.isLoading ? <LoadingView /> : an.isError ? <ErrorView onRetry={an.refetch} /> : (
            <>
              <SectionTitle title="Analytics (last 14 days)" />
              {[
                ["daily_active_users", "Daily active users"], ["new_registrations", "New registrations"], ["candidate_growth", "Candidate growth"],
                ["recruiter_growth", "Recruiter growth"], ["jobs_posted", "Jobs posted"], ["applications", "Applications"],
              ].map(([k, l]) => (
                <Card key={k} style={{ gap: 8 }}>
                  <Text style={s.h3}>{l}</Text>
                  <Bars data={a[k]} testID={`chart-${k}`} />
                </Card>
              ))}
              <Card style={{ gap: 6 }} testID="chart-conversion">
                <Text style={s.h3}>Application conversion</Text>
                <Text style={s.mv}>{a.application_conversion.rate}%</Text>
                <Text style={s.sub}>{a.application_conversion.applications} applications from {a.application_conversion.job_views} job views</Text>
              </Card>
              <Card style={{ gap: 8 }}><Text style={s.h3}>Top job categories</Text><HBars data={a.top_categories} testID="chart-top-categories" /></Card>
              <Card style={{ gap: 8 }}><Text style={s.h3}>Top locations</Text><HBars data={a.top_locations} testID="chart-top-locations" /></Card>
            </>
          )}

          <SectionTitle title="Integrations" />
          <Card style={{ gap: 10 }} testID="admin-integrations">
            {((integ.data as any)?.items ?? []).map((i: any) => (
              <View key={i.key} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.body}>{i.name}</Text>
                  <Text style={s.tiny}>Env: {i.env}</Text>
                </View>
                <Badge text={i.configured ? "Configured" : "Not configured"} tone={i.configured ? "success" : "warning"} />
              </View>
            ))}
            <Text style={s.sub}>Secrets are set as server environment variables (Deployment → Secrets). They are never stored in the app.</Text>
          </Card>

          <Card style={{ gap: 8 }}>
            <Text style={s.h3}>Development test data</Text>
            <Text style={s.sub}>{d.test_records} test records (labelled [TEST]). Remove before going live.</Text>
            <Button title="Remove all test data" variant="danger" small onPress={() => setPurge(true)} testID="admin-purge-test-data" />
          </Card>
        </ScrollView>
      )}
      <Sheet visible={purge} onClose={() => setPurge(false)} title="Remove test data?" testID="purge-sheet">
        <Text style={s.body}>Deletes all records flagged is_test (test users, company, jobs and their applications). Your current admin session is kept.</Text>
        <Button title="Remove test data" variant="danger" onPress={doPurge} testID="purge-confirm-button" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  h1: { fontSize: 22, fontWeight: "800", color: c.onSurface },
  h3: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted, lineHeight: 18 },
  body: { fontSize: 14, color: c.onSurfaceSecondary, flexShrink: 1 },
  tiny: { fontSize: 9, color: c.muted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { width: "30%", flexGrow: 1, padding: 12, gap: 2, minWidth: 100 },
  mv: { fontSize: 22, fontWeight: "800", color: c.brandPrimary },
  ml: { fontSize: 11, color: c.muted, fontWeight: "600" },
}));
