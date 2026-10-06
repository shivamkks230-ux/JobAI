import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { makeStyles } from "@/src/theme";
import { Button, ErrorView, Header, Input, LoadingView, MultiSelect, useToast } from "@/src/ui";

const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

export default function ProfileEdit() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const q = useQuery({ queryKey: ["profile"], queryFn: () => api("/candidate/profile") });
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api("/meta"), staleTime: 600000 });
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p: any = q.data;
    if (p && !f)
      setF({
        name: p.name ?? "",
        phone: p.phone ?? "",
        headline: p.headline ?? "",
        current_location: p.current_location ?? "",
        preferred_locations: (p.preferred_locations ?? []).join(", "),
        experience_years: p.experience_years != null ? String(p.experience_years) : "",
        degree: p.education?.[0]?.degree ?? "",
        institution: p.education?.[0]?.institution ?? "",
        year: p.education?.[0]?.year ?? "",
        skills: (p.skills ?? []).join(", "),
        current_salary: p.current_salary ? String(p.current_salary / 100000) : "",
        expected_salary: p.expected_salary ? String(p.expected_salary / 100000) : "",
        notice_period: p.notice_period ?? "",
        job_types: p.job_types ?? [],
        work_preferences: p.work_preferences ?? [],
        preferred_industries: p.preferred_industries ?? [],
        preferred_roles: (p.preferred_roles ?? []).join(", "),
      });
  }, [q.data, f]);

  if (q.isLoading || !f) return <View style={s.root}><Header title="Edit profile" back />{q.isError ? <ErrorView onRetry={q.refetch} /> : <LoadingView />}</View>;
  const set = (k: string) => (v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

  const save = async () => {
    if (!f.name.trim()) return toast("Name is required", "error");
    setBusy(true);
    try {
      await api("/candidate/profile", {
        method: "PUT",
        body: {
          name: f.name.trim(),
          phone: f.phone || undefined,
          headline: f.headline || undefined,
          current_location: f.current_location || undefined,
          preferred_locations: list(f.preferred_locations),
          experience_years: num(f.experience_years),
          education: f.degree ? [{ degree: f.degree, institution: f.institution, year: f.year }] : [],
          skills: list(f.skills),
          current_salary: f.current_salary ? Number(f.current_salary) * 100000 : undefined,
          expected_salary: f.expected_salary ? Number(f.expected_salary) * 100000 : undefined,
          notice_period: f.notice_period || undefined,
          job_types: f.job_types,
          work_preferences: f.work_preferences,
          preferred_industries: f.preferred_industries,
          preferred_roles: list(f.preferred_roles),
        },
      });
      toast("Profile saved");
      qc.invalidateQueries();
      refresh();
      router.back();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <Header title="Edit profile" subtitle="Only name is required — fill the rest anytime" back />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}>
        <Text style={s.section}>Basics</Text>
        <Input label="Full name *" value={f.name} onChangeText={set("name")} testID="profile-name-input" />
        <Input label="Phone" value={f.phone} onChangeText={set("phone")} keyboardType="phone-pad" testID="profile-phone-input" />
        <Input label="Headline" value={f.headline} onChangeText={set("headline")} placeholder="e.g. Customer Support Executive" testID="profile-headline-input" />
        <Input label="Current location" value={f.current_location} onChangeText={set("current_location")} placeholder="e.g. Bengaluru" testID="profile-location-input" />
        <Input label="Preferred job locations (comma separated)" value={f.preferred_locations} onChangeText={set("preferred_locations")} placeholder="Bengaluru, Hyderabad" testID="profile-pref-locations-input" />
        <Text style={s.section}>Experience & education</Text>
        <Input label="Total experience (years)" value={f.experience_years} onChangeText={(v) => set("experience_years")(v.replace(/[^0-9.]/g, ""))} keyboardType="numeric" testID="profile-experience-input" />
        <Input label="Highest degree" value={f.degree} onChangeText={set("degree")} placeholder="e.g. B.Com, B.Tech, MBA" testID="profile-degree-input" />
        <Input label="Institution" value={f.institution} onChangeText={set("institution")} testID="profile-institution-input" />
        <Input label="Year" value={f.year} onChangeText={set("year")} keyboardType="numeric" testID="profile-year-input" />
        <Input label="Skills (comma separated)" value={f.skills} onChangeText={set("skills")} multiline placeholder="Communication, CRM, MS Excel" testID="profile-skills-input" />
        <Text style={s.section}>Salary & availability</Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><Input label="Current (LPA)" value={f.current_salary} onChangeText={(v) => set("current_salary")(v.replace(/[^0-9.]/g, ""))} keyboardType="numeric" testID="profile-current-salary-input" /></View>
          <View style={{ flex: 1 }}><Input label="Expected (LPA)" value={f.expected_salary} onChangeText={(v) => set("expected_salary")(v.replace(/[^0-9.]/g, ""))} keyboardType="numeric" testID="profile-expected-salary-input" /></View>
        </View>
        <Input label="Notice period" value={f.notice_period} onChangeText={set("notice_period")} placeholder="e.g. Immediate, 30 days" testID="profile-notice-input" />
        <Text style={s.section}>Preferences</Text>
        <Text style={s.label}>Work preference</Text>
        <MultiSelect testIDPrefix="profile-workpref" options={["office", "hybrid", "remote"]} value={f.work_preferences} onChange={set("work_preferences")} />
        <Text style={s.label}>Preferred job type</Text>
        <MultiSelect testIDPrefix="profile-jobtype" options={["full_time", "part_time", "contract", "internship"]} value={f.job_types} onChange={set("job_types")} />
        <Text style={s.label}>Preferred industries</Text>
        <MultiSelect testIDPrefix="profile-industry" options={(meta.data as any)?.industries ?? []} value={f.preferred_industries} onChange={set("preferred_industries")} />
        <Input label="Preferred job roles (comma separated)" value={f.preferred_roles} onChangeText={set("preferred_roles")} placeholder="Customer Support, Customer Success" testID="profile-roles-input" />
        <Button title="Save profile" onPress={save} loading={busy} testID="profile-save-button" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  section: { fontSize: 17, fontWeight: "800", color: c.onSurface, marginTop: 8 },
  label: { fontSize: 13, fontWeight: "600", color: c.onSurfaceSecondary },
}));
