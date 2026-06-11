import { Redirect, router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/core/auth/AuthProvider";
import { colors } from "@/core/theme";

const tiles = [
  { title: "Skaner", subtitle: "Dodaj lub odejmij produkt", icon: "barcode-scan", route: "/scanner", color: "#2E7D32" },
  { title: "Spizarnia", subtitle: "Aktualny stan produktow", icon: "fridge-outline", route: "/pantry", color: "#1565C0" },
  { title: "Posilki", subtitle: "Kcal, makro i skladniki", icon: "silverware-fork-knife", route: "/meals", color: "#EF6C00" },
  { title: "Zapisane", subtitle: "Baza kodow kreskowych", icon: "bookmark-multiple-outline", route: "/saved", color: "#6A1B9A" }
] as const;

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  if (!user) return <Redirect href="/login" />;

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View><Text style={styles.title}>Smart Spizarnia</Text><Text style={styles.subtitle}>Co chcesz dzis zrobic?</Text></View>
        <Pressable onPress={signOut} style={styles.logout}><Text>Wyloguj</Text></Pressable>
      </View>
      <View style={styles.grid}>
        {tiles.map((tile) => (
          <Pressable key={tile.title} onPress={() => router.push(tile.route)} style={[styles.tile, { borderTopColor: tile.color }]}>
            <MaterialCommunityIcons name={tile.icon} size={64} color={tile.color} />
            <Text style={styles.tileTitle}>{tile.title}</Text>
            <Text style={styles.tileSubtitle}>{tile.subtitle}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 28, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  title: { fontSize: 32, fontWeight: "800", color: colors.text },
  subtitle: { color: colors.muted, fontSize: 16 },
  logout: { backgroundColor: colors.surface, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  grid: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 20 },
  tile: { width: "48%", flexGrow: 1, minHeight: 180, backgroundColor: colors.surface, borderRadius: 22, borderTopWidth: 8, padding: 24, justifyContent: "center", elevation: 3 },
  tileTitle: { fontSize: 27, fontWeight: "800", color: colors.text, marginTop: 12 },
  tileSubtitle: { fontSize: 15, color: colors.muted, marginTop: 4 }
});
