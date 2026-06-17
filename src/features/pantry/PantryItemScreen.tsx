import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { DatePickerField } from "@/core/components/DatePickerField";
import { LocationPicker } from "@/core/components/LocationPicker";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import { PantryItem, Unit } from "@/domain/product";
import { AddDepletedPrompt } from "@/features/shopping/AddDepletedPrompt";
import { getExpiryWarning } from "@/services/expiry";
import { changePantryQuantity, deletePantryItem, getPantryItem, savePantryItem } from "@/services/inventoryRepository";
import { packageSummary } from "@/services/pantryPackages";
import { shouldAskToBuyAgain } from "@/services/shoppingPrompt";

export function PantryItemScreen() {
  const params = useLocalSearchParams<{ barcode: string | string[] }>();
  const barcode = Array.isArray(params.barcode) ? params.barcode[0] : params.barcode;
  const [item, setItem] = useState<PantryItem | null>(null);
  const [expiryDate, setExpiryDate] = useState("");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("Ładowanie produktu...");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shoppingPromptItems, setShoppingPromptItems] = useState<PantryItem["product"][]>([]);
  const [consumeOpen, setConsumeOpen] = useState(false);
  const [consumeAmount, setConsumeAmount] = useState("1");
  const itemRef = useRef<PantryItem | null>(null);
  const metadataQueue = useRef(Promise.resolve());
  const expiryWarning = getExpiryWarning(expiryDate);
  const summary = item ? packageSummary(item) : null;
  const quickAmount = item?.product.quickUseAmount ?? (item?.product.packageAmount ? 1 : undefined);
  const quickUnit = item?.product.quickUseUnit ?? (item?.product.packageAmount ? "szt" : undefined);

  useEffect(() => {
    if (!barcode) return setMessage("Brak kodu produktu.");
    void getPantryItem(barcode).then((found) => {
      if (!found) return setMessage("Tego produktu nie ma już w spiżarni.");
      itemRef.current = found;
      setItem(found);
      setExpiryDate(found.expiryDate ?? "");
      setLocation(found.location ?? "");
      setMessage("");
    }).catch(() => setMessage("Nie udało się pobrać produktu."));
  }, [barcode]);

  function saveMetadata(patch: Pick<PantryItem, "expiryDate"> | Pick<PantryItem, "location">, successMessage: string) {
    const current = itemRef.current;
    if (!current) return;
    const next = { ...current, ...patch };
    itemRef.current = next;
    setItem(next);
    setMessage("Zapisywanie...");
    metadataQueue.current = metadataQueue.current
      .then(() => savePantryItem(next))
      .then(() => setMessage(successMessage))
      .catch(() => setMessage("Nie udało się zapisać zmiany."));
  }

  function changeExpiryDate(value: string) {
    setExpiryDate(value);
    saveMetadata({ expiryDate: value.trim() || undefined }, value ? "Data ważności została zapisana." : "Data ważności została usunięta.");
  }

  function changeLocation(value: string) {
    setLocation(value);
    saveMetadata({ location: value.trim() || undefined }, value ? "Lokalizacja została zapisana." : "Usunięto przypisanie lokalizacji.");
  }

  async function remove() {
    if (!barcode) return;
    try {
      setBusy(true);
      await deletePantryItem(barcode);
      router.replace("/pantry");
    } catch {
      setMessage("Nie udało się usunąć produktu ze spiżarni.");
      setBusy(false);
    }
  }

  function openConsumption() {
    if (!item) return;
    setConsumeAmount("");
    setMessage("");
    setConsumeOpen(true);
  }

  async function consumeSelected(amount: number, unit: Unit) {
    if (!item) return;
    try {
      setBusy(true);
      setMessage("");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Wpisz prawidłową ilość.");
      await changePantryQuantity(item.product, -amount, unit);
      const refreshed = await getPantryItem(item.barcode);
      if (refreshed) {
        itemRef.current = refreshed;
        setItem(refreshed);
        if (shouldAskToBuyAgain(item, refreshed)) setShoppingPromptItems([refreshed.product]);
      }
      setConsumeOpen(false);
      setMessage(`Zużyto ${amount} ${unit}. Pozostało: ${refreshed?.quantity ?? 0} ${refreshed?.unit ?? item.unit}.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Nie udało się zużyć produktu.");
    } finally {
      setBusy(false);
    }
  }

  async function consume() {
    await consumeSelected(Number(consumeAmount.replace(",", ".")), item?.unit ?? "szt");
  }

  return <ModuleScreen title="Produkt">
    <AddDepletedPrompt products={shoppingPromptItems} onClose={() => setShoppingPromptItems([])} onAdded={() => setMessage("Produkt dodano do listy zakupów.")} />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {!item ? <Text style={styles.loading}>{message}</Text> : <View style={styles.card}>
        <Text style={styles.name}>{item.product.name}</Text>
        <Text style={styles.muted}>{item.product.brand || "Brak marki"} | kod: {item.barcode}</Text>
        <View style={styles.nutrition}><Text>{item.product.nutrientsPer100g.energyKcal ?? "-"} kcal</Text><Text>B: {item.product.nutrientsPer100g.proteins ?? "-"} g</Text><Text>W: {item.product.nutrientsPer100g.carbohydrates ?? "-"} g</Text><Text>T: {item.product.nutrientsPer100g.fat ?? "-"} g</Text></View>
        <View style={styles.micronutrients}><Text style={styles.sectionLabel}>Mikroelementy na 100 g/ml</Text><Text style={styles.muted}>Potas: {item.product.nutrientsPer100g.potassium ?? "-"} mg | Wapń: {item.product.nutrientsPer100g.calcium ?? "-"} mg | Żelazo: {item.product.nutrientsPer100g.iron ?? "-"} mg | Magnez: {item.product.nutrientsPer100g.magnesium ?? "-"} mg | Wit. C: {item.product.nutrientsPer100g.vitaminC ?? "-"} mg</Text></View>
        <View style={styles.stockInfo}><Text style={styles.stockLabel}>Stan w spiżarni</Text><Text style={styles.stockValue}>{summary?.text ?? `${item.quantity} ${item.unit}`}</Text></View>
        {!!summary?.openText && <Text style={styles.packageLine}>Otwarte: {summary.openText}</Text>}
        {!!summary?.closedText && <Text style={styles.packageLine}>Zamknięte: {summary.closedText}</Text>}
        <DatePickerField value={expiryDate} onChange={changeExpiryDate} />
        {expiryWarning && <Text style={[styles.expiryWarning, expiryWarning.level === "soon" ? styles.expirySoon : styles.expiryUrgent]}>{expiryWarning.label}</Text>}
        <LocationPicker value={location} onChange={changeLocation} />
        {!!message && <Text style={message.startsWith("Nie") ? styles.error : styles.success}>{message}</Text>}
        {item.quantity > 0 && <View style={styles.consumeActions}>
          {quickAmount && quickUnit && <Pressable disabled={busy} onPress={() => void consumeSelected(quickAmount, quickUnit)} style={[styles.quickButton, busy && styles.disabled]}><Text style={styles.white}>Szybko zużyj: {quickAmount} {quickUnit}</Text></Pressable>}
          <Pressable disabled={busy} onPress={openConsumption} style={[styles.consumeButton, busy && styles.disabled]}><Text style={styles.white}>Zużyj inną ilość</Text></Pressable>
        </View>}
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Usunięcie ze spiżarni</Text>
          <Text style={styles.muted}>Produkt zniknie ze stanu, ale pozostanie w katalogu Zapisane i w dotychczasowej historii.</Text>
          {confirmDelete ? <View style={styles.confirm}><Pressable disabled={busy} onPress={() => void remove()} style={styles.delete}><Text style={styles.white}>Tak, usuń produkt</Text></Pressable><Pressable onPress={() => setConfirmDelete(false)} style={styles.cancel}><Text>Anuluj</Text></Pressable></View> : <Pressable onPress={() => setConfirmDelete(true)} style={styles.deleteOutline}><Text style={styles.deleteText}>Usuń produkt ze spiżarni</Text></Pressable>}
        </View>
      </View>}
    </ScrollView>
    <Modal visible={consumeOpen} transparent animationType="fade" onRequestClose={() => setConsumeOpen(false)}><View style={styles.backdrop}><View style={styles.consumeCard}>
      <View style={styles.consumeHeader}><Text style={styles.consumeTitle}>Zużyj: {item?.product.name}</Text><Pressable onPress={() => setConsumeOpen(false)}><Text style={styles.muted}>Zamknij</Text></Pressable></View>
      <Text style={styles.muted}>Dostępne: {summary?.text ?? `${item?.quantity ?? 0} ${item?.unit ?? ""}`}</Text>
      <View style={styles.consumeAmountRow}><TextInput autoFocus value={consumeAmount} onChangeText={setConsumeAmount} keyboardType="decimal-pad" placeholder="Wpisz zużytą ilość" style={styles.consumeInput} /><Text style={styles.consumeUnit}>{item?.unit}</Text></View>
      <Pressable disabled={busy} onPress={() => void consume()} style={[styles.useButton, busy && styles.disabled]}><Text style={styles.white}>{busy ? "Zapisywanie..." : "Potwierdź zużycie"}</Text></Pressable>
    </View></View></Modal>
  </ModuleScreen>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 }, content: { flexGrow: 1, paddingBottom: 36 }, loading: { textAlign: "center", color: colors.muted, marginTop: 70 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 22, gap: 16 }, name: { fontSize: 27, fontWeight: "900" }, muted: { color: colors.muted, lineHeight: 20 },
  nutrition: { flexDirection: "row", flexWrap: "wrap", gap: 18, backgroundColor: colors.background, borderRadius: 12, padding: 14 }, micronutrients: { backgroundColor: colors.background, borderRadius: 12, padding: 14, gap: 5 }, sectionLabel: { fontWeight: "800" },
  stockInfo: { gap: 7, backgroundColor: colors.background, borderRadius: 12, padding: 15 }, stockLabel: { fontWeight: "800" }, stockValue: { color: colors.primary, fontSize: 22, fontWeight: "900" }, packageLine: { color: colors.muted, fontWeight: "800" }, white: { color: "white", fontWeight: "800" },
  consumeActions: { gap: 10 }, quickButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 11, padding: 15 }, consumeButton: { alignItems: "center", backgroundColor: "#EF6C00", borderRadius: 11, padding: 15 }, disabled: { opacity: 0.55 }, success: { color: colors.primary, fontWeight: "700" }, error: { color: colors.danger, fontWeight: "700" },
  expiryWarning: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontWeight: "900" }, expiryUrgent: { color: colors.danger, backgroundColor: "#FFEBEE" }, expirySoon: { color: "#8A4B00", backgroundColor: "#FFF3E0" },
  dangerZone: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 18, gap: 10 }, dangerTitle: { color: colors.danger, fontSize: 18, fontWeight: "900" },
  deleteOutline: { alignSelf: "flex-start", borderWidth: 2, borderColor: colors.danger, borderRadius: 10, padding: 13 }, deleteText: { color: colors.danger, fontWeight: "800" },
  confirm: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, delete: { backgroundColor: colors.danger, borderRadius: 10, padding: 13 }, cancel: { backgroundColor: colors.background, borderRadius: 10, padding: 13 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "center", padding: 16 }, consumeCard: { width: "100%", maxWidth: 560, backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 14 }, consumeHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }, consumeTitle: { flex: 1, fontSize: 22, fontWeight: "900" }, consumeAmountRow: { flexDirection: "row", alignItems: "center", gap: 10 }, consumeInput: { flex: 1, minWidth: 100, backgroundColor: colors.background, borderRadius: 10, padding: 13, fontSize: 18 }, consumeUnit: { fontSize: 18, fontWeight: "900" }, useButton: { backgroundColor: "#1565C0", borderRadius: 11, padding: 14, alignItems: "center" }
});
