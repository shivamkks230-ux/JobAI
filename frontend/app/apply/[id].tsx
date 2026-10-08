import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, Card, ErrorView, Header, Icon, Input, LoadingView, MatchBadge, useToast } from "@/src/ui";

export default function Apply() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useQuery({ queryKey: ["job", id], queryFn: () => api(`/jobs/${id}`) });
  const prof = useQuery({ queryKey: ["profile"], queryFn: () => api("/candidate/profile") });
  const [cover, setCover] = useState("");
  const [consent, setConsent] = useState(false);
  const [shareEmail, setShareEmail] = useState(true);
  const [sharePhone, setSharePhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const pv = (prof.data as any)?.privacy;
    if (pv) {
      setShareEmail(pv.share_email_default ?? true);
      setSharePhone(pv.share_phone_default ?? false);
    }
  }, [prof.data]);

  if (job.isLoading || prof.isLoading) return <View style={s.root}><Header title="Apply" back /><LoadingView /></View>;
  if (job.isError || prof.isError) return <View style={s.root}><Header title="Apply" back /><ErrorView onRetry={() => { job.refetch(); prof.refetch(); }} /></View>;
  const j: any = job.data;
  const p: any = prof.data;
  const missing = [!p.name && "Name", !p.current_location && "Current location", !p.skills?.length && "Skills"].filter(Boolean) as string[];

  const submit = async () => {
    setErr("");
    if (!consent) return setErr("Please confirm consent to continue");
    setBusy(true);
    try {
      const a = await api("/applications", { body: { job_id: j.id, cover_letter: cover || null, consent, share_email: shareEmail, share_phone: sharePhone } });
      toast("Application submitted successfully.");
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["job", id] });
      qc.invalidateQueries({ queryKey: ["home"] });
      router.replace(`/application/${a.id}`);
    } catch (e: any) {
      setErr(e.status === 409 ? "Already applied." : e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <Header title="Apply" subtitle={`${j.title} · ${j.company_name}`} back />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}>
        {j.match && (
          <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={s.h3}>Your fit for this role</Text>
            <MatchBadge score={j.match.score} large />
          </Card>
        )}
        <Card style={{ gap: 10 }} testID="apply-checklist">
          <Text style={s.h3}>Before you apply</Text>
          <Check ok={missing.length === 0} text={missing.length ? `Complete profile: ${missing.join(", ")}` : "Profile ready"} action={missing.length ? () => router.push("/profile-edit") : undefined} testID="apply-fix-profile" />
          <Check ok={p.has_resume} text={p.has_resume ? "Resume uploaded" : "Upload a resume"} action={!p.has_resume ? () => router.push("/resume") : undefined} testID="apply-fix-resume" />
        </Card>
        <Input label="Cover note (optional)" testID="apply-cover-input" value={cover} onChangeText={setCover} multiline placeholder="Briefly tell the recruiter why you're a good fit" maxLength={3000} />
        <Card style={{ gap: 12 }} testID="apply-consent-card">
          <Text style={s.h3}>What the recruiter will see</Text>
          <Text style={s.body}>Your name, headline, location, experience, education, skills, salary expectation, notice period, resume and cover note will be shared with {j.company_name}. Your profile is never shown publicly.</Text>
          <Toggle label="Share my email address" value={shareEmail} onChange={setShareEmail} testID="apply-share-email" />
          <Toggle label="Share my phone number" value={sharePhone} onChange={setSharePhone} testID="apply-share-phone" />
          <Pressable style={s.consent} onPress={() => setConsent(!consent)} testID="apply-consent-checkbox">
            <View style={[s.box, consent && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>{consent && <Icon name="checkmark" size={16} color={colors.onBrandPrimary} />}</View>
            <Text style={[s.body, { flex: 1 }]}>I consent to sharing the information above with this employer for this application.</Text>
          </Pressable>
        </Card>
        {err ? <Text style={s.err} testID="apply-error">{err}</Text> : null}
        <Button title="Submit application" icon="paper-plane" onPress={submit} loading={busy} disabled={missing.length > 0 || !p.has_resume} testID="apply-submit-button" />
      </KeyboardAwareScrollView>
    </View>
  );
}

function Check({ ok, text, action, testID }: { ok: boolean; text: string; action?: () => void; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Icon name={ok ? "checkmark-circle" : "alert-circle"} size={18} color={ok ? colors.success : colors.warning} />
      <Text style={[s.body, { flex: 1 }]}>{text}</Text>
      {action && <Button title="Fix" small variant="secondary" onPress={action} testID={testID} />}
    </View>
  );
}

function Toggle({ label, value, onChange, testID }: { label: string; value: boolean; onChange: (v: boolean) => void; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={s.body}>{label}</Text>
      <Switch testID={testID} value={value} onValueChange={onChange} trackColor={{ true: colors.brand, false: colors.borderStrong }} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  h3: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  body: { fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 20 },
  consent: { flexDirection: "row", gap: 12, alignItems: "flex-start", paddingTop: 4 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  err: { color: c.error, fontSize: 13, fontWeight: "600" },
}));
