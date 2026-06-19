import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { useRef } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { DatePickerField } from "@/core/components/DatePickerField";
import { ConsumerPicker } from "@/core/components/ConsumerPicker";
import { LocationPicker } from "@/core/components/LocationPicker";
import { useAppNavigation, useNavigationLayer } from "@/core/navigation/useAppNavigation";
import { colors } from "@/core/theme";
import { ChemicalLevel, Product, ProductType, Unit } from "@/domain/product";
import { Consumer } from "@/domain/meal";
import { ManualProductForm } from "@/features/scanner/ManualProductForm";
import { BarcodeCamera } from "@/features/scanner/BarcodeCamera";
import { shouldAutoStartScanner } from "@/features/scanner/scannerLaunch";
import { AddDepletedPrompt } from "@/features/shopping/AddDepletedPrompt";
import { getProductByBarcode } from "@/services/openFoodFacts";
import { changePantryQuantity, createUntrackedMeal, getPantryItem, getSavedProduct, saveChemicalPantryItem, saveProduct } from "@/services/inventoryRepository";
import { createUntrackedMealIngredient } from "@/services/nutrition";
import { canUseWholePackage, convertPantryAmount, preferredPantryUnit } from "@/services/pantryUnits";
import { shouldAskToBuyAgain } from "@/services/shoppingPrompt";
import { chemicalLevelLabel, chemicalLevels, isChemical, productTypes, withProductType } from "@/services/productTypes";
import { searchUsdaFoods, UsdaFoodResult } from "@/services/usdaFoodData";

