import { Redirect } from "expo-router";
import { PropsWithChildren } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/core/auth/AuthProvider";
import { BottomActionBar } from "@/core/components/BottomActionBar";
import { useAppNavigation } from "@/core/navigation/useAppNavigation";
import { colors } from "@/core/theme";

type ModuleScreenProps = PropsWithChildren<{
  title: string;
  actionLabel?: string;
  actionVisible?: boolean;
  onBack?: () => void;
}>;

export function ModuleScreen({ title, children, actionLabel = "Cofnij", actionVisible = true, onBack }: ModuleScreenProps) {
  const { user, loading, isActive } = useAuth();
  const appNavigation = useAppNavigation();
  if (loading) return <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>;
  if (!user || !isActive) return <Redirect href="/login" />;
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerSide} />
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerSide} />
      </View>
      <View style={styles.content}>{children}</View>
      <BottomActionBar visible={actionVisible} label={actionLabel} onPress={onBack ?? appNavigation.goBack} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  header: { padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSide: { width: 76 },
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  content: { flex: 1, minHeight: 0, paddingHorizontal: 24, paddingBottom: 12 }
  ,loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }
});
