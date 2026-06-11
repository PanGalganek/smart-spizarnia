import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import { Product } from "@/domain/product";
import { listSavedProducts } from "@/services/inventoryRepository";
import { addProductToShoppingList } from "@/services/shoppingRepository";

export function SavedScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    setError("");
    void listSavedProducts().then(setProducts).catch(() => setError("Nie udało się pobrać zapisanych produktów."));
  }, []));

  const visibleProducts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pl-PL");
    return [...products]
      .filter((product) => !normalized || [product.name, product.brand, product.barcode].some((value) => value?.toLocaleLowerCase("pl-PL").includes(normalized)))
      .sort((left, right) => left.name.localeCompare(right.name, "pl", { sensitivity: "base" }));
  }, [products, query]);

  async function addToShoppingList() {
    if (!selected) return;
    try {
      setBusy(true);
      await addProductToShoppingList(selected, "saved");
      setMessage(`Dodano do listy zakupów: ${selected.name}.`);
      setSelected(null);
    } catch {
      setError("Nie udało się dodać produktu do listy zakupów.");
    } finally { setBusy(false); }
  }

  return (
    <ModuleScreen title="Zapisane">
      <TextInput value={query} onChangeText={setQuery} placeholder="Szukaj produktu..." autoCorrect={false} style={styles.search} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!message && <Text style={styles.message}>{message}</Text>}
      <FlatList
        data={visibleProducts}
        keyExtractor={(item) => item.barcode}
        contentContainerStyle={visibleProducts.length ? styles.list : styles.emptyList}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.empty}>{query.trim() ? "Nie znaleziono pasującego produktu." : "Brak zapisanych produktów."}</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => { setSelected(item); setMessage(""); }} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.open}>Szczegóły ›</Text>
          </Pressable>
        )}
      />

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.backdrop}><View style={styles.modalCard}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>{selected?.name}</Text><Pressable onPress={() => setSelected(null)} style={styles.close}><Text style={styles.closeText}>Zamknij</Text></Pressable></View>
          {!!selected?.brand && <Text style={styles.brand}>{selected.brand}</Text>}
          <ScrollView style={styles.detailsScroll} contentContainerStyle={styles.details} showsVerticalScrollIndicator>
            <Detail label="Kod produktu" value={selected?.source === "usda" ? "Produkt bez kodu (USDA)" : selected?.barcode} />
            <Detail label="Kalorie" value={`${selected?.nutrientsPer100g.energyKcal ?? "brak"} kcal / ${selected?.nutritionBasis === "perUnit" ? "szt." : "100 g/ml"}`} />
            <Detail label="Makroskładniki" value={`B: ${selected?.nutrientsPer100g.proteins ?? "-"} g  W: ${selected?.nutrientsPer100g.carbohydrates ?? "-"} g  T: ${selected?.nutrientsPer100g.fat ?? "-"} g`} />
            <Detail label="Mikroelementy" value={`Potas: ${selected?.nutrientsPer100g.potassium ?? "-"} mg  Wapń: ${selected?.nutrientsPer100g.calcium ?? "-"} mg  Żelazo: ${selected?.nutrientsPer100g.iron ?? "-"} mg  Magnez: ${selected?.nutrientsPer100g.magnesium ?? "-"} mg`} />
            {selected?.packageAmount && <Detail label="Opakowanie" value={`${selected.packageAmount} ${selected.packageUnit}`} />}
          </ScrollView>
          <Pressable disabled={busy} onPress={() => void addToShoppingList()} style={[styles.addButton, busy && styles.disabled]}><Text style={styles.white}>{busy ? "Dodawanie..." : "Dodaj do listy zakupów"}</Text></Pressable>
        </View></View>
      </Modal>
    </ModuleScreen>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value || "brak danych"}</Text></View>;
}

const styles = StyleSheet.create({
  search: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, marginBottom: 12 },
  list: { paddingBottom: 30 }, emptyList: { flexGrow: 1 }, row: { backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 17, marginBottom: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  name: { flex: 1, fontWeight: "800", fontSize: 18 }, open: { color: colors.primary, fontWeight: "800" }, pressed: { opacity: 0.68 },
  message: { color: "#1B5E20", backgroundColor: "#E8F5E9", borderRadius: 10, padding: 12, marginBottom: 12, fontWeight: "700" }, error: { color: colors.danger, backgroundColor: "#FFEBEE", borderRadius: 10, padding: 12, marginBottom: 12, fontWeight: "700" }, empty: { textAlign: "center", color: colors.muted, marginTop: 70 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "center", padding: 18 }, modalCard: { width: "100%", maxWidth: 580, maxHeight: "92%", backgroundColor: colors.surface, borderRadius: 20, padding: 22 }, modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }, modalTitle: { flex: 1, fontSize: 24, fontWeight: "900" }, close: { padding: 6 }, closeText: { color: colors.muted, fontWeight: "700" }, brand: { color: colors.muted, fontSize: 16, marginTop: 5 },
  detailsScroll: { flexShrink: 1, minHeight: 0, marginTop: 18 }, details: { gap: 10, paddingBottom: 2 }, detail: { backgroundColor: colors.background, borderRadius: 11, padding: 13 }, detailLabel: { color: colors.muted, fontSize: 12, fontWeight: "800", marginBottom: 4, textTransform: "uppercase" }, detailValue: { color: colors.text, fontSize: 16, lineHeight: 22 }, addButton: { backgroundColor: colors.primary, borderRadius: 12, padding: 15, alignItems: "center", marginTop: 18 }, white: { color: "white", fontWeight: "800" }, disabled: { opacity: 0.55 }
});
