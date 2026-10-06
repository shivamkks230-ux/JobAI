import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, label } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, Card, Chip, ErrorView, Header, Input, LoadingView, Progress, useToast } from "@/src/ui";

const BG = "https://images.unsplash.com/photo-1780733057947-7b57f5108f68?crop=entropy&cs=srgb&fm=jpg&q=70&w=900";

export default function Coach() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const list = useQuery({ queryKey: ["coach"], queryFn: () => api("/coach/sessions") });
  const [cat, setCat] = useState("HR interview");
  const [role, setRole] = useState("");
  const [session, setSession] = useState<any>(null);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [fb, setFb] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const sres = await api("/coach/sessions", { body: { category: cat, role: role || null } });
      setSession(sres);
      setIdx(0);
      setFb(null);
      setAnswer("");
      list.refetch();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (answer.trim().length < 10) return toast("Write at least a couple of sentences", "error");
    setBusy(true);
    try {
      const r = await api(`/coach/sessions/${session.id}/answer`, { body: { index: idx, answer } });
      setFb(r.feedback);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    setIdx(idx + 1);
    setFb(null);
    setAnswer("");
  };

  const cats: string[] = (list.data as any)?.categories ?? [];

  return (
    <View style={s.root}>
      <Header title="AI Interview Coach" subtitle="Practice. Get feedback. Improve." back />
      {list.isLoading ? (
        <LoadingView />
      ) : list.isError ? (
        <ErrorView message={(list.error as Error).message} onRetry={list.refetch} />
      ) : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}>
          {!session ? (
            <>
              <View style={s.hero}>
                <Image source={{ uri: BG }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
                <LinearGradient colors={["rgba(15,23,42,0.2)", "rgba(15,23,42,0.85)"]} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
                <Text style={s.heroTitle}>Mock interview</Text>
                <Text style={s.heroSub}>5 AI questions tailored to your category. Answer in your own words and get scored feedback.</Text>
              </View>
              <Text style={s.h3}>Choose a category</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {cats.map((c) => <Chip key={c} label={c} selected={cat === c} onPress={() => setCat(c)} testID={`coach-category-${c.toLowerCase().replace(/[^a-z]+/g, "-")}`} />)}
              </View>
              <Input label="Target role (optional)" value={role} onChangeText={setRole} placeholder="e.g. Inside Sales Executive" testID="coach-role-input" />
              <Button title="Start mock interview" icon="play" onPress={start} loading={busy} testID="coach-start-button" />
              {(list.data as any).items.length > 0 && (
                <Card style={{ gap: 8 }} testID="coach-history">
                  <Text style={s.h3}>Recent sessions</Text>
                  {(list.data as any).items.slice(0, 5).map((it: any) => (
                    <Text key={it.id} style={s.body} onPress={() => { setSession(it); setIdx(0); setFb(it.answers?.["0"]?.feedback ?? null); setAnswer(it.answers?.["0"]?.answer ?? ""); }}>
                      {it.category}{it.role ? ` · ${it.role}` : ""} — {Object.keys(it.answers ?? {}).length}/{it.questions.length} answered
                    </Text>
                  ))}
                </Card>
              )}
            </>
          ) : idx >= session.questions.length ? (
            <Card style={{ gap: 12, alignItems: "center" }} testID="coach-complete">
              <Text style={s.h2}>Session complete</Text>
              <Text style={s.body}>Great practice! Try another category to keep building confidence.</Text>
              <Button title="New session" onPress={() => setSession(null)} testID="coach-new-session" />
            </Card>
          ) : (
            <>
              <View style={{ gap: 6 }}>
                <Text style={s.muted}>{session.category} · Question {idx + 1} of {session.questions.length}</Text>
                <Progress value={((idx + (fb ? 1 : 0)) / session.questions.length) * 100} />
              </View>
              <Card style={{ backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary }} testID="coach-question">
                <Text style={s.question}>{session.questions[idx]}</Text>
              </Card>
              <Input label="Your answer" multiline value={answer} onChangeText={setAnswer} placeholder="Type your answer as you would say it…" testID="coach-answer-input" editable={!fb} style={{ minHeight: 140 }} />
              {!fb ? (
                <Button title="Get AI feedback" icon="sparkles" onPress={submit} loading={busy} testID="coach-submit-answer" />
              ) : (
                <Card style={{ gap: 12 }} testID="coach-feedback">
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={s.h3}>Feedback</Text>
                    <Text style={[s.h3, { color: colors.brand }]} testID="coach-overall-score">{fb.overall}/10</Text>
                  </View>
                  {Object.entries(fb.scores ?? {}).map(([k, v]: any) => (
                    <View key={k} style={{ gap: 4 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={s.body}>{label(k)}</Text>
                        <Text style={s.body}>{v}/10</Text>
                      </View>
                      <Progress value={v * 10} height={6} color={v >= 7 ? colors.success : v >= 5 ? colors.brand : colors.warning} />
                    </View>
                  ))}
                  {(fb.strengths ?? []).map((t: string) => <Text key={t} style={s.body}>✓ {t}</Text>)}
                  {(fb.improvements ?? []).map((t: string) => <Text key={t} style={s.body}>→ {t}</Text>)}
                  {fb.sample_answer ? (
                    <View style={s.sample}>
                      <Text style={s.label}>Stronger answer example</Text>
                      <Text style={s.body}>{fb.sample_answer}</Text>
                    </View>
                  ) : null}
                  <Text style={s.muted}>Practice feedback only — not a hiring assessment or guarantee.</Text>
                  <Button title={idx + 1 < session.questions.length ? "Next question" : "Finish"} icon="arrow-forward" onPress={next} testID="coach-next-question" />
                </Card>
              )}
              <Button title="End session" variant="ghost" small onPress={() => setSession(null)} testID="coach-end-session" />
            </>
          )}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  hero: { height: 180, borderRadius: 20, overflow: "hidden", justifyContent: "flex-end", padding: 20, gap: 6 },
  heroTitle: { color: c.onSurfaceInverse, fontSize: 22, fontWeight: "800" },
  heroSub: { color: c.onSurfaceInverse, fontSize: 13, lineHeight: 19, opacity: 0.9 },
  h2: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  h3: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  body: { fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 20 },
  muted: { fontSize: 12, color: c.muted },
  question: { fontSize: 17, fontWeight: "700", color: c.onBrandSecondary, lineHeight: 24 },
  label: { fontSize: 12, fontWeight: "800", color: c.brand, textTransform: "uppercase" },
  sample: { padding: 12, borderRadius: 12, backgroundColor: c.surfaceSecondary, gap: 6 },
}));
