import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ConsumerPicker } from "@/core/components/ConsumerPicker";
import { DatePickerField } from "@/core/components/DatePickerField";
import { LocationPicker } from "@/core/components/LocationPicker";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import { PantryItem, Unit } from "@/domain/product";
import { Consumer } from "@/domain/meal";
import { AddDepletedPrompt } from "@/features/shopping/AddDepletedPrompt";
import { getExpiryWarning } from "@/services/expiry";
import { changePantryQuantity, createMeal, deletePantryItem, getPantryItem, savePantryItem } from "@/services/inventoryRepository";
import { createMealIngredient } from "@/services/nutrition";
import { canUseWholePackage, convertPantryAmount } from "@/services/pantryUnits";
import { capacityForPackage } from "@/services/stockLevel";

export function PantryItemScreen() {
  const params = useLocalSearchParams<{ barcode: string | string[] }>();
  const barcode = Array.isArray(params.barcode) ? params.barcode[0] : params.barcode;
  const [item, setItem] = useState<PantryItem | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("g");
  const [expiryDate, setExpiryDate] = useState("");
  const [location, setLocation] = useState("");
  const [packageAmount, setPackageAmount] = useState("");
  const [packageUnit, setPackageUnit] = useState<Unit>("g");
  const [message, setMessage] = useState("Ladowanie produktu...");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [depleted, setDepleted] = useState(false);
  const [consumeOpen, setConsumeOpen] = useState(false);
  const [consumeAmount, setConsumeAmount] = useState("1");
  const [consumeUnit, setConsumeUnit] = useState<Unit>("szt");
  const [consumer, setConsumer] = useState<Consumer>({ id: "bartek", name: "Bartek" });
  const expiryWarning = getExpiryWarning(expiryDate);

  useEffect(() => {
    if (!barcode) return setMessage("Brak kodu produktu.");
    void getPantryItem(barcode).then((found) => {
      if (!found) return setMessage("Tego produktu nie ma już w spiżarni.");
      setItem(found); setQuantity(String(found.quantity)); setUnit(found.unit);
      setPackageAmount(found.product.packageAmount ? String(found.product.packageAmount) : "");
      setPackageUnit(found.product.packageUnit ?? found.unit);
      setExpiryDate(found.expiryDate ?? ""); setLocation(found.location ?? ""); setMessage("");
    }).catch(() => setMessage("Nie udało się pobrać produktu."));
  }, [barcode]);

  async function save() {
    if (!item) return;
    const nextQuantity = Number(quantity.replace(",", "."));
    const nextPackageAmount = packageAmount.trim() ? Number(packageAmount.replace(",", ".")) : undefined;
    if (!Number.isFinite(nextQuantity) || nextQuantity < 0) return setMessage("Ilość musi byc liczba nie mniejsza od zera.");
    if (nextPackageAmount !== undefined && (!Number.isFinite(nextPackageAmount) || nextPackageAmount <= 0)) return setMessage("Pojemność opakowania musi być większa od zera.");
    try {
      setBusy(true); setMessage("");
      const product = { ...item.product, packageAmount: nextPackageAmount, packageUnit: nextPackageAmount ? packageUnit : undefined, netWeightGrams: packageUnit === "g" ? nextPackageAmount : item.product.netWeightGrams, updatedAt: Date.now() };
      const draft = { ...item, product, quantity: nextQuantity, unit, expiryDate: expiryDate.trim() || undefined, location: location.trim() || undefined, status: nextQuantity === 0 ? "consumed" as const : "active" as const };
      const next = { ...draft, capacity: capacityForPackage(draft, nextPackageAmount, nextPackageAmount ? packageUnit : undefined) };
      await savePantryItem(next); setItem(next); setMessage("Zmiany zostały zapisane.");
      if (item.quantity > 0 && nextQuantity === 0) setDepleted(true);
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

  function openConsumption() {
    if (!item) return;
    setConsumeUnit(canUseWholePackage(item.product) ? "szt" : item.unit);
    setConsumeAmount(canUseWholePackage(item.product) ? "1" : String(item.quantity));
    setMessage(""); setConsumeOpen(true);
  }

  function pantryAmount() {
    if (!item) return 0;
    const value = Number(consumeAmount.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) throw new Error("Wpisz prawidłową ilość.");
    return convertPantryAmount(item.product, value, consumeUnit, item.unit);
  }

  async function consume(withCalories: boolean) {
    if (!item) return;
    try {
      setBusy(true); setMessage("");
      const amount = pantryAmount();
      if (amount > item.quantity) throw new Error(`W spiżarni jest tylko ${item.quantity} ${item.unit}.`);
      if (withCalories) {
        const ingredient = createMealIngredient(item, amount);
        await createMeal(`Zużycie: ${item.product.name}`, "snack", [ingredient], 1, Date.now(), consumer);
      } else {
        await changePantryQuantity(item.product, -Number(consumeAmount.replace(",", ".")), consumeUnit);
      }
      const refreshed = await getPantryItem(item.barcode);
      if (refreshed) { setItem(refreshed); setQuantity(String(refreshed.quantity)); if (refreshed.quantity === 0) setDepleted(true); }
      setConsumeOpen(false);
      setMessage(withCalories ? `Odjęto produkt i doliczono kalorie osobie ${consumer.name}.` : "Odjęto produkt ze stanu bez naliczania kalorii.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Nie udało się zużyć produktu."); }
    finally { setBusy(false); }
  }

  return <ModuleScreen title="Produkt">
    <AddDepletedPrompt products={depleted && item ? [item.product] : []} onClose={() => setDepleted(false)} onAdded={() => setMessage("Produkt dodano do listy zakupów.")} />
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
        <View style={styles.packageBox}>
          <Text style={styles.sectionLabel}>Pojemność jednego pełnego opakowania</Text>
          <Text style={styles.muted}>Na tej podstawie aplikacja wylicza procent zapasu. Przykład: mleko 1000 ml.</Text>
          <View style={styles.row}><Field label="Gramatura / objętość" value={packageAmount} onChangeText={setPackageAmount} numeric /><View style={styles.field}><Text style={styles.label}>Jednostka opakowania</Text><View style={styles.units}>{(["g", "ml", "szt"] as Unit[]).map((value) => <Pressable key={value} onPress={() => setPackageUnit(value)} style={[styles.unit, packageUnit === value && styles.unitActive]}><Text style={packageUnit === value ? styles.white : undefined}>{value}</Text></Pressable>)}</View></View></View>
        </View>
        <DatePickerField value={expiryDate} onChange={setExpiryDate} />
        {expiryWarning && <Text style={[styles.expiryWarning, expiryWarning.level === "soon" ? styles.expirySoon : styles.expiryUrgent]}>{expiryWarning.label}</Text>}
        <LocationPicker value={location} onChange={setLocation} />
        {!!message && <Text style={message.includes("zapisane") ? styles.success : styles.error}>{message}</Text>}
        <Pressable disabled={busy} onPress={() => void save()} style={[styles.save, busy && styles.disabled]}><Text style={styles.white}>{busy ? "Zapisywanie..." : "Zapisz zmiany"}</Text></Pressable>
        {item.quantity > 0 && <Pressable disabled={busy} onPress={openConsumption} style={styles.consumeButton}><Text style={styles.white}>Zużyj produkt</Text></Pressable>}
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Usunięcie ze spiżarni</Text>
          <Text style={styles.muted}>Produkt zniknie ze stanu, ale pozostanie w katalogu Zapisane i w dotychczasowej historii.</Text>
          {confirmDelete ? <View style={styles.confirm}><Pressable disabled={busy} onPress={() => void remove()} style={styles.delete}><Text style={styles.white}>Tak, usuń produkt</Text></Pressable><Pressable onPress={() => setConfirmDelete(false)} style={styles.cancel}><Text>Anuluj</Text></Pressable></View> : <Pressable onPress={() => setConfirmDelete(true)} style={styles.deleteOutline}><Text style={styles.deleteText}>Usuń produkt ze spiżarni</Text></Pressable>}
        </View>
      </View>}
    </ScrollView>
    <Modal visible={consumeOpen} transparent animationType="fade" onRequestClose={() => setConsumeOpen(false)}><View style={styles.backdrop}><View style={styles.consumeCard}>
      <View style={styles.consumeHeader}><Text style={styles.consumeTitle}>Zużyj: {item?.product.name}</Text><Pressable onPress={() => setConsumeOpen(false)}><Text style={styles.muted}>Zamknij</Text></Pressable></View>
      {item && canUseWholePackage(item.product) && <Pressable onPress={() => { setConsumeAmount("1"); setConsumeUnit("szt"); }} style={styles.wholePackage}><Text style={styles.wholePackageText}>Całe opakowanie: 1 szt. ({item.product.packageAmount} {item.product.packageUnit})</Text></Pressable>}
      <View style={styles.consumeAmountRow}><TextInput value={consumeAmount} onChangeText={setConsumeAmount} keyboardType="decimal-pad" style={styles.consumeInput} />{(["g", "ml", "szt"] as Unit[]).map((value) => <Pressable key={value} onPress={() => setConsumeUnit(value)} style={[styles.unit, consumeUnit === value && styles.unitActive]}><Text style={consumeUnit === value ? styles.white : undefined}>{value}</Text></Pressable>)}</View>
      <ConsumerPicker value={consumer} onChange={setConsumer} label="Jeśli to jedzenie, dolicz dla" />
      <Pressable disabled={busy} onPress={() => void consume(true)} style={styles.eatButton}><Text style={styles.white}>Zjedz i dolicz kalorie</Text></Pressable>
      <Pressable disabled={busy} onPress={() => void consume(false)} style={styles.useButton}><Text style={styles.white}>Zużyj bez kalorii</Text></Pressable>
      <Text style={styles.muted}>Tryb bez kalorii służy także do artykułów domowych i chemii gospodarczej.</Text>
    </View></View></Modal>
  </ModuleScreen>;
}

function Field({ label, numeric, ...props }: { label: string; numeric?: boolean; value: string; onChangeText: (value: string) => void }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} keyboardType={numeric ? "decimal-pad" : "default"} style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 }, content: { flexGrow: 1, paddingBottom: 36 }, loading: { textAlign: "center", color: colors.muted, marginTop: 70 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 22, gap: 16 }, name: { fontSize: 27, fontWeight: "900" }, muted: { color: colors.muted, lineHeight: 20 },
  nutrition: { flexDirection: "row", flexWrap: "wrap", gap: 18, backgroundColor: colors.background, borderRadius: 12, padding: 14 }, micronutrients: { backgroundColor: colors.background, borderRadius: 12, padding: 14, gap: 5 }, packageBox: { backgroundColor: colors.background, borderRadius: 12, padding: 14, gap: 10 }, sectionLabel: { fontWeight: "800" }, row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  field: { minWidth: 150, flex: 1, gap: 6 }, label: { fontWeight: "700" }, input: { backgroundColor: colors.background, borderRadius: 10, padding: 13, fontSize: 17 }, units: { flexDirection: "row", gap: 7 },
  unit: { backgroundColor: colors.background, padding: 13, borderRadius: 10 }, unitActive: { backgroundColor: colors.primary }, white: { color: "white", fontWeight: "800" },
  save: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 11, padding: 15 }, consumeButton: { alignItems: "center", backgroundColor: "#EF6C00", borderRadius: 11, padding: 15 }, disabled: { opacity: 0.55 }, success: { color: colors.primary, fontWeight: "700" }, error: { color: colors.danger, fontWeight: "700" },
  expiryWarning: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontWeight: "900" }, expiryUrgent: { color: colors.danger, backgroundColor: "#FFEBEE" }, expirySoon: { color: "#8A4B00", backgroundColor: "#FFF3E0" },
  dangerZone: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 18, gap: 10 }, dangerTitle: { color: colors.danger, fontSize: 18, fontWeight: "900" },
  deleteOutline: { alignSelf: "flex-start", borderWidth: 2, borderColor: colors.danger, borderRadius: 10, padding: 13 }, deleteText: { color: colors.danger, fontWeight: "800" },
  confirm: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, delete: { backgroundColor: colors.danger, borderRadius: 10, padding: 13 }, cancel: { backgroundColor: colors.background, borderRadius: 10, padding: 13 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "center", padding: 16 }, consumeCard: { width: "100%", maxWidth: 560, backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 14 }, consumeHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }, consumeTitle: { flex: 1, fontSize: 22, fontWeight: "900" }, wholePackage: { backgroundColor: "#E8F5E9", borderWidth: 1, borderColor: colors.primary, borderRadius: 11, padding: 12 }, wholePackageText: { color: colors.primary, fontWeight: "800" }, consumeAmountRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, consumeInput: { flex: 1, minWidth: 100, backgroundColor: colors.background, borderRadius: 10, padding: 13, fontSize: 18 }, eatButton: { backgroundColor: colors.primary, borderRadius: 11, padding: 14, alignItems: "center" }, useButton: { backgroundColor: "#1565C0", borderRadius: 11, padding: 14, alignItems: "center" }
});
