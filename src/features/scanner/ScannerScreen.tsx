import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { DatePickerField } from "@/core/components/DatePickerField";
import { LocationPicker } from "@/core/components/LocationPicker";
import { colors } from "@/core/theme";
import { Product, Unit } from "@/domain/product";
import { ManualProductForm } from "@/features/scanner/ManualProductForm";
import { BarcodeCamera } from "@/features/scanner/BarcodeCamera";
import { AddDepletedPrompt } from "@/features/shopping/AddDepletedPrompt";
import { getProductByBarcode } from "@/services/openFoodFacts";
import { changePantryQuantity, createUntrackedMeal, saveProduct } from "@/services/inventoryRepository";
import { createUntrackedMealIngredient } from "@/services/nutrition";
import { searchUsdaFoods, UsdaFoodResult } from "@/services/usdaFoodData";

export function ScannerScreen() {
  const params = useLocalSearchParams<{ autoScan?: string }>();
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [message, setMessage] = useState("Zeskanuj kod lub wpisz go ręcznie.");
  const [stockAmount, setStockAmount] = useState("1");
  const [stockUnit, setStockUnit] = useState<Unit>("szt");
  const [expiryDate, setExpiryDate] = useState("");
  const [location, setLocation] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [foodName, setFoodName] = useState("");
  const [usdaResults, setUsdaResults] = useState<UsdaFoodResult[]>([]);
  const [usdaBusy, setUsdaBusy] = useState(false);
  const [usdaMessage, setUsdaMessage] = useState("");
  const [depletedProducts, setDepletedProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (params.autoScan === "1") setCameraOpen(true);
  }, [params.autoScan]);

  async function search(value = barcode) {
    const normalized = value.trim();
    if (!normalized) return;
    setBarcode(normalized);
    setMessage("Pobieranie informacji...");
    try {
      const result = await getProductByBarcode(normalized);
      setProduct(result);
      if (result) {
        setStockUnit(result.packageUnit ?? result.defaultUnit ?? "szt");
        setStockAmount(String(result.packageAmount ?? 1));
      }
      setActionMessage("");
      setManualOpen(false);
      setMessage(result ? "Produkt znaleziony." : "Nie znaleziono tego produktu w bazie Open Food Facts. Możesz dodać go ręcznie.");
    } catch {
      setMessage("Nie udało się połączyć z Open Food Facts.");
    }
  }

  function openCamera() {
    setCameraOpen(true);
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
    setUsdaResults([]);
    setUsdaMessage(`Wybrano: ${result.description}. Podaj ilość i dodaj produkt do spiżarni.`);
    setMessage("Produkt bez kodu pobrany z USDA.");
    setActionMessage("");
  }

  function scanned(value: string) {
    setCameraOpen(false);
    setMessage(`Odczytano kod: ${value}`);
    void search(value);
  }

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
    try {
      setBusy(true);
      const updated = await changePantryQuantity(product, amount * direction, stockUnit, { expiryDate: expiryDate.trim() || undefined, location: location.trim() || undefined });
      const operation = direction > 0 ? "Dodano" : "Odjęto";
      setActionMessage(`${operation} ${amount} ${updated.unit}. Stan: ${updated.quantity} ${updated.unit}.`);
      setMessage(direction > 0 ? "Produkt dodany do spiżarni." : "Produkt odjęty ze spiżarni.");
      if (direction < 0 && updated.quantity === 0) setDepletedProducts([product]);
    } catch (error) {
      setActionError(true);
      setActionMessage(error instanceof Error ? error.message : "Nie udało się zmienić stanu.");
    } finally { setBusy(false); }
  }

  async function eatNow() {
    if (!product) return;
    const amount = Number(stockAmount.replace(",", "."));
    setActionMessage("");
    setActionError(false);
    try {
      setBusy(true);
      const ingredient = createUntrackedMealIngredient(product, amount, stockUnit);
      await saveProduct(product);
      await createUntrackedMeal(`Przekąska: ${product.name}`, "snack", ingredient);
      setActionMessage(`Dodano do dzisiejszego bilansu: ${amount} ${stockUnit}, ${ingredient.nutrients.energyKcal ?? 0} kcal. Stan spiżarni nie został zmieniony.`);
      setMessage("Produkt zapisany w dzisiejszym bilansie.");
    } catch (error) {
      setActionError(true);
      setActionMessage(error instanceof Error ? error.message : "Nie udało się zapisać produktu w bilansie.");
    } finally { setBusy(false); }
  }

  return (
    <ModuleScreen title="Skaner">
      <AddDepletedPrompt products={depletedProducts} onClose={() => setDepletedProducts([])} onAdded={() => setActionMessage("Produkt zużyty i dodany do listy zakupów.")} />
      {manualOpen ? (
        <ManualProductForm
          barcode={barcode}
          onCancel={() => setManualOpen(false)}
          onSaved={(savedProduct) => {
            setProduct(savedProduct);
            setManualOpen(false);
            setMessage("Produkt został zapisany ręcznie.");
          }}
        />
      ) : cameraOpen ? (
        <BarcodeCamera onCancel={() => setCameraOpen(false)} onScanned={scanned} />
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
          <View style={styles.row}>
            <TextInput keyboardType="number-pad" value={barcode} onChangeText={setBarcode} placeholder="Kod kreskowy" style={styles.input} />
            <Pressable onPress={() => void search()} style={styles.button}><Text style={styles.white}>Sprawdź</Text></Pressable>
            <Pressable onPress={openCamera} style={styles.scan}><Text style={styles.white}>Skanuj</Text></Pressable>
          </View>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.usdaPanel}>
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
          </View>
          {!product && !!barcode && <Pressable onPress={() => setManualOpen(true)} style={styles.manual}><Text style={styles.white}>Dodaj produkt ręcznie</Text></Pressable>}
          {product && (
            <View style={styles.product}>
              <Text style={styles.name}>{product.name}</Text>
              <Text>{product.brand}</Text>
              <Text style={styles.package}>{product.source === "usda" ? "Produkt bez kodu - wartości na 100 g" : `Gramatura opakowania: ${product.packageAmount ? `${product.packageAmount} ${product.packageUnit}` : product.servingSize || "brak danych"}`}</Text>
              <Text>{product.nutrientsPer100g.energyKcal ?? "-"} kcal / 100 g</Text>
              <Text>B: {product.nutrientsPer100g.proteins ?? "-"} g  W: {product.nutrientsPer100g.carbohydrates ?? "-"} g  T: {product.nutrientsPer100g.fat ?? "-"} g</Text>
              <Text style={styles.micro}>Potas: {product.nutrientsPer100g.potassium ?? "-"} mg  Wapń: {product.nutrientsPer100g.calcium ?? "-"} mg  Żelazo: {product.nutrientsPer100g.iron ?? "-"} mg  Magnez: {product.nutrientsPer100g.magnesium ?? "-"} mg</Text>
              <View style={styles.row}><DatePickerField value={expiryDate} onChange={setExpiryDate} /><LocationPicker value={location} onChange={setLocation} label="Lokalizacja w spiżarni" /></View>
              <View style={styles.actions}>
                <TextInput value={stockAmount} onChangeText={setStockAmount} keyboardType="decimal-pad" style={styles.amount} />
                {(["g", "ml", "szt"] as Unit[]).map((unit) => <Pressable key={unit} onPress={() => setStockUnit(unit)} style={[styles.unitChoice, stockUnit === unit && styles.unitActive]}><Text style={stockUnit === unit ? styles.white : undefined}>{unit}</Text></Pressable>)}
                <Pressable disabled={busy} onPress={() => void update(1)} style={[styles.button, busy && styles.disabled]}><Text style={styles.white}>{busy ? "Zapisywanie..." : "+ Dodaj"}</Text></Pressable>
                <Pressable disabled={busy} onPress={() => void update(-1)} style={[styles.remove, busy && styles.disabled]}><Text style={styles.white}>- Odejmij</Text></Pressable>
                <Pressable disabled={busy} onPress={() => void eatNow()} style={[styles.eat, busy && styles.disabled]}><Text style={styles.white}>Zjedz teraz - tylko do bilansu</Text></Pressable>
              </View>
              {!!actionMessage && <Text style={[styles.actionMessage, actionError ? styles.actionError : styles.actionSuccess]}>{actionMessage}</Text>}
              {product.nutrientsPer100g.energyKcal === undefined && <Pressable onPress={() => setManualOpen(true)} style={styles.manual}><Text style={styles.white}>Uzupełnij kalorie ręcznie</Text></Pressable>}
            </View>
          )}
        </View>
        </ScrollView>
      )}
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  webScroll: { overflow: "scroll" },
  scrollContent: { flexGrow: 1, paddingBottom: 36 },
  card: { backgroundColor: colors.surface, padding: 24, borderRadius: 20 },
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
