import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, LogBox, Text, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "@/src/auth";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { useTheme } from "@/src/theme";
import { ToastProvider } from "@/src/ui";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

const ROLE_HOME = { candidate: "/home", recruiter: "/dashboard", admin: "/overview" } as const;
const ROLE_GROUP = { candidate: "(candidate)", recruiter: "(recruiter)", admin: "(admin)" } as const;
const GROUPS = ["(candidate)", "(recruiter)", "(admin)"];

function Gate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();
  const first = segments[0] as string | undefined;

  useEffect(() => {
    if (loading) return;
    const inAuth = first === "(auth)";
    if (!user) {
      if (!inAuth) router.replace("/login");
      return;
    }
    const wrongGroup = first && GROUPS.includes(first) && first !== ROLE_GROUP[user.role];
    if (inAuth || !first || first === "index" || wrongGroup) router.replace(ROLE_HOME[user.role] as any);
  }, [user, loading, first, router]);

  if (loading) {
    return (
      <View testID="app-splash" style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, gap: 16 }}>
        <Text style={{ fontSize: 26, fontWeight: "800", color: colors.brandPrimary, letterSpacing: -0.5 }}>JobMatch AI</Text>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />;
}

export default function RootLayout() {
  // One app level ErrorBoundary; a render crash shows a reload screen
  // instead of a blank app.
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <ToastProvider>
              <AuthProvider>
                <StatusBar style="dark" />
                <Gate />
              </AuthProvider>
            </ToastProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
