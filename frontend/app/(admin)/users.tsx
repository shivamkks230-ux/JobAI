import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";

import { api, label, timeAgo } from "@/src/api";
import { useBottomChrome } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { Badge, Button, Card, EmptyView, ErrorView, Header, Icon, LoadingView, MatchBadge, Segmented, useToast } from "@/src/ui";

type Tab = "candidate" | "recruiter" | "applications";

export default function Users() {
  const s = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const bottom = useBottomChrome();
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab ?? "candidate");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const path = tab === "applications" ? "/admin/applications?" : `/admin/users?role=${tab}&q=${encodeURIComponent(search)}&`;
  const list = useInfiniteQuery({
    queryKey: ["admin-users", path],
    queryFn: ({ pageParam }) => api(`${path}page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (last: any, all) => (last.has_more ? all.length + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((p: any) => p.items) ?? [];
  const total = (list.data?.pages[0] as any)?.total ?? 0;

  const setStatus = async (id: string, status: string) => {
    try {
      await api(`/admin/users/${id}/status`, { body: { status } });
      toast(status === "suspended" ? "User suspended" : "User reactivated");
      list.refetch();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  return (
    <View style={s.root}>
      <Header title="Users & applications" subtitle={`${total} total`} />
      <View style={{ padding: 16, paddingBottom: 0, gap: 8 }}>
        <Segmented testIDPrefix="users-tab" value={tab} onChange={setTab} options={[{ key: "candidate", label: "Candidates" }, { key: "recruiter", label: "Recruiters" }, { key: "applications", label: "Applications" }]} />
        {tab !== "applications" && (
          <View style={s.searchBox}>
            <Icon name="search" size={18} color={colors.muted} />
            <TextInput testID="users-search-input" style={s.input} value={q} onChangeText={setQ} onSubmitEditing={() => setSearch(q)} placeholder="Search name or email" placeholderTextColor={colors.muted} returnKeyType="search" />
          </View>
        )}
      </View>
      {list.isLoading ? (
        <LoadingView />
      ) : list.isError ? (
        <ErrorView message={(list.error as Error).message} onRetry={list.refetch} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(u: any) => u.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: bottom + 24, flexGrow: 1 }}
          refreshing={list.isRefetching && !list.isFetchingNextPage}
          onRefresh={list.refetch}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          ListEmptyComponent={<EmptyView icon="people-outline" title={tab === "applications" ? "No applications yet" : "No users found"} />}
          renderItem={({ item: u }) =>
            tab === "applications" ? (
              <Card style={{ gap: 4 }} testID={`admin-app-${u.id}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={[s.title, { flex: 1 }]}>{u.candidate_name} → {u.job_title}</Text>
                  <MatchBadge score={u.match_score} />
                </View>
                <Text style={s.sub}>{u.company_name} · {label(u.stage)} · {timeAgo(u.applied_at)}</Text>
              </Card>
            ) : (
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 10 }} testID={`admin-user-${u.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{u.name}</Text>
                  <Text style={s.sub}>{u.email} · joined {timeAgo(u.created_at)}</Text>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                    {u.status === "suspended" && <Badge text="Suspended" tone="error" />}
                    {u.is_test && <Badge text="TEST" tone="warning" />}
                  </View>
                </View>
                {u.status === "suspended" ? (
                  <Button title="Reactivate" small variant="secondary" onPress={() => setStatus(u.id, "active")} testID={`admin-reactivate-${u.id}`} />
                ) : (
                  <Button title="Suspend" small variant="danger" onPress={() => setStatus(u.id, "suspended")} testID={`admin-suspend-${u.id}`} />
                )}
              </Card>
            )
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, height: 48, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 15, color: c.onSurface, height: 46 },
  title: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted },
}));
