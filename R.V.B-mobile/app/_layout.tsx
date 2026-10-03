import { Stack, useSegments, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useAuthStore } from "@/stores/auth-store";
import { getAuthGate } from "@/utils/auth-gate";
import { isApiUrlConfigured } from "@/api/config";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { ThemeProvider } from "@/theme/ThemeProvider";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { status, account, bootstrap, isBootstrapped } = useAuthStore();
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    // Validate API URL early
    if (!isApiUrlConfigured()) {
      setApiError(
        "EXPO_PUBLIC_RVB_API_URL is not set. Set it in .env (e.g. http://192.168.1.100:5000). See .env.example. Physical device localhost is the device itself — use LAN IP."
      );
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    if (!isBootstrapped) {
      bootstrap().finally(() => {
        SplashScreen.hideAsync().catch(() => {});
      });
    } else {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isBootstrapped]);

  useEffect(() => {
    if (apiError) return;
    if (status === "booting") return;
    const gate = getAuthGate(status, account);
    const segArray = segments as unknown as string[];
    const seg0 = segArray[0] as string | undefined;
    const seg1 = segArray[1] as string | undefined;

    const inAuth = seg0 === "(auth)";
    const inApp = seg0 === "(app)";

    // Prevent flicker: only navigate when segments resolved
    if (gate === "login") {
      if (!inAuth || seg1 !== "login") {
        router.replace("/(auth)/login" as any);
      }
      return;
    }
    if (gate === "change-password") {
      if (seg1 !== "change-password") {
        router.replace("/(auth)/change-password" as any);
      }
      return;
    }
    if (gate === "onboarding") {
      if (seg1 !== "onboarding") {
        router.replace("/(auth)/onboarding" as any);
      }
      return;
    }
    if (gate === "app") {
      if (!inApp) {
        router.replace("/(app)/profile" as any);
      }
      return;
    }
  }, [status, account, segments, apiError]);

  if (apiError) {
    return (
      <SafeAreaProvider>
        <View style={styles.apiErrorWrap}>
          <Text style={styles.apiErrorTitle}>Configuration required</Text>
          <ErrorState title="Missing API URL" message={apiError} />
          <Text style={styles.apiHint}>Set EXPO_PUBLIC_RVB_API_URL and restart with --clear</Text>
        </View>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    );
  }

  if (status === "booting") {
    return (
      <SafeAreaProvider>
        <Loading message="Restoring session..." />
        <StatusBar style="dark" />
      </SafeAreaProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
          <Stack.Screen name="index" options={{ headerShown: false }} />
        </Stack>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  apiErrorWrap: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#F8FAFC" },
  apiErrorTitle: { fontSize: 20, fontWeight: "700", color: "#0F172A", textAlign: "center", marginBottom: 12 },
  apiHint: { marginTop: 12, color: "#64748B", fontSize: 12, textAlign: "center" },
});
