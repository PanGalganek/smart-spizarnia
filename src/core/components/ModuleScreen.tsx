import { Redirect, router } from "expo-router";
import { PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/core/auth/AuthProvider";
import { colors } from "@/core/theme";

export function ModuleScreen({ title, children, onBack }: PropsWithChildren<{ title: string; onBack?: () => void }>) {
  const { user, loading, isActive } = useAuth();
  if (loading) return <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>;
  if (!user || !isActive) return <Redirect href="/login" />;
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <Pressable onPress={onBack ?? (() => router.back())} style={styles.back}>
          <Text style={styles.backText}>Wstecz</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.back} />
      </View>
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  header: { padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 76, paddingVertical: 10 },
  backText: { color: colors.primary, fontWeight: "700" },
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  content: { flex: 1, minHeight: 0, paddingHorizontal: 24, paddingBottom: 24 }
  ,loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }
});
