import { Redirect, router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useAuth } from "@/core/auth/AuthProvider";
import { colors } from "@/core/theme";

const tiles = [
  { title: "Skaner", subtitle: "Dodaj lub odejmij produkt", icon: "barcode-scan", route: "/scanner", color: "#2E7D32" },
  { title: "Spiżarnia", subtitle: "Aktualny stan produktów", icon: "fridge-outline", route: "/pantry", color: "#1565C0" },
  { title: "Posiłki", subtitle: "Kcal, makro i składniki", icon: "silverware-fork-knife", route: "/meals", color: "#EF6C00" },
  { title: "Zapisane", subtitle: "Baza kodów kreskowych", icon: "bookmark-multiple-outline", route: "/saved", color: "#6A1B9A" },
  { title: "Lista zakupów", subtitle: "Produkty do kupienia", icon: "cart-outline", route: "/shopping", color: "#AD5A00" }
] as const;

const APP_VERSION = "0.11.15";

export default function HomeScreen() {
  const { user, profile, isActive, isAdmin, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 700;
  if (!user || !isActive) return <Redirect href="/login" />;
  const visibleTiles = isAdmin ? [...tiles, { title: "Panel administratora", subtitle: "Użytkownicy i zatwierdzanie kont", icon: "shield-account-outline", route: "/admin", color: "#455A64" } as const] : tiles;

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.content, compact && styles.compactContent]}>
      <View style={styles.header}>
        <View style={styles.heading}><Text style={[styles.title, compact && styles.compactTitle]}>Smart Spiżarnia</Text><Text style={styles.subtitle}>Co chcesz dziś zrobić? · wersja {APP_VERSION}</Text></View>
        <Pressable onPress={signOut} style={styles.logout}><Text>Wyloguj</Text></Pressable>
      </View>
      <View style={styles.grid}>
        {visibleTiles.map((tile) => (
          <Pressable key={tile.title} onPress={() => router.push(tile.route)} style={[styles.tile, compact && styles.compactTile, { borderTopColor: tile.color }]}>
            <MaterialCommunityIcons name={tile.icon} size={compact ? 48 : 64} color={tile.color} />
            <Text style={[styles.tileTitle, compact && styles.compactTileTitle]}>{tile.title}</Text>
            <Text style={styles.tileSubtitle}>{tile.subtitle}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: 28 },
  compactContent: { padding: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 24 },
  heading: { flex: 1 },
  title: { fontSize: 32, fontWeight: "800", color: colors.text },
  compactTitle: { fontSize: 25 },
  subtitle: { color: colors.muted, fontSize: 16 },
  logout: { backgroundColor: colors.surface, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  tile: { width: "48%", flexGrow: 1, minHeight: 180, backgroundColor: colors.surface, borderRadius: 22, borderTopWidth: 8, padding: 24, justifyContent: "center", elevation: 3 },
  compactTile: { width: "100%", minHeight: 145, padding: 20 },
  tileTitle: { fontSize: 27, fontWeight: "800", color: colors.text, marginTop: 12 },
  compactTileTitle: { fontSize: 23, marginTop: 8 },
  tileSubtitle: { fontSize: 15, color: colors.muted, marginTop: 4 }
});
