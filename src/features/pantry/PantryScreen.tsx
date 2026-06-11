import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { formatPolishDate } from "@/core/components/DatePickerField";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import { PantryItem } from "@/domain/product";
import { getExpiryWarning } from "@/services/expiry";
import { displayLocationName, listLocations } from "@/services/locationRepository";
import { listPantry } from "@/services/inventoryRepository";

const UNASSIGNED = "__unassigned__";

export function PantryScreen() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [configuredLocations, setConfiguredLocations] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [pantryItems, locations] = await Promise.all([listPantry(true), listLocations()]);
      setItems(pantryItems);
      setConfiguredLocations(locations);
      setMessage("");
    } catch { setMessage("Nie udało się pobrać stanu spiżarni."); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const locations = useMemo(() => {
    const assigned = items.map((item) => item.location?.trim()).filter((value): value is string => Boolean(value)).map(displayLocationName);
    return [...new Set([...configuredLocations.map(displayLocationName), ...assigned])]
      .sort((left, right) => left.localeCompare(right, "pl", { sensitivity: "base" }));
  }, [configuredLocations, items]);

  const urgentExpiryCount = useMemo(() => items.filter(isUrgent).length, [items]);
  const locationItems = useMemo(() => {
    if (!selectedLocation) return [];
    const normalizedQuery = query.trim().toLocaleLowerCase("pl-PL");
    return items
      .filter((item) => selectedLocation === UNASSIGNED ? !item.location?.trim() : displayLocationName(item.location?.trim() ?? "") === selectedLocation)
      .filter((item) => !normalizedQuery || [item.product.name, item.product.brand].some((value) => value?.toLocaleLowerCase("pl-PL").includes(normalizedQuery)))
      .sort((left, right) => left.product.name.localeCompare(right.product.name, "pl", { sensitivity: "base" }));
  }, [items, query, selectedLocation]);

  function openLocation(location: string) {
    setQuery("");
    setSelectedLocation(location);
  }

  return (
    <ModuleScreen title="Spiżarnia">
      {!!message && <Text style={styles.message}>{message}</Text>}
      {!selectedLocation ? <>
        {urgentExpiryCount > 0 && <Text style={styles.expirySummary}>Uwaga: {urgentExpiryCount} produktów ma termin najpóźniej jutro lub jest po terminie.</Text>}
        <FlatList
          data={[...locations, UNASSIGNED]}
          keyExtractor={(item) => item}
          numColumns={2}
          columnWrapperStyle={styles.tileColumns}
          contentContainerStyle={styles.tiles}
          ListHeaderComponent={<Text style={styles.hint}>Wybierz miejsce przechowywania</Text>}
          renderItem={({ item }) => {
            const unassigned = item === UNASSIGNED;
            const count = items.filter((product) => unassigned ? !product.location?.trim() : displayLocationName(product.location?.trim() ?? "") === item).length;
            const urgent = items.filter((product) => (unassigned ? !product.location?.trim() : displayLocationName(product.location?.trim() ?? "") === item) && isUrgent(product)).length;
            return <Pressable onPress={() => openLocation(item)} style={({ pressed }) => [styles.tile, unassigned && styles.unassignedTile, pressed && styles.pressed]}>
              <MaterialCommunityIcons name={unassigned ? "archive-alert-outline" : locationIcon(item)} size={38} color={unassigned ? "#8A4B00" : colors.primary} />
              <Text style={styles.tileName}>{unassigned ? "Nieprzypisane" : item}</Text>
              <Text style={styles.tileCount}>{count} {productCountLabel(count)}</Text>
              {urgent > 0 && <Text style={styles.tileWarning}>{urgent} z pilnym terminem</Text>}
            </Pressable>;
          }}
        />
      </> : <>
        <View style={styles.locationHeader}>
          <Pressable onPress={() => { setSelectedLocation(null); setQuery(""); }} style={styles.locationsBack}><Text style={styles.locationsBackText}>‹ Lokalizacje</Text></Pressable>
          <Text style={styles.locationTitle}>{selectedLocation === UNASSIGNED ? "Nieprzypisane" : selectedLocation}</Text>
        </View>
        <TextInput value={query} onChangeText={setQuery} placeholder="Szukaj produktu..." autoCorrect={false} style={styles.search} />
        <FlatList
          data={locationItems}
          keyExtractor={(item) => item.barcode}
          contentContainerStyle={locationItems.length ? styles.list : styles.emptyList}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>{query.trim() ? "Nie znaleziono pasującego produktu." : "Brak produktów w tej lokalizacji."}</Text>}
          renderItem={({ item }) => <ProductCard item={item} />}
        />
      </>}
    </ModuleScreen>
  );
}

