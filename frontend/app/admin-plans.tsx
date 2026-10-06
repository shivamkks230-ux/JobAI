import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, label } from "@/src/api";
import { makeStyles } from "@/src/theme";
import { Badge, Button, Card, ErrorView, Header, Input, LoadingView, useToast } from "@/src/ui";

function PlanEditor({ p, onSaved }: { p: any; onSaved: () => void }) {
  const s = useStyles();
  const toast = useToast();
  const [price, setPrice] = useState(String(p.price_inr));
  const [limit, setLimit] = useState(String(p.job_post_limit));
  const [features, setFeatures] = useState(p.features.join("\n"));
  const [busy, setBusy] = useState(false);
  const save = async (active?: boolean) => {
    setBusy(true);
    try {
      await api(`/admin/plans/${p.id}`, { method: "PUT", body: { price_inr: Number(price || 0), job_post_limit: Number(limit || 0), features: features.split("\n").map((x: string) => x.trim()).filter(Boolean), ...(active !== undefined ? { active } : {}) } });
      toast("Plan saved");
      onSaved();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 10 }} testID={`admin-plan-${p.audience}-${p.code}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={[s.title, { flex: 1 }]}>{label(p.audience)} · {p.name}</Text>
        <Badge text={p.active ? "Active" : "Inactive"} tone={p.active ? "success" : "neutral"} />
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}><Input label="Price (₹/month)" value={price} onChangeText={setPrice} keyboardType="numeric" testID={`plan-price-${p.audience}-${p.code}`} /></View>
        {p.audience === "recruiter" && <View style={{ flex: 1 }}><Input label="Active job limit" value={limit} onChangeText={setLimit} keyboardType="numeric" testID={`plan-limit-${p.code}`} /></View>}
      </View>
      <Input label="Features (one per line)" value={features} onChangeText={setFeatures} multiline />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button title="Save" small onPress={() => save()} loading={busy} testID={`plan-save-${p.audience}-${p.code}`} />
        {p.code !== "free" && <Button title={p.active ? "Deactivate" : "Activate"} small variant="outline" onPress={() => save(!p.active)} />}
      </View>
    </Card>
  );
}

export default function AdminPlans() {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const q = useQuery({ queryKey: ["admin-plans"], queryFn: () => api("/admin/plans") });
  return (
    <View style={s.root}>
      <Header title="Subscription plans" back />
      {q.isLoading ? <LoadingView /> : q.isError ? <ErrorView onRetry={q.refetch} /> : (
        <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}>
          <Text style={s.sub}>Payments connect through PAYMENT_PROVIDER (e.g. Razorpay/Cashfree) set in server secrets.</Text>
          {(q.data as any).items.map((p: any) => <PlanEditor key={p.id} p={p} onSaved={q.refetch} />)}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  title: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 13, color: c.muted },
}));

