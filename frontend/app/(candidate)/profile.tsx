import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, uploadFile } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useBottomChrome } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, Card, ErrorView, Icon, IconName, LoadingView, Logo, Progress, Sheet, useToast } from "@/src/ui";

export function MenuRow({ icon, title, subtitle, onPress, testID, danger }: { icon: IconName; title: string; subtitle?: string; onPress: () => void; testID: string; danger?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfaceSecondary }]}>
      <View style={[s.rowIcon, danger && { backgroundColor: colors.errorSoft }]}>
        <Icon name={icon} size={18} color={danger ? colors.error : colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, danger && { color: colors.error }]}>{title}</Text>
        {subtitle ? <Text style={s.rowSub}>{subtitle}</Text> : null}
      </View>
      <Icon name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

export default function Profile() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useBottomChrome();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { logout } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [permSheet, setPermSheet] = useState(false);
  const q = useQuery({ queryKey: ["profile"], queryFn: () => api("/candidate/profile") });
  const p: any = q.data;

  const pickPhoto = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) return setPermSheet(true);
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!req.granted) return setPermSheet(true);
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (r.canceled) return;
    const a = r.assets[0];
    setUploading(true);
    try {
      const name = a.fileName ?? `photo.${(a.mimeType ?? "image/jpeg").split("/")[1]}`;
      await uploadFile("/candidate/photo", { uri: a.uri, name: name.replace(/\.jpeg$/i, ".jpg"), mimeType: a.mimeType, file: (a as any).file });
      toast("Profile photo updated");
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setUploading(false);
    }
  };

  if (q.isLoading) return <LoadingView />;
  if (q.isError) return <ErrorView message={(q.error as Error).message} onRetry={q.refetch} />;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: bottom + 24, gap: 16 }}>
        <View style={s.head}>
          <Pressable onPress={pickPhoto} testID="profile-photo-button" style={{ position: "relative" }}>
            <Logo fileId={p.photo_file_id} name={p.name} size={76} round />
            <View style={s.camBadge}>{uploading ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Icon name="camera" size={14} color={colors.onBrand} />}</View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.name} testID="profile-name">
              {p.name}
            </Text>
            <Text style={s.sub}>{p.headline || "Add a headline"}</Text>
            <Text style={s.sub}>{p.email}</Text>
          </View>
        </View>
        <Card style={{ marginHorizontal: 16, gap: 10 }} testID="profile-completion-card">
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={s.cardTitle}>Profile completion</Text>
            <Text style={[s.cardTitle, { color: colors.brand }]} testID="profile-completion-value">
              {p.completion}%
            </Text>
          </View>
          <Progress value={p.completion} />
          <Text style={s.sub}>A complete profile improves your match accuracy.</Text>
          <Button title="Edit profile" small variant="secondary" icon="create-outline" onPress={() => router.push("/profile-edit")} testID="profile-edit-button" />
        </Card>
        <View style={s.group}>
          <MenuRow icon="document-text-outline" title="Resume & AI score" subtitle={p.has_resume ? "View analysis, improve with AI" : "Upload your resume"} onPress={() => router.push("/resume")} testID="profile-menu-resume" />
          <MenuRow icon="mic-outline" title="AI Interview Coach" subtitle="Practice mock interviews" onPress={() => router.push("/coach")} testID="profile-menu-coach" />
          <MenuRow icon="notifications-outline" title="Notifications" onPress={() => router.push("/notifications")} testID="profile-menu-notifications" />
          <MenuRow icon="diamond-outline" title="JobMatch Premium" subtitle="AI resume optimisation & insights" onPress={() => router.push("/plans")} testID="profile-menu-plans" />
          <MenuRow icon="shield-checkmark-outline" title="Privacy & account" subtitle="Contact sharing, data, deletion" onPress={() => router.push("/privacy")} testID="profile-menu-privacy" />
        </View>
        <View style={s.group}>
          <MenuRow icon="log-out-outline" title="Log out" danger onPress={() => logout()} testID="profile-logout-button" />
        </View>
      </ScrollView>
      <Sheet visible={permSheet} onClose={() => setPermSheet(false)} title="Photo access needed" testID="photo-permission-sheet">
        <Text style={s.sub}>Allow photo access to add a profile picture recruiters can see. You can enable it in Settings.</Text>
        <Button title="Open Settings" onPress={() => { setPermSheet(false); Linking.openSettings(); }} testID="photo-permission-settings" />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  head: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 16 },
  camBadge: { position: "absolute", right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.surface },
  name: { fontSize: 22, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted, marginTop: 2, lineHeight: 18 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  group: { marginHorizontal: 16, backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, minHeight: 60, borderBottomWidth: 1, borderBottomColor: c.divider },
  rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "600", color: c.onSurface },
  rowSub: { fontSize: 12, color: c.muted, marginTop: 2 },
}));
