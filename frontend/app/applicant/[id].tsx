import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Linking, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, fileUrl, formatDateTime, label } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Badge, Button, Card, Chip, ErrorView, Header, Icon, Input, LoadingView, Logo, MatchBadge, Sheet, useToast } from "@/src/ui";

const STAGES = ["applied", "screening", "shortlisted", "interview", "selected", "hired", "rejected"];

export default function Applicant() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["applicant", id], queryFn: () => api(`/recruiter/applications/${id}`) });
  const [sheet, setSheet] = useState<"" | "stage" | "interview" | "message">("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [iv, setIv] = useState({ date: "", time: "", duration: "30", mode: "video", link: "", notes: "" });
  const [busy, setBusy] = useState("");

  if (q.isLoading) return <View style={s.root}><Header title="Candidate" back /><LoadingView /></View>;
  if (q.isError) return <View style={s.root}><Header title="Candidate" back /><ErrorView message={(q.error as Error).message} onRetry={q.refetch} /></View>;
  const a: any = q.data;
  const c = a.candidate;
  const refresh = () => {
    q.refetch();
    qc.invalidateQueries({ queryKey: ["pipeline"] });
    qc.invalidateQueries({ queryKey: ["rdash"] });
    qc.invalidateQueries({ queryKey: ["rinterviews"] });
  };
  const run = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast(ok);
      setSheet("");
      refresh();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy("");
    }
  };
  const move = (stage: string) => run(stage, () => api(`/recruiter/applications/${id}/stage`, { body: { stage } }), `Moved to ${label(stage)}`);
  const addNote = () => note.trim() && run("note", () => api(`/recruiter/applications/${id}/notes`, { body: { note } }).then(() => setNote("")), "Note added");
  const schedule = () => {
    const d = new Date(`${iv.date}T${iv.time}`);
    if (isNaN(d.getTime())) return toast("Enter date as YYYY-MM-DD and time as HH:MM", "error");
    run("iv", () => api(`/recruiter/applications/${id}/interviews`, { body: { scheduled_at: d.toISOString(), duration_minutes: Number(iv.duration || 30), mode: iv.mode, location_or_link: iv.link || null, notes: iv.notes || null } }), "Interview scheduled");
  };
  const send = () => msg.trim() && run("msg", () => api(`/recruiter/applications/${id}/message`, { body: { body: msg } }).then(() => setMsg("")), "Message sent");
  const openResume = () => {
    const url = fileUrl(a.resume_file_id, true)!;
    if (Platform.OS === "web") window.open(url, "_blank");
    else Linking.openURL(url);
  };

  return (
    <View style={s.root}>
      <Header title={c.name ?? a.candidate_name} subtitle={a.job_title} back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}>
        <Card style={{ gap: 12 }} testID="applicant-summary">
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Logo fileId={c.photo_file_id} name={c.name} size={56} round />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{c.name}</Text>
              <Text style={s.sub}>{c.headline || "—"}</Text>
              <Text style={s.sub}>{c.current_location} · {c.experience_years ?? "?"} yrs · Notice {c.notice_period || "—"}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Badge text={label(a.stage)} tone={a.stage === "rejected" ? "error" : "brand"} testID="applicant-stage" />
            <MatchBadge score={a.match?.score} />
            {a.resume_score != null && <Badge text={`Resume ${a.resume_score}/100`} tone="neutral" />}
            {a.candidate_status === "withdrawn" && <Badge text="Withdrawn" tone="neutral" />}
          </View>
          {c.email ? <Text style={s.body}>Email: {c.email}</Text> : <Text style={s.sub}>Email not shared by candidate</Text>}
          {c.phone ? <Text style={s.body}>Phone: {c.phone}</Text> : <Text style={s.sub}>Phone not shared by candidate</Text>}
          {c.expected_salary ? <Text style={s.body}>Expected: ₹{(c.expected_salary / 100000).toFixed(1)} LPA</Text> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{(c.skills ?? []).map((k: string) => <Badge key={k} text={k} tone="brand" />)}</View>
          {(c.education ?? []).map((e: any, i: number) => <Text key={i} style={s.sub}>{[e.degree, e.institution, e.year].filter(Boolean).join(" · ")}</Text>)}
        </Card>

        <View style={s.actions}>
          <Button title="Shortlist" small icon="star-outline" onPress={() => move("shortlisted")} loading={busy === "shortlisted"} disabled={a.stage === "shortlisted"} testID="applicant-shortlist-button" />
          <Button title="Move stage" small variant="secondary" icon="git-commit-outline" onPress={() => setSheet("stage")} testID="applicant-move-stage-button" />
          <Button title="Interview" small variant="secondary" icon="calendar-outline" onPress={() => setSheet("interview")} testID="applicant-schedule-button" />
          <Button title="Resume" small variant="outline" icon="download-outline" onPress={openResume} testID="applicant-resume-button" />
          {c.allow_contact && <Button title="Message" small variant="outline" icon="chatbubble-outline" onPress={() => setSheet("message")} testID="applicant-message-button" />}
          <Button title="Reject" small variant="danger" icon="close" onPress={() => move("rejected")} loading={busy === "rejected"} disabled={a.stage === "rejected"} testID="applicant-reject-button" />
        </View>

        {a.match && (
          <Card style={{ gap: 6 }}>
            <Text style={s.h3}>AI match breakdown</Text>
            {a.match.reasons.map((r: string) => <Text key={r} style={s.body}>✓ {r}</Text>)}
            {a.match.gaps.map((g: string) => <Text key={g} style={s.body}>⚠ {g}</Text>)}
          </Card>
        )}
        {a.cover_letter ? <Card style={{ gap: 6 }}><Text style={s.h3}>Cover note</Text><Text style={s.body}>{a.cover_letter}</Text></Card> : null}

        {a.interviews.length > 0 && (
          <Card style={{ gap: 6 }} testID="applicant-interviews">
            <Text style={s.h3}>Interviews</Text>
            {a.interviews.map((i: any) => <Text key={i.id} style={s.body}>{formatDateTime(i.scheduled_at)} · {label(i.mode)} · {label(i.status)}</Text>)}
          </Card>
        )}

        <Card style={{ gap: 10 }} testID="applicant-notes">
          <Text style={s.h3}>Private notes</Text>
          {(a.recruiter_notes ?? []).map((n: any) => (
            <View key={n.id} style={s.note}><Text style={s.body}>{n.text}</Text><Text style={s.sub}>{n.author_name} · {formatDateTime(n.created_at)}</Text></View>
          ))}
          <Input value={note} onChangeText={setNote} placeholder="Add a note (only your team sees this)" multiline testID="applicant-note-input" />
          <Button title="Add note" small variant="secondary" onPress={addNote} loading={busy === "note"} testID="applicant-add-note" />
        </Card>

        {a.messages?.length > 0 && (
          <Card style={{ gap: 6 }}>
            <Text style={s.h3}>Messages sent</Text>
            {a.messages.map((m: any) => <Text key={m.id} style={s.body}>{formatDateTime(m.created_at)}: {m.body}</Text>)}
          </Card>
        )}

        <Card style={{ gap: 6 }}>
          <Text style={s.h3}>Timeline</Text>
          {a.events.map((e: any) => (
            <View key={e.id} style={{ flexDirection: "row", gap: 8 }}>
              <Icon name="ellipse" size={8} color={colors.brand} style={{ marginTop: 6 }} />
              <Text style={[s.body, { flex: 1 }]}>{label(e.stage)} · {formatDateTime(e.created_at)}{e.note ? ` — ${e.note}` : ""}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>

      <Sheet visible={sheet === "stage"} onClose={() => setSheet("")} title="Move to stage" testID="stage-sheet">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {STAGES.map((st) => <Chip key={st} label={label(st)} selected={a.stage === st} onPress={() => st !== a.stage && move(st)} testID={`stage-option-${st}`} />)}
        </View>
        <Text style={s.sub}>The candidate is notified of every stage change.</Text>
      </Sheet>

      <Sheet visible={sheet === "interview"} onClose={() => setSheet("")} title="Schedule interview" testID="interview-sheet">
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><Input label="Date (YYYY-MM-DD)" value={iv.date} onChangeText={(v) => setIv({ ...iv, date: v })} placeholder="2026-07-15" testID="interview-date-input" /></View>
          <View style={{ flex: 1 }}><Input label="Time (HH:MM)" value={iv.time} onChangeText={(v) => setIv({ ...iv, time: v })} placeholder="14:30" testID="interview-time-input" /></View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {["video", "phone", "in_person"].map((m) => <Chip key={m} label={label(m)} selected={iv.mode === m} onPress={() => setIv({ ...iv, mode: m })} testID={`interview-mode-${m}`} />)}
        </View>
        <Input label="Duration (minutes)" value={iv.duration} onChangeText={(v) => setIv({ ...iv, duration: v.replace(/\D/g, "") })} keyboardType="numeric" testID="interview-duration-input" />
        <Input label="Meeting link / address" value={iv.link} onChangeText={(v) => setIv({ ...iv, link: v })} autoCapitalize="none" testID="interview-link-input" />
        <Input label="Notes for candidate" value={iv.notes} onChangeText={(v) => setIv({ ...iv, notes: v })} multiline testID="interview-notes-input" />
        <Button title="Schedule" onPress={schedule} loading={busy === "iv"} testID="interview-submit-button" />
      </Sheet>

      <Sheet visible={sheet === "message"} onClose={() => setSheet("")} title="Message candidate" testID="message-sheet">
        <Input value={msg} onChangeText={setMsg} multiline placeholder="Write a message" testID="message-input" />
        <Button title="Send" onPress={send} loading={busy === "msg"} testID="message-send-button" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  name: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted, marginTop: 2 },
  body: { fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 20 },
  h3: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  note: { padding: 10, borderRadius: 10, backgroundColor: c.surfaceSecondary },
}));
