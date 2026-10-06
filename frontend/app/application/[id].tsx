import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, formatDateTime, label } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Badge, Button, Card, ErrorView, Header, Icon, LoadingView, Logo, MatchBadge, useToast } from "@/src/ui";

const FLOW = ["applied", "screening", "shortlisted", "interview", "selected", "hired"];

export default function ApplicationTracker() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["application", id], queryFn: () => api(`/applications/${id}`) });
  if (q.isLoading) return <View style={s.root}><Header title="Application" back /><LoadingView /></View>;
  if (q.isError) return <View style={s.root}><Header title="Application" back /><ErrorView message={(q.error as Error).message} onRetry={q.refetch} /></View>;
  const a: any = q.data;
  const rejected = a.stage === "rejected";
  const cur = FLOW.indexOf(a.stage);
  const eventFor = (st: string) => [...a.events].reverse().find((e: any) => e.stage === st);

  const withdraw = async () => {
    try {
      await api(`/applications/${id}/withdraw`, { method: "POST" });
      toast("Application withdrawn", "info");
      qc.invalidateQueries({ queryKey: ["application", id] });
      qc.invalidateQueries({ queryKey: ["applications"] });
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  return (
    <View style={s.root}>
      <Header title="Application tracker" back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} />}>
        <Card onPress={() => router.push(`/job/${a.job_id}`)} style={{ flexDirection: "row", gap: 12, alignItems: "center" }} testID="tracker-job-card">
          <Logo fileId={a.job?.company_logo_id} name={a.company_name} />
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{a.job_title}</Text>
            <Text style={s.sub}>{a.company_name} · {a.job?.location}</Text>
          </View>
          <MatchBadge score={a.match_score} />
        </Card>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Badge testID="tracker-current-stage" text={`Current: ${label(a.stage)}`} tone={rejected ? "error" : "brand"} />
          {a.viewed_at && <Badge text="Viewed by recruiter" tone="success" icon="eye" />}
          {a.candidate_status === "withdrawn" && <Badge text="Withdrawn" tone="neutral" />}
        </View>

        <Card style={{ gap: 0 }} testID="tracker-timeline">
          {FLOW.map((st, i) => {
            const done = !rejected ? i <= cur : !!eventFor(st);
            const ev = eventFor(st);
            const last = i === FLOW.length - 1 && !rejected;
            return (
              <View key={st} style={s.step} testID={`tracker-step-${st}`}>
                <View style={{ alignItems: "center" }}>
                  <View style={[s.node, done && s.nodeOn]}>{done && <Icon name="checkmark" size={14} color={colors.onBrandPrimary} />}</View>
                  {!last && <View style={[s.line, done && s.lineOn]} />}
                </View>
                <View style={{ flex: 1, paddingBottom: 20 }}>
                  <Text style={[s.stepTitle, !done && { color: colors.muted }]}>{label(st)}</Text>
                  {ev && <Text style={s.sub}>{formatDateTime(ev.created_at)}{ev.note ? ` · ${ev.note}` : ""}</Text>}
                </View>
              </View>
            );
          })}
          {rejected && (
            <View style={s.step}>
              <View style={[s.node, { backgroundColor: colors.error, borderColor: colors.error }]}>
                <Icon name="close" size={14} color={colors.onError} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.stepTitle, { color: colors.error }]}>Not selected</Text>
                <Text style={s.sub}>{formatDateTime(eventFor("rejected")?.created_at)} · Keep going — new matches arrive daily.</Text>
              </View>
            </View>
          )}
        </Card>

        {a.interviews?.length > 0 && (
          <Card style={{ gap: 10 }} testID="tracker-interviews">
            <Text style={s.h3}>Interviews</Text>
            {a.interviews.map((iv: any) => (
              <View key={iv.id} style={s.iv}>
                <Icon name={iv.mode === "phone" ? "call-outline" : iv.mode === "video" ? "videocam-outline" : "business-outline"} size={18} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={s.stepTitle}>{formatDateTime(iv.scheduled_at)} · {iv.duration_minutes} min</Text>
                  <Text style={s.sub}>{label(iv.mode)} · {label(iv.status)}{iv.location_or_link ? ` · ${iv.location_or_link}` : ""}</Text>
                  {iv.notes ? <Text style={s.sub}>{iv.notes}</Text> : null}
                </View>
              </View>
            ))}
            <Button title="Practice with AI Coach" small variant="secondary" icon="mic-outline" onPress={() => router.push("/coach")} testID="tracker-practice-button" />
          </Card>
        )}

        <Card style={{ gap: 8 }}>
          <Text style={s.h3}>Activity</Text>
          {a.events.map((e: any) => (
            <Text key={e.id} style={s.sub}>{formatDateTime(e.created_at)} — {label(e.stage)}{e.note ? `: ${e.note}` : ""}</Text>
          ))}
        </Card>
        {a.candidate_status !== "withdrawn" && !["hired", "rejected"].includes(a.stage) && (
          <Button title="Withdraw application" variant="danger" small onPress={withdraw} testID="tracker-withdraw-button" />
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  title: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted, marginTop: 2, lineHeight: 18 },
  h3: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  step: { flexDirection: "row", gap: 12 },
  node: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.borderStrong, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  nodeOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  line: { width: 2, flex: 1, minHeight: 20, backgroundColor: c.border },
  lineOn: { backgroundColor: c.brandPrimary },
  stepTitle: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  iv: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
}));
