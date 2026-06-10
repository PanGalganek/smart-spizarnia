import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "@/core/theme";
import { Nutrients, Product } from "@/domain/product";
import { saveProduct } from "@/services/inventoryRepository";

type Props = {
  barcode: string;
  onCancel: () => void;
  onSaved: (product: Product) => void;
};

type NumericKey = keyof Nutrients | "netWeightGrams";

export function ManualProductForm({ barcode, onCancel, onSaved }: Props) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [numbers, setNumbers] = useState<Record<NumericKey, string>>({
    netWeightGrams: "",
    energyKcal: "",
    proteins: "",
    carbohydrates: "",
    fat: "",
    fiber: "",
    salt: ""
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
    if (!barcode.trim() || !name.trim()) {
      setError("Kod kreskowy i nazwa produktu sa wymagane.");
      return;
    }

    const product: Product = {
      barcode: barcode.trim(),
      name: name.trim(),
      ...(brand.trim() ? { brand: brand.trim() } : {}),
      ...(numberValue("netWeightGrams") ? { netWeightGrams: numberValue("netWeightGrams") } : {}),
      nutrientsPer100g: {
        energyKcal: numberValue("energyKcal"),
        proteins: numberValue("proteins"),
        carbohydrates: numberValue("carbohydrates"),
        fat: numberValue("fat"),
        fiber: numberValue("fiber"),
        salt: numberValue("salt")
      },
      source: "manual",
      updatedAt: Date.now()
    };

    try {
      setBusy(true);
      setError("");
      await saveProduct(product);
      onSaved(product);
    } catch {
      setError("Nie udalo sie zapisac produktu w Firebase.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Dodaj produkt recznie</Text>
      <Text style={styles.barcode}>Kod: {barcode}</Text>
      <View style={styles.row}>
        <Field label="Nazwa produktu *" value={name} onChangeText={setName} />
        <Field label="Marka" value={brand} onChangeText={setBrand} />
        <Field label="Masa 1 sztuki (g)" value={numbers.netWeightGrams} onChangeText={(value) => setNumber("netWeightGrams", value)} numeric />
      </View>
      <Text style={styles.section}>Wartosci na 100 g</Text>
      <View style={styles.row}>
        <Field label="kcal" value={numbers.energyKcal} onChangeText={(value) => setNumber("energyKcal", value)} numeric />
        <Field label="Bialko (g)" value={numbers.proteins} onChangeText={(value) => setNumber("proteins", value)} numeric />
        <Field label="Weglowodany (g)" value={numbers.carbohydrates} onChangeText={(value) => setNumber("carbohydrates", value)} numeric />
        <Field label="Tluszcz (g)" value={numbers.fat} onChangeText={(value) => setNumber("fat", value)} numeric />
        <Field label="Blonnik (g)" value={numbers.fiber} onChangeText={(value) => setNumber("fiber", value)} numeric />
        <Field label="Sol (g)" value={numbers.salt} onChangeText={(value) => setNumber("salt", value)} numeric />
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.actions}>
        <Pressable onPress={onCancel} style={styles.cancel}><Text>Anuluj</Text></Pressable>
        <Pressable disabled={busy} onPress={() => void submit()} style={styles.save}><Text style={styles.white}>{busy ? "Zapisywanie..." : "Zapisz produkt"}</Text></Pressable>
      </View>
    </ScrollView>
  );
}

function Field({ label, numeric, ...props }: { label: string; numeric?: boolean; value: string; onChangeText: (value: string) => void }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} keyboardType={numeric ? "decimal-pad" : "default"} style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  form: { backgroundColor: colors.surface, padding: 24, borderRadius: 20, gap: 14 },
  title: { fontSize: 24, fontWeight: "800", color: colors.text },
  barcode: { color: colors.muted },
  section: { fontSize: 18, fontWeight: "700", marginTop: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  field: { minWidth: 170, flex: 1, gap: 6 },
  label: { fontWeight: "600", color: colors.text },
  input: { backgroundColor: colors.background, borderRadius: 10, padding: 12, fontSize: 16 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
  cancel: { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 14 },
  save: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 14 },
  white: { color: "white", fontWeight: "700" },
  error: { color: colors.danger }
});
