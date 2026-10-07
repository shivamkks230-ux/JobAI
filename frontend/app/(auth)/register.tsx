import React, { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { makeStyles } from "@/src/theme";
import { Button, Header, Input, Segmented } from "@/src/ui";

export default function Register() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const [role, setRole] = useState<"candidate" | "recruiter">("candidate");
  const [f, setF] = useState<Record<string, string>>({ name: "", email: "", password: "", phone: "", company_name: "", website: "", industry: "", size: "", location: "", description: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setErr("");
    if (!f.name || !f.email || !f.password) return setErr("Name, email and password are required");
    if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) return setErr("Password must be at least 8 characters with a letter and a number");
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setErr("Please enter a valid email address.");
    if (role === "recruiter" && !f.company_name) return setErr("Company name is required");
    setBusy(true);
    try {
      await register({
        name: f.name,
        email: f.email.trim(),
        password: f.password,
        role,
        phone: f.phone || null,
        company:
          role === "recruiter"
            ? { name: f.company_name, website: f.website || null, industry: f.industry || null, size: f.size || null, location: f.location || null, description: f.description || null }
            : null,
      });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <Header title="Create account" subtitle="Free for job seekers" back />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 24 }]}>
        <Segmented
          testIDPrefix="register-role"
          value={role}
          onChange={setRole}
          options={[
            { key: "candidate", label: "I'm looking for a job" },
            { key: "recruiter", label: "I'm hiring" },
          ]}
        />
        <Input label={role === "recruiter" ? "Your name" : "Full name"} testID="register-name-input" value={f.name} onChangeText={set("name")} placeholder="Priya Sharma" />
        <Input label={role === "recruiter" ? "Work email" : "Email"} testID="register-email-input" value={f.email} onChangeText={set("email")} autoCapitalize="none" keyboardType="email-address" placeholder="you@company.com" />
        <Input label="Password" testID="register-password-input" value={f.password} onChangeText={set("password")} secureTextEntry placeholder="Min. 8 characters" />
        <Input label="Phone (optional)" testID="register-phone-input" value={f.phone} onChangeText={set("phone")} keyboardType="phone-pad" placeholder="98XXXXXXXX" />
        {role === "recruiter" && (
          <>
            <Text style={s.section}>Company details</Text>
            <Text style={s.note}>Your company will be reviewed by our team. Verified companies get a trust badge and instant job publishing.</Text>
            <Input label="Company name" testID="register-company-name-input" value={f.company_name} onChangeText={set("company_name")} />
            <Input label="Company website" testID="register-company-website-input" value={f.website} onChangeText={set("website")} autoCapitalize="none" placeholder="https://" />
            <Input label="Industry" testID="register-company-industry-input" value={f.industry} onChangeText={set("industry")} placeholder="e.g. Software / SaaS" />
            <Input label="Company size" testID="register-company-size-input" value={f.size} onChangeText={set("size")} placeholder="e.g. 51-200" />
            <Input label="Location" testID="register-company-location-input" value={f.location} onChangeText={set("location")} placeholder="e.g. Bengaluru" />
            <Input label="About the company" testID="register-company-description-input" value={f.description} onChangeText={set("description")} multiline />
          </>
        )}
        {err ? (
          <Text style={s.err} testID="register-error">
            {err}
          </Text>
        ) : null}
        <Button title="Create account" onPress={submit} loading={busy} testID="register-submit-button" />
        <Text style={s.note}>By continuing you agree to our Terms and Privacy Policy. You can complete your profile later.</Text>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  body: { padding: 20, gap: 16 },
  section: { fontSize: 17, fontWeight: "800", color: c.onSurface, marginTop: 8 },
  note: { fontSize: 13, color: c.muted, lineHeight: 19 },
  err: { color: c.error, fontSize: 13, fontWeight: "600" },
}));