export function ScannerScreen() {
  const params = useLocalSearchParams<{ autoScan?: string | string[] }>();
  const appNavigation = useAppNavigation();
  const cameraLayer = useNavigationLayer("scanner-camera", "scanner", { scanner: true });
  const manualLayer = useNavigationLayer("scanner-manual-product", "form", { modal: "scanner-manual-product", mode: "add-product" });
  const activeType = appNavigation.state.view === "scanner" && (appNavigation.state.tab === "food" || appNavigation.state.tab === "household_chemical") ? appNavigation.state.tab : "food";
  const setActiveType = (type: ProductType) => appNavigation.updateState({ tab: type }, { push: true });
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [message, setMessage] = useState("Zeskanuj kod lub wpisz go ręcznie.");
  const [stockAmount, setStockAmount] = useState("1");
  const [stockUnit, setStockUnit] = useState<Unit>("szt");
  const [expiryDate, setExpiryDate] = useState("");
  const [packageDates, setPackageDates] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [foodName, setFoodName] = useState("");
  const [usdaResults, setUsdaResults] = useState<UsdaFoodResult[]>([]);
  const [usdaBusy, setUsdaBusy] = useState(false);
  const [usdaMessage, setUsdaMessage] = useState("");
  const [depletedProducts, setDepletedProducts] = useState<Product[]>([]);
  const [consumer, setConsumer] = useState<Consumer | null>(null);
  const [chemicalLevel, setChemicalLevel] = useState<ChemicalLevel>("full");
  const autoScanHandled = useRef(false);

  useEffect(() => {
    if (!shouldAutoStartScanner(params.autoScan, appNavigation.state.view, autoScanHandled.current)) return;
    autoScanHandled.current = true;
    cameraLayer.openLayer();
  }, [appNavigation.state.view, params.autoScan]);

  async function search(value = barcode) {
    const normalized = value.trim();
    if (!normalized) return;
    setBarcode(normalized);
    setMessage("Pobieranie informacji...");
    try {
      const saved = await getSavedProduct(normalized);
      if (saved) {
        const typedSaved = withProductType(saved, activeType);
        setProduct(typedSaved);
        setStockUnit(canUseWholePackage(typedSaved) ? "szt" : typedSaved.defaultUnit ?? "szt");
        setStockAmount("1");
        setPackageDates([]);
        setActionMessage("");
        manualLayer.closeLayer();
        setMessage("Produkt znaleziony w Twojej bazie Zapisane.");
        return;
      }
      const result = await getProductByBarcode(normalized);
      const typedResult = result ? withProductType(result, activeType) : null;
      setProduct(typedResult);
      if (typedResult) {
        setStockUnit(canUseWholePackage(typedResult) ? "szt" : typedResult.defaultUnit ?? "szt");
        setStockAmount("1");
        setPackageDates([]);
      }
      setActionMessage("");
      manualLayer.closeLayer();
      setMessage(result ? "Produkt znaleziony." : "Nie znaleziono tego produktu w bazie Open Food Facts. Możesz dodać go ręcznie.");
    } catch {
      setMessage("Nie udało się połączyć z Open Food Facts.");
    }
  }

  function openCamera() {
    cameraLayer.openLayer();
  }

  async function searchByName() {
    const query = foodName.trim();
    if (!query) return setUsdaMessage("Wpisz nazwę produktu, np. pomidor.");
    try {
      setUsdaBusy(true); setUsdaMessage("Wyszukiwanie w bazie USDA..."); setUsdaResults([]);
      const results = await searchUsdaFoods(query);
      setUsdaResults(results);
      setUsdaMessage(results.length ? "Wybierz produkt najbardziej pasujący do Twojego." : "USDA nie znalazło produktu z danymi kalorycznymi.");
    } catch { setUsdaMessage("Nie udało się połączyć z USDA FoodData Central."); }
    finally { setUsdaBusy(false); }
  }

  function selectUsda(result: UsdaFoodResult) {
    setProduct(result.product);
    setBarcode(result.product.barcode);
    setStockAmount("100");
    setStockUnit("g");
    setPackageDates([]);
    setUsdaResults([]);
    setUsdaMessage(`Wybrano: ${result.description}. Podaj ilość i dodaj produkt do spiżarni.`);
    setMessage("Produkt bez kodu pobrany z USDA.");
    setActionMessage("");
  }

  function scanned(value: string) {
    cameraLayer.closeLayer();
    setMessage(`Odczytano kod: ${value}`);
    void search(value);
  }

  const bottomActionLabel = manualLayer.open ? "Anuluj" : cameraLayer.open ? "Zamknij" : "Cofnij";
  const bottomAction = manualLayer.open ? manualLayer.closeLayer : cameraLayer.open ? cameraLayer.closeLayer : appNavigation.goBack;

  async function update(direction: 1 | -1) {
    if (!product) return;
    const amount = Number(stockAmount.replace(",", "."));
    setActionMessage("");
    setActionError(false);
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionError(true); setActionMessage("Wpisz prawidłową ilość."); return;
    }
    if (direction > 0 && !location.trim()) {
      setActionError(true); setActionMessage("Przed dodaniem wybierz lokalizację. Data ważności jest opcjonalna."); return;
    }
    if (direction > 0 && isChemical(product)) {
      try {
        setBusy(true);
        const updated = await saveChemicalPantryItem(product, chemicalLevel, { location: location.trim() || undefined });
        setActionMessage(`Dodano ${product.name}. Stan: ${chemicalLevelLabel(updated.chemicalLevel)}.`);
        setMessage("Produkt chemiczny dodany do spiżarni.");
      } catch (error) {
        setActionError(true);
        setActionMessage(error instanceof Error ? error.message : "Nie udało się dodać produktu chemicznego.");
      } finally { setBusy(false); }
      return;
    }
    try {
      setBusy(true);
      const before = direction < 0 ? await getPantryItem(product.barcode) : null;
      const packageExpiryDates = direction > 0 ? buildPackageDates(product, amount, stockUnit, expiryDate, packageDates) : undefined;
      const updated = await changePantryQuantity(product, amount * direction, stockUnit, { expiryDate: expiryDate.trim() || undefined, location: location.trim() || undefined, packageExpiryDates });
      const operation = direction > 0 ? "Dodano" : "Odjęto";
      setActionMessage(`${operation} ${amount} ${stockUnit}. Stan: ${updated.quantity} ${updated.unit}.`);
      setMessage(direction > 0 ? "Produkt dodany do spiżarni." : "Produkt odjęty ze spiżarni.");
      if (direction < 0 && before && shouldAskToBuyAgain(before, updated)) setDepletedProducts([product]);
    } catch (error) {
      setActionError(true);
      setActionMessage(error instanceof Error ? error.message : "Nie udało się zmienić stanu.");
    } finally { setBusy(false); }
  }

  function changePackageDate(index: number, value: string) {
    setPackageDates((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  }

  async function eatNow() {
    if (!product) return;
    const amount = Number(stockAmount.replace(",", "."));
    setActionMessage("");
    setActionError(false);
    if (!consumer) {
      setActionError(true);
      setActionMessage("Najpierw dodaj i wybierz profil osoby w zakładce Posiłki.");
      return;
    }
    try {
      setBusy(true);
      const nutritionUnit = stockUnit === "szt" && canUseWholePackage(product) && product.nutritionBasis !== "perUnit"
        ? preferredPantryUnit(product, stockUnit)
        : stockUnit;
      const nutritionAmount = nutritionUnit === stockUnit ? amount : convertPantryAmount(product, amount, stockUnit, nutritionUnit);
      const ingredient = createUntrackedMealIngredient(product, nutritionAmount, nutritionUnit);
      await saveProduct(product);
      await createUntrackedMeal(`Przekąska: ${product.name}`, "snack", ingredient, Date.now(), consumer);
      setActionMessage(`Dodano do bilansu osoby ${consumer.name}: ${amount} ${stockUnit}, ${ingredient.nutrients.energyKcal ?? 0} kcal. Stan spiżarni nie został zmieniony.`);
      setMessage("Produkt zapisany w dzisiejszym bilansie.");
    } catch (error) {
      setActionError(true);
      setActionMessage(error instanceof Error ? error.message : "Nie udało się zapisać produktu w bilansie.");
    } finally { setBusy(false); }
  }

  return (
    <ModuleScreen title="Skaner" actionLabel={bottomActionLabel} onBack={bottomAction}>
      <AddDepletedPrompt products={depletedProducts} onClose={() => setDepletedProducts([])} onAdded={() => setActionMessage("Produkt zużyty i dodany do listy zakupów.")} />
      {manualLayer.open ? (
        <ManualProductForm
          barcode={barcode}
          productType={activeType}
          onCancel={manualLayer.closeLayer}
          onSaved={(savedProduct) => {
            setProduct(savedProduct);
            manualLayer.closeLayer();
            setMessage("Produkt został zapisany ręcznie.");
          }}
        />
      ) : cameraLayer.open ? (
        <BarcodeCamera onCancel={cameraLayer.closeLayer} onScanned={scanned} />
      ) : (
        <ScrollView
          style={[styles.scroll, Platform.OS === "web" && styles.webScroll]}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
        <View style={styles.card}>
          <View style={styles.tabs}>{productTypes.map((item) => <Pressable key={item.type} onPress={() => { setActiveType(item.type); setProduct(null); setActionMessage(""); }} style={[styles.tab, activeType === item.type && styles.tabActive]}><Text style={activeType === item.type ? styles.tabTextActive : styles.tabText}>{item.label}</Text></Pressable>)}</View>
          <View style={styles.row}>
            <TextInput keyboardType="number-pad" value={barcode} onChangeText={setBarcode} placeholder="Kod kreskowy" style={styles.input} />
            <Pressable onPress={() => void search()} style={styles.button}><Text style={styles.white}>Sprawdź</Text></Pressable>
            <Pressable onPress={openCamera} style={styles.scan}><Text style={styles.white}>Skanuj</Text></Pressable>
          </View>
          <Text style={styles.message}>{message}</Text>
          {activeType === "food" && <View style={styles.usdaPanel}>
            <Text style={styles.usdaTitle}>Produkt bez kodu kreskowego</Text>
            <Text style={styles.usdaHint}>Wpisz np. pomidor, marchew lub jabłko. Dane odżywcze pobierzemy z USDA.</Text>
            <View style={styles.row}>
              <TextInput value={foodName} onChangeText={setFoodName} onSubmitEditing={() => void searchByName()} placeholder="Nazwa produktu, np. pomidor" style={styles.input} />
              <Pressable disabled={usdaBusy} onPress={() => void searchByName()} style={[styles.usdaButton, usdaBusy && styles.disabled]}><Text style={styles.white}>{usdaBusy ? "Szukam..." : "Szukaj USDA"}</Text></Pressable>
            </View>
            {!!usdaMessage && <Text style={styles.usdaMessage}>{usdaMessage}</Text>}
            {usdaResults.map((result) => <Pressable key={result.fdcId} onPress={() => selectUsda(result)} style={styles.usdaResult}>
              <View style={styles.usdaResultText}><Text style={styles.usdaName}>{result.description}</Text><Text style={styles.muted}>{result.dataType}</Text></View>
              <View style={styles.usdaNutrition}><Text style={styles.usdaKcal}>{result.product.nutrientsPer100g.energyKcal ?? 0} kcal</Text><Text style={styles.muted}>B {result.product.nutrientsPer100g.proteins ?? 0} | W {result.product.nutrientsPer100g.carbohydrates ?? 0} | T {result.product.nutrientsPer100g.fat ?? 0}</Text></View>
            </Pressable>)}
          </View>}
          {!product && <Pressable onPress={() => manualLayer.openLayer()} style={styles.manual}><Text style={styles.white}>Dodaj produkt ręcznie</Text></Pressable>}
          {product && (
            <View style={styles.product}>              <Text style={styles.name}>{product.name}</Text>
              <Text>{product.brand}</Text>
              {isChemical(product) ? <><Text style={styles.package}>Produkt chemiczny, niespożywczy</Text><View style={styles.levelGrid}>{chemicalLevels.map((level) => <Pressable key={level.value} onPress={() => setChemicalLevel(level.value)} style={[styles.levelButton, chemicalLevel === level.value && styles.levelActive]}><Text style={chemicalLevel === level.value ? styles.white : styles.levelText}>{level.label}</Text></Pressable>)}</View></> : <>
                <Text style={styles.package}>{product.source === "usda" ? "Produkt bez kodu - wartości na 100 g" : `Gramatura opakowania: ${product.packageAmount ? `${product.packageAmount} ${product.packageUnit}` : product.servingSize || "brak danych"}`}</Text>
                <Text>{product.nutrientsPer100g.energyKcal ?? "-"} kcal / 100 g</Text>
                <Text>B: {product.nutrientsPer100g.proteins ?? "-"} g  W: {product.nutrientsPer100g.carbohydrates ?? "-"} g  T: {product.nutrientsPer100g.fat ?? "-"} g</Text>
                <Text style={styles.micro}>Potas: {product.nutrientsPer100g.potassium ?? "-"} mg  Wapń: {product.nutrientsPer100g.calcium ?? "-"} mg  Żelazo: {product.nutrientsPer100g.iron ?? "-"} mg  Magnez: {product.nutrientsPer100g.magnesium ?? "-"} mg</Text>
              </>}
              <View style={styles.row}>{!isChemical(product) && <DatePickerField value={expiryDate} onChange={setExpiryDate} />}<LocationPicker value={location} onChange={setLocation} label="Lokalizacja w spiżarni" productType={activeType} /></View>
              {!isChemical(product) && <PackageDateFields product={product} amount={stockAmount} unit={stockUnit} packageDates={packageDates} fallbackDate={expiryDate} onChange={changePackageDate} />}
              {!isChemical(product) && canUseWholePackage(product) && <View style={styles.packageHint}><Text style={styles.packageHintTitle}>Jedno opakowanie: {product.packageAmount} {product.packageUnit}</Text><Text style={styles.muted}>Przy dodawaniu wpisz liczbę opakowań, np. 4 szt. Możesz też odejmować później gramy, ml albo 1 sztukę.</Text></View>}
              {!isChemical(product) && <ConsumerPicker value={consumer} onChange={setConsumer} label="Dla kogo dodać produkt do dzisiejszego bilansu?" />}
              <View style={styles.actions}>
                {!isChemical(product) && <>
                  <TextInput value={stockAmount} onChangeText={setStockAmount} keyboardType="decimal-pad" style={styles.amount} />
                  {(["g", "ml", "szt"] as Unit[]).map((unit) => <Pressable key={unit} onPress={() => setStockUnit(unit)} style={[styles.unitChoice, stockUnit === unit && styles.unitActive]}><Text style={stockUnit === unit ? styles.white : undefined}>{unit}</Text></Pressable>)}
                </>}
                <Pressable disabled={busy} onPress={() => void update(1)} style={[styles.button, busy && styles.disabled]}><Text style={styles.white}>{busy ? "Zapisywanie..." : "+ Dodaj"}</Text></Pressable>
                {!isChemical(product) && <Pressable disabled={busy} onPress={() => void update(-1)} style={[styles.remove, busy && styles.disabled]}><Text style={styles.white}>- Odejmij</Text></Pressable>}
                {!isChemical(product) && <Pressable disabled={busy} onPress={() => void eatNow()} style={[styles.eat, busy && styles.disabled]}><Text style={styles.white}>Dodaj do dzisiejszego bilansu</Text></Pressable>}
              </View>
              {!!actionMessage && <Text style={[styles.actionMessage, actionError ? styles.actionError : styles.actionSuccess]}>{actionMessage}</Text>}
              {product.nutrientsPer100g.energyKcal === undefined && <Pressable onPress={() => manualLayer.openLayer()} style={styles.manual}><Text style={styles.white}>Uzupełnij kalorie ręcznie</Text></Pressable>}
            </View>
          )}
        </View>
        </ScrollView>
      )}
    </ModuleScreen>
  );
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
    <Text style={styles.muted}>Puste pola użyją daty ogólnej albo zostaną bez daty.</Text>
    {Array.from({ length: count }, (_, index) => <DatePickerField key={index} label={`Opakowanie ${index + 1}`} value={packageDates[index] ?? fallbackDate} onChange={(value) => onChange(index, value)} />)}
  </View>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  webScroll: { overflow: "scroll" },
  scrollContent: { flexGrow: 1, paddingBottom: 36 },
  card: { backgroundColor: colors.surface, padding: 24, borderRadius: 20 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 14 },
  tab: { flex: 1, backgroundColor: colors.background, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.text, fontWeight: "800", textAlign: "center" },
  tabTextActive: { color: "white", fontWeight: "900", textAlign: "center" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  input: { flex: 1, backgroundColor: colors.background, padding: 16, borderRadius: 12, fontSize: 18 },
  button: { backgroundColor: colors.primary, paddingHorizontal: 24, justifyContent: "center", borderRadius: 12 },
  scan: { backgroundColor: "#1565C0", paddingHorizontal: 24, justifyContent: "center", borderRadius: 12 },
  manual: { alignSelf: "flex-start", backgroundColor: "#6A1B9A", padding: 14, borderRadius: 12, marginBottom: 16 },
  white: { color: "white", fontWeight: "700" },
  message: { color: colors.muted, marginVertical: 18 },
  muted: { color: colors.muted, fontSize: 12 },
  usdaPanel: { borderTopWidth: 1, borderTopColor: colors.border, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 16, marginBottom: 16, gap: 9 },
  usdaTitle: { fontSize: 19, fontWeight: "900" }, usdaHint: { color: colors.muted, lineHeight: 19 }, usdaButton: { backgroundColor: "#7A4E22", paddingHorizontal: 20, paddingVertical: 14, justifyContent: "center", borderRadius: 12 }, usdaMessage: { color: colors.muted, fontWeight: "600" },
  usdaResult: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: colors.background, borderRadius: 11, padding: 13 }, usdaResultText: { flex: 1, minWidth: 180 }, usdaName: { fontSize: 16, fontWeight: "800" }, usdaNutrition: { alignItems: "flex-end" }, usdaKcal: { color: colors.primary, fontWeight: "900" },
  product: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 18, gap: 8 },
  name: { fontSize: 24, fontWeight: "800" },
  package: { fontSize: 18, fontWeight: "800", color: colors.primary },
  packageHint: { backgroundColor: "#E8F5E9", borderWidth: 1, borderColor: colors.primary, borderRadius: 11, padding: 12, gap: 4 },
  packageHintTitle: { color: colors.primary, fontWeight: "900", fontSize: 16 },
  packageDates: { backgroundColor: colors.background, borderRadius: 12, padding: 12, gap: 8 },
  packageDatesTitle: { fontWeight: "900", fontSize: 16 },
  levelGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  levelButton: { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: colors.border },
  levelActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  levelText: { color: colors.text, fontWeight: "800" },
  micro: { color: colors.muted, lineHeight: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  amount: { width: 80, backgroundColor: colors.background, borderRadius: 10, padding: 12, textAlign: "center" },
  metaInput: { flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 12 },
  unitChoice: { backgroundColor: colors.background, padding: 12, borderRadius: 10 }, unitActive: { backgroundColor: colors.primary },
  remove: { backgroundColor: colors.danger, padding: 15, borderRadius: 12 },
  eat: { backgroundColor: "#EF6C00", padding: 15, borderRadius: 12 },
  actionMessage: { fontSize: 17, fontWeight: "800", padding: 14, borderRadius: 10 },
  actionSuccess: { color: "#1B5E20", backgroundColor: "#E8F5E9" },
  actionError: { color: colors.danger, backgroundColor: "#FFEBEE" },
  disabled: { opacity: 0.55 }
});
