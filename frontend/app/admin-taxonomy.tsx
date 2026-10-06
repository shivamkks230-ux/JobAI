import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, EmptyView, ErrorView, Header, Icon, Input, LoadingView, Segmented, useToast } from "@/src/ui";

type Kind = "categories" | "skills" | "industries";

export default function Taxonomy() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>("categories");
  const [name, setName] = useState("");
  const q = useQuery({ queryKey: ["tax", kind], queryFn: () => api(`/admin/taxonomy/${kind}`) });
  const add = async () => {
    if (name.trim().length < 2) return;
    try {
      await api(`/admin/taxonomy/${kind}`, { body: { name: name.trim() } });
      setName("");
      toast("Added");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const del = async (id: string) => {
    try {
      await api(`/admin/taxonomy/${kind}/${id}`, { method: "DELETE" });
      q.refetch();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  return (
    <View style={s.root}>
      <Header title="Categories & skills" back />
      <View style={{ padding: 16, gap: 10 }}>
        <Segmented testIDPrefix="tax-kind" value={kind} onChange={setKind} options={[{ key: "categories", label: "Categories" }, { key: "skills", label: "Skills" }, { key: "industries", label: "Industries" }]} />
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}><Input value={name} onChangeText={setName} placeholder={`New ${kind.slice(0, -1)}`} testID="tax-name-input" onSubmitEditing={add} /></View>
          <Button title="Add" onPress={add} testID="tax-add-button" />
        </View>
      </View>
      {q.isLoading ? <LoadingView /> : q.isError ? <ErrorView onRetry={q.refetch} /> : (
        <FlatList
          data={(q.data as any).items}
          keyExtractor={(i: any) => i.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          ListEmptyComponent={<EmptyView title="Nothing here yet" />}
          renderItem={({ item }) => (
            <View style={s.row} testID={`tax-item-${item.id}`}>
              <Text style={s.name}>{item.name}</Text>
              <Pressable onPress={() => del(item.id)} hitSlop={10} testID={`tax-delete-${item.id}`}>
                <Icon name="trash-outline" size={18} color={colors.error} />
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.divider },
  name: { flex: 1, fontSize: 15, color: c.onSurface },
}));
