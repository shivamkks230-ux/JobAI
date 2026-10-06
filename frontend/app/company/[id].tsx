import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { FlatList, Linking, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { JobCard } from "@/src/JobCard";
import { makeStyles, useTheme } from "@/src/theme";
import { Badge, Card, EmptyView, ErrorView, Header, Icon, LoadingView, Logo } from "@/src/ui";

export default function CompanyPage() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["company", id], queryFn: () => api(`/companies/${id}`) });
  if (q.isLoading) return <View style={s.root}><Header title="Company" back /><LoadingView /></View>;
  if (q.isError) return <View style={s.root}><Header title="Company" back /><ErrorView message={(q.error as Error).message} onRetry={q.refetch} /></View>;
  const { company: c, jobs } = q.data as any;
  return (
    <View style={s.root}>
      <Header title={c.name} back />
      <FlatList
        data={jobs}
        keyExtractor={(j: any) => j.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <Card style={{ gap: 12, marginBottom: 8 }} testID="company-info-card">
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Logo fileId={c.logo_file_id} name={c.name} size={64} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.name}>{c.name}</Text>
                {c.verification_status === "verified" ? <Badge text="Verified company" tone="info" icon="shield-checkmark" testID="company-verified-badge" /> : <Badge text="Verification pending" tone="warning" />}
              </View>
            </View>
            {c.description ? <Text style={s.body}>{c.description}</Text> : null}
            <View style={{ gap: 6 }}>
              {c.industry ? <Row icon="layers-outline" text={c.industry} /> : null}
              {c.location ? <Row icon="location-outline" text={c.location} /> : null}
              {c.size ? <Row icon="people-outline" text={`${c.size} employees`} /> : null}
              {c.website ? (
                <Text style={[s.body, { color: colors.brand }]} onPress={() => Linking.openURL(c.website)} testID="company-website-link">
                  {c.website}
                </Text>
              ) : null}
            </View>
            <Text style={s.h3}>{jobs.length} active jobs</Text>
          </Card>
        }
        renderItem={({ item }) => <JobCard job={item} />}
        ListEmptyComponent={<EmptyView title="No open jobs" message="This company has no active openings right now." />}
      />
    </View>
  );
}

function Row({ icon, text }: { icon: any; text: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
      <Icon name={icon} size={16} color={colors.muted} />
      <Text style={s.body}>{text}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  name: { fontSize: 20, fontWeight: "800", color: c.onSurface },
  body: { fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 21 },
  h3: { fontSize: 15, fontWeight: "800", color: c.onSurface },
}));
