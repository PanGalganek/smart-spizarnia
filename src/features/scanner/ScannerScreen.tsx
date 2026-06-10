import { BarcodeScanningResult, CameraView, useCameraPermissions } from "expo-camera";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import { Product } from "@/domain/product";
import { ManualProductForm } from "@/features/scanner/ManualProductForm";
import { getProductByBarcode } from "@/services/openFoodFacts";
import { changePantryQuantity } from "@/services/inventoryRepository";

export function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [message, setMessage] = useState("Zeskanuj kod lub wpisz go recznie.");

  async function search(value = barcode) {
    const normalized = value.trim();
    if (!normalized) return;
    setBarcode(normalized);
    setMessage("Pobieranie informacji...");
    try {
      const result = await getProductByBarcode(normalized);
      setProduct(result);
      setManualOpen(!result);
      setMessage(result ? "Produkt znaleziony." : "Brak produktu w Open Food Facts. Wymagany wpis reczny.");
    } catch {
      setMessage("Nie udalo sie polaczyc z Open Food Facts.");
    }
  }

  async function openCamera() {
    const result = permission?.granted ? permission : await requestPermission();
    if (result?.granted) setCameraOpen(true);
    else setMessage("Aby skanowac, zezwol aplikacji na dostep do aparatu.");
  }

  function scanned(result: BarcodeScanningResult) {
    setCameraOpen(false);
    void search(result.data);
  }

  async function update(delta: number) {
    if (!product) return;
    await changePantryQuantity(product, delta);
    setMessage(delta > 0 ? "Dodano produkt do spizarni." : "Odjeto produkt ze spizarni.");
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
        <View style={styles.cameraBox}>
          <CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }} onBarcodeScanned={scanned} />
          <Pressable onPress={() => setCameraOpen(false)} style={styles.close}><Text style={styles.white}>Anuluj</Text></Pressable>
        </View>
      ) : (
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
              <Text>{product.nutrientsPer100g.energyKcal ?? "-"} kcal / 100 g</Text>
              <Text>B: {product.nutrientsPer100g.proteins ?? "-"} g  W: {product.nutrientsPer100g.carbohydrates ?? "-"} g  T: {product.nutrientsPer100g.fat ?? "-"} g</Text>
              <View style={styles.actions}>
                <Pressable onPress={() => void update(1)} style={styles.button}><Text style={styles.white}>+ Dodaj</Text></Pressable>
                <Pressable onPress={() => void update(-1)} style={styles.remove}><Text style={styles.white}>- Odejmij</Text></Pressable>
              </View>
            </View>
          )}
        </View>
      )}
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, padding: 24, borderRadius: 20 },
  row: { flexDirection: "row", gap: 12 },
  input: { flex: 1, backgroundColor: colors.background, padding: 16, borderRadius: 12, fontSize: 18 },
  button: { backgroundColor: colors.primary, paddingHorizontal: 24, justifyContent: "center", borderRadius: 12 },
  scan: { backgroundColor: "#1565C0", paddingHorizontal: 24, justifyContent: "center", borderRadius: 12 },
  manual: { alignSelf: "flex-start", backgroundColor: "#6A1B9A", padding: 14, borderRadius: 12, marginBottom: 16 },
  white: { color: "white", fontWeight: "700" },
  message: { color: colors.muted, marginVertical: 18 },
  product: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 18, gap: 8 },
  name: { fontSize: 24, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 12, marginTop: 12 },
  remove: { backgroundColor: colors.danger, padding: 15, borderRadius: 12 },
  cameraBox: { flex: 1, borderRadius: 20, overflow: "hidden" },
  camera: { flex: 1 },
  close: { position: "absolute", right: 20, top: 20, backgroundColor: colors.danger, padding: 14, borderRadius: 12 }
});