function ProductCard({ item }: { item: PantryItem }) {
  const warning = item.quantity > 0 ? getExpiryWarning(item.expiryDate) : null;
  return (
    <Pressable onPress={() => router.push({ pathname: "/pantry/[barcode]", params: { barcode: item.barcode } })} style={({ pressed }) => [styles.card, item.quantity === 0 && styles.consumed, pressed && styles.pressed]}>
      <View style={styles.header}>
        <Text style={styles.name}>{item.product.name}</Text>
        <Text style={styles.qty}>{item.quantity} {item.unit}</Text>
      </View>
      <View style={styles.meta}>
        <Text>{item.expiryDate ? `Ważne do: ${formatPolishDate(item.expiryDate)}` : "Brak daty ważności"}</Text>
        <Text style={item.quantity === 0 ? styles.used : styles.active}>{item.quantity === 0 ? "ZUŻYTY" : "AKTYWNY"}</Text>
      </View>
      {warning && <Text style={[styles.expiryWarning, warning.level === "soon" ? styles.expirySoon : styles.expiryUrgent]}>{warning.label}</Text>}
      <Text style={styles.open}>Otwórz szczegóły ›</Text>
    </Pressable>
  );
}

function isUrgent(item: PantryItem) {
  if (item.quantity <= 0) return false;
  const warning = getExpiryWarning(item.expiryDate);
  return warning !== null && warning.days <= 1;
}

function productCountLabel(count: number) {
  if (count === 1) return "produkt";
  if (count >= 2 && count <= 4) return "produkty";
  return "produktów";
}

function locationIcon(location: string): keyof typeof MaterialCommunityIcons.glyphMap {
  const value = location.toLocaleLowerCase("pl-PL");
  if (value.includes("lodów")) return "fridge-outline";
  if (value.includes("zamraż")) return "snowflake";
  if (value.includes("szaf")) return "cupboard-outline";
  if (value.includes("pół")) return "bookshelf";
  return "archive-outline";
}

const styles = StyleSheet.create({
  hint: { color: colors.muted, fontSize: 16, marginBottom: 14 }, tiles: { paddingBottom: 30 }, tileColumns: { gap: 12 }, tile: { flex: 1, minWidth: 0, minHeight: 150, backgroundColor: colors.surface, borderRadius: 18, padding: 18, marginBottom: 12, justifyContent: "center", borderWidth: 1, borderColor: colors.border }, unassignedTile: { backgroundColor: "#FFF8E8", borderColor: "#F2C879" }, tileName: { fontSize: 20, fontWeight: "900", marginTop: 10 }, tileCount: { color: colors.muted, marginTop: 4 }, tileWarning: { color: "#8A4B00", fontWeight: "800", fontSize: 12, marginTop: 8 },
  locationHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 12 }, locationsBack: { backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10 }, locationsBackText: { color: colors.primary, fontWeight: "800" }, locationTitle: { flex: 1, minWidth: 150, fontSize: 24, fontWeight: "900" }, search: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, marginBottom: 12 },
  list: { paddingBottom: 30 }, emptyList: { flexGrow: 1 }, card: { backgroundColor: colors.surface, borderRadius: 16, padding: 18, marginBottom: 12, gap: 10 }, consumed: { opacity: 0.65 }, pressed: { opacity: 0.72 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }, name: { flex: 1, fontWeight: "800", fontSize: 18 }, qty: { fontWeight: "800", fontSize: 22, color: colors.primary }, meta: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }, active: { color: colors.primary, fontWeight: "800" }, used: { color: colors.danger, fontWeight: "800" }, open: { color: colors.primary, fontWeight: "800" },
  expirySummary: { color: "#8A4B00", backgroundColor: "#FFF3E0", borderRadius: 11, padding: 12, marginBottom: 12, fontWeight: "800" }, expiryWarning: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontWeight: "900" }, expiryUrgent: { color: colors.danger, backgroundColor: "#FFEBEE" }, expirySoon: { color: "#8A4B00", backgroundColor: "#FFF3E0" }, message: { color: colors.danger, textAlign: "center", marginBottom: 10, fontWeight: "600" }, empty: { textAlign: "center", color: colors.muted, marginTop: 70 }
});
