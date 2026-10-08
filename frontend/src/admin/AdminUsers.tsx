import { useInfiniteQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";

import { api, label, timeAgo } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Badge, Button, Card, Chip, ChipRow, EmptyView, ErrorView, Header, Icon, LoadingView, useToast } from "@/src/ui";

const FILTERS = [
  { key: "all", label: "All", q: "" },
  { key: "candidate", label: "Candidates", q: "role=candidate" },
  { key: "recruiter", label: "Recruiters", q: "role=recruiter" },
  { key: "admin", label: "Admins", q: "role=admin" },
  { key: "active", label: "Active", q: "status=active" },
  { key: "suspended", label: "Suspended", q: "status=suspended" },
];

export function AdminUsers({ mode }: { mode: "all" | "candidate" | "recruiter" }) {
  const s = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const [filter, setFilter] = useState(mode);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
  const path = `/admin/users?${f.q}&q=${encodeURIComponent(search)}&`;
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

  const title = mode === "candidate" ? "Candidates" : mode === "recruiter" ? "Recruiters" : "Users";
  return (
    <View style={s.root}>
      <Header title={title} subtitle={`${total} total`} />
      <View style={s.searchBox}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput testID="users-search-input" style={s.input} value={q} onChangeText={setQ} onSubmitEditing={() => setSearch(q)} placeholder="Search name or email" placeholderTextColor={colors.muted} returnKeyType="search" />
      </View>
      {mode === "all" && (
        <ChipRow testID="users-filter-row">
          {FILTERS.map((x) => <Chip key={x.key} label={x.label} selected={filter === x.key} onPress={() => setFilter(x.key as any)} testID={`users-filter-${x.key}`} />)}
        </ChipRow>
      )}
      {list.isLoading ? (
        <LoadingView />
      ) : list.isError ? (
        <ErrorView message={(list.error as Error).message} onRetry={list.refetch} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(u: any) => u.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24, flexGrow: 1, maxWidth: 1000, width: "100%", alignSelf: "center" }}
          refreshing={list.isRefetching && !list.isFetchingNextPage}
          onRefresh={list.refetch}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          ListEmptyComponent={<EmptyView icon="people-outline" title="No users found" />}
          renderItem={({ item: u }) => (
            <Card style={{ flexDirection: "row", alignItems: "center", gap: 10 }} testID={`admin-user-${u.id}`}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.title}>{u.name}</Text>
                <Text style={s.sub}>{u.email} · joined {timeAgo(u.created_at)}</Text>
                {u.role === "candidate" && (
                  <Text style={s.sub}>Profile {u.profile_completion ?? 0}% · {u.has_resume ? "Resume uploaded" : "No resume"} · {u.applications_count ?? 0} applications</Text>
                )}
                {u.role === "recruiter" && (
                  <Text style={s.sub}>{u.company_name ?? "No company"} ({label(u.company_status)}) · {u.jobs_posted ?? 0} jobs · {u.jobs_published ?? 0} published · {u.applications_received ?? 0} applications</Text>
                )}
                <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                  <Badge text={label(u.role)} tone="brand" />
                  <Badge text={label(u.status)} tone={u.status === "suspended" ? "error" : "success"} />
                </View>
              </View>
              {u.role !== "admin" &&
                (u.status === "suspended" ? (
                  <Button title="Reactivate" small variant="secondary" onPress={() => setStatus(u.id, "active")} testID={`admin-reactivate-${u.id}`} />
                ) : (
                  <Button title="Suspend" small variant="danger" onPress={() => setStatus(u.id, "suspended")} testID={`admin-suspend-${u.id}`} />
                ))}
            </Card>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 12, height: 48, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 15, color: c.onSurface, height: 46 },
  title: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted },
}));
