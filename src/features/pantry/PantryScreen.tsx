import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { formatPolishDate } from "@/core/components/DatePickerField";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import { PantryItem } from "@/domain/product";
import { getExpiryWarning } from "@/services/expiry";
import { displayLocationName } from "@/services/locationRepository";
import { listPantry } from "@/services/inventoryRepository";

export function PantryScreen() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try { setItems(await listPantry(true)); setMessage(""); }
    catch { setMessage("Nie udało się pobrać stanu spiżarni."); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const urgentExpiryCount = useMemo(() => items.filter((item) => {
    if (item.quantity <= 0) return false;
    const warning = getExpiryWarning(item.expiryDate);
    return warning !== null && warning.days <= 1;
  }).length, [items]);
  const sortedItems = useMemo(() => [...items].sort((left, right) => expiryPriority(left.expiryDate) - expiryPriority(right.expiryDate) || left.product.name.localeCompare(right.product.name, "pl")), [items]);

  return (
    <ModuleScreen title="Spiżarnia">
      {!!message && <Text style={styles.message}>{message}</Text>}
      {urgentExpiryCount > 0 && <Text style={styles.expirySummary}>Uwaga: {urgentExpiryCount} produktów ma termin najpóźniej jutro lub jest po terminie.</Text>}
      <FlatList
        data={sortedItems}
        keyExtractor={(item) => item.barcode}
        contentContainerStyle={sortedItems.length ? styles.list : styles.emptyList}
        ListEmptyComponent={<Text style={styles.empty}>Spiżarnia jest pusta.</Text>}
        renderItem={({ item }) => {
          const warning = item.quantity > 0 ? getExpiryWarning(item.expiryDate) : null;
          return (
            <Pressable
              onPress={() => router.push({ pathname: "/pantry/[barcode]", params: { barcode: item.barcode } })}
              style={({ pressed }) => [styles.card, item.quantity === 0 && styles.consumed, pressed && styles.pressed]}
            >
              <View style={styles.header}>
                <View style={styles.heading}><Text style={styles.name}>{item.product.name}</Text><Text style={styles.muted}>{item.barcode} | {item.location ? displayLocationName(item.location) : "brak lokalizacji"}</Text></View>
                <Text style={styles.qty}>{item.quantity} {item.unit}</Text>
              </View>
              <View style={styles.meta}>
                <Text>{item.expiryDate ? `Ważne do: ${formatPolishDate(item.expiryDate)}` : "Brak daty ważności"}</Text>
                <Text style={item.quantity === 0 ? styles.used : styles.active}>{item.quantity === 0 ? "ZUZYTY" : "AKTYWNY"}</Text>
              </View>
              {warning && <Text style={[styles.expiryWarning, warning.level === "soon" ? styles.expirySoon : styles.expiryUrgent]}>{warning.label}</Text>}
              <Text style={styles.open}>Otworz szczegoly &gt;</Text>
            </Pressable>
          );
        }}
      />
    </ModuleScreen>
  );
}

function expiryPriority(expiryDate?: string) {
  const warning = getExpiryWarning(expiryDate);
  if (!warning) return 4;
  return warning.level === "expired" ? 0 : warning.level === "today" ? 1 : warning.level === "urgent" ? 2 : 3;
}

const styles = StyleSheet.create({
  list: { paddingBottom: 30 }, emptyList: { flexGrow: 1 }, card: { backgroundColor: colors.surface, borderRadius: 16, padding: 18, marginBottom: 12, gap: 10 },
  consumed: { opacity: 0.65 }, pressed: { opacity: 0.75 }, header: { flexDirection: "row", justifyContent: "space-between", gap: 12 }, heading: { flex: 1 },
  name: { fontWeight: "800", fontSize: 18 }, muted: { color: colors.muted }, qty: { fontWeight: "800", fontSize: 22, color: colors.primary }, meta: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  active: { color: colors.primary, fontWeight: "800" }, used: { color: colors.danger, fontWeight: "800" }, open: { color: colors.primary, fontWeight: "800" },
  expirySummary: { color: "#8A4B00", backgroundColor: "#FFF3E0", borderRadius: 11, padding: 12, marginBottom: 12, fontWeight: "800" }, expiryWarning: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontWeight: "900" }, expiryUrgent: { color: colors.danger, backgroundColor: "#FFEBEE" }, expirySoon: { color: "#8A4B00", backgroundColor: "#FFF3E0" },
  message: { color: colors.danger, textAlign: "center", marginBottom: 10, fontWeight: "600" }, empty: { textAlign: "center", color: colors.muted, marginTop: 80 }
});
