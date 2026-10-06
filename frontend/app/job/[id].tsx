import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, formatExp, formatSalary, label, timeAgo } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToggleSave } from "@/src/JobCard";
import { makeStyles, useTheme } from "@/src/theme";
import { Badge, Button, Card, Chip, ErrorView, Header, Icon, IconButton, Input, LoadingView, Logo, MatchBadge, Sheet, VerifiedBadge, useToast } from "@/src/ui";

const REPORT = [
  { key: "fake_job", label: "Fake job" },
  { key: "scam", label: "Scam / payment request" },
  { key: "wrong_information", label: "Wrong information" },
  { key: "offensive", label: "Offensive content" },
  { key: "duplicate", label: "Duplicate" },
  { key: "other", label: "Other" },
];

export default function JobDetail() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const toggle = useToggleSave();
  const [report, setReport] = useState(false);
  const [rCat, setRCat] = useState("");
  const [rText, setRText] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["job", id], queryFn: () => api(`/jobs/${id}`) });
  const j: any = q.data;
  const isCandidate = user?.role === "candidate";

  const save = async () => {
    try {
      await toggle(j.id, j.saved);
      qc.setQueryData(["job", id], { ...j, saved: !j.saved });
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const external = async () => {
    try {
      const r = await api(`/jobs/${j.id}/external-click`, { method: "POST" });
      if (Platform.OS === "web") window.open(r.url, "_blank");
      else Linking.openURL(r.url);
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const submitReport = async () => {
    if (!rCat) return toast("Choose a reason", "error");
    setBusy(true);
    try {
      const r = await api(`/jobs/${j.id}/report`, { body: { category: rCat, details: rText || null } });
      toast(r.message, "success");
      setReport(false);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (q.isLoading) return <View style={s.root}><Header title="Job details" back /><LoadingView /></View>;
  if (q.isError) return <View style={s.root}><Header title="Job details" back /><ErrorView message={(q.error as Error).message} onRetry={q.refetch} /></View>;

  const lines = (t?: string) => (t ?? "").split(/\n+/).map((x) => x.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);

  return (
    <View style={s.root}>
      <Header
        title="Job details"
        back
        right={
          <View style={{ flexDirection: "row", gap: 8 }}>
            {isCandidate && <IconButton name={j.saved ? "bookmark" : "bookmark-outline"} color={j.saved ? colors.brand : undefined} onPress={save} testID="job-detail-save-button" />}
            <IconButton name="flag-outline" onPress={() => setReport(true)} testID="job-detail-report-button" />
          </View>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 120 }}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Logo fileId={j.company_logo_id} name={j.company_name} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={s.title} testID="job-detail-title">{j.title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={s.company} onPress={() => j.company_id && router.push(`/company/${j.company_id}`)} testID="job-detail-company-link">
                {j.company_name}
              </Text>
              {j.company_verified && <VerifiedBadge size={16} />}
            </View>
          </View>
        </View>
        <View style={s.wrap}>
          {j.is_test && <Badge text="TEST DATA" tone="error" />}
          {j.company_verified ? <Badge text="Verified employer" tone="info" icon="shield-checkmark" /> : <Badge text="Employer not yet verified" tone="warning" icon="alert-circle" />}
          {j.is_external && <Badge text={`External · ${j.source}`} tone="neutral" icon="open-outline" />}
          {j.status !== "published" && <Badge text={label(j.status)} tone="warning" />}
        </View>
        <Card style={s.facts}>
          <Fact icon="wallet-outline" k="Salary" v={formatSalary(j.salary_min, j.salary_max, j.salary_period)} />
          <Fact icon="location-outline" k="Location" v={j.location} />
          <Fact icon="briefcase-outline" k="Experience" v={formatExp(j.min_experience, j.max_experience)} />
          <Fact icon="business-outline" k="Work mode" v={label(j.work_mode)} />
          <Fact icon="time-outline" k="Type" v={label(j.employment_type)} />
          <Fact icon="people-outline" k="Openings" v={String(j.openings ?? 1)} />
          <Fact icon="calendar-outline" k="Posted" v={timeAgo(j.posted_at)} />
          {j.application_deadline ? <Fact icon="hourglass-outline" k="Apply by" v={j.application_deadline} /> : null}
        </Card>

        {j.match && (
          <Card testID="job-detail-match-card" style={{ gap: 12, borderColor: colors.brandSecondary, backgroundColor: colors.brandTertiary }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={s.h2}>AI Fit Analysis</Text>
              <MatchBadge score={j.match.score} large testID="job-detail-match-score" />
            </View>
            {j.match.reasons.length > 0 && <Text style={s.label}>Why this job matches</Text>}
            {j.match.reasons.map((r: string) => (
              <View key={r} style={s.li}>
                <Icon name="checkmark-circle" size={16} color={colors.success} />
                <Text style={s.liText}>{r}</Text>
              </View>
            ))}
            {j.match.gaps.length > 0 && <Text style={s.label}>Potential gaps</Text>}
            {j.match.gaps.map((g: string) => (
              <View key={g} style={s.li}>
                <Icon name="warning" size={16} color={colors.warning} />
                <Text style={s.liText}>{g}</Text>
              </View>
            ))}
            <Text style={s.disclaimer}>Match scores estimate fit based on your profile. They do not guarantee an interview or job offer.</Text>
          </Card>
        )}

        <Section title="About the role">
          <Text style={s.body}>{j.description}</Text>
        </Section>
        {lines(j.responsibilities).length > 0 && (
          <Section title="Responsibilities">
            {lines(j.responsibilities).map((l) => (
              <View key={l} style={s.li}><Text style={s.bullet}>•</Text><Text style={s.liText}>{l}</Text></View>
            ))}
          </Section>
        )}
        <Section title="Requirements">
          {j.education ? <Text style={s.body}>Education: {j.education}</Text> : null}
          <Text style={s.body}>Experience: {formatExp(j.min_experience, j.max_experience)}</Text>
        </Section>
        <Section title="Skills">
          <View style={s.wrap}>
            {(j.required_skills ?? []).map((k: string) => <Chip key={k} label={k} selected />)}
            {(j.preferred_skills ?? []).map((k: string) => <Chip key={k} label={`${k} (preferred)`} />)}
          </View>
        </Section>
        {lines(j.benefits).length > 0 && (
          <Section title="Benefits">
            {lines(j.benefits).map((l) => (
              <View key={l} style={s.li}><Icon name="gift-outline" size={14} color={colors.brand} /><Text style={s.liText}>{l}</Text></View>
            ))}
          </Section>
        )}
        <Text style={s.disclaimer}>JobMatch AI never asks for payment to apply. Report any job that requests money.</Text>
      </ScrollView>

      {isCandidate && (
        <View style={[s.cta, { paddingBottom: insets.bottom + 12 }]}>
          {j.application ? (
            <Button title={`Applied · ${label(j.application.stage)} — Track`} icon="git-commit-outline" variant="secondary" onPress={() => router.push(`/application/${j.application.id}`)} testID="job-detail-track-button" />
          ) : j.is_external ? (
            <View style={{ gap: 6 }}>
              <Button title="Apply on employer's site" icon="open-outline" onPress={external} testID="job-detail-external-apply" />
              <Text style={s.disclaimer}>{"You'll apply directly on the employer's website. This application is not tracked in JobMatch AI."}</Text>
            </View>
          ) : (
            <Button title="Apply Now" icon="paper-plane" onPress={() => router.push(`/apply/${j.id}`)} disabled={j.status !== "published"} testID="job-detail-apply-button" />
          )}
        </View>
      )}

      <Sheet visible={report} onClose={() => setReport(false)} title="Report this job" testID="report-sheet">
        <Text style={s.body}>Reports are reviewed by our team before any action is taken.</Text>
        <View style={s.wrap}>
          {REPORT.map((r) => <Chip key={r.key} label={r.label} selected={rCat === r.key} onPress={() => setRCat(r.key)} testID={`report-category-${r.key}`} />)}
        </View>
        <Input label="Details (optional)" multiline value={rText} onChangeText={setRText} testID="report-details-input" placeholder="What looks wrong?" />
        <Button title="Submit report" onPress={submitReport} loading={busy} testID="report-submit-button" />
      </Sheet>
    </View>
  );
}

function Fact({ icon, k, v }: { icon: any; k: string; v: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.fact}>
      <Icon name={icon} size={16} color={colors.brand} />
      <View>
        <Text style={s.factK}>{k}</Text>
        <Text style={s.factV}>{v}</Text>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const s = useStyles();
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.h2}>{title}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  title: { fontSize: 22, fontWeight: "800", color: c.onSurface, letterSpacing: -0.3 },
  company: { fontSize: 15, color: c.brand, fontWeight: "600" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  facts: { flexDirection: "row", flexWrap: "wrap", rowGap: 16, backgroundColor: c.surfaceSecondary },
  fact: { width: "50%", flexDirection: "row", gap: 8, alignItems: "flex-start", paddingRight: 8 },
  factK: { fontSize: 12, color: c.muted },
  factV: { fontSize: 14, fontWeight: "700", color: c.onSurface },
  h2: { fontSize: 17, fontWeight: "800", color: c.onSurface },
  label: { fontSize: 13, fontWeight: "700", color: c.onSurfaceSecondary, marginTop: 4 },
  li: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  liText: { flex: 1, fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 20 },
  bullet: { color: c.brand, fontSize: 16, lineHeight: 20 },
  body: { fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 22 },
  disclaimer: { fontSize: 12, color: c.muted, lineHeight: 17 },
  cta: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
}));
