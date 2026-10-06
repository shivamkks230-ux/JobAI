import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, Card, Header, Input, Sheet, useToast } from "@/src/ui";

export default function Privacy() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const { user, logout, clearLocal } = useAuth();
  const isCandidate = user?.role === "candidate";
  const q = useQuery({ queryKey: ["profile"], queryFn: () => api("/candidate/profile"), enabled: isCandidate });
  const pv = (q.data as any)?.privacy ?? {};
  const [del, setDel] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const setPv = async (k: string, v: boolean) => {
    try {
      await api("/candidate/profile", { method: "PUT", body: { privacy: { ...{ profile_visible: true, share_email_default: true, share_phone_default: false, allow_contact: true }, ...pv, [k]: v } } });
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const requestDeletion = async () => {
    try {
      const r = await api("/account/data-deletion-request", { method: "POST" });
      toast(r.message, "info");
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    try {
      await api("/account", { method: "DELETE" });
      toast("Your account has been deleted", "info");
      await clearLocal();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ k, title, sub }: { k: string; title: string; sub: string }) => (
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.sub}>{sub}</Text>
      </View>
      <Switch testID={`privacy-${k}`} value={!!pv[k]} onValueChange={(v) => setPv(k, v)} trackColor={{ true: colors.brand, false: colors.borderStrong }} />
    </View>
  );

  return (
    <View style={s.root}>
      <Header title="Privacy & account" back />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}>
        {isCandidate && q.data ? (
          <Card style={{ gap: 4 }} testID="privacy-settings-card">
            <Row k="profile_visible" title="Profile visible to recruiters" sub="Only recruiters of jobs you apply to can see your profile." />
            <Row k="share_email_default" title="Share email by default" sub="Pre-selects email sharing when you apply." />
            <Row k="share_phone_default" title="Share phone by default" sub="Pre-selects phone sharing when you apply." />
            <Row k="allow_contact" title="Allow recruiter messages" sub="Recruiters you applied to can message you in-app." />
          </Card>
        ) : null}
        <Card style={{ gap: 12 }}>
          <Text style={s.title}>Sessions</Text>
          <Text style={s.sub}>Sign out of JobMatch AI on every device, including this one.</Text>
          <Button title="Log out from all devices" variant="outline" icon="phone-portrait-outline" onPress={() => logout(true)} testID="privacy-logout-all" />
        </Card>
        <Card style={{ gap: 12 }}>
          <Text style={s.title}>Your data</Text>
          <Text style={s.sub}>Request a full data deletion review by our team (processed within 30 days), or delete your account instantly.</Text>
          <Button title="Request data deletion" variant="outline" icon="document-lock-outline" onPress={requestDeletion} testID="privacy-data-request" />
          {user?.role !== "admin" && <Button title="Delete my account" variant="danger" icon="trash-outline" onPress={() => setDel(true)} testID="privacy-delete-account" />}
        </Card>
      </ScrollView>
      <Sheet visible={del} onClose={() => setDel(false)} title="Delete account permanently?" testID="delete-account-sheet">
        <Text style={s.sub}>This removes your profile, resume, applications, saved jobs and notifications. This cannot be undone.</Text>
        <Input label='Type "DELETE" to confirm' value={confirm} onChangeText={setConfirm} autoCapitalize="characters" testID="delete-account-confirm-input" />
        <Button title="Delete account" variant="danger" disabled={confirm !== "DELETE"} loading={busy} onPress={deleteAccount} testID="delete-account-confirm-button" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  title: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted, lineHeight: 18, marginTop: 2 },
}));
