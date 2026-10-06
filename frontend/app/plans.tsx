import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Badge, Button, Card, ErrorView, Header, Icon, LoadingView, useToast } from "@/src/ui";

export default function Plans() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const q = useQuery({ queryKey: ["plans"], queryFn: () => api("/plans") });
  const d: any = q.data;

  const buy = async (id: string) => {
    setBusy(id);
    try {
      await api("/payments/checkout", { body: { plan_id: id } });
      toast("Checkout created", "success");
    } catch (e: any) {
      toast(e.message, "info");
    } finally {
      setBusy("");
    }
  };

  return (
    <View style={s.root}>
      <Header title="Plans" subtitle="Basic job search is always free" back />
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={(q.error as Error).message} onRetry={q.refetch} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}>
          {!d.payments_enabled && (
            <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warningSoft }} testID="plans-payments-disabled">
              <Text style={s.body}>Online payments are being set up. You can explore plans now; upgrades will open soon.</Text>
            </Card>
          )}
          {d.items.map((p: any) => {
            const current = p.id === d.current_plan_id;
            return (
              <Card key={p.id} testID={`plan-card-${p.code}`} style={[{ gap: 12 }, current && { borderColor: colors.brand, borderWidth: 2 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={s.name}>{p.name}</Text>
                  {current && <Badge text="Current plan" tone="brand" />}
                </View>
                <Text style={s.price}>{p.price_inr ? `₹${p.price_inr.toLocaleString("en-IN")}` : "Free"}<Text style={s.per}>{p.price_inr ? ` / ${p.period}` : ""}</Text></Text>
                {p.features.map((f: string) => (
                  <View key={f} style={{ flexDirection: "row", gap: 8 }}>
                    <Icon name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={s.body}>{f}</Text>
                  </View>
                ))}
                {!current && p.price_inr > 0 && <Button title={`Upgrade to ${p.name}`} onPress={() => buy(p.id)} loading={busy === p.id} testID={`plan-upgrade-${p.code}`} />}
              </Card>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  name: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  price: { fontSize: 28, fontWeight: "800", color: c.brandPrimary },
  per: { fontSize: 14, color: c.muted, fontWeight: "500" },
  body: { fontSize: 14, color: c.onSurfaceSecondary, lineHeight: 20, flex: 1 },
}));
