import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import { Product } from "@/domain/product";
import { listSavedProducts } from "@/services/inventoryRepository";

export function SavedScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  useFocusEffect(useCallback(() => {
    setError("");
    void listSavedProducts().then(setProducts).catch(() => setError("Nie udalo sie pobrac zapisanych produktow."));
  }, []));
  return (
    <ModuleScreen title="Zapisane">
      {!!error && <Text style={styles.error}>{error}</Text>}
      <FlatList data={products} keyExtractor={(item) => item.barcode} numColumns={2} columnWrapperStyle={styles.columns} ListEmptyComponent={!error ? <Text style={styles.empty}>Brak zapisanych produktow.</Text> : null} renderItem={({ item }) => (
        <View style={styles.card}><Text style={styles.name}>{item.name}</Text><Text style={styles.muted}>{item.source === "usda" ? "USDA - produkt bez kodu" : item.barcode}</Text><Text style={styles.kcal}>{item.nutrientsPer100g.energyKcal ?? "brak"} kcal / {item.nutritionBasis === "perUnit" ? "szt." : "100 g/ml"}</Text><Text>B: {item.nutrientsPer100g.proteins ?? "-"} g  W: {item.nutrientsPer100g.carbohydrates ?? "-"} g  T: {item.nutrientsPer100g.fat ?? "-"} g</Text><Text style={styles.muted}>Potas: {item.nutrientsPer100g.potassium ?? "-"} mg | Wapn: {item.nutrientsPer100g.calcium ?? "-"} mg | Zelazo: {item.nutrientsPer100g.iron ?? "-"} mg</Text></View>
      )} />
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  columns: { gap: 12 }, card: { flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 12 },
  name: { fontWeight: "800", fontSize: 18 }, muted: { color: colors.muted, marginVertical: 5 }, kcal: { color: colors.primary, fontWeight: "700", marginBottom: 5 },
  empty: { textAlign: "center", color: colors.muted, marginTop: 80 }
  , error: { color: colors.danger, textAlign: "center", marginBottom: 12 }
});
