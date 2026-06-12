import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { ConsumerPicker } from "@/core/components/ConsumerPicker";
import { DatePickerField } from "@/core/components/DatePickerField";
import { LocationPicker } from "@/core/components/LocationPicker";
import { colors } from "@/core/theme";
import { Consumer } from "@/domain/meal";
import { Product, Unit } from "@/domain/product";
import { changePantryQuantity, createUntrackedMeal, listSavedProducts, updateProductPackage } from "@/services/inventoryRepository";
import { createUntrackedMealIngredient } from "@/services/nutrition";
import { canUseWholePackage, convertPantryAmount, preferredPantryUnit } from "@/services/pantryUnits";
import { addProductToShoppingList } from "@/services/shoppingRepository";

export function SavedScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState<Unit>("szt");
  const [location, setLocation] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [consumer, setConsumer] = useState<Consumer>({ id: "bartek", name: "Bartek" });
  const [packageAmount, setPackageAmount] = useState("");
  const [packageUnit, setPackageUnit] = useState<Unit>("g");

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

  function openProduct(product: Product) {
    setSelected(product); setMessage(""); setError("");
    setAmount(canUseWholePackage(product) ? "1" : "100");
    setUnit(canUseWholePackage(product) ? "szt" : product.defaultUnit ?? "g");
    setPackageAmount(product.packageAmount ? String(product.packageAmount) : "");
    setPackageUnit(product.packageUnit ?? product.defaultUnit ?? "g");
    setLocation(""); setExpiryDate("");
  }

  async function savePackage() {
    if (!selected) return;
    const value = parseAmount(packageAmount);
    if (!value) return setError("Wpisz pojemność jednego pełnego opakowania.");
    try {
      setBusy(true); setError("");
      const updated = await updateProductPackage(selected, value, packageUnit);
      setSelected(updated);
      setProducts((current) => current.map((product) => product.barcode === updated.barcode ? updated : product));
      setMessage(`Zapisano pojemność opakowania: ${value} ${packageUnit}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Nie udało się zapisać pojemności opakowania."); }
    finally { setBusy(false); }
  }

  async function addToPantry() {
    if (!selected) return;
    const value = parseAmount(amount);
    if (!value) return setError("Wpisz prawidłową ilość.");
    if (!location.trim()) return setError("Wybierz lokalizację w spiżarni.");
    try {
      setBusy(true); setError("");
      const updated = await changePantryQuantity(selected, value, unit, { location, expiryDate: expiryDate || undefined });
      setMessage(`Dodano ${selected.name}. Stan: ${updated.quantity} ${updated.unit}.`); setSelected(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Nie udało się dodać produktu do spiżarni."); }
    finally { setBusy(false); }
  }

  async function addToToday() {
    if (!selected) return;
    const value = parseAmount(amount);
    if (!value) return setError("Wpisz prawidłową ilość.");
    try {
      setBusy(true); setError("");
      const nutritionUnit = unit === "szt" && canUseWholePackage(selected) && selected.nutritionBasis !== "perUnit" ? preferredPantryUnit(selected, unit) : unit;
      const nutritionAmount = nutritionUnit === unit ? value : convertPantryAmount(selected, value, unit, nutritionUnit);
      const ingredient = createUntrackedMealIngredient(selected, nutritionAmount, nutritionUnit);
      await createUntrackedMeal(`Przekąska: ${selected.name}`, "snack", ingredient, Date.now(), consumer);
      setMessage(`Dodano do bilansu osoby ${consumer.name}: ${ingredient.nutrients.energyKcal ?? 0} kcal.`); setSelected(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Nie udało się dodać produktu do bilansu."); }
    finally { setBusy(false); }
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
          <Pressable onPress={() => openProduct(item)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
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
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Detail label="Kod produktu" value={selected?.source === "usda" ? "Produkt bez kodu (USDA)" : selected?.barcode} />
            <Detail label="Kalorie" value={`${selected?.nutrientsPer100g.energyKcal ?? "brak"} kcal / ${selected?.nutritionBasis === "perUnit" ? "szt." : "100 g/ml"}`} />
            <Detail label="Makroskładniki" value={`B: ${selected?.nutrientsPer100g.proteins ?? "-"} g  W: ${selected?.nutrientsPer100g.carbohydrates ?? "-"} g  T: ${selected?.nutrientsPer100g.fat ?? "-"} g`} />
            <Detail label="Mikroelementy" value={`Potas: ${selected?.nutrientsPer100g.potassium ?? "-"} mg  Wapń: ${selected?.nutrientsPer100g.calcium ?? "-"} mg  Żelazo: ${selected?.nutrientsPer100g.iron ?? "-"} mg  Magnez: ${selected?.nutrientsPer100g.magnesium ?? "-"} mg`} />
            <View style={styles.packageEditor}>
              <Text style={styles.actionTitle}>Jedno pełne opakowanie</Text>
              <Text style={styles.hint}>Ta wartość określa 100% zapasu i umożliwia użycie przycisku „całe opakowanie”.</Text>
              <View style={styles.amountRow}><TextInput value={packageAmount} onChangeText={setPackageAmount} keyboardType="decimal-pad" placeholder="Np. 1000" style={styles.amountInput} />{(["g", "ml", "szt"] as Unit[]).map((value) => <Pressable key={value} onPress={() => setPackageUnit(value)} style={[styles.unit, packageUnit === value && styles.unitActive]}><Text style={packageUnit === value ? styles.white : undefined}>{value}</Text></Pressable>)}</View>
              <Pressable disabled={busy} onPress={() => void savePackage()} style={[styles.savePackageButton, busy && styles.disabled]}><Text style={styles.white}>Zapisz pojemność opakowania</Text></Pressable>
            </View>
            <View style={styles.actionForm}>
              <Text style={styles.actionTitle}>Ilość</Text>
              {selected && canUseWholePackage(selected) && <Pressable onPress={() => { setAmount("1"); setUnit("szt"); }} style={styles.packageButton}><Text style={styles.packageText}>Całe opakowanie: 1 szt. ({selected.packageAmount} {selected.packageUnit})</Text></Pressable>}
              <View style={styles.amountRow}><TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.amountInput} />{(["g", "ml", "szt"] as Unit[]).map((value) => <Pressable key={value} onPress={() => setUnit(value)} style={[styles.unit, unit === value && styles.unitActive]}><Text style={unit === value ? styles.white : undefined}>{value}</Text></Pressable>)}</View>
              <LocationPicker value={location} onChange={setLocation} label="Lokalizacja przy dodawaniu do spiżarni" />
              <DatePickerField value={expiryDate} onChange={setExpiryDate} />
              <ConsumerPicker value={consumer} onChange={setConsumer} label="Bilans kalorii dla" />
            </View>
          </ScrollView>
          <View style={styles.actions}>
            <Pressable disabled={busy} onPress={() => void addToPantry()} style={[styles.addButton, busy && styles.disabled]}><Text style={styles.white}>Dodaj do spiżarni</Text></Pressable>
            <Pressable disabled={busy} onPress={() => void addToToday()} style={[styles.todayButton, busy && styles.disabled]}><Text style={styles.white}>Dodaj do dzisiejszego bilansu</Text></Pressable>
            <Pressable disabled={busy} onPress={() => void addToShoppingList()} style={[styles.shoppingButton, busy && styles.disabled]}><Text style={styles.white}>{busy ? "Dodawanie..." : "Dodaj do listy zakupów"}</Text></Pressable>
          </View>
        </View></View>
      </Modal>
    </ModuleScreen>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value || "brak danych"}</Text></View>;
}

function parseAmount(value: string) { const number = Number(value.replace(",", ".")); return Number.isFinite(number) && number > 0 ? number : 0; }

const styles = StyleSheet.create({
  search: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, marginBottom: 12 },
  list: { paddingBottom: 30 }, emptyList: { flexGrow: 1 }, row: { backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 17, marginBottom: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  name: { flex: 1, fontWeight: "800", fontSize: 18 }, open: { color: colors.primary, fontWeight: "800" }, pressed: { opacity: 0.68 },
  message: { color: "#1B5E20", backgroundColor: "#E8F5E9", borderRadius: 10, padding: 12, marginBottom: 12, fontWeight: "700" }, error: { color: colors.danger, backgroundColor: "#FFEBEE", borderRadius: 10, padding: 12, marginBottom: 12, fontWeight: "700" }, empty: { textAlign: "center", color: colors.muted, marginTop: 70 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "center", padding: 18 }, modalCard: { width: "100%", maxWidth: 580, maxHeight: "92%", backgroundColor: colors.surface, borderRadius: 20, padding: 22 }, modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }, modalTitle: { flex: 1, fontSize: 24, fontWeight: "900" }, close: { padding: 6 }, closeText: { color: colors.muted, fontWeight: "700" }, brand: { color: colors.muted, fontSize: 16, marginTop: 5 },
  detailsScroll: { flexShrink: 1, minHeight: 0, marginTop: 18 }, details: { gap: 10, paddingBottom: 8 }, detail: { backgroundColor: colors.background, borderRadius: 11, padding: 13 }, detailLabel: { color: colors.muted, fontSize: 12, fontWeight: "800", marginBottom: 4, textTransform: "uppercase" }, detailValue: { color: colors.text, fontSize: 16, lineHeight: 22 },
  packageEditor: { backgroundColor: "#F5F9F5", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 10 }, hint: { color: colors.muted, lineHeight: 19 }, savePackageButton: { backgroundColor: colors.primary, borderRadius: 10, padding: 13, alignItems: "center" }, actionForm: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingTop: 14, gap: 10 }, actionTitle: { fontSize: 18, fontWeight: "900" }, packageButton: { backgroundColor: "#E8F5E9", borderWidth: 1, borderColor: colors.primary, borderRadius: 10, padding: 11 }, packageText: { color: colors.primary, fontWeight: "800" }, amountRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, amountInput: { flex: 1, minWidth: 100, backgroundColor: colors.background, borderRadius: 10, padding: 12, fontSize: 17 }, unit: { backgroundColor: colors.background, borderRadius: 10, padding: 12 }, unitActive: { backgroundColor: colors.primary },
  actions: { gap: 8, marginTop: 14 }, addButton: { backgroundColor: colors.primary, borderRadius: 12, padding: 14, alignItems: "center" }, todayButton: { backgroundColor: "#EF6C00", borderRadius: 12, padding: 14, alignItems: "center" }, shoppingButton: { backgroundColor: "#1565C0", borderRadius: 12, padding: 14, alignItems: "center" }, white: { color: "white", fontWeight: "800" }, disabled: { opacity: 0.55 }
});
