import { useQuery } from "@tanstack/react-query";
import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Card, ErrorView, Header, LoadingView } from "@/src/ui";

function Bars({ data }: { data: { label: string; value: number }[] }) {
  const s = useStyles();
  const { colors } = useTheme();
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <Text style={s.sub}>No data yet</Text>;
  return (
    <View style={{ gap: 8 }}>
      {data.map((d) => (
        <View key={d.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={s.body} numberOfLines={1}>{d.label}</Text>
            <Text style={s.body}>{d.value}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceTertiary }}>
            <View style={{ width: `${(d.value / max) * 100}%`, height: 8, borderRadius: 4, backgroundColor: colors.brand }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function Analytics() {
  const s = useStyles();
  const m = useQuery({ queryKey: ["admin-metrics"], queryFn: () => api("/admin/metrics") });
  const a = useQuery({ queryKey: ["admin-analytics"], queryFn: () => api("/admin/analytics") });
  const d: any = m.data;
  const an: any = a.data;
  const sum = (arr?: any[]) => (arr ?? []).reduce((t, x) => t + x.value, 0);
  return (
    <View style={s.root}>
      <Header title="Reports & Analytics" subtitle="Live platform data" />
      {m.isLoading || a.isLoading ? (
        <LoadingView />
      ) : m.isError || a.isError ? (
        <ErrorView message="Unable to load data." onRetry={() => { m.refetch(); a.refetch(); }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24, maxWidth: 1000, width: "100%", alignSelf: "center" }}
          refreshControl={<RefreshControl refreshing={m.isRefetching} onRefresh={() => { m.refetch(); a.refetch(); }} />}
        >
          <Card style={{ gap: 12 }} testID="analytics-funnel">
            <Text style={s.h3}>Hiring funnel (all time)</Text>
            <Bars data={[
              { label: "Jobs posted", value: d.total_jobs },
              { label: "Jobs approved (live)", value: d.active_jobs },
              { label: "Jobs rejected", value: d.rejected_jobs },
              { label: "Applications", value: d.applications },
              { label: "Shortlisted", value: d.shortlisted },
              { label: "Interviews scheduled", value: d.interviews },
              { label: "Hired", value: d.hires },
            ]} />
          </Card>
          <Card style={{ gap: 12 }} testID="analytics-activity">
            <Text style={s.h3}>Active users (30 days)</Text>
            <Bars data={[{ label: "Active candidates", value: d.active_candidates }, { label: "Active recruiters", value: d.active_recruiters }]} />
          </Card>
          <Card style={{ gap: 12 }} testID="analytics-14d">
            <Text style={s.h3}>Last 14 days</Text>
            <Bars data={[
              { label: "New registrations", value: sum(an.new_registrations) },
              { label: "New candidates", value: sum(an.candidate_growth) },
              { label: "New recruiters", value: sum(an.recruiter_growth) },
              { label: "Jobs posted", value: sum(an.jobs_posted) },
              { label: "Applications", value: sum(an.applications) },
            ]} />
            <Text style={s.sub}>Application conversion: {an.application_conversion.rate}% ({an.application_conversion.applications} applications / {an.application_conversion.job_views} job views)</Text>
          </Card>
          <Card style={{ gap: 12 }}><Text style={s.h3}>Top job categories</Text><Bars data={an.top_categories} /></Card>
          <Card style={{ gap: 12 }}><Text style={s.h3}>Top locations</Text><Bars data={an.top_locations} /></Card>
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  h3: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted },
  body: { fontSize: 14, color: c.onSurfaceSecondary, flexShrink: 1 },
}));
