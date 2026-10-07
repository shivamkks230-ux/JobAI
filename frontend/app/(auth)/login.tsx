import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { backendHost, checkHealth } from "@/src/api";
import { useAuth } from "@/src/auth";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, Icon, Input } from "@/src/ui";

export default function Login() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, googleLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [gBusy, setGBusy] = useState(false);
  const [health, setHealth] = useState<{ ok: boolean; message: string; ms: number } | null>(null);
  const [checking, setChecking] = useState(false);

  const probe = async () => {
    setChecking(true);
    setHealth(await checkHealth());
    setChecking(false);
  };

  // When a request fails with a connectivity/config error, probe /api/health so the real cause is visible.
  const showError = (e: any) => {
    setErr(e.message ?? "Something went wrong");
    if (e?.kind === "network" || e?.kind === "timeout" || e?.kind === "config") probe();
  };

  const submit = async () => {
    setErr("");
    if (!email.trim() || !password) return setErr("Enter your email and password");
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setGBusy(true);
    try {
      await googleLogin();
    } catch (e: any) {
      showError(e);
    } finally {
      setGBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <LinearGradient colors={[colors.heroStart, colors.heroEnd]} style={[s.hero, { paddingTop: insets.top + 40 }]}>
          <View style={s.logoMark}>
            <Icon name="sparkles" size={26} color={colors.onBrand} />
          </View>
          <Text style={s.brand} testID="login-brand">
            JobMatch AI
          </Text>
          <Text style={s.tagline}>Your next job, matched smarter.</Text>
        </LinearGradient>
        <View style={s.form}>
          <Text style={s.h1}>Welcome back</Text>
          <Text style={s.sub}>Sign in as a job seeker, recruiter or admin.</Text>
          <Input label="Email" testID="login-email-input" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" autoComplete="email" />
          <Input label="Password" testID="login-password-input" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" onSubmitEditing={submit} />
          {err ? (
            <Text style={s.err} testID="login-error">
              {err}
            </Text>
          ) : null}
          <Button title="Sign in" onPress={submit} loading={busy} testID="login-submit-button" />
          <View style={s.orRow}>
            <View style={s.line} />
            <Text style={s.or}>or</Text>
            <View style={s.line} />
          </View>
          <Button title="Continue with Google" icon="logo-google" variant="outline" onPress={google} loading={gBusy} testID="login-google-button" />
          <Pressable onPress={() => router.push("/register")} testID="login-go-register" style={s.link}>
            <Text style={s.linkText}>
              New to JobMatch AI? <Text style={{ color: colors.brand, fontWeight: "700" }}>Create an account</Text>
            </Text>
          </Pressable>
          <Pressable onPress={probe} testID="login-check-connection" style={s.diag}>
            <Icon name={health?.ok ? "checkmark-circle" : health ? "alert-circle" : "pulse-outline"} size={14} color={health?.ok ? colors.success : health ? colors.error : colors.muted} />
            <Text style={s.diagText} testID="login-connection-status" numberOfLines={2}>
              {checking ? "Checking server…" : health ? `${health.message}${health.ok ? ` · ${health.ms}ms` : ""}` : `Server: ${backendHost()} · tap to test connection`}
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { paddingHorizontal: 24, paddingBottom: 40, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  logoMark: { width: 52, height: 52, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  brand: { fontSize: 32, fontWeight: "800", color: c.onBrand, letterSpacing: -0.8 },
  tagline: { fontSize: 16, color: c.brandSecondary, marginTop: 6 },
  form: { padding: 24, gap: 16 },
  h1: { fontSize: 24, fontWeight: "800", color: c.onSurface },
  sub: { fontSize: 14, color: c.muted, marginTop: -8 },
  err: { color: c.error, fontSize: 13, fontWeight: "600" },
  orRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  line: { flex: 1, height: 1, backgroundColor: c.border },
  or: { color: c.muted, fontSize: 13 },
  link: { alignItems: "center", paddingVertical: 12 },
  linkText: { color: c.onSurfaceSecondary, fontSize: 14 },
  diag: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
  diagText: { color: c.muted, fontSize: 12, flexShrink: 1, textAlign: "center" },
}));
