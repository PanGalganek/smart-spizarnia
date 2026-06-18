import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { ConsumerPicker } from "@/core/components/ConsumerPicker";
import { DatePickerField } from "@/core/components/DatePickerField";
import { LocationPicker } from "@/core/components/LocationPicker";
import { colors } from "@/core/theme";
import { Consumer } from "@/domain/meal";
import { ChemicalLevel, Product, ProductType, Unit } from "@/domain/product";
import { changePantryQuantity, createUntrackedMeal, deleteSavedProduct, listSavedProducts, saveChemicalPantryItem, updateProductDetails } from "@/services/inventoryRepository";
import { createUntrackedMealIngredient } from "@/services/nutrition";
import { canUseWholePackage, convertPantryAmount, preferredPantryUnit } from "@/services/pantryUnits";
import { chemicalLevelLabel, chemicalLevels, isChemical, productType, productTypes } from "@/services/productTypes";
import { addProductToShoppingList } from "@/services/shoppingRepository";

type ActionMode = "details" | "edit" | "pantry" | "today";
type EditKey = "energyKcal" | "proteins" | "carbohydrates" | "fat" | "fiber" | "salt" | "packageAmount" | "quickUseAmount";

export function SavedScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [activeType, setActiveType] = useState<ProductType>("food");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState<Unit>("szt");
  const [location, setLocation] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [packageDates, setPackageDates] = useState<string[]>([]);
  const [chemicalLevel, setChemicalLevel] = useState<ChemicalLevel>("full");
  const [consumer, setConsumer] = useState<Consumer | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>("details");
  const [editName, setEditName] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editPackageUnit, setEditPackageUnit] = useState<Unit>("g");
  const [editQuickUseUnit, setEditQuickUseUnit] = useState<Unit>("szt");
  const [editNumbers, setEditNumbers] = useState<Record<EditKey, string>>({
    energyKcal: "",
    proteins: "",
    carbohydrates: "",
    fat: "",
    fiber: "",
    salt: "",
    packageAmount: "",
    quickUseAmount: ""
  });

  const refresh = useCallback(async () => {
    setError("");
    try { setProducts(await listSavedProducts()); }
    catch { setError("Nie udało się pobrać zapisanych produktów."); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const visibleProducts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pl-PL");
    return [...products]
      .filter((product) => productType(product) === activeType)
      .filter((product) => !normalized || [product.name, product.brand, product.barcode].some((value) => value?.toLocaleLowerCase("pl-PL").includes(normalized)))
      .sort((left, right) => left.name.localeCompare(right.name, "pl", { sensitivity: "base" }));
  }, [activeType, products, query]);

  function openProduct(product: Product) {
    setSelected(product);
    setMessage("");
    setError("");
    setActionMode("details");
    setAmount(canUseWholePackage(product) ? "1" : "100");
    setUnit(canUseWholePackage(product) ? "szt" : product.defaultUnit ?? "g");
    setLocation("");
    setExpiryDate("");
    setPackageDates([]);
    setChemicalLevel("full");
    fillEditForm(product);
  }

  function fillEditForm(product: Product) {
    setEditName(product.name);
    setEditBrand(product.brand ?? "");
    setEditPackageUnit(product.packageUnit ?? product.defaultUnit ?? "g");
    setEditQuickUseUnit(product.quickUseUnit ?? (product.packageAmount ? "szt" : product.defaultUnit ?? "g"));
    setEditNumbers({
      energyKcal: textNumber(product.nutrientsPer100g.energyKcal),
      proteins: textNumber(product.nutrientsPer100g.proteins),
      carbohydrates: textNumber(product.nutrientsPer100g.carbohydrates),
      fat: textNumber(product.nutrientsPer100g.fat),
      fiber: textNumber(product.nutrientsPer100g.fiber),
      salt: textNumber(product.nutrientsPer100g.salt),
      packageAmount: textNumber(product.packageAmount),
      quickUseAmount: textNumber(product.quickUseAmount ?? (product.packageAmount ? 1 : undefined))
    });
  }

  function openAction(mode: Exclude<ActionMode, "details">) {
    if (!selected) return;
    setError("");
    setMessage("");
    if (mode !== "edit") {
      setAmount(canUseWholePackage(selected) ? "1" : "100");
      setUnit(canUseWholePackage(selected) ? "szt" : selected.defaultUnit ?? "g");
      setPackageDates([]);
    }
    if (mode === "edit") fillEditForm(selected);
    setActionMode(mode);
  }

  function setEditNumber(key: EditKey, value: string) {
    setEditNumbers((current) => ({ ...current, [key]: value }));
  }

  function changePackageDate(index: number, value: string) {
    setPackageDates((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  }

  async function saveEditedProduct() {
    if (!selected) return;
    const chemical = isChemical(selected);
    const kcal = parseOptionalNumber(editNumbers.energyKcal);
    if (!editName.trim()) return setError("Nazwa produktu jest wymagana.");
    if (!chemical && kcal === undefined) return setError("Kalorie są wymagane, żeby produkt działał w posiłkach.");
    try {
      setBusy(true);
      setError("");
      const updated: Product = {
        ...selected,
        name: editName.trim(),
        type: selected.type ?? "food",
        brand: editBrand.trim() || undefined,
        packageAmount: parseOptionalNumber(editNumbers.packageAmount),
        packageUnit: parseOptionalNumber(editNumbers.packageAmount) ? editPackageUnit : undefined,
        quickUseAmount: parseOptionalNumber(editNumbers.quickUseAmount),
        quickUseUnit: parseOptionalNumber(editNumbers.quickUseAmount) ? editQuickUseUnit : undefined,
        defaultUnit: selected.defaultUnit ?? editPackageUnit,
        nutrientsPer100g: chemical ? {} : {
          ...selected.nutrientsPer100g,
          energyKcal: kcal,
          proteins: parseOptionalNumber(editNumbers.proteins),
          carbohydrates: parseOptionalNumber(editNumbers.carbohydrates),
          fat: parseOptionalNumber(editNumbers.fat),
          fiber: parseOptionalNumber(editNumbers.fiber),
          salt: parseOptionalNumber(editNumbers.salt)
        }
      };
      const saved = await updateProductDetails(updated);
      setSelected(saved);
      setProducts((current) => current.map((product) => product.barcode === saved.barcode ? saved : product));
      setMessage("Dane produktu zostały zapisane.");
      setActionMode("details");
    } catch {
      setError("Nie udało się zapisać zmian produktu.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSavedProduct() {
    if (!selected) return;
    try {
      setBusy(true);
      setError("");
      await deleteSavedProduct(selected.barcode);
      setProducts((current) => current.filter((product) => product.barcode !== selected.barcode));
      setMessage(`Usunięto z Zapisanych: ${selected.name}. Jeśli produkt jest w spiżarni, pozostaje tam.`);
      setSelected(null);
    } catch {
      setError("Nie udało się usunąć produktu z Zapisanych.");
    } finally {
      setBusy(false);
    }
  }

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

  async function addToPantry() {
    if (!selected) return;
    if (isChemical(selected)) {
      if (!location.trim()) return setError("Wybierz lokalizację w spiżarni.");
      try {
        setBusy(true); setError("");
        const updated = await saveChemicalPantryItem(selected, chemicalLevel, { location });
        setMessage(`Dodano ${selected.name}. Stan: ${chemicalLevelLabel(updated.chemicalLevel)}.`);
        setSelected(null);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Nie udało się dodać produktu do spiżarni."); }
      finally { setBusy(false); }
      return;
    }
    const value = parseAmount(amount);
    if (!value) return setError("Wpisz prawidłową ilość.");
    if (!location.trim()) return setError("Wybierz lokalizację w spiżarni.");
    try {
      setBusy(true); setError("");
      const packageExpiryDates = buildPackageDates(selected, value, unit, expiryDate, packageDates);
      const updated = await changePantryQuantity(selected, value, unit, { location, expiryDate: expiryDate || undefined, packageExpiryDates });
      setMessage(`Dodano ${selected.name}. Stan: ${updated.quantity} ${updated.unit}.`);
      setSelected(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Nie udało się dodać produktu do spiżarni."); }
    finally { setBusy(false); }
  }

  async function addToToday() {
    if (!selected) return;
    if (!consumer) return setError("Najpierw dodaj i wybierz profil osoby w zakładce Posiłki.");
    const value = parseAmount(amount);
    if (!value) return setError("Wpisz prawidłową ilość.");
    try {
      setBusy(true); setError("");
      const nutritionUnit = unit === "szt" && canUseWholePackage(selected) && selected.nutritionBasis !== "perUnit" ? preferredPantryUnit(selected, unit) : unit;
      const nutritionAmount = nutritionUnit === unit ? value : convertPantryAmount(selected, value, unit, nutritionUnit);
      const ingredient = createUntrackedMealIngredient(selected, nutritionAmount, nutritionUnit);
      await createUntrackedMeal(`Przekąska: ${selected.name}`, "snack", ingredient, Date.now(), consumer);
      setMessage(`Dodano do bilansu osoby ${consumer.name}: ${ingredient.nutrients.energyKcal ?? 0} kcal.`);
      setSelected(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Nie udało się dodać produktu do bilansu."); }
    finally { setBusy(false); }
  }

  return (
    <ModuleScreen title="Zapisane">
      <TextInput value={query} onChangeText={setQuery} placeholder="Szukaj produktu..." autoCorrect={false} style={styles.search} />
      <View style={styles.tabs}>{productTypes.map((item) => <Pressable key={item.type} onPress={() => { setActiveType(item.type); setQuery(""); }} style={[styles.tab, activeType === item.type && styles.tabActive]}><Text style={activeType === item.type ? styles.tabTextActive : styles.tabText}>{item.label}</Text></Pressable>)}</View>
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
          <View style={styles.modalHeader}>
            <View style={styles.modalHeading}>{actionMode !== "details" && <Pressable onPress={() => { setActionMode("details"); setError(""); }} style={styles.backAction}><Text style={styles.backActionText}>‹ Szczegóły</Text></Pressable>}<Text style={styles.modalTitle}>{selected?.name}</Text></View>
            <Pressable onPress={() => setSelected(null)} style={styles.close}><Text style={styles.closeText}>Zamknij</Text></Pressable>
          </View>
          {!!selected?.brand && <Text style={styles.brand}>{selected.brand}</Text>}
          <ScrollView style={styles.detailsScroll} contentContainerStyle={styles.details} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
            {!!error && <Text style={styles.error}>{error}</Text>}
            {actionMode === "details" && selected && <Details product={selected} />}
            {actionMode === "edit" && selected && <EditForm
              name={editName}
              brand={editBrand}
              numbers={editNumbers}
              packageUnit={editPackageUnit}
              quickUseUnit={editQuickUseUnit}
              onName={setEditName}
              onBrand={setEditBrand}
              onNumber={setEditNumber}
              onPackageUnit={setEditPackageUnit}
              onQuickUseUnit={setEditQuickUseUnit}
            />}
            {actionMode === "pantry" && selected && <ActionForm
              title="Dodaj do spiżarni"
              selected={selected}
              amount={amount}
              unit={unit}
              onAmount={setAmount}
              onUnit={setUnit}
              footer={<><LocationPicker value={location} onChange={setLocation} label="Lokalizacja przy dodawaniu do spiżarni" productType={productType(selected)} />{isChemical(selected) ? <View style={styles.levelGrid}>{chemicalLevels.map((level) => <Pressable key={level.value} onPress={() => setChemicalLevel(level.value)} style={[styles.levelButton, chemicalLevel === level.value && styles.levelActive]}><Text style={chemicalLevel === level.value ? styles.white : styles.levelText}>{level.label}</Text></Pressable>)}</View> : <><DatePickerField value={expiryDate} onChange={setExpiryDate} /><PackageDateFields product={selected} amount={amount} unit={unit} packageDates={packageDates} fallbackDate={expiryDate} onChange={changePackageDate} /></>}<Pressable disabled={busy} onPress={() => void addToPantry()} style={[styles.addButton, busy && styles.disabled]}><Text style={styles.white}>{busy ? "Dodawanie..." : "Potwierdź dodanie do spiżarni"}</Text></Pressable></>}
            />}
            {actionMode === "today" && selected && !isChemical(selected) && <ActionForm
              title="Dodaj do dzisiejszego bilansu"
              selected={selected}
              amount={amount}
              unit={unit}
              onAmount={setAmount}
              onUnit={setUnit}
              footer={<><ConsumerPicker value={consumer} onChange={setConsumer} label="Bilans kalorii dla" /><Pressable disabled={busy} onPress={() => void addToToday()} style={[styles.todayButton, busy && styles.disabled]}><Text style={styles.white}>{busy ? "Dodawanie..." : "Potwierdź dodanie do bilansu"}</Text></Pressable></>}
            />}
          </ScrollView>
          {actionMode === "details" && <View style={styles.actions}>
            <Pressable disabled={busy} onPress={() => openAction("edit")} style={[styles.editButton, busy && styles.disabled]}><Text style={styles.white}>Edytuj dane produktu</Text></Pressable>
            <Pressable disabled={busy} onPress={() => openAction("pantry")} style={[styles.addButton, busy && styles.disabled]}><Text style={styles.white}>Dodaj do spiżarni</Text></Pressable>
            {selected && !isChemical(selected) && <Pressable disabled={busy} onPress={() => openAction("today")} style={[styles.todayButton, busy && styles.disabled]}><Text style={styles.white}>Dodaj do dzisiejszego bilansu</Text></Pressable>}
            <Pressable disabled={busy} onPress={() => void addToShoppingList()} style={[styles.shoppingButton, busy && styles.disabled]}><Text style={styles.white}>Dodaj do listy zakupów</Text></Pressable>
            <Pressable disabled={busy} onPress={() => void removeSavedProduct()} style={[styles.deleteButton, busy && styles.disabled]}><Text style={styles.deleteText}>Usuń z Zapisanych</Text></Pressable>
          </View>}
          {actionMode === "edit" && <View style={styles.actions}><Pressable disabled={busy} onPress={() => void saveEditedProduct()} style={[styles.addButton, busy && styles.disabled]}><Text style={styles.white}>{busy ? "Zapisywanie..." : "Zapisz poprawione dane"}</Text></Pressable></View>}
        </View></View>
      </Modal>
    </ModuleScreen>
  );
}

function Details({ product }: { product: Product }) {
  if (isChemical(product)) return <>
    <Detail label="Typ" value="Produkt chemiczny, niespożywczy" />
    <Detail label="Kod produktu" value={product.barcode} />
    <Detail label="Szybkie zużycie" value="Poziom: Cały / Więcej niż pół / Połowa / Mniej niż pół / Zużyty" />
  </>;
  return <>
    <Detail label="Kod produktu" value={product.source === "usda" || product.barcode.startsWith("manual-") ? product.barcode : product.barcode} />
    <Detail label="Kalorie" value={`${product.nutrientsPer100g.energyKcal ?? "brak"} kcal / ${product.nutritionBasis === "perUnit" ? "szt." : "100 g/ml"}`} />
    <Detail label="Makroskładniki" value={`B: ${product.nutrientsPer100g.proteins ?? "-"} g  W: ${product.nutrientsPer100g.carbohydrates ?? "-"} g  T: ${product.nutrientsPer100g.fat ?? "-"} g`} />
    <Detail label="Mikroelementy" value={`Potas: ${product.nutrientsPer100g.potassium ?? "-"} mg  Wapń: ${product.nutrientsPer100g.calcium ?? "-"} mg  Żelazo: ${product.nutrientsPer100g.iron ?? "-"} mg  Magnez: ${product.nutrientsPer100g.magnesium ?? "-"} mg`} />
    <Detail label="Jedno pełne opakowanie" value={product.packageAmount ? `${product.packageAmount} ${product.packageUnit}` : "brak danych"} />
    <Detail label="Szybkie zużycie" value={product.quickUseAmount ? `${product.quickUseAmount} ${product.quickUseUnit}` : "brak danych"} />
  </>;
}

function EditForm({ name, brand, numbers, packageUnit, quickUseUnit, onName, onBrand, onNumber, onPackageUnit, onQuickUseUnit }: {
  name: string; brand: string; numbers: Record<EditKey, string>; packageUnit: Unit; quickUseUnit: Unit;
  onName: (value: string) => void; onBrand: (value: string) => void; onNumber: (key: EditKey, value: string) => void; onPackageUnit: (value: Unit) => void; onQuickUseUnit: (value: Unit) => void;
}) {
  return <View style={styles.actionForm}>
    <Text style={styles.actionTitle}>Ręczna korekta danych</Text>
    <Field label="Nazwa produktu" value={name} onChangeText={onName} />
    <Field label="Marka" value={brand} onChangeText={onBrand} />
    <Text style={styles.hint}>Popraw tu dane, jeśli etykieta produktu różni się od informacji pobranych z internetu.</Text>
    <Field label="kcal na 100 g/ml albo szt." value={numbers.energyKcal} onChangeText={(value) => onNumber("energyKcal", value)} numeric />
    <View style={styles.threeColumns}>
      <Field label="Białko" value={numbers.proteins} onChangeText={(value) => onNumber("proteins", value)} numeric />
      <Field label="Węglowodany" value={numbers.carbohydrates} onChangeText={(value) => onNumber("carbohydrates", value)} numeric />
      <Field label="Tłuszcz" value={numbers.fat} onChangeText={(value) => onNumber("fat", value)} numeric />
    </View>
    <View style={styles.threeColumns}>
      <Field label="Błonnik" value={numbers.fiber} onChangeText={(value) => onNumber("fiber", value)} numeric />
      <Field label="Sól" value={numbers.salt} onChangeText={(value) => onNumber("salt", value)} numeric />
    </View>
    <Text style={styles.actionTitle}>Jedno pełne opakowanie</Text>
    <View style={styles.amountRow}><TextInput value={numbers.packageAmount} onChangeText={(value) => onNumber("packageAmount", value)} keyboardType="decimal-pad" placeholder="Np. 200" style={styles.amountInput} />{(["g", "ml", "szt"] as Unit[]).map((value) => <Pressable key={value} onPress={() => onPackageUnit(value)} style={[styles.unit, packageUnit === value && styles.unitActive]}><Text style={packageUnit === value ? styles.white : undefined}>{value}</Text></Pressable>)}</View>
    <Text style={styles.actionTitle}>Szybki przycisk zużycia</Text>
    <Text style={styles.hint}>Np. 1 szt. dla serka, 200 ml dla mleka albo 50 g dla masła.</Text>
    <View style={styles.amountRow}><TextInput value={numbers.quickUseAmount} onChangeText={(value) => onNumber("quickUseAmount", value)} keyboardType="decimal-pad" placeholder="Np. 1" style={styles.amountInput} />{(["g", "ml", "szt"] as Unit[]).map((value) => <Pressable key={value} onPress={() => onQuickUseUnit(value)} style={[styles.unit, quickUseUnit === value && styles.unitActive]}><Text style={quickUseUnit === value ? styles.white : undefined}>{value}</Text></Pressable>)}</View>
  </View>;
}

function ActionForm({ title, selected, amount, unit, onAmount, onUnit, footer }: { title: string; selected: Product; amount: string; unit: Unit; onAmount: (value: string) => void; onUnit: (value: Unit) => void; footer: ReactNode }) {
  const chemical = isChemical(selected);
  return <View style={styles.actionForm}>
    <Text style={styles.actionTitle}>{title}</Text>
    {!chemical && canUseWholePackage(selected) && <View style={styles.packageButton}><Text style={styles.packageText}>Jedno opakowanie: {selected.packageAmount} {selected.packageUnit}</Text><Text style={styles.hint}>Wpisz np. 4 szt., a aplikacja zapisze pełną ilość produktu.</Text></View>}
    {!chemical && <View style={styles.amountRow}><TextInput value={amount} onChangeText={onAmount} keyboardType="decimal-pad" style={styles.amountInput} />{(["g", "ml", "szt"] as Unit[]).map((value) => <Pressable key={value} onPress={() => onUnit(value)} style={[styles.unit, unit === value && styles.unitActive]}><Text style={unit === value ? styles.white : undefined}>{value}</Text></Pressable>)}</View>}
    {footer}
  </View>;
}

function Field({ label, numeric, ...props }: { label: string; numeric?: boolean; value: string; onChangeText: (value: string) => void }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} keyboardType={numeric ? "decimal-pad" : "default"} style={styles.input} /></View>;
}

function Detail({ label, value }: { label: string; value?: string }) {
  return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value || "brak danych"}</Text></View>;
}

function packageDateCount(product: Product | null, amount: string, unit: Unit) {
  if (!product || unit !== "szt" || !canUseWholePackage(product)) return 0;
  const count = Math.floor(Number(amount.replace(",", ".")));
  return Number.isFinite(count) && count > 1 ? count : 0;
}

function buildPackageDates(product: Product, amount: number, unit: Unit, fallbackDate: string, packageDates: string[]) {
  const count = packageDateCount(product, String(amount), unit);
  if (!count) return undefined;
  return Array.from({ length: count }, (_, index) => packageDates[index]?.trim() || fallbackDate.trim() || undefined);
}

function PackageDateFields({ product, amount, unit, packageDates, fallbackDate, onChange }: { product: Product; amount: string; unit: Unit; packageDates: string[]; fallbackDate: string; onChange: (index: number, value: string) => void }) {
  const count = packageDateCount(product, amount, unit);
  if (!count) return null;
  return <View style={styles.packageDates}>
    <Text style={styles.packageDatesTitle}>Daty dla poszczególnych opakowań (opcjonalne)</Text>
    <Text style={styles.hint}>Puste pola użyją daty ogólnej albo zostaną bez daty.</Text>
    {Array.from({ length: count }, (_, index) => <DatePickerField key={index} label={`Opakowanie ${index + 1}`} value={packageDates[index] ?? fallbackDate} onChange={(value) => onChange(index, value)} />)}
  </View>;
}

function parseAmount(value: string) { const number = Number(value.replace(",", ".")); return Number.isFinite(number) && number > 0 ? number : 0; }
function parseOptionalNumber(value: string) { const number = Number(value.replace(",", ".")); return Number.isFinite(number) && number >= 0 ? number : undefined; }
function textNumber(value?: number) { return value === undefined ? "" : String(value); }

const styles = StyleSheet.create({
  search: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, marginBottom: 12 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 12 },
  tab: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.text, fontWeight: "800", textAlign: "center" },
  tabTextActive: { color: "white", fontWeight: "900", textAlign: "center" },
  list: { paddingBottom: 30 }, emptyList: { flexGrow: 1 }, row: { backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 17, marginBottom: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  name: { flex: 1, fontWeight: "800", fontSize: 18 }, open: { color: colors.primary, fontWeight: "800" }, pressed: { opacity: 0.68 },
  message: { color: "#1B5E20", backgroundColor: "#E8F5E9", borderRadius: 10, padding: 12, marginBottom: 12, fontWeight: "700" }, error: { color: colors.danger, backgroundColor: "#FFEBEE", borderRadius: 10, padding: 12, marginBottom: 12, fontWeight: "700" }, empty: { textAlign: "center", color: colors.muted, marginTop: 70 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "center", padding: 18 }, modalCard: { width: "100%", maxWidth: 580, maxHeight: "92%", backgroundColor: colors.surface, borderRadius: 20, padding: 22 }, modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }, modalHeading: { flex: 1, gap: 3 }, modalTitle: { fontSize: 24, fontWeight: "900" }, backAction: { alignSelf: "flex-start", paddingVertical: 3 }, backActionText: { color: colors.primary, fontWeight: "800" }, close: { padding: 6 }, closeText: { color: colors.muted, fontWeight: "700" }, brand: { color: colors.muted, fontSize: 16, marginTop: 5 },
  detailsScroll: { flexShrink: 1, minHeight: 0, marginTop: 18 }, details: { gap: 10, paddingBottom: 8 }, detail: { backgroundColor: colors.background, borderRadius: 11, padding: 13 }, detailLabel: { color: colors.muted, fontSize: 12, fontWeight: "800", marginBottom: 4, textTransform: "uppercase" }, detailValue: { color: colors.text, fontSize: 16, lineHeight: 22 },
  actionForm: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingTop: 14, gap: 10 }, actionTitle: { fontSize: 18, fontWeight: "900" }, hint: { color: colors.muted, lineHeight: 19 }, packageButton: { backgroundColor: "#E8F5E9", borderWidth: 1, borderColor: colors.primary, borderRadius: 10, padding: 11, gap: 4 }, packageText: { color: colors.primary, fontWeight: "800" }, amountRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, amountInput: { flex: 1, minWidth: 100, backgroundColor: colors.background, borderRadius: 10, padding: 12, fontSize: 17 }, unit: { backgroundColor: colors.background, borderRadius: 10, padding: 12 }, unitActive: { backgroundColor: colors.primary },
  levelGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  levelButton: { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: colors.border },
  levelActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  levelText: { color: colors.text, fontWeight: "800" },
  packageDates: { backgroundColor: colors.background, borderRadius: 12, padding: 12, gap: 8 }, packageDatesTitle: { fontWeight: "900", fontSize: 16 },
  field: { gap: 5 }, fieldLabel: { fontWeight: "800" }, input: { backgroundColor: colors.background, borderRadius: 10, padding: 12, fontSize: 16 }, threeColumns: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actions: { gap: 8, marginTop: 14 }, editButton: { backgroundColor: "#6A1B9A", borderRadius: 12, padding: 14, alignItems: "center" }, addButton: { backgroundColor: colors.primary, borderRadius: 12, padding: 14, alignItems: "center" }, todayButton: { backgroundColor: "#EF6C00", borderRadius: 12, padding: 14, alignItems: "center" }, shoppingButton: { backgroundColor: "#1565C0", borderRadius: 12, padding: 14, alignItems: "center" }, deleteButton: { borderWidth: 2, borderColor: colors.danger, borderRadius: 12, padding: 14, alignItems: "center" }, deleteText: { color: colors.danger, fontWeight: "900" }, white: { color: "white", fontWeight: "800" }, disabled: { opacity: 0.55 }
});
