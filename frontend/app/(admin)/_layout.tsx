import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { makeStyles, useTheme } from "@/src/theme";
import { Icon, IconName } from "@/src/ui";

type Item = { name: string; title: string; icon: IconName; mobile?: boolean };
const ITEMS: Item[] = [
  { name: "overview", title: "Dashboard", icon: "grid-outline", mobile: true },
  { name: "approvals", title: "Job Approvals", icon: "hourglass-outline", mobile: true },
  { name: "published", title: "Published Jobs", icon: "checkmark-done-outline" },
  { name: "rejected", title: "Rejected Jobs", icon: "close-circle-outline" },
  { name: "review", title: "Companies", icon: "business-outline" },
  { name: "users", title: "Users", icon: "people-outline", mobile: true },
  { name: "candidates", title: "Candidates", icon: "person-outline" },
  { name: "recruiters", title: "Recruiters", icon: "briefcase-outline" },
  { name: "applications", title: "Applications", icon: "document-text-outline", mobile: true },
  { name: "analytics", title: "Reports & Analytics", icon: "bar-chart-outline" },
  { name: "reports", title: "Reported Content", icon: "flag-outline" },
  { name: "settings", title: "Settings", icon: "settings-outline", mobile: true },
];
export const WIDE = 900;

function AdminNav({ state, navigation }: { state: any; navigation: any }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout } = useAuth();
  const current = state.routes[state.index]?.name;
  const go = (name: string) => navigation.navigate(name as never);

  if (width < WIDE) {
    return (
      <View style={[s.bottom, { paddingBottom: insets.bottom }]}>
        {ITEMS.filter((i) => i.mobile).map((i) => {
          const on = current === i.name;
          return (
            <Pressable key={i.name} testID={`tab-${i.name}`} onPress={() => go(i.name)} style={s.bottomItem}>
              <Icon name={i.icon} size={22} color={on ? colors.brandPrimary : colors.muted} />
              <Text style={[s.bottomText, on && { color: colors.brandPrimary }]} numberOfLines={1}>{i.title.split(" ").pop()}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }
  return (
    <View style={[s.side, { paddingTop: insets.top + 20 }]} testID="admin-sidebar">
      <Text style={s.brand}>JobMatch AI</Text>
      <Text style={s.brandSub}>Admin Console</Text>
      <ScrollView contentContainerStyle={{ gap: 2, paddingVertical: 16 }}>
        {ITEMS.map((i) => {
          const on = current === i.name;
          return (
            <Pressable key={i.name} testID={`sidebar-${i.name}`} onPress={() => go(i.name)} style={[s.sideItem, on && s.sideItemOn]}>
              <Icon name={i.icon} size={18} color={on ? colors.onBrandPrimary : colors.borderStrong} />
              <Text style={[s.sideText, on && { color: colors.onBrandPrimary }]}>{i.title}</Text>
            </Pressable>
          );
        })}
        <Pressable testID="sidebar-notifications" onPress={() => router.push("/notifications")} style={s.sideItem}>
          <Icon name="notifications-outline" size={18} color={colors.borderStrong} />
          <Text style={s.sideText}>Notifications</Text>
        </Pressable>
        <Pressable testID="sidebar-logout" onPress={() => logout()} style={s.sideItem}>
          <Icon name="log-out-outline" size={18} color={colors.error} />
          <Text style={[s.sideText, { color: colors.error }]}>Logout</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

export default function AdminLayout() {
  const { width } = useWindowDimensions();
  return (
    <Tabs tabBar={(p) => <AdminNav {...p} />} screenOptions={{ headerShown: false, tabBarPosition: width >= WIDE ? "left" : "bottom" }}>
      {ITEMS.map((i) => (
        <Tabs.Screen key={i.name} name={i.name} options={{ title: i.title }} />
      ))}
    </Tabs>
  );
}

const useStyles = makeStyles((c) => ({
  side: { width: 240, backgroundColor: c.surfaceInverse, paddingHorizontal: 12 },
  brand: { color: c.onSurfaceInverse, fontSize: 20, fontWeight: "800", paddingHorizontal: 12 },
  brandSub: { color: c.borderStrong, fontSize: 12, paddingHorizontal: 12, marginTop: 2 },
  sideItem: { flexDirection: "row", alignItems: "center", gap: 10, height: 42, paddingHorizontal: 12, borderRadius: 10 },
  sideItemOn: { backgroundColor: c.brandPrimary },
  sideText: { color: c.borderStrong, fontSize: 14, fontWeight: "600" },
  bottom: { flexDirection: "row", backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, ...(Platform.OS === "web" ? { height: 64 } : { minHeight: 56 }) },
  bottomItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 6 },
  bottomText: { fontSize: 11, fontWeight: "600", color: c.muted },
}));
