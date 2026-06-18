import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/core/auth/AuthProvider";
import { colors } from "@/core/theme";

export default function Index() {
  const { user, loading, isActive } = useAuth();
  if (loading) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>;
  }
  return <Redirect href={user && isActive ? "/home" : "/login"} />;
}
