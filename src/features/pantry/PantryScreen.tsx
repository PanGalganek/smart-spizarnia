import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { formatPolishDate } from "@/core/components/DatePickerField";
import { colors } from "@/core/theme";
import { PantryItem } from "@/domain/product";
import { listPantry } from "@/services/inventoryRepository";

export function PantryScreen() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try { setItems(await listPantry(true)); setMessage(""); }
    catch { setMessage("Nie udalo sie pobrac stanu spizarni."); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  return (
    <ModuleScreen title="Spizarnia">
      {!!message && <Text style={styles.message}>{message}</Text>}
      <FlatList
        data={items}
        keyExtractor={(item) => item.barcode}
        contentContainerStyle={items.length ? styles.list : styles.emptyList}
        ListEmptyComponent={<Text style={styles.empty}>Spizarnia jest pusta.</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/pantry/[barcode]", params: { barcode: item.barcode } })}
            style={({ pressed }) => [styles.card, item.quantity === 0 && styles.consumed, pressed && styles.pressed]}
          >
            <View style={styles.header}>
              <View style={styles.heading}><Text style={styles.name}>{item.product.name}</Text><Text style={styles.muted}>{item.barcode} | {item.location || "brak lokalizacji"}</Text></View>
              <Text style={styles.qty}>{item.quantity} {item.unit}</Text>
            </View>
            <View style={styles.meta}>
              <Text>{item.expiryDate ? `Wazne do: ${formatPolishDate(item.expiryDate)}` : "Brak daty waznosci"}</Text>
              <Text style={item.quantity === 0 ? styles.used : styles.active}>{item.quantity === 0 ? "ZUZYTY" : "AKTYWNY"}</Text>
            </View>
            <Text style={styles.open}>Otworz szczegoly ›</Text>
          </Pressable>
        )}
      />
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 30 }, emptyList: { flexGrow: 1 }, card: { backgroundColor: colors.surface, borderRadius: 16, padding: 18, marginBottom: 12, gap: 10 },
  consumed: { opacity: 0.65 }, pressed: { opacity: 0.75 }, header: { flexDirection: "row", justifyContent: "space-between", gap: 12 }, heading: { flex: 1 },
  name: { fontWeight: "800", fontSize: 18 }, muted: { color: colors.muted }, qty: { fontWeight: "800", fontSize: 22, color: colors.primary }, meta: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  active: { color: colors.primary, fontWeight: "800" }, used: { color: colors.danger, fontWeight: "800" }, open: { color: colors.primary, fontWeight: "800" },
  message: { color: colors.danger, textAlign: "center", marginBottom: 10, fontWeight: "600" }, empty: { textAlign: "center", color: colors.muted, marginTop: 80 }
});
