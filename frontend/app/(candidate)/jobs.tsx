import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { JobCard } from "@/src/JobCard";
import { useBottomChrome } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, Chip, ChipRow, EmptyView, ErrorView, Icon, Input, LoadingView, MultiSelect, Sheet } from "@/src/ui";

type Filters = { work_mode: string[]; employment_type: string[]; posted_within: number; min_salary: string; experience: string; min_match: number; industry: string };
const EMPTY: Filters = { work_mode: [], employment_type: [], posted_within: 0, min_salary: "", experience: "", min_match: 0, industry: "" };
const SORTS = [
  { key: "best_match", label: "Best match" },
  { key: "latest", label: "Latest" },
  { key: "salary_high", label: "Salary: High to low" },
  { key: "salary_low", label: "Salary: Low to high" },
];

export default function Jobs() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useBottomChrome();
  const params = useLocalSearchParams<{ q?: string; sort?: string; min_match?: string; work_mode?: string }>();
  const [q, setQ] = useState(params.q ?? "");
  const [loc, setLoc] = useState("");
  const [submitted, setSubmitted] = useState({ q: params.q ?? "", loc: "" });
  const [sort, setSort] = useState(params.sort ?? "best_match");
  const [f, setF] = useState<Filters>({ ...EMPTY, min_match: Number(params.min_match ?? 0), work_mode: params.work_mode ? [params.work_mode] : [] });
  const [draft, setDraft] = useState<Filters>(f);
  const [sheet, setSheet] = useState<"" | "filters" | "sort">("");
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api("/meta"), staleTime: 600000 });

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (submitted.q) p.set("q", submitted.q);
    if (submitted.loc) p.set("location", submitted.loc);
    p.set("sort", sort);
    if (f.work_mode.length) p.set("work_mode", f.work_mode.join(","));
    if (f.employment_type.length) p.set("employment_type", f.employment_type.join(","));
    if (f.posted_within) p.set("posted_within", String(f.posted_within));
    if (f.min_salary) p.set("min_salary", String(Number(f.min_salary) * 100000));
    if (f.experience) p.set("experience", f.experience);
    if (f.min_match) p.set("min_match", String(f.min_match));
    if (f.industry) p.set("industry", f.industry);
    return p.toString();
  }, [submitted, sort, f]);

  const list = useInfiniteQuery({
    queryKey: ["jobs", qs],
    queryFn: ({ pageParam }) => api(`/jobs?${qs}&page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (last: any) => (last.has_more ? last.page + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((p: any) => p.items) ?? [];
  const total = (list.data?.pages[0] as any)?.total ?? 0;
  const activeCount = f.work_mode.length + f.employment_type.length + (f.posted_within ? 1 : 0) + (f.min_salary ? 1 : 0) + (f.experience ? 1 : 0) + (f.min_match ? 1 : 0) + (f.industry ? 1 : 0);
  const toggleMode = (m: string) => setF((p) => ({ ...p, work_mode: p.work_mode.includes(m) ? p.work_mode.filter((x) => x !== m) : [...p.work_mode, m] }));

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Text style={s.title}>Find jobs</Text>
        <View style={s.searchBox}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput testID="jobs-search-input" style={s.searchInput} value={q} onChangeText={setQ} placeholder="Title, skill or company" placeholderTextColor={colors.muted} returnKeyType="search" onSubmitEditing={() => setSubmitted({ q, loc })} />
        </View>
        <View style={s.searchBox}>
          <Icon name="location-outline" size={18} color={colors.muted} />
          <TextInput testID="jobs-location-input" style={s.searchInput} value={loc} onChangeText={setLoc} placeholder="City (e.g. Bengaluru)" placeholderTextColor={colors.muted} returnKeyType="search" onSubmitEditing={() => setSubmitted({ q, loc })} />
          <Button title="Search" small onPress={() => setSubmitted({ q, loc })} testID="jobs-search-button" />
        </View>
      </View>
      <ChipRow testID="jobs-filter-row">
        <Chip label={activeCount ? `Filters (${activeCount})` : "Filters"} icon="options-outline" selected={!!activeCount} testID="jobs-open-filters" onPress={() => { setDraft(f); setSheet("filters"); }} />
        <Chip label={SORTS.find((x) => x.key === sort)?.label ?? "Sort"} icon="swap-vertical" testID="jobs-open-sort" onPress={() => setSheet("sort")} />
        {[90, 80, 70].map((m) => (
          <Chip key={m} label={`${m}%+ match`} selected={f.min_match === m} testID={`jobs-match-${m}`} onPress={() => setF((p) => ({ ...p, min_match: p.min_match === m ? 0 : m }))} />
        ))}
        {["remote", "hybrid", "office"].map((m) => (
          <Chip key={m} label={m === "office" ? "Office" : m[0].toUpperCase() + m.slice(1)} selected={f.work_mode.includes(m)} testID={`jobs-mode-${m}`} onPress={() => toggleMode(m)} />
        ))}
      </ChipRow>
      {list.isLoading ? (
        <LoadingView />
      ) : list.isError ? (
        <ErrorView message={(list.error as Error).message} onRetry={list.refetch} />
      ) : (
        <FlatList
          testID="jobs-list"
          data={items}
          keyExtractor={(j: any) => j.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: bottom + 24, flexGrow: 1 }}
          ListHeaderComponent={<Text style={s.count} testID="jobs-count">{total} jobs found</Text>}
          renderItem={({ item }) => <JobCard job={item} />}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          onEndReachedThreshold={0.4}
          refreshing={list.isRefetching && !list.isFetchingNextPage}
          onRefresh={list.refetch}
          ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.brand} /> : null}
          ListEmptyComponent={<EmptyView icon="search-outline" title="No jobs found" message="Try different keywords, a nearby city, or fewer filters." action={activeCount ? "Clear filters" : undefined} onAction={() => setF(EMPTY)} />}
        />
      )}

      <Sheet visible={sheet === "sort"} onClose={() => setSheet("")} title="Sort by" testID="jobs-sort-sheet">
        {SORTS.map((o) => (
          <Chip key={o.key} label={o.label} selected={sort === o.key} testID={`jobs-sort-${o.key}`} onPress={() => { setSort(o.key); setSheet(""); }} />
        ))}
      </Sheet>

      <Sheet visible={sheet === "filters"} onClose={() => setSheet("")} title="Filters" testID="jobs-filter-sheet">
        <Text style={s.fLabel}>Work mode</Text>
        <MultiSelect testIDPrefix="filter-mode" options={["office", "hybrid", "remote"]} value={draft.work_mode} onChange={(v) => setDraft({ ...draft, work_mode: v })} />
        <Text style={s.fLabel}>Job type</Text>
        <MultiSelect testIDPrefix="filter-type" options={["full_time", "part_time", "contract", "internship"]} value={draft.employment_type} onChange={(v) => setDraft({ ...draft, employment_type: v })} />
        <Text style={s.fLabel}>Date posted</Text>
        <View style={s.wrap}>
          {[0, 1, 3, 7, 30].map((d) => (
            <Chip key={d} label={d ? `Last ${d} day${d > 1 ? "s" : ""}` : "Any time"} selected={draft.posted_within === d} testID={`filter-posted-${d}`} onPress={() => setDraft({ ...draft, posted_within: d })} />
          ))}
        </View>
        <Text style={s.fLabel}>Match score</Text>
        <View style={s.wrap}>
          {[0, 70, 80, 90].map((m) => (
            <Chip key={m} label={m ? `${m}%+` : "Any"} selected={draft.min_match === m} testID={`filter-match-${m}`} onPress={() => setDraft({ ...draft, min_match: m })} />
          ))}
        </View>
        <Text style={s.fLabel}>Industry</Text>
        <View style={s.wrap}>
          {["", ...((meta.data as any)?.industries ?? [])].map((i: string) => (
            <Chip key={i || "any"} label={i || "Any"} selected={draft.industry === i} testID={`filter-industry-${i || "any"}`} onPress={() => setDraft({ ...draft, industry: i })} />
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Input label="Min salary (LPA)" testID="filter-min-salary" keyboardType="numeric" value={draft.min_salary} onChangeText={(v) => setDraft({ ...draft, min_salary: v.replace(/[^0-9.]/g, "") })} placeholder="e.g. 4" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Your experience (yrs)" testID="filter-experience" keyboardType="numeric" value={draft.experience} onChangeText={(v) => setDraft({ ...draft, experience: v.replace(/[^0-9.]/g, "") })} placeholder="e.g. 2" />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Button title="Reset" variant="outline" style={{ flex: 1 }} testID="filter-reset" onPress={() => setDraft(EMPTY)} />
          <Button title="Apply filters" style={{ flex: 2 }} testID="filter-apply" onPress={() => { setF(draft); setSheet(""); }} />
        </View>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: { paddingHorizontal: 16, gap: 8, paddingBottom: 4, backgroundColor: c.surfaceSecondary },
  title: { fontSize: 24, fontWeight: "800", color: c.onSurface, letterSpacing: -0.4 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, height: 50, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, paddingLeft: 14, paddingRight: 6 },
  searchInput: { flex: 1, fontSize: 15, color: c.onSurface, height: 48 },
  count: { fontSize: 13, color: c.muted, fontWeight: "600" },
  fLabel: { fontSize: 14, fontWeight: "700", color: c.onSurface, marginTop: 4 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
}));
