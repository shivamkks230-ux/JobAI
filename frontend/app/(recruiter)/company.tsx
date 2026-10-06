import { useQuery } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api, uploadFile } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useBottomChrome } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { Badge, Button, Card, ErrorView, Header, Icon, Input, LoadingView, Logo, Sheet, useToast } from "@/src/ui";

export default function Company() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const bottom = useBottomChrome();
  const { logout } = useAuth();
  const q = useQuery({ queryKey: ["rcompany"], queryFn: () => api("/recruiter/company") });
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(false);
  const [perm, setPerm] = useState(false);
  const c: any = q.data;
  useEffect(() => {
    if (c) setF({ name: c.name ?? "", website: c.website ?? "", description: c.description ?? "", industry: c.industry ?? "", size: c.size ?? "", location: c.location ?? "" });
  }, [c]);

  if (q.isLoading || (!f && !q.isError)) return <View style={s.root}><Header title="Company" /><LoadingView /></View>;
  if (q.isError) return <View style={s.root}><Header title="Company" /><ErrorView message={(q.error as Error).message} onRetry={q.refetch} /></View>;
  const set = (k: string) => (v: string) => setF((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const body: any = {};
      Object.entries(f).forEach(([k, v]) => { if (v) body[k] = v; });
      await api("/recruiter/company", { method: "PUT", body });
      toast("Company profile saved");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const logo = async () => {
    const p = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!p.granted) {
      if (!p.canAskAgain) return setPerm(true);
      const r = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!r.granted) return setPerm(true);
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (r.canceled) return;
    const a = r.assets[0];
    setUp(true);
    try {
      const name = (a.fileName ?? `logo.${(a.mimeType ?? "image/png").split("/")[1]}`).replace(/\.jpeg$/i, ".jpg");
      await uploadFile("/recruiter/company/logo", { uri: a.uri, name, mimeType: a.mimeType, file: (a as any).file });
      toast("Logo updated");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setUp(false);
    }
  };

  const tone = c.verification_status === "verified" ? "info" : c.verification_status === "pending" ? "warning" : "error";
  return (
    <View style={s.root}>
      <Header title="Company" right={<Pressable onPress={() => logout()} testID="recruiter-logout-button" hitSlop={8}><Icon name="log-out-outline" size={24} color={colors.error} /></Pressable>} />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: bottom + 24 }}>
        <Card style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
          <Pressable onPress={logo} testID="company-logo-button">
            <Logo fileId={c.logo_file_id} name={c.name} size={64} />
            <View style={s.cam}>{up ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Icon name="camera" size={12} color={colors.onBrand} />}</View>
          </Pressable>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={s.name}>{c.name}</Text>
            <Badge text={c.verification_status === "verified" ? "Verified" : `Verification: ${c.verification_status}`} tone={tone as any} icon={c.verification_status === "verified" ? "shield-checkmark" : "time-outline"} testID="company-verification-status" />
            <Text style={s.sub}>Plan: {c.plan?.name ?? "Free"} · {c.plan?.job_post_limit ?? 2} active jobs</Text>
          </View>
        </Card>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button title="Public page" small variant="outline" icon="eye-outline" onPress={() => router.push(`/company/${c.id}`)} testID="company-view-public" style={{ flex: 1 }} />
          <Button title="Plans" small variant="secondary" icon="diamond-outline" onPress={() => router.push("/plans")} testID="company-plans" style={{ flex: 1 }} />
          <Button title="Privacy" small variant="outline" icon="shield-outline" onPress={() => router.push("/privacy")} testID="company-privacy" style={{ flex: 1 }} />
        </View>
        <Input label="Company name" value={f.name} onChangeText={set("name")} testID="company-name-input" />
        <Input label="Website" value={f.website} onChangeText={set("website")} autoCapitalize="none" testID="company-website-input" />
        <Input label="Industry" value={f.industry} onChangeText={set("industry")} testID="company-industry-input" />
        <Input label="Company size" value={f.size} onChangeText={set("size")} testID="company-size-input" />
        <Input label="Location" value={f.location} onChangeText={set("location")} testID="company-location-input" />
        <Input label="Description" value={f.description} onChangeText={set("description")} multiline testID="company-description-input" />
        <Button title="Save company" onPress={save} loading={busy} testID="company-save-button" />
      </KeyboardAwareScrollView>
      <Sheet visible={perm} onClose={() => setPerm(false)} title="Photo access needed" testID="logo-permission-sheet">
        <Text style={s.sub}>Allow photo access to upload your company logo. Enable it in Settings.</Text>
        <Button title="Open Settings" onPress={() => { setPerm(false); Linking.openSettings(); }} testID="logo-permission-settings" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  name: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted },
  cam: { position: "absolute", right: -4, bottom: -4, width: 24, height: 24, borderRadius: 12, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
}));
