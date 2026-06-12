import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { formatPolishDate } from "@/core/components/DatePickerField";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import { PantryItem } from "@/domain/product";
import { getExpiryWarning } from "@/services/expiry";
import { addLocation, displayLocationName, listLocations, removeLocation } from "@/services/locationRepository";
import { listPantry } from "@/services/inventoryRepository";
import { stockPercentage } from "@/services/stockLevel";

const UNASSIGNED = "__unassigned__";

export function PantryScreen() {
  const navigation = useNavigation();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [configuredLocations, setConfiguredLocations] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [managerOpen, setManagerOpen] = useState(false);
  const [newLocation, setNewLocation] = useState("");
  const [managerMessage, setManagerMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [pantryItems, locations] = await Promise.all([listPantry(true), listLocations()]);
      setItems(pantryItems);
      setConfiguredLocations(locations);
      setMessage("");
    } catch { setMessage("Nie udało się pobrać stanu spiżarni."); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  useEffect(() => navigation.addListener("beforeRemove", (event) => {
    if (managerOpen) {
      event.preventDefault();
      setManagerOpen(false);
      return;
    }
    if (selectedLocation) {
      event.preventDefault();
      setSelectedLocation(null);
      setQuery("");
    }
  }), [managerOpen, navigation, selectedLocation]);

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

  function goBack() {
    if (managerOpen) return setManagerOpen(false);
    if (selectedLocation) {
      setSelectedLocation(null);
      setQuery("");
      return;
    }
    router.back();
  }

  async function createLocation() {
    const name = newLocation.trim();
    if (!name) return setManagerMessage("Wpisz nazwę nowej lokalizacji.");
    try {
      const values = await addLocation(name);
      setConfiguredLocations(values);
      setNewLocation("");
      setManagerMessage(`Dodano lokalizację: ${displayLocationName(name)}.`);
    } catch { setManagerMessage("Nie udało się dodać lokalizacji."); }
  }

  async function deleteLocation(location: string) {
    const assignedCount = items.filter((item) => displayLocationName(item.location?.trim() ?? "") === location).length;
    if (assignedCount > 0) return setManagerMessage(`Nie można usunąć lokalizacji „${location}”. Najpierw przenieś ${assignedCount} ${productCountLabel(assignedCount)}.`);
    try {
      setConfiguredLocations(await removeLocation(location));
      setManagerMessage(`Usunięto lokalizację: ${location}.`);
    } catch { setManagerMessage("Nie udało się usunąć lokalizacji."); }
  }

  return (
    <ModuleScreen title="Spiżarnia" onBack={goBack}>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {!selectedLocation ? <>
        {urgentExpiryCount > 0 && <Text style={styles.expirySummary}>Uwaga: {urgentExpiryCount} produktów ma termin najpóźniej jutro lub jest po terminie.</Text>}
        <FlatList
          data={[...locations, UNASSIGNED]}
          keyExtractor={(item) => item}
          numColumns={2}
          columnWrapperStyle={styles.tileColumns}
          contentContainerStyle={styles.tiles}
          ListHeaderComponent={<View style={styles.tilesHeader}><Text style={styles.hint}>Wybierz miejsce przechowywania</Text><Pressable onPress={() => { setManagerOpen(true); setManagerMessage(""); }} style={styles.manageButton}><MaterialCommunityIcons name="cog-outline" size={20} color={colors.primary} /><Text style={styles.manageButtonText}>Zarządzaj lokalizacjami</Text></Pressable></View>}
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

      <Modal visible={managerOpen} transparent animationType="fade" onRequestClose={() => setManagerOpen(false)}>
        <View style={styles.backdrop}><View style={styles.managerCard}>
          <View style={styles.managerHeader}><Text style={styles.managerTitle}>Lokalizacje spiżarni</Text><Pressable onPress={() => setManagerOpen(false)} style={styles.managerClose}><Text style={styles.managerCloseText}>Zamknij</Text></Pressable></View>
          <View style={styles.addLocationRow}><TextInput value={newLocation} onChangeText={setNewLocation} onSubmitEditing={() => void createLocation()} placeholder="Nowa lokalizacja" style={styles.locationInput} /><Pressable onPress={() => void createLocation()} style={styles.addLocationButton}><Text style={styles.white}>+ Dodaj</Text></Pressable></View>
          {!!managerMessage && <Text style={[styles.managerMessage, managerMessage.startsWith("Nie") && styles.managerError]}>{managerMessage}</Text>}
          <ScrollView style={styles.managerList} contentContainerStyle={styles.managerListContent}>
            {configuredLocations.map((location) => {
              const count = items.filter((item) => displayLocationName(item.location?.trim() ?? "") === displayLocationName(location)).length;
              return <View key={location} style={styles.managerRow}><View style={styles.managerLocationText}><Text style={styles.managerLocationName}>{displayLocationName(location)}</Text><Text style={styles.managerLocationCount}>{count} {productCountLabel(count)}</Text></View><Pressable onPress={() => void deleteLocation(displayLocationName(location))} style={[styles.removeLocationButton, count > 0 && styles.removeLocationDisabled]}><Text style={styles.removeLocationText}>Usuń</Text></Pressable></View>;
            })}
          </ScrollView>
          <Text style={styles.managerHint}>Lokalizację zawierającą produkty można usunąć dopiero po przeniesieniu produktów w inne miejsce.</Text>
        </View></View>
      </Modal>
    </ModuleScreen>
  );
}

function ProductCard({ item }: { item: PantryItem }) {
  const warning = item.quantity > 0 ? getExpiryWarning(item.expiryDate) : null;
  const percentage = stockPercentage(item);
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
      <View style={styles.stockRow}><View style={styles.battery}><View style={[styles.batteryFill, { width: `${percentage}%` }, percentage <= 20 && styles.batteryLow]} /></View><View style={styles.batteryTip} /><Text style={styles.stockText}>{percentage}% zapasu</Text></View>
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
  tilesHeader: { marginBottom: 14, gap: 10 }, hint: { color: colors.muted, fontSize: 16 }, manageButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#E8F5E9", borderWidth: 1, borderColor: colors.primary, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 10 }, manageButtonText: { color: colors.primary, fontWeight: "800" }, tiles: { paddingBottom: 30 }, tileColumns: { gap: 12 }, tile: { flex: 1, minWidth: 0, minHeight: 150, backgroundColor: colors.surface, borderRadius: 18, padding: 18, marginBottom: 12, justifyContent: "center", borderWidth: 1, borderColor: colors.border }, unassignedTile: { backgroundColor: "#FFF8E8", borderColor: "#F2C879" }, tileName: { fontSize: 20, fontWeight: "900", marginTop: 10 }, tileCount: { color: colors.muted, marginTop: 4 }, tileWarning: { color: "#8A4B00", fontWeight: "800", fontSize: 12, marginTop: 8 },
  locationHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 12 }, locationsBack: { backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10 }, locationsBackText: { color: colors.primary, fontWeight: "800" }, locationTitle: { flex: 1, minWidth: 150, fontSize: 24, fontWeight: "900" }, search: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, marginBottom: 12 },
  list: { paddingBottom: 30 }, emptyList: { flexGrow: 1 }, card: { backgroundColor: colors.surface, borderRadius: 16, padding: 18, marginBottom: 12, gap: 10 }, consumed: { opacity: 0.65 }, pressed: { opacity: 0.72 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }, name: { flex: 1, fontWeight: "800", fontSize: 18 }, qty: { fontWeight: "800", fontSize: 22, color: colors.primary }, meta: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }, active: { color: colors.primary, fontWeight: "800" }, used: { color: colors.danger, fontWeight: "800" }, open: { color: colors.primary, fontWeight: "800" },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 5 }, battery: { flex: 1, maxWidth: 210, height: 18, borderWidth: 2, borderColor: colors.text, borderRadius: 5, padding: 2, overflow: "hidden" }, batteryFill: { height: "100%", backgroundColor: colors.primary, borderRadius: 2 }, batteryLow: { backgroundColor: colors.danger }, batteryTip: { width: 4, height: 9, backgroundColor: colors.text, borderTopRightRadius: 2, borderBottomRightRadius: 2, marginLeft: -5 }, stockText: { color: colors.muted, fontSize: 12, fontWeight: "800", marginLeft: 4 },
  expirySummary: { color: "#8A4B00", backgroundColor: "#FFF3E0", borderRadius: 11, padding: 12, marginBottom: 12, fontWeight: "800" }, expiryWarning: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontWeight: "900" }, expiryUrgent: { color: colors.danger, backgroundColor: "#FFEBEE" }, expirySoon: { color: "#8A4B00", backgroundColor: "#FFF3E0" }, message: { color: colors.danger, textAlign: "center", marginBottom: 10, fontWeight: "600" }, empty: { textAlign: "center", color: colors.muted, marginTop: 70 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "center", padding: 18 }, managerCard: { width: "100%", maxWidth: 560, maxHeight: "90%", backgroundColor: colors.surface, borderRadius: 20, padding: 20 }, managerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, managerTitle: { flex: 1, fontSize: 23, fontWeight: "900" }, managerClose: { padding: 8 }, managerCloseText: { color: colors.muted, fontWeight: "700" }, addLocationRow: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 16 }, locationInput: { flex: 1, minWidth: 170, backgroundColor: colors.background, borderRadius: 11, padding: 13, fontSize: 16 }, addLocationButton: { backgroundColor: colors.primary, borderRadius: 11, paddingHorizontal: 17, paddingVertical: 13, justifyContent: "center" }, white: { color: "white", fontWeight: "800" }, managerMessage: { color: colors.primary, backgroundColor: "#E8F5E9", borderRadius: 9, padding: 10, marginTop: 10, fontWeight: "700" }, managerError: { color: colors.danger, backgroundColor: "#FFEBEE" }, managerList: { minHeight: 100, marginTop: 12 }, managerListContent: { gap: 8, paddingBottom: 2 }, managerRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.background, borderRadius: 11, padding: 12 }, managerLocationText: { flex: 1 }, managerLocationName: { fontSize: 17, fontWeight: "800" }, managerLocationCount: { color: colors.muted, fontSize: 12, marginTop: 2 }, removeLocationButton: { backgroundColor: "#FFEBEE", borderRadius: 9, paddingHorizontal: 13, paddingVertical: 10 }, removeLocationDisabled: { opacity: 0.45 }, removeLocationText: { color: colors.danger, fontWeight: "800" }, managerHint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 12 }
});
