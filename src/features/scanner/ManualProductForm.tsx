import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "@/core/theme";
import { Nutrients, NutritionBasis, Product, Unit } from "@/domain/product";
import { savePantryItem, saveProduct } from "@/services/inventoryRepository";

type Props = { barcode: string; onCancel: () => void; onSaved: (product: Product) => void };
type NumericKey = keyof Nutrients | "netWeightGrams" | "quantity";

export function ManualProductForm({ barcode, onCancel, onSaved }: Props) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [unit, setUnit] = useState<Unit>("g");
  const [basis, setBasis] = useState<NutritionBasis>("per100");
  const [expiryDate, setExpiryDate] = useState("");
  const [location, setLocation] = useState("");
  const [numbers, setNumbers] = useState<Record<NumericKey, string>>({
    quantity: "", netWeightGrams: "", energyKcal: "", proteins: "",
    carbohydrates: "", fat: "", fiber: "", salt: ""
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function setNumber(key: NumericKey, value: string) {
    setNumbers((current) => ({ ...current, [key]: value }));
  }

  function numberValue(key: NumericKey) {
    const value = Number(numbers[key].replace(",", "."));
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }

  async function submit() {
    const kcal = numberValue("energyKcal");
    if (!barcode.trim() || !name.trim()) return setError("Kod kreskowy i nazwa produktu sa wymagane.");
    if (kcal === undefined) return setError("Wpisz kalorie produktu. Bez nich produkt nie moze trafic do posilku.");
    if (basis === "perUnit" && unit !== "szt") return setError("Kalorie na sztuke wymagaja jednostki szt.");
    if (basis === "per100" && unit === "szt" && !numberValue("netWeightGrams")) return setError("Podaj mase jednej sztuki, aby poprawnie liczyc kalorie.");
    if ((numberValue("quantity") ?? 0) > 0 && (!expiryDate.trim() || !location.trim())) return setError("Dla produktu w spizarni podaj date waznosci i lokalizacje.");

    const product: Product = {
      barcode: barcode.trim(), name: name.trim(), ...(brand.trim() ? { brand: brand.trim() } : {}),
      ...(numberValue("netWeightGrams") ? { netWeightGrams: numberValue("netWeightGrams") } : {}),
      defaultUnit: unit, nutritionBasis: basis,
      nutrientsPer100g: {
        energyKcal: kcal, proteins: numberValue("proteins"), carbohydrates: numberValue("carbohydrates"),
        fat: numberValue("fat"), fiber: numberValue("fiber"), salt: numberValue("salt")
      },
      source: "manual", updatedAt: Date.now()
    };

    try {
      setBusy(true); setError("");
      const quantity = numberValue("quantity") ?? 0;
      if (quantity > 0) {
        await savePantryItem({ barcode: product.barcode, product, quantity, unit, expiryDate: expiryDate.trim() || undefined, location: location.trim() || undefined, status: "active" });
      } else await saveProduct(product);
      onSaved(product);
    } catch { setError("Nie udalo sie zapisac produktu w Firebase."); }
    finally { setBusy(false); }
  }

  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Dodaj produkt recznie</Text><Text style={styles.muted}>Kod: {barcode}</Text>
      <View style={styles.row}>
        <Field label="Nazwa produktu *" value={name} onChangeText={setName} />
        <Field label="Marka" value={brand} onChangeText={setBrand} />
        <Field label="Ilosc poczatkowa" value={numbers.quantity} onChangeText={(v) => setNumber("quantity", v)} numeric />
      </View>
      <Text style={styles.section}>Jednostka stanu</Text><ChoiceRow values={["g", "ml", "szt"]} selected={unit} onSelect={(value) => { setUnit(value as Unit); if (value !== "szt") setBasis("per100"); }} />
      <View style={styles.row}>
        <Field label="Data waznosci (RRRR-MM-DD)" value={expiryDate} onChangeText={setExpiryDate} />
        <Field label="Lokalizacja" value={location} onChangeText={setLocation} />
        {unit === "szt" && <Field label="Masa 1 sztuki (g)" value={numbers.netWeightGrams} onChangeText={(v) => setNumber("netWeightGrams", v)} numeric />}
      </View>
      <Text style={styles.section}>Sposob liczenia</Text><ChoiceRow values={["per100", "perUnit"]} labels={["na 100 g/ml", "na sztuke"]} selected={basis} onSelect={(value) => setBasis(value as NutritionBasis)} disabled={unit !== "szt"} />
      <Text style={styles.section}>Wartosci odzywcze {basis === "perUnit" ? "na sztuke" : "na 100 g/ml"}</Text>
      <View style={styles.row}>
        <Field label="kcal *" value={numbers.energyKcal} onChangeText={(v) => setNumber("energyKcal", v)} numeric />
        <Field label="Bialko (g)" value={numbers.proteins} onChangeText={(v) => setNumber("proteins", v)} numeric />
        <Field label="Weglowodany (g)" value={numbers.carbohydrates} onChangeText={(v) => setNumber("carbohydrates", v)} numeric />
        <Field label="Tluszcz (g)" value={numbers.fat} onChangeText={(v) => setNumber("fat", v)} numeric />
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.actions}><Pressable onPress={onCancel} style={styles.cancel}><Text>Anuluj</Text></Pressable><Pressable disabled={busy} onPress={() => void submit()} style={styles.save}><Text style={styles.white}>{busy ? "Zapisywanie..." : "Zapisz produkt"}</Text></Pressable></View>
    </ScrollView>
  );
}

function ChoiceRow({ values, labels, selected, onSelect, disabled }: { values: string[]; labels?: string[]; selected: string; onSelect: (value: string) => void; disabled?: boolean }) {
  return <View style={styles.choices}>{values.map((value, index) => <Pressable key={value} disabled={disabled && value === "perUnit"} onPress={() => onSelect(value)} style={[styles.choice, selected === value && styles.choiceActive, disabled && value === "perUnit" && styles.disabled]}><Text style={selected === value ? styles.white : styles.choiceText}>{labels?.[index] ?? value}</Text></Pressable>)}</View>;
}

function Field({ label, numeric, ...props }: { label: string; numeric?: boolean; value: string; onChangeText: (value: string) => void }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} keyboardType={numeric ? "decimal-pad" : "default"} style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  form: { backgroundColor: colors.surface, padding: 24, borderRadius: 20, gap: 14 }, title: { fontSize: 24, fontWeight: "800" }, muted: { color: colors.muted },
  section: { fontSize: 17, fontWeight: "700", marginTop: 4 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, field: { minWidth: 170, flex: 1, gap: 6 },
  label: { fontWeight: "600" }, input: { backgroundColor: colors.background, borderRadius: 10, padding: 12, fontSize: 16 }, choices: { flexDirection: "row", gap: 8 },
  choice: { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11 }, choiceActive: { backgroundColor: colors.primary }, choiceText: { color: colors.text },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12 }, cancel: { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 14 },
  save: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 14 }, white: { color: "white", fontWeight: "700" }, error: { color: colors.danger }, disabled: { opacity: 0.4 }
});
