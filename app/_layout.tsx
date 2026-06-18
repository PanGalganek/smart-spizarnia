import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/core/auth/AuthProvider";
import { SystemBackHandler } from "@/core/navigation/SystemBackHandler";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <SystemBackHandler />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
