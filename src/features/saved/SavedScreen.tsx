import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import { Product } from "@/domain/product";
import { listSavedProducts } from "@/services/inventoryRepository";
import { addProductToShoppingList } from "@/services/shoppingRepository";

export function SavedScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useFocusEffect(useCallback(() => {
    setError("");
    void listSavedProducts().then(setProducts).catch(() => setError("Nie udało się pobrać zapisanych produktów."));
  }, []));
  return (
    <ModuleScreen title="Zapisane">
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!message && <Text style={styles.message}>{message}</Text>}
      <FlatList data={products} keyExtractor={(item) => item.barcode} numColumns={2} columnWrapperStyle={styles.columns} ListEmptyComponent={!error ? <Text style={styles.empty}>Brak zapisanych produktów.</Text> : null} renderItem={({ item }) => (
        <Pressable onPress={() => void addProductToShoppingList(item, "saved").then(() => setMessage(`Dodano do listy zakupów: ${item.name}.`)).catch(() => setMessage("Nie udało się dodać produktu do listy."))} style={({ pressed }) => [styles.card, pressed && styles.pressed]}><Text style={styles.name}>{item.name}</Text><Text style={styles.muted}>{item.source === "usda" ? "USDA - produkt bez kodu" : item.barcode}</Text><Text style={styles.kcal}>{item.nutrientsPer100g.energyKcal ?? "brak"} kcal / {item.nutritionBasis === "perUnit" ? "szt." : "100 g/ml"}</Text><Text>B: {item.nutrientsPer100g.proteins ?? "-"} g  W: {item.nutrientsPer100g.carbohydrates ?? "-"} g  T: {item.nutrientsPer100g.fat ?? "-"} g</Text><Text style={styles.muted}>Potas: {item.nutrientsPer100g.potassium ?? "-"} mg | Wapń: {item.nutrientsPer100g.calcium ?? "-"} mg | Żelazo: {item.nutrientsPer100g.iron ?? "-"} mg</Text><Text style={styles.add}>Kliknij, aby dodać do listy zakupów</Text></Pressable>
      )} />
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  columns: { gap: 12 }, card: { flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 12 },
  name: { fontWeight: "800", fontSize: 18 }, muted: { color: colors.muted, marginVertical: 5 }, kcal: { color: colors.primary, fontWeight: "700", marginBottom: 5 }, add: { color: colors.primary, fontWeight: "800", marginTop: 10 }, pressed: { opacity: 0.68 }, message: { color: "#1B5E20", backgroundColor: "#E8F5E9", borderRadius: 10, padding: 12, marginBottom: 12, fontWeight: "700" },
  empty: { textAlign: "center", color: colors.muted, marginTop: 80 }
  , error: { color: colors.danger, textAlign: "center", marginBottom: 12 }
});
