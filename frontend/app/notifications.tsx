import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, timeAgo } from "@/src/api";
import { useAuth } from "@/src/auth";
import { makeStyles, useTheme } from "@/src/theme";
import { EmptyView, ErrorView, Header, Icon, LoadingView } from "@/src/ui";

export default function Notifications() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api("/notifications") });
  const items = (q.data as any)?.items ?? [];

  const open = async (n: any) => {
    if (!n.read) api(`/notifications/${n.id}/read`, { method: "POST" }).then(() => { q.refetch(); qc.invalidateQueries({ queryKey: ["unread"] }); });
    const d = n.data ?? {};
    if (d.application_id) router.push(user?.role === "recruiter" ? `/applicant/${d.application_id}` : `/application/${d.application_id}`);
    else if (d.job_id && user?.role !== "admin") router.push(`/job/${d.job_id}`);
  };
  const readAll = async () => {
    await api("/notifications/read-all", { method: "POST" });
    q.refetch();
    qc.invalidateQueries({ queryKey: ["unread"] });
  };

  return (
    <View style={s.root}>
      <Header title="Notifications" back right={items.some((n: any) => !n.read) ? <Text style={s.action} onPress={readAll} testID="notifications-read-all">Mark all read</Text> : null} />
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={(q.error as Error).message} onRetry={q.refetch} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n: any) => n.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          refreshing={q.isRefetching}
          onRefresh={q.refetch}
          ListEmptyComponent={<EmptyView icon="notifications-off-outline" title="You're all caught up" message="Application updates and new matches will appear here." />}
          renderItem={({ item: n }) => (
            <Pressable testID={`notification-${n.id}`} onPress={() => open(n)} style={[s.row, !n.read && { backgroundColor: colors.brandTertiary }]}>
              <View style={s.icon}>
                <Icon name={n.type.includes("interview") ? "calendar" : n.type.includes("stage") || n.type.includes("short") ? "git-commit" : n.type.includes("application") ? "paper-plane" : "notifications"} size={18} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{n.title}</Text>
                <Text style={s.body}>{n.body}</Text>
                <Text style={s.time}>{timeAgo(n.created_at)}</Text>
              </View>
              {!n.read && <View style={s.dot} />}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  action: { color: c.brand, fontWeight: "700", fontSize: 14 },
  row: { flexDirection: "row", gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: c.divider },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  body: { fontSize: 14, color: c.onSurfaceSecondary, marginTop: 2, lineHeight: 19 },
  time: { fontSize: 12, color: c.muted, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.brand, marginTop: 6 },
}));
