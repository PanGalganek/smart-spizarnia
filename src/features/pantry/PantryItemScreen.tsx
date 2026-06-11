import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { DatePickerField } from "@/core/components/DatePickerField";
import { LocationPicker } from "@/core/components/LocationPicker";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import { PantryItem, Unit } from "@/domain/product";
import { getExpiryWarning } from "@/services/expiry";
import { deletePantryItem, getPantryItem, savePantryItem } from "@/services/inventoryRepository";

export function PantryItemScreen() {
  const params = useLocalSearchParams<{ barcode: string | string[] }>();
  const barcode = Array.isArray(params.barcode) ? params.barcode[0] : params.barcode;
  const [item, setItem] = useState<PantryItem | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("g");
  const [expiryDate, setExpiryDate] = useState("");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("Ladowanie produktu...");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const expiryWarning = getExpiryWarning(expiryDate);

  useEffect(() => {
    if (!barcode) return setMessage("Brak kodu produktu.");
    void getPantryItem(barcode).then((found) => {
      if (!found) return setMessage("Tego produktu nie ma już w spiżarni.");
      setItem(found); setQuantity(String(found.quantity)); setUnit(found.unit);
      setExpiryDate(found.expiryDate ?? ""); setLocation(found.location ?? ""); setMessage("");
    }).catch(() => setMessage("Nie udało się pobrać produktu."));
  }, [barcode]);

  async function save() {
    if (!item) return;
    const nextQuantity = Number(quantity.replace(",", "."));
    if (!Number.isFinite(nextQuantity) || nextQuantity < 0) return setMessage("Ilość musi byc liczba nie mniejsza od zera.");
    try {
      setBusy(true); setMessage("");
      const next = { ...item, quantity: nextQuantity, unit, expiryDate: expiryDate.trim() || undefined, location: location.trim() || undefined, status: nextQuantity === 0 ? "consumed" as const : "active" as const };
      await savePantryItem(next); setItem(next); setMessage("Zmiany zostały zapisane.");
    } catch { setMessage("Nie udało się zapisać produktu."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!barcode) return;
    try {
      setBusy(true);
      await deletePantryItem(barcode);
      router.replace("/pantry");
    } catch { setMessage("Nie udało się usunąć produktu ze spiżarni."); setBusy(false); }
  }

  return <ModuleScreen title="Produkt">
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {!item ? <Text style={styles.loading}>{message}</Text> : <View style={styles.card}>
        <Text style={styles.name}>{item.product.name}</Text>
        <Text style={styles.muted}>{item.product.brand || "Brak marki"} | kod: {item.barcode}</Text>
        <View style={styles.nutrition}><Text>{item.product.nutrientsPer100g.energyKcal ?? "-"} kcal</Text><Text>B: {item.product.nutrientsPer100g.proteins ?? "-"} g</Text><Text>W: {item.product.nutrientsPer100g.carbohydrates ?? "-"} g</Text><Text>T: {item.product.nutrientsPer100g.fat ?? "-"} g</Text></View>
        <View style={styles.micronutrients}><Text style={styles.sectionLabel}>Mikroelementy na 100 g/ml</Text><Text style={styles.muted}>Potas: {item.product.nutrientsPer100g.potassium ?? "-"} mg | Wapń: {item.product.nutrientsPer100g.calcium ?? "-"} mg | Żelazo: {item.product.nutrientsPer100g.iron ?? "-"} mg | Magnez: {item.product.nutrientsPer100g.magnesium ?? "-"} mg | Wit. C: {item.product.nutrientsPer100g.vitaminC ?? "-"} mg</Text></View>
        <View style={styles.row}>
          <Field label="Ilość" value={quantity} onChangeText={setQuantity} numeric />
          <View style={styles.field}><Text style={styles.label}>Jednostka</Text><View style={styles.units}>{(["g", "ml", "szt"] as Unit[]).map((value) => <Pressable key={value} onPress={() => setUnit(value)} style={[styles.unit, unit === value && styles.unitActive]}><Text style={unit === value ? styles.white : undefined}>{value}</Text></Pressable>)}</View></View>
        </View>
        <DatePickerField value={expiryDate} onChange={setExpiryDate} />
        {expiryWarning && <Text style={[styles.expiryWarning, expiryWarning.level === "soon" ? styles.expirySoon : styles.expiryUrgent]}>{expiryWarning.label}</Text>}
        <LocationPicker value={location} onChange={setLocation} />
        {!!message && <Text style={message.includes("zapisane") ? styles.success : styles.error}>{message}</Text>}
        <Pressable disabled={busy} onPress={() => void save()} style={[styles.save, busy && styles.disabled]}><Text style={styles.white}>{busy ? "Zapisywanie..." : "Zapisz zmiany"}</Text></Pressable>
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Usuńiecie ze spiżarni</Text>
          <Text style={styles.muted}>Produkt zniknie ze stanu, ale pozostanie w katalogu Zapisane i w dotychczasowej historii.</Text>
          {confirmDelete ? <View style={styles.confirm}><Pressable disabled={busy} onPress={() => void remove()} style={styles.delete}><Text style={styles.white}>Tak, usuń produkt</Text></Pressable><Pressable onPress={() => setConfirmDelete(false)} style={styles.cancel}><Text>Anuluj</Text></Pressable></View> : <Pressable onPress={() => setConfirmDelete(true)} style={styles.deleteOutline}><Text style={styles.deleteText}>Usuń produkt ze spiżarni</Text></Pressable>}
        </View>
      </View>}
    </ScrollView>
  </ModuleScreen>;
}

function Field({ label, numeric, ...props }: { label: string; numeric?: boolean; value: string; onChangeText: (value: string) => void }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} keyboardType={numeric ? "decimal-pad" : "default"} style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 }, content: { flexGrow: 1, paddingBottom: 36 }, loading: { textAlign: "center", color: colors.muted, marginTop: 70 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 22, gap: 16 }, name: { fontSize: 27, fontWeight: "900" }, muted: { color: colors.muted, lineHeight: 20 },
  nutrition: { flexDirection: "row", flexWrap: "wrap", gap: 18, backgroundColor: colors.background, borderRadius: 12, padding: 14 }, micronutrients: { backgroundColor: colors.background, borderRadius: 12, padding: 14, gap: 5 }, sectionLabel: { fontWeight: "800" }, row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  field: { minWidth: 150, flex: 1, gap: 6 }, label: { fontWeight: "700" }, input: { backgroundColor: colors.background, borderRadius: 10, padding: 13, fontSize: 17 }, units: { flexDirection: "row", gap: 7 },
  unit: { backgroundColor: colors.background, padding: 13, borderRadius: 10 }, unitActive: { backgroundColor: colors.primary }, white: { color: "white", fontWeight: "800" },
  save: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 11, padding: 15 }, disabled: { opacity: 0.55 }, success: { color: colors.primary, fontWeight: "700" }, error: { color: colors.danger, fontWeight: "700" },
  expiryWarning: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontWeight: "900" }, expiryUrgent: { color: colors.danger, backgroundColor: "#FFEBEE" }, expirySoon: { color: "#8A4B00", backgroundColor: "#FFF3E0" },
  dangerZone: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 18, gap: 10 }, dangerTitle: { color: colors.danger, fontSize: 18, fontWeight: "900" },
  deleteOutline: { alignSelf: "flex-start", borderWidth: 2, borderColor: colors.danger, borderRadius: 10, padding: 13 }, deleteText: { color: colors.danger, fontWeight: "800" },
  confirm: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, delete: { backgroundColor: colors.danger, borderRadius: 10, padding: 13 }, cancel: { backgroundColor: colors.background, borderRadius: 10, padding: 13 }
});
