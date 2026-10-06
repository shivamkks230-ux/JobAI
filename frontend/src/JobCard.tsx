import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { api, formatExp, formatSalary, label, timeAgo } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { Badge, Button, Card, Icon, Logo, MatchBadge, VerifiedBadge, useToast } from "@/src/ui";

export type JobCardT = {
  id: string;
  title: string;
  company_name: string;
  company_id?: string;
  company_logo_id?: string;
  company_verified?: boolean;
  location: string;
  salary_min?: number;
  salary_max?: number;
  salary_period?: string;
  min_experience?: number;
  max_experience?: number;
  work_mode?: string;
  employment_type?: string;
  posted_at?: string;
  featured?: boolean;
  is_external?: boolean;
  is_test?: boolean;
  match_score?: number | null;
  saved?: boolean;
  application_stage?: string | null;
};

export function useToggleSave() {
  const qc = useQueryClient();
  const toast = useToast();
  return async (jobId: string, saved: boolean) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await api(`/jobs/${jobId}/save`, { method: saved ? "DELETE" : "POST" });
    toast(saved ? "Removed from saved jobs" : "Job saved", "success");
    qc.invalidateQueries({ queryKey: ["saved"] });
    qc.invalidateQueries({ queryKey: ["job", jobId] });
  };
}

export function JobCard({ job, width, showActions = true }: { job: JobCardT; width?: number; showActions?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const toggle = useToggleSave();
  const [saved, setSaved] = useState(!!job.saved);
  const [busy, setBusy] = useState(false);

  const onSave = async () => {
    setBusy(true);
    try {
      await toggle(job.id, saved);
      setSaved(!saved);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card testID={`job-card-${job.id}`} onPress={() => router.push(`/job/${job.id}`)} style={[{ gap: 12 }, width ? { width } : null]}>
      <View style={s.top}>
        <Logo fileId={job.company_logo_id} name={job.company_name} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title} numberOfLines={2}>
            {job.title}
          </Text>
          <View style={s.row}>
            <Text style={s.company} numberOfLines={1}>
              {job.company_name}
            </Text>
            {job.company_verified && <VerifiedBadge />}
          </View>
        </View>
        {job.match_score != null && <MatchBadge score={job.match_score} testID={`job-match-${job.id}`} />}
      </View>
      <View style={s.meta}>
        <Meta icon="location-outline" text={job.location} />
        <Meta icon="wallet-outline" text={formatSalary(job.salary_min, job.salary_max, job.salary_period)} />
        <Meta icon="briefcase-outline" text={formatExp(job.min_experience, job.max_experience)} />
      </View>
      <View style={[s.row, { flexWrap: "wrap", gap: 6 }]}>
        <Badge text={label(job.work_mode)} tone="neutral" />
        {job.featured && <Badge text="Featured" tone="warning" icon="star" />}
        {job.is_external && <Badge text="External" tone="info" icon="open-outline" />}
        {job.is_test && <Badge text="TEST DATA" tone="error" />}
        {job.application_stage && <Badge text={`Applied · ${label(job.application_stage)}`} tone="success" />}
        <Text style={s.posted}>{timeAgo(job.posted_at)}</Text>
      </View>
      {showActions && (
        <View style={s.row}>
          <Button
            title={job.application_stage ? "View status" : job.is_external ? "Apply on site" : "Apply Now"}
            small
            style={{ flex: 1 }}
            testID={`job-apply-${job.id}`}
            onPress={() => router.push(job.application_stage || job.is_external ? `/job/${job.id}` : `/apply/${job.id}`)}
          />
          <Pressable testID={`job-save-${job.id}`} disabled={busy} onPress={onSave} style={s.saveBtn} hitSlop={6}>
            <Icon name={saved ? "bookmark" : "bookmark-outline"} size={20} color={saved ? colors.brand : colors.onSurfaceTertiary} />
          </Pressable>
        </View>
      )}
    </Card>
  );
}

function Meta({ icon, text }: { icon: any; text: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.metaItem}>
      <Icon name={icon} size={14} color={colors.muted} />
      <Text style={s.metaText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  top: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 16, fontWeight: "700", color: c.onSurface, lineHeight: 21 },
  company: { fontSize: 13, color: c.onSurfaceTertiary, flexShrink: 1 },
  meta: { gap: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 13, color: c.onSurfaceSecondary, flex: 1 },
  posted: { fontSize: 12, color: c.muted, marginLeft: "auto" },
  saveBtn: { width: 44, height: 38, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
}));
