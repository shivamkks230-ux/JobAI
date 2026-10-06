import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import React, { useState } from "react";
import { Linking, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, fileUrl, timeAgo, uploadFile } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Badge, Button, Card, Chip, ErrorView, Header, Icon, Input, LoadingView, Progress, Sheet, useToast } from "@/src/ui";

const MODES = [
  { key: "resume", label: "Improve resume" },
  { key: "summary", label: "Improve summary" },
  { key: "experience", label: "Experience bullets" },
  { key: "skills", label: "Skills section" },
  { key: "ats", label: "ATS optimisation" },
];

export default function Resume() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [mode, setMode] = useState("resume");
  const [role, setRole] = useState("");
  const [improving, setImproving] = useState(false);
  const [improve, setImprove] = useState<any>(null);
  const q = useQuery({
    queryKey: ["resume"],
    queryFn: () => api("/candidate/resume"),
    refetchInterval: (query) => ((query.state.data as any)?.analysis?.status === "processing" ? 3000 : false),
  });
  const r: any = (q.data as any)?.resume;
  const a: any = (q.data as any)?.analysis;

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const f = res.assets[0];
    if ((f.size ?? 0) > 5 * 1024 * 1024) return toast("File too large. Max 5 MB", "error");
    setUploading(true);
    try {
      await uploadFile("/candidate/resume", { uri: f.uri, name: f.name, mimeType: f.mimeType, file: (f as any).file });
      toast("Resume uploaded. AI analysis started.");
      setImprove(null);
      qc.invalidateQueries({ queryKey: ["resume"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setUploading(false);
    }
  };

  const open = (download: boolean) => {
    const url = fileUrl(r.file_id, download)!;
    if (Platform.OS === "web") window.open(url, "_blank");
    else Linking.openURL(url);
  };

  const del = async () => {
    try {
      await api("/candidate/resume", { method: "DELETE" });
      toast("Resume deleted", "info");
      setConfirmDel(false);
      qc.invalidateQueries({ queryKey: ["resume"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const runImprove = async () => {
    setImproving(true);
    setImprove(null);
    try {
      setImprove(await api("/ai/resume-improve", { body: { mode, target_role: role || null } }));
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setImproving(false);
    }
  };

  const reanalyze = async () => {
    try {
      await api("/candidate/resume/reanalyze", { method: "POST" });
      qc.invalidateQueries({ queryKey: ["resume"] });
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  return (
    <View style={s.root}>
      <Header title="Resume & AI analysis" back />
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={(q.error as Error).message} onRetry={q.refetch} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}>
          {!r ? (
            <Card style={{ alignItems: "center", gap: 12, paddingVertical: 32 }} testID="resume-empty">
              <View style={s.bigIcon}><Icon name="document-attach-outline" size={32} color={colors.brand} /></View>
              <Text style={s.h2}>Upload your resume</Text>
              <Text style={s.muted}>PDF, DOC or DOCX · max 5 MB. Our AI extracts your details and scores your resume. We never invent experience.</Text>
              <Button title="Choose file" icon="cloud-upload-outline" onPress={pick} loading={uploading} testID="resume-upload-button" />
            </Card>
          ) : (
            <Card style={{ gap: 12 }} testID="resume-file-card">
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <View style={s.fileIcon}><Icon name="document-text" size={22} color={colors.brand} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.h3} numberOfLines={1} testID="resume-file-name">{r.file_name}</Text>
                  <Text style={s.muted}>{(r.size / 1024).toFixed(0)} KB · uploaded {timeAgo(r.created_at)}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <Button title="View" small variant="outline" icon="eye-outline" onPress={() => open(false)} testID="resume-view-button" />
                <Button title="Download" small variant="outline" icon="download-outline" onPress={() => open(true)} testID="resume-download-button" />
                <Button title="Replace" small variant="secondary" icon="swap-horizontal" onPress={pick} loading={uploading} testID="resume-replace-button" />
                <Button title="Delete" small variant="danger" icon="trash-outline" onPress={() => setConfirmDel(true)} testID="resume-delete-button" />
              </View>
            </Card>
          )}

          {r && a?.status === "processing" && (
            <Card style={{ gap: 8 }} testID="resume-analysis-processing">
              <LoadingView testID="resume-analysis-loading" />
              <Text style={[s.muted, { textAlign: "center" }]}>AI is reading your resume… this takes about 10–20 seconds.</Text>
            </Card>
          )}
          {r && a?.status === "failed" && (
            <ErrorView message={a.error ?? "Analysis failed"} onRetry={reanalyze} testID="resume-analysis-error" />
          )}
          {r && a?.status === "completed" && (
            <>
              <Card style={{ gap: 12 }} testID="resume-score-card">
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={s.h2}>Resume score</Text>
                  <Text style={[s.score, { color: a.score >= 75 ? colors.success : a.score >= 50 ? colors.brand : colors.warning }]} testID="resume-score-value">{a.score}<Text style={s.muted}>/100</Text></Text>
                </View>
                <Progress value={a.score} color={a.score >= 75 ? colors.success : colors.brand} />
                <Text style={s.muted}>AI assessment of clarity and ATS readiness. It is guidance only, not a hiring prediction.</Text>
              </Card>
              <ListCard title="Strengths" items={a.strengths} icon="checkmark-circle" color={colors.success} testID="resume-strengths" />
              <ListCard title="Missing skills" items={a.missing_skills} icon="add-circle-outline" color={colors.warning} testID="resume-missing-skills" />
              <ListCard title="Missing keywords" items={a.missing_keywords} icon="key-outline" color={colors.warning} testID="resume-missing-keywords" />
              <ListCard title="Formatting issues" items={a.formatting_issues} icon="construct-outline" color={colors.error} testID="resume-formatting" />
              <ListCard title="Experience gaps" items={a.experience_gaps} icon="time-outline" color={colors.muted} testID="resume-gaps" />
              <ListCard title="Suggestions" items={a.suggestions} icon="bulb-outline" color={colors.brand} testID="resume-suggestions" />
              {a.parsed && (
                <Card style={{ gap: 8 }} testID="resume-parsed-card">
                  <Text style={s.h3}>Extracted from your resume</Text>
                  <Text style={s.muted}>Empty profile fields were filled automatically. Review them in Edit profile.</Text>
                  {a.parsed.years_of_experience != null && <Text style={s.body}>Experience: {a.parsed.years_of_experience} years{a.parsed.industry ? ` · ${a.parsed.industry}` : ""}</Text>}
                  {a.parsed.job_titles?.length > 0 && <Text style={s.body}>Titles: {a.parsed.job_titles.join(", ")}</Text>}
                  {a.parsed.companies?.length > 0 && <Text style={s.body}>Companies: {a.parsed.companies.join(", ")}</Text>}
                  {a.parsed.education?.length > 0 && <Text style={s.body}>Education: {a.parsed.education.map((e: any) => [e.degree, e.institution].filter(Boolean).join(", ")).join("; ")}</Text>}
                  {a.parsed.certifications?.length > 0 && <Text style={s.body}>Certifications: {a.parsed.certifications.join(", ")}</Text>}
                  {a.parsed.projects?.length > 0 && <Text style={s.body}>Projects: {a.parsed.projects.map((p: any) => (typeof p === "string" ? p : p.name ?? p.title)).join(", ")}</Text>}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {(a.parsed.skills ?? []).map((k: string) => <Badge key={k} text={k} tone="brand" />)}
                  </View>
                </Card>
              )}

              <Card style={{ gap: 12 }} testID="resume-improve-card">
                <Text style={s.h2}>AI resume improvement</Text>
                <Text style={s.muted}>Get before/after rewrites. {"AI only rephrases what's in your resume — it never adds qualifications."}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {MODES.map((m) => <Chip key={m.key} label={m.label} selected={mode === m.key} onPress={() => setMode(m.key)} testID={`improve-mode-${m.key}`} />)}
                </View>
                <Input label="Target role (optional)" value={role} onChangeText={setRole} placeholder="e.g. Customer Success Manager" testID="improve-role-input" />
                <Button title="Generate suggestions" icon="sparkles" onPress={runImprove} loading={improving} testID="improve-submit-button" />
                {improve && (
                  <View style={{ gap: 12 }} testID="improve-results">
                    {improve.summary ? <Text style={s.body}>{improve.summary}</Text> : null}
                    {(improve.items ?? []).map((it: any, i: number) => (
                      <View key={i} style={s.ba}>
                        <Text style={s.label}>{it.section}</Text>
                        <Text style={s.before}>Before: {it.before}</Text>
                        <Text style={s.after}>After: {it.after}</Text>
                        {it.why ? <Text style={s.muted}>{it.why}</Text> : null}
                      </View>
                    ))}
                    {(improve.tips ?? []).map((t: string) => <Text key={t} style={s.body}>• {t}</Text>)}
                  </View>
                )}
              </Card>
            </>
          )}
        </ScrollView>
      )}
      <Sheet visible={confirmDel} onClose={() => setConfirmDel(false)} title="Delete resume?" testID="resume-delete-sheet">
        <Text style={s.body}>Your resume file and its AI analysis will be removed. Past applications keep the copy you submitted until you delete your account.</Text>
        <Button title="Delete resume" variant="danger" onPress={del} testID="resume-delete-confirm" />
      </Sheet>
    </View>
  );
}

function ListCard({ title, items, icon, color, testID }: { title: string; items?: string[]; icon: any; color: string; testID: string }) {
  const s = useStyles();
  if (!items?.length) return null;
  return (
    <Card style={{ gap: 8 }} testID={testID}>
      <Text style={s.h3}>{title}</Text>
      {items.map((t) => (
        <View key={t} style={{ flexDirection: "row", gap: 8 }}>
          <Icon name={icon} size={16} color={color} />
          <Text style={[s.body, { flex: 1 }]}>{t}</Text>
        </View>
      ))}
    </Card>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  h2: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  h3: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  body: { fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 20 },
  muted: { fontSize: 13, color: c.muted, lineHeight: 18, textAlign: "left" },
  label: { fontSize: 12, fontWeight: "800", color: c.brand, textTransform: "uppercase" },
  score: { fontSize: 32, fontWeight: "800" },
  bigIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  fileIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  ba: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  before: { fontSize: 13, color: c.muted, lineHeight: 19, textDecorationLine: "line-through" },
  after: { fontSize: 14, color: c.successText, lineHeight: 20, fontWeight: "600" },
}));
