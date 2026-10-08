import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { makeStyles } from "@/src/theme";
import { Button, Chip, ErrorView, Header, Input, LoadingView, useToast } from "@/src/ui";

const csv = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
const EMPTY = { title: "", description: "", responsibilities: "", benefits: "", required_skills: "", preferred_skills: "", min_experience: "0", max_experience: "", education: "", salary_min: "", salary_max: "", salary_period: "yearly", location: "", work_mode: "office", employment_type: "full_time", industry: "", category: "", openings: "1", application_deadline: "", external_url: "", company_name: "" };

export default function JobForm() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useQuery({ queryKey: ["edit-job", id], enabled: !!id, queryFn: () => api(isAdmin ? `/jobs/${id}` : `/recruiter/jobs/${id}`) });
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api("/meta"), staleTime: 600000 });
  const [f, setF] = useState<any>(id ? null : EMPTY);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const j: any = existing.data;
    if (j && !f) {
      const o: any = { ...EMPTY };
      Object.keys(EMPTY).forEach((k) => { if (j[k] != null) o[k] = Array.isArray(j[k]) ? j[k].join(", ") : String(j[k]); });
      ["salary_min", "salary_max"].forEach((k) => { if (j[k]) o[k] = String(j.salary_period === "monthly" ? j[k] / 1000 : j[k] / 100000); });
      setF(o);
    }
  }, [existing.data, f]);

  if (id && (existing.isLoading || !f)) return <View style={s.root}><Header title="Edit job" back />{existing.isError ? <ErrorView onRetry={existing.refetch} /> : <LoadingView />}</View>;
  const set = (k: string) => (v: string) => setF((p: any) => ({ ...p, [k]: v }));
  const mult = f.salary_period === "monthly" ? 1000 : 100000;
  const n = (v: string) => (v.trim() === "" ? null : Number(v));

  const submit = async (draft: boolean) => {
    setErr("");
    if (f.title.length < 3 || f.description.length < 30 || f.location.length < 2) return setErr("Title, location and a description (30+ chars) are required");
    setBusy(draft ? "draft" : "publish");
    const body: any = {
      title: f.title, description: f.description, responsibilities: f.responsibilities || null, benefits: f.benefits || null,
      required_skills: csv(f.required_skills), preferred_skills: csv(f.preferred_skills),
      min_experience: Number(f.min_experience || 0), max_experience: n(f.max_experience), education: f.education || null,
      salary_min: f.salary_min ? Number(f.salary_min) * mult : null, salary_max: f.salary_max ? Number(f.salary_max) * mult : null,
      salary_period: f.salary_period, location: f.location, work_mode: f.work_mode, employment_type: f.employment_type,
      industry: f.industry || null, category: f.category || null, openings: Number(f.openings || 1),
      application_deadline: f.application_deadline || null, external_url: f.external_url || null, save_as_draft: draft,
    };
    try {
      if (isAdmin) {
        if (id) await api(`/admin/jobs/${id}`, { method: "PUT", body });
        else await api("/admin/jobs", { body: { ...body, company_name: f.company_name || null, source: "admin" } });
        toast(id ? "Job updated" : "Job published");
      } else if (id) {
        const r = await api(`/recruiter/jobs/${id}`, { method: "PUT", body });
        toast(r.status === "pending_approval" ? "Saved — sent for admin review" : "Job updated");
      } else {
        const r = await api("/recruiter/jobs", { body });
        toast(r.status === "draft" ? "Draft saved" : "Job submitted for admin approval.");
        qc.invalidateQueries();
        router.replace("/postings");
        return;
      }
      qc.invalidateQueries();
      router.back();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  };

  const Pick = ({ k, opts }: { k: string; opts: string[] }) => (
    <View style={s.wrap}>
      {opts.map((o) => <Chip key={o} label={o.replace(/_/g, " ")} selected={f[k] === o} onPress={() => set(k)(f[k] === o && (k === "category" || k === "industry") ? "" : o)} testID={`jobform-${k}-${o.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} />)}
    </View>
  );

  return (
    <View style={s.root}>
      <Header title={id ? "Edit job" : "Post a job"} subtitle={isAdmin ? "Admin-verified listing" : undefined} back />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}>
        {isAdmin && !id && <Input label="Employer name (for external listings)" value={f.company_name} onChangeText={set("company_name")} testID="jobform-company-name" />}
        <Input label="Job title *" value={f.title} onChangeText={set("title")} testID="jobform-title" />
        <Input label="Description *" value={f.description} onChangeText={set("description")} multiline testID="jobform-description" />
        <Input label="Responsibilities (one per line)" value={f.responsibilities} onChangeText={set("responsibilities")} multiline testID="jobform-responsibilities" />
        <Input label="Required skills (comma separated)" value={f.required_skills} onChangeText={set("required_skills")} testID="jobform-required-skills" />
        <Input label="Preferred skills (comma separated)" value={f.preferred_skills} onChangeText={set("preferred_skills")} testID="jobform-preferred-skills" />
        <View style={s.row2}>
          <View style={{ flex: 1 }}><Input label="Min exp (yrs)" value={f.min_experience} onChangeText={set("min_experience")} keyboardType="numeric" testID="jobform-min-exp" /></View>
          <View style={{ flex: 1 }}><Input label="Max exp (yrs)" value={f.max_experience} onChangeText={set("max_experience")} keyboardType="numeric" testID="jobform-max-exp" /></View>
        </View>
        <Input label="Education" value={f.education} onChangeText={set("education")} placeholder="e.g. Graduate" testID="jobform-education" />
        <Text style={s.label}>Salary period</Text>
        <Pick k="salary_period" opts={["yearly", "monthly"]} />
        <View style={s.row2}>
          <View style={{ flex: 1 }}><Input label={f.salary_period === "monthly" ? "Min (₹ thousand/mo)" : "Min (LPA)"} value={f.salary_min} onChangeText={set("salary_min")} keyboardType="numeric" testID="jobform-salary-min" /></View>
          <View style={{ flex: 1 }}><Input label={f.salary_period === "monthly" ? "Max (₹ thousand/mo)" : "Max (LPA)"} value={f.salary_max} onChangeText={set("salary_max")} keyboardType="numeric" testID="jobform-salary-max" /></View>
        </View>
        <Input label="Location *" value={f.location} onChangeText={set("location")} placeholder="e.g. Bengaluru" testID="jobform-location" />
        <Text style={s.label}>Work mode</Text>
        <Pick k="work_mode" opts={["office", "hybrid", "remote"]} />
        <Text style={s.label}>Employment type</Text>
        <Pick k="employment_type" opts={["full_time", "part_time", "contract", "internship", "temporary"]} />
        <Text style={s.label}>Category</Text>
        <Pick k="category" opts={(meta.data as any)?.categories ?? []} />
        <Text style={s.label}>Industry</Text>
        <Pick k="industry" opts={(meta.data as any)?.industries ?? []} />
        <View style={s.row2}>
          <View style={{ flex: 1 }}><Input label="Openings" value={f.openings} onChangeText={set("openings")} keyboardType="numeric" testID="jobform-openings" /></View>
          <View style={{ flex: 1 }}><Input label="Deadline (YYYY-MM-DD)" value={f.application_deadline} onChangeText={set("application_deadline")} testID="jobform-deadline" /></View>
        </View>
        <Input label="Benefits (one per line)" value={f.benefits} onChangeText={set("benefits")} multiline testID="jobform-benefits" />
        <Input label="External application URL (optional, https://)" value={f.external_url} onChangeText={set("external_url")} autoCapitalize="none" testID="jobform-external-url" />
        <Text style={s.note}>Never ask candidates for payment. Listings with payment requests or personal contact details are held for review.</Text>
        {err ? <Text style={s.err} testID="jobform-error">{err}</Text> : null}
        <Button title={id ? "Save changes" : isAdmin ? "Publish job" : "Submit for approval"} onPress={() => submit(false)} loading={busy === "publish"} testID="jobform-submit" />
        {!isAdmin && !id && <Button title="Save as draft" variant="outline" onPress={() => submit(true)} loading={busy === "draft"} testID="jobform-save-draft" />}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  row2: { flexDirection: "row", gap: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  label: { fontSize: 13, fontWeight: "600", color: c.onSurfaceSecondary },
  note: { fontSize: 12, color: c.muted, lineHeight: 17 },
  err: { color: c.error, fontSize: 13, fontWeight: "600" },
}));
