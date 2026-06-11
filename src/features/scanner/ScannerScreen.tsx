import { useCameraPermissions } from "expo-camera";
import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { DatePickerField } from "@/core/components/DatePickerField";
import { LocationPicker } from "@/core/components/LocationPicker";
import { colors } from "@/core/theme";
import { Product, Unit } from "@/domain/product";
import { ManualProductForm } from "@/features/scanner/ManualProductForm";
import { BarcodeCamera } from "@/features/scanner/BarcodeCamera";
import { getProductByBarcode } from "@/services/openFoodFacts";
import { changePantryQuantity, createUntrackedMeal, saveProduct } from "@/services/inventoryRepository";
import { createUntrackedMealIngredient } from "@/services/nutrition";

export function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [message, setMessage] = useState("Zeskanuj kod lub wpisz go recznie.");
  const [stockAmount, setStockAmount] = useState("1");
  const [stockUnit, setStockUnit] = useState<Unit>("szt");
  const [expiryDate, setExpiryDate] = useState("");
  const [location, setLocation] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState(false);
  const [busy, setBusy] = useState(false);

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
      setMessage(result ? "Produkt znaleziony." : "Nie znaleziono tego produktu w bazie Open Food Facts. Mozesz dodac go recznie.");
    } catch {
      setMessage("Nie udalo sie polaczyc z Open Food Facts.");
    }
  }

  async function openCamera() {
    if (Platform.OS === "web") {
      setCameraOpen(true);
      return;
    }
    const result = permission?.granted ? permission : await requestPermission();
    if (result?.granted) setCameraOpen(true);
    else setMessage("Aby skanowac, zezwol aplikacji na dostep do aparatu.");
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
      setActionError(true); setActionMessage("Wpisz prawidlowa ilosc."); return;
    }
    if (direction > 0 && !location.trim()) {
      setActionError(true); setActionMessage("Przed dodaniem wybierz lokalizacje. Data waznosci jest opcjonalna."); return;
    }
    try {
      setBusy(true);
      const updated = await changePantryQuantity(product, amount * direction, stockUnit, { expiryDate: expiryDate.trim() || undefined, location: location.trim() || undefined });
      const operation = direction > 0 ? "Dodano" : "Odjeto";
      setActionMessage(`${operation} ${amount} ${updated.unit}. Stan: ${updated.quantity} ${updated.unit}.`);
      setMessage(direction > 0 ? "Produkt dodany do spizarni." : "Produkt odjety ze spizarni.");
    } catch (error) {
      setActionError(true);
      setActionMessage(error instanceof Error ? error.message : "Nie udalo sie zmienic stanu.");
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
      await createUntrackedMeal(`Przekaska: ${product.name}`, "snack", ingredient);
      setActionMessage(`Dodano do dzisiejszego bilansu: ${amount} ${stockUnit}, ${ingredient.nutrients.energyKcal ?? 0} kcal. Stan spizarni nie zostal zmieniony.`);
      setMessage("Produkt zapisany w dzisiejszym bilansie.");
    } catch (error) {
      setActionError(true);
      setActionMessage(error instanceof Error ? error.message : "Nie udalo sie zapisac produktu w bilansie.");
    } finally { setBusy(false); }
  }

  return (
    <ModuleScreen title="Skaner">
      {manualOpen ? (
        <ManualProductForm
          barcode={barcode}
          onCancel={() => setManualOpen(false)}
          onSaved={(savedProduct) => {
            setProduct(savedProduct);
            setManualOpen(false);
            setMessage("Produkt zostal zapisany recznie.");
          }}
        />
      ) : cameraOpen ? (
        <BarcodeCamera onCancel={() => setCameraOpen(false)} onScanned={scanned} />
      ) : (
        <ScrollView
          style={[styles.scroll, Platform.OS === "web" && styles.webScroll]}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
        <View style={styles.card}>
          <View style={styles.row}>
            <TextInput keyboardType="number-pad" value={barcode} onChangeText={setBarcode} placeholder="Kod kreskowy" style={styles.input} />
            <Pressable onPress={() => void search()} style={styles.button}><Text style={styles.white}>Sprawdz</Text></Pressable>
            <Pressable onPress={openCamera} style={styles.scan}><Text style={styles.white}>Skanuj</Text></Pressable>
          </View>
          <Text style={styles.message}>{message}</Text>
          {!product && !!barcode && <Pressable onPress={() => setManualOpen(true)} style={styles.manual}><Text style={styles.white}>Dodaj produkt recznie</Text></Pressable>}
          {product && (
            <View style={styles.product}>
              <Text style={styles.name}>{product.name}</Text>
              <Text>{product.brand}</Text>
              <Text style={styles.package}>Gramatura opakowania: {product.packageAmount ? `${product.packageAmount} ${product.packageUnit}` : product.servingSize || "brak danych"}</Text>
              <Text>{product.nutrientsPer100g.energyKcal ?? "-"} kcal / 100 g</Text>
              <Text>B: {product.nutrientsPer100g.proteins ?? "-"} g  W: {product.nutrientsPer100g.carbohydrates ?? "-"} g  T: {product.nutrientsPer100g.fat ?? "-"} g</Text>
              <View style={styles.row}><DatePickerField value={expiryDate} onChange={setExpiryDate} /><LocationPicker value={location} onChange={setLocation} label="Lokalizacja w spizarni" /></View>
              <View style={styles.actions}>
                <TextInput value={stockAmount} onChangeText={setStockAmount} keyboardType="decimal-pad" style={styles.amount} />
                {(["g", "ml", "szt"] as Unit[]).map((unit) => <Pressable key={unit} onPress={() => setStockUnit(unit)} style={[styles.unitChoice, stockUnit === unit && styles.unitActive]}><Text style={stockUnit === unit ? styles.white : undefined}>{unit}</Text></Pressable>)}
                <Pressable disabled={busy} onPress={() => void update(1)} style={[styles.button, busy && styles.disabled]}><Text style={styles.white}>{busy ? "Zapisywanie..." : "+ Dodaj"}</Text></Pressable>
                <Pressable disabled={busy} onPress={() => void update(-1)} style={[styles.remove, busy && styles.disabled]}><Text style={styles.white}>- Odejmij</Text></Pressable>
                <Pressable disabled={busy} onPress={() => void eatNow()} style={[styles.eat, busy && styles.disabled]}><Text style={styles.white}>Zjedz teraz - tylko do bilansu</Text></Pressable>
              </View>
              {!!actionMessage && <Text style={[styles.actionMessage, actionError ? styles.actionError : styles.actionSuccess]}>{actionMessage}</Text>}
              {product.nutrientsPer100g.energyKcal === undefined && <Pressable onPress={() => setManualOpen(true)} style={styles.manual}><Text style={styles.white}>Uzupelnij kalorie recznie</Text></Pressable>}
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
  product: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 18, gap: 8 },
  name: { fontSize: 24, fontWeight: "800" },
  package: { fontSize: 18, fontWeight: "800", color: colors.primary },
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
