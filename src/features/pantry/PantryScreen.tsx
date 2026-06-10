import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import { PantryItem } from "@/domain/product";
import { listPantry } from "@/services/inventoryRepository";

export function PantryScreen() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [error, setError] = useState("");
  useFocusEffect(useCallback(() => {
    setError("");
    void listPantry().then(setItems).catch(() => setError("Nie udalo sie pobrac stanu spizarni."));
  }, []));
  return (
    <ModuleScreen title="Spizarnia">
      {!!error && <Text style={styles.error}>{error}</Text>}
      <FlatList data={items} keyExtractor={(item) => item.barcode} ListEmptyComponent={!error ? <Text style={styles.empty}>Spizarnia jest pusta.</Text> : null} renderItem={({ item }) => (
        <View style={styles.row}><View><Text style={styles.name}>{item.product.name}</Text><Text style={styles.muted}>{item.barcode}</Text></View><Text style={styles.qty}>{item.quantity} {item.unit}</Text></View>
      )} />
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 12, flexDirection: "row", justifyContent: "space-between" },
  name: { fontWeight: "700", fontSize: 18 }, muted: { color: colors.muted }, qty: { fontWeight: "800", fontSize: 20, color: colors.primary },
  empty: { textAlign: "center", color: colors.muted, marginTop: 80 }
  , error: { color: colors.danger, textAlign: "center", marginBottom: 12 }
});
