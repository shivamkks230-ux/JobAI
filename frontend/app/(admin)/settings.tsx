import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";

import { api, formatDateTime, label } from "@/src/api";
import { useAuth } from "@/src/auth";
import { makeStyles } from "@/src/theme";
import { Badge, Button, Card, Header } from "@/src/ui";

export default function Settings() {
  const s = useStyles();
  const router = useRouter();
  const { logout } = useAuth();
  const integ = useQuery({ queryKey: ["admin-integrations"], queryFn: () => api("/admin/integrations") });
  const logs = useQuery({ queryKey: ["admin-audit"], queryFn: () => api("/admin/audit-logs") });
  return (
    <View style={s.root}>
      <Header title="Settings" subtitle="Platform configuration" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24, maxWidth: 1000, width: "100%", alignSelf: "center" }}>
        <Card style={{ gap: 10 }}>
          <Text style={s.h3}>Manage</Text>
          <View style={s.wrap}>
            <Button title="Categories & skills" small variant="secondary" onPress={() => router.push("/admin-taxonomy")} testID="settings-taxonomy" />
            <Button title="Subscription plans" small variant="secondary" onPress={() => router.push("/admin-plans")} testID="settings-plans" />
            <Button title="Add verified job" small variant="outline" onPress={() => router.push("/job-form")} testID="settings-add-job" />
            <Button title="Notifications" small variant="outline" onPress={() => router.push("/notifications")} testID="settings-notifications" />
          </View>
        </Card>
        <Card style={{ gap: 10 }} testID="settings-integrations">
          <Text style={s.h3}>Integrations</Text>
          {((integ.data as any)?.items ?? []).map((i: any) => (
            <View key={i.key} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.body}>{i.name}</Text>
                <Text style={s.tiny}>Env: {i.env}</Text>
              </View>
              <Badge text={i.configured ? "Configured" : "Not configured"} tone={i.configured ? "success" : "warning"} />
            </View>
          ))}
          <Text style={s.sub}>Secrets live in server environment variables (Deployment → Secrets), never in the app.</Text>
        </Card>
        <Card style={{ gap: 6 }} testID="settings-audit">
          <Text style={s.h3}>Recent admin & security activity</Text>
          {((logs.data as any)?.items ?? []).slice(0, 15).map((l: any) => (
            <Text key={l.id} style={s.sub}>{formatDateTime(l.created_at)} · {label(l.actor_role)} · {label(l.action)}</Text>
          ))}
        </Card>
        <Button title="Logout" variant="danger" icon="log-out-outline" onPress={() => logout()} testID="settings-logout" />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  h3: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted, lineHeight: 18 },
  body: { fontSize: 14, color: c.onSurfaceSecondary },
  tiny: { fontSize: 11, color: c.muted },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
}));
