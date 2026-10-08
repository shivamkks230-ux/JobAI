import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, formatDateTime, label, timeAgo } from "@/src/api";
import { useBottomChrome } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { Badge, Button, Card, EmptyView, ErrorView, IconButton, LoadingView, MatchBadge, SectionTitle } from "@/src/ui";

export function VerificationBanner({ status }: { status: string }) {
  const { colors } = useTheme();
  const s = useStyles();
  if (status === "verified") return null;
  const msg: Record<string, string> = {
    pending: "Your company is under review. Jobs you post will be published after admin approval.",
    rejected: "Your company verification was rejected. Update company details and contact support.",
    suspended: "Your company is suspended. Job posting is disabled.",
  };
  return (
    <Card testID="verification-banner" style={{ backgroundColor: status === "pending" ? colors.warningSoft : colors.errorSoft, borderColor: "transparent" }}>
      <Text style={s.body}>{msg[status] ?? status}</Text>
    </Card>
  );
}

export default function Dashboard() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const bottom = useBottomChrome();
  const router = useRouter();
  const q = useQuery({ queryKey: ["rdash"], queryFn: () => api("/recruiter/dashboard") });
  const unread = useQuery({ queryKey: ["unread"], queryFn: () => api("/notifications"), select: (d: any) => d.unread });
  const d: any = q.data;
  const M = [
    ["active_jobs", "Active jobs"],
    ["total_applications", "Total applications"],
    ["new_applications", "New (unviewed)"],
    ["shortlisted", "Shortlisted"],
    ["interviews", "Interviews"],
    ["hired", "Hired"],
    ["rejected", "Rejected"],
    ["pending_jobs", "Pending approval"],
  ];
  return (
    <View style={s.root}>
      <View style={[s.top, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.h1}>Hiring dashboard</Text>
          <Text style={s.sub} numberOfLines={1}>{d?.company?.name ?? ""}</Text>
        </View>
        <IconButton name="notifications-outline" badge={unread.data} onPress={() => router.push("/notifications")} testID="recruiter-notifications-button" />
      </View>
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={(q.error as Error).message} onRetry={q.refetch} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: bottom + 24 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} />}>
          <VerificationBanner status={d.company.verification_status} />
          <View style={s.grid}>
            {M.map(([k, l]) => (
              <Card key={k} style={s.metric} testID={`metric-${k}`}>
                <Text style={s.metricV}>{d.metrics[k]}</Text>
                <Text style={s.metricL}>{l}</Text>
              </Card>
            ))}
          </View>
          <Button title="Post a new job" icon="add" onPress={() => router.push("/job-form")} testID="dashboard-post-job" />
          <SectionTitle title="Upcoming interviews" action="All" onAction={() => router.push("/interviews")} testID="dashboard-see-interviews" />
          {d.upcoming_interviews.length === 0 ? (
            <Text style={s.sub}>No upcoming interviews.</Text>
          ) : (
            d.upcoming_interviews.map((iv: any) => (
              <Card key={iv.id} onPress={() => router.push(`/applicant/${iv.application_id}`)} testID={`dashboard-interview-${iv.id}`}>
                <Text style={s.title}>{iv.candidate_name}</Text>
                <Text style={s.sub}>{iv.job_title} · {formatDateTime(iv.scheduled_at)} · {label(iv.mode)}</Text>
              </Card>
            ))
          )}
          <SectionTitle title="Recent applications" action="Pipeline" onAction={() => router.push("/candidates")} testID="dashboard-see-pipeline" />
          {d.recent_applications.length === 0 ? (
            <EmptyView icon="people-outline" title="No applications yet" message="Applications will appear here when candidates apply to your jobs." action="Post job" onAction={() => router.push("/job-form")} />
          ) : (
            d.recent_applications.map((a: any) => (
              <Card key={a.id} onPress={() => router.push(`/applicant/${a.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }} testID={`dashboard-app-${a.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{a.candidate_name}</Text>
                  <Text style={s.sub}>{a.job_title} · {timeAgo(a.applied_at)}</Text>
                </View>
                {!a.viewed_at && <Badge text="New" tone="success" />}
                <MatchBadge score={a.match_score} />
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  h1: { fontSize: 22, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted, marginTop: 2 },
  body: { fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 20 },
  title: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: { width: "47%", flexGrow: 1, gap: 4, padding: 14 },
  metricV: { fontSize: 26, fontWeight: "800", color: c.brandPrimary },
  metricL: { fontSize: 12, color: c.muted, fontWeight: "600" },
}));
