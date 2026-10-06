import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { JobCard, JobCardT } from "@/src/JobCard";
import { useBottomChrome } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";
import { Card, EmptyView, ErrorView, Icon, IconButton, LoadingView, Logo, Progress, SectionTitle, VerifiedBadge } from "@/src/ui";

const SECTIONS: { key: string; title: string; params: string }[] = [
  { key: "recommended", title: "Recommended for you", params: "?sort=best_match" },
  { key: "high_match", title: "High match (80%+)", params: "?min_match=80&sort=best_match" },
  { key: "recent", title: "Recently posted", params: "?sort=latest" },
  { key: "remote", title: "Remote jobs", params: "?work_mode=remote" },
  { key: "nearby", title: "Near your preferred location", params: "?sort=latest" },
];

export default function Home() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useBottomChrome();
  const router = useRouter();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["home"], queryFn: () => api("/jobs/home") });
  const unread = useQuery({ queryKey: ["unread"], queryFn: () => api("/notifications"), select: (d: any) => d.unread });
  const d: any = q.data;
  const allEmpty = d && SECTIONS.every((x) => !d[x.key]?.length);

  return (
    <View style={s.root}>
      <View style={[s.top, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.hello}>Namaste, {user?.name?.split(" ")[0]}</Text>
          <Text style={s.sub}>Find the right job, not just more jobs.</Text>
        </View>
        <IconButton name="notifications-outline" testID="home-notifications-button" badge={unread.data} onPress={() => router.push("/notifications")} />
      </View>
      <Pressable testID="home-search-bar" style={s.search} onPress={() => router.push("/jobs")}>
        <Icon name="search" size={18} color={colors.muted} />
        <Text style={s.searchText}>Search job title, skill, company or city</Text>
      </Pressable>
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={(q.error as Error).message} onRetry={q.refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: bottom + 24, gap: 24, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brand} />}
        >
          <LinearGradient colors={[colors.heroStart, colors.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
            <View style={{ flexDirection: "row", gap: 16 }}>
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={s.heroLabel}>Profile strength</Text>
                <Text style={s.heroValue} testID="home-profile-completion">
                  {d.profile_completion}%
                </Text>
                <Progress value={d.profile_completion} color={colors.onBrand} height={6} />
              </View>
              <View style={s.heroDivider} />
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={s.heroLabel}>Resume score</Text>
                <Text style={s.heroValue} testID="home-resume-score">
                  {d.resume_score != null ? `${d.resume_score}/100` : "—"}
                </Text>
                <Text style={s.heroHint}>{d.resume_score != null ? "AI analysed" : "Upload resume"}</Text>
              </View>
            </View>
            <View style={s.heroActions}>
              <Pressable style={s.heroBtn} testID="home-resume-button" onPress={() => router.push("/resume")}>
                <Icon name="document-attach-outline" size={16} color={colors.onBrand} />
                <Text style={s.heroBtnText}>Resume AI</Text>
              </Pressable>
              <Pressable style={s.heroBtn} testID="home-coach-button" onPress={() => router.push("/coach")}>
                <Icon name="mic-outline" size={16} color={colors.onBrand} />
                <Text style={s.heroBtnText}>Interview Coach</Text>
              </Pressable>
              <Pressable style={s.heroBtn} testID="home-edit-profile-button" onPress={() => router.push("/profile-edit")}>
                <Icon name="create-outline" size={16} color={colors.onBrand} />
                <Text style={s.heroBtnText}>Profile</Text>
              </Pressable>
            </View>
          </LinearGradient>

          {allEmpty && <EmptyView icon="briefcase-outline" title="No jobs yet" message="No jobs matched your criteria today. Try adjusting your preferences." action="Update profile" onAction={() => router.push("/profile-edit")} />}

          {SECTIONS.map((sec) =>
            d[sec.key]?.length ? (
              <View key={sec.key} style={{ gap: 12 }} testID={`home-section-${sec.key}`}>
                <View style={{ paddingHorizontal: 16 }}>
                  <SectionTitle title={sec.title} action="See all" testID={`home-see-all-${sec.key}`} onAction={() => router.push(`/jobs${sec.params}` as any)} />
                </View>
                <FlatList
                  horizontal
                  data={d[sec.key] as JobCardT[]}
                  keyExtractor={(j) => `${sec.key}-${j.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
                  renderItem={({ item }) => <JobCard job={item} width={300} />}
                />
              </View>
            ) : null,
          )}

          {d.featured_companies?.length ? (
            <View style={{ gap: 12, paddingHorizontal: 16 }}>
              <SectionTitle title="Featured companies" />
              {d.featured_companies.map((c: any) => (
                <Card key={c.id} testID={`featured-company-${c.id}`} onPress={() => router.push(`/company/${c.id}`)} style={s.compRow}>
                  <Logo fileId={c.logo_file_id} name={c.name} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={s.compName} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <VerifiedBadge />
                    </View>
                    <Text style={s.compMeta}>
                      {[c.industry, c.location].filter(Boolean).join(" · ")} · {c.active_jobs} open jobs
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size={18} color={colors.muted} />
                </Card>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, backgroundColor: c.surfaceSecondary },
  hello: { fontSize: 22, fontWeight: "800", color: c.onSurface, letterSpacing: -0.4 },
  sub: { fontSize: 13, color: c.muted, marginTop: 2 },
  search: { marginHorizontal: 16, marginBottom: 8, height: 50, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  searchText: { color: c.muted, fontSize: 14 },
  hero: { marginHorizontal: 16, borderRadius: 20, padding: 20, gap: 16 },
  heroLabel: { color: c.brandSecondary, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  heroValue: { color: c.onBrand, fontSize: 26, fontWeight: "800" },
  heroHint: { color: c.brandSecondary, fontSize: 12 },
  heroDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.25)" },
  heroActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  heroBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.16)", paddingHorizontal: 12, height: 36, borderRadius: 999 },
  heroBtnText: { color: c.onBrand, fontSize: 13, fontWeight: "700" },
  compRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  compName: { fontSize: 15, fontWeight: "700", color: c.onSurface, flexShrink: 1 },
  compMeta: { fontSize: 12, color: c.muted, marginTop: 2 },
}));
