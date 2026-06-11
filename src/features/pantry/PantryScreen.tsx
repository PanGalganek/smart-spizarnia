import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { DatePickerField, formatPolishDate } from "@/core/components/DatePickerField";
import { LocationPicker } from "@/core/components/LocationPicker";
import { colors } from "@/core/theme";
import { PantryItem, Unit } from "@/domain/product";
import { listPantry, savePantryItem } from "@/services/inventoryRepository";

export function PantryScreen() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [editing, setEditing] = useState<PantryItem | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("g");
  const [expiryDate, setExpiryDate] = useState("");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try { setItems(await listPantry(true)); }
    catch { setMessage("Nie udalo sie pobrac stanu spizarni."); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  function startEdit(item: PantryItem) {
    setEditing(item); setQuantity(String(item.quantity)); setUnit(item.unit);
    setExpiryDate(item.expiryDate ?? ""); setLocation(item.location ?? ""); setMessage("");
  }

  async function save() {
    if (!editing) return;
    const nextQuantity = Number(quantity.replace(",", "."));
    if (!Number.isFinite(nextQuantity) || nextQuantity < 0) return setMessage("Ilosc musi byc liczba nie mniejsza od zera.");
    try {
      await savePantryItem({
        ...editing, quantity: nextQuantity, unit, expiryDate: expiryDate.trim() || undefined,
        location: location.trim() || undefined, status: nextQuantity === 0 ? "consumed" : "active"
      });
      setEditing(null); setMessage("Stan produktu zostal zapisany."); await refresh();
    } catch { setMessage("Nie udalo sie zapisac produktu."); }
  }

  return (
    <ModuleScreen title="Spizarnia">
      {!!message && <Text style={styles.message}>{message}</Text>}
      <FlatList data={items} keyExtractor={(item) => item.barcode} ListEmptyComponent={<Text style={styles.empty}>Spizarnia jest pusta.</Text>} renderItem={({ item }) => (
        <View style={[styles.card, item.quantity === 0 && styles.consumed]}>
          {editing?.barcode === item.barcode ? (
            <View style={styles.editor}>
              <Text style={styles.name}>{item.product.name}</Text>
              <View style={styles.row}>
                <Field label="Ilosc" value={quantity} onChangeText={setQuantity} numeric />
                <View style={styles.field}><Text style={styles.label}>Jednostka</Text><View style={styles.units}>{(["g", "ml", "szt"] as Unit[]).map((value) => <Pressable key={value} onPress={() => setUnit(value)} style={[styles.unit, unit === value && styles.unitActive]}><Text style={unit === value ? styles.white : undefined}>{value}</Text></Pressable>)}</View></View>
                <DatePickerField value={expiryDate} onChange={setExpiryDate} />
                <LocationPicker value={location} onChange={setLocation} />
              </View>
              <View style={styles.actions}><Pressable onPress={() => setEditing(null)} style={styles.cancel}><Text>Anuluj</Text></Pressable><Pressable onPress={() => void save()} style={styles.save}><Text style={styles.white}>Zapisz</Text></Pressable></View>
            </View>
          ) : (
            <>
              <View style={styles.header}><View style={{ flex: 1 }}><Text style={styles.name}>{item.product.name}</Text><Text style={styles.muted}>{item.barcode} | {item.location || "brak lokalizacji"}</Text></View><Text style={styles.qty}>{item.quantity} {item.unit}</Text></View>
              <View style={styles.meta}><Text>{item.expiryDate ? `Wazne do: ${formatPolishDate(item.expiryDate)}` : "Brak daty waznosci"}</Text><Text style={item.quantity === 0 ? styles.used : styles.active}>{item.quantity === 0 ? "ZUZYTY" : "AKTYWNY"}</Text></View>
              <Pressable onPress={() => startEdit(item)} style={styles.edit}><Text>Edytuj stan i dane</Text></Pressable>
            </>
          )}
        </View>
      )} />
    </ModuleScreen>
  );
}

function Field({ label, numeric, ...props }: { label: string; numeric?: boolean; value: string; onChangeText: (value: string) => void }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} keyboardType={numeric ? "decimal-pad" : "default"} style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 18, marginBottom: 12, gap: 10 }, consumed: { opacity: 0.65 }, header: { flexDirection: "row", justifyContent: "space-between" },
  name: { fontWeight: "800", fontSize: 18 }, muted: { color: colors.muted }, qty: { fontWeight: "800", fontSize: 22, color: colors.primary }, meta: { flexDirection: "row", justifyContent: "space-between" },
  active: { color: colors.primary, fontWeight: "800" }, used: { color: colors.danger, fontWeight: "800" }, edit: { alignSelf: "flex-start", backgroundColor: colors.background, padding: 10, borderRadius: 9 },
  editor: { gap: 12 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, field: { minWidth: 150, flex: 1, gap: 5 }, label: { fontWeight: "600" },
  input: { backgroundColor: colors.background, padding: 11, borderRadius: 9 }, units: { flexDirection: "row", gap: 5 }, unit: { backgroundColor: colors.background, padding: 11, borderRadius: 9 }, unitActive: { backgroundColor: colors.primary },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 }, cancel: { backgroundColor: colors.background, padding: 12, borderRadius: 9 }, save: { backgroundColor: colors.primary, padding: 12, borderRadius: 9 }, white: { color: "white", fontWeight: "700" },
  message: { color: colors.primary, textAlign: "center", marginBottom: 10, fontWeight: "600" }, empty: { textAlign: "center", color: colors.muted, marginTop: 80 }
});
