import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "@/core/theme";
import { DatePickerField } from "@/core/components/DatePickerField";
import { LocationPicker } from "@/core/components/LocationPicker";
import { ChemicalLevel, Nutrients, NutritionBasis, Product, ProductType, Unit } from "@/domain/product";
import { changePantryQuantity, saveChemicalPantryItem, saveProduct } from "@/services/inventoryRepository";
import { chemicalLevels, isChemical, withProductType } from "@/services/productTypes";

type Props = { barcode: string; onCancel: () => void; onSaved: (product: Product) => void; productType?: ProductType };
type NumericKey = "energyKcal" | "proteins" | "carbohydrates" | "fat" | "fiber" | "salt" | "packageAmount" | "quantity";

export function ManualProductForm({ barcode, onCancel, onSaved, productType = "food" }: Props) {
  const [manualBarcode, setManualBarcode] = useState(barcode);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [unit, setUnit] = useState<Unit>("g");
  const [basis, setBasis] = useState<NutritionBasis>("per100");
  const [packageUnit, setPackageUnit] = useState<Unit>("g");
  const [expiryDate, setExpiryDate] = useState("");
  const [location, setLocation] = useState("");
  const [chemicalLevel, setChemicalLevel] = useState<ChemicalLevel>("full");
  const [numbers, setNumbers] = useState<Record<NumericKey, string>>({
    quantity: "", packageAmount: "", energyKcal: "", proteins: "",
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
    if (!name.trim()) return setError("Nazwa produktu jest wymagana.");
    if (productType === "food" && kcal === undefined) return setError("Wpisz kalorie produktu. Bez nich produkt nie może trafić do posiłku.");
    if (basis === "perUnit" && unit !== "szt") return setError("Kalorie na sztukÄ™ wymagaja jednostki szt.");
    if (basis === "per100" && unit === "szt" && (!numberValue("packageAmount") || packageUnit === "szt")) return setError("Podaj jedno peĹ‚ne opakowanie w g albo ml, aby poprawnie liczyÄ‡ kalorie.");
    if ((numberValue("quantity") ?? 0) > 0 && !location.trim()) return setError("Dla produktu w spiĹĽarni wybierz lokalizacjÄ™. Data waĹĽnoĹ›ci jest opcjonalna.");

    const productCode = manualBarcode.trim() || `manual-${Date.now()}`;
    const packageAmount = numberValue("packageAmount");
    const product: Product = withProductType({
      barcode: productCode, name: name.trim(), ...(brand.trim() ? { brand: brand.trim() } : {}),
      ...(unit === "szt" && packageAmount && packageUnit !== "szt" ? { netWeightGrams: packageAmount } : {}),
      ...(packageAmount ? { packageAmount, packageUnit } : {}),
      defaultUnit: unit, nutritionBasis: basis,
      nutrientsPer100g: {
        energyKcal: kcal, proteins: numberValue("proteins"), carbohydrates: numberValue("carbohydrates"),
        fat: numberValue("fat"), fiber: numberValue("fiber"), salt: numberValue("salt")
      },
      source: "manual", updatedAt: Date.now()
    }, productType);

    try {
      setBusy(true); setError("");
      const quantity = numberValue("quantity") ?? 0;
      if (isChemical(product)) {
        await saveChemicalPantryItem(product, chemicalLevel, { location: location.trim() || undefined });
      } else if (quantity > 0) {
        await changePantryQuantity(product, quantity, unit, { expiryDate: expiryDate.trim() || undefined, location: location.trim() || undefined });
      } else await saveProduct(product);
      onSaved(product);
    } catch { setError("Nie udaĹ‚o siÄ™ zapisaÄ‡ produktu w Firebase."); }
    finally { setBusy(false); }
  }

  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Dodaj produkt rÄ™cznie</Text>
      <Field label="Kod kreskowy (opcjonalnie)" value={manualBarcode} onChangeText={setManualBarcode} numeric />
      <View style={styles.row}>
        <Field label="Nazwa produktu *" value={name} onChangeText={setName} />
        <Field label="Marka" value={brand} onChangeText={setBrand} />
        {productType === "food" && <Field label="IloĹ›Ä‡ poczÄ…tkowa" value={numbers.quantity} onChangeText={(v) => setNumber("quantity", v)} numeric />}
      </View>
      {productType === "food" ? <>
      <Text style={styles.section}>Jednostka stanu</Text><ChoiceRow values={["g", "ml", "szt"]} selected={unit} onSelect={(value) => { setUnit(value as Unit); setPackageUnit(value === "szt" ? "g" : value as Unit); if (value !== "szt") setBasis("per100"); }} />
      <View style={styles.row}>
        <DatePickerField value={expiryDate} onChange={setExpiryDate} />
        <LocationPicker value={location} onChange={setLocation} productType={productType} />
      </View>
      <Text style={styles.section}>Jedno peĹ‚ne opakowanie</Text>
      <Text style={styles.muted}>Np. serek 500 g, mleko 1000 ml albo jajko 1 szt. To pole sĹ‚uĹĽy do liczenia sztuk, paska zapasu i szybkiego zuĹĽycia caĹ‚ego opakowania.</Text>
      <View style={styles.row}><Field label="IloĹ›Ä‡ w opakowaniu" value={numbers.packageAmount} onChangeText={(v) => setNumber("packageAmount", v)} numeric /><View style={styles.field}><Text style={styles.label}>Jednostka opakowania</Text><ChoiceRow values={["g", "ml", "szt"]} selected={packageUnit} onSelect={(value) => setPackageUnit(value as Unit)} /></View></View>
      <Text style={styles.section}>SposĂłb liczenia</Text><ChoiceRow values={["per100", "perUnit"]} labels={["na 100 g/ml", "na sztukÄ™"]} selected={basis} onSelect={(value) => setBasis(value as NutritionBasis)} disabled={unit !== "szt"} />
      <Text style={styles.section}>WartoĹ›ci odĹĽywcze {basis === "perUnit" ? "na sztukÄ™" : "na 100 g/ml"}</Text>
      <View style={styles.row}>
        <Field label="kcal *" value={numbers.energyKcal} onChangeText={(v) => setNumber("energyKcal", v)} numeric />
        <Field label="BiaĹ‚ko (g)" value={numbers.proteins} onChangeText={(v) => setNumber("proteins", v)} numeric />
        <Field label="WÄ™glowodany (g)" value={numbers.carbohydrates} onChangeText={(v) => setNumber("carbohydrates", v)} numeric />
        <Field label="TĹ‚uszcz (g)" value={numbers.fat} onChangeText={(v) => setNumber("fat", v)} numeric />
      </View>
      </> : <>
        <LocationPicker value={location} onChange={setLocation} productType={productType} />
        <Text style={styles.section}>Poziom produktu chemicznego</Text>
        <View style={styles.levelGrid}>{chemicalLevels.map((level) => <Pressable key={level.value} onPress={() => setChemicalLevel(level.value)} style={[styles.levelButton, chemicalLevel === level.value && styles.levelActive]}><Text style={chemicalLevel === level.value ? styles.white : styles.choiceText}>{level.label}</Text></Pressable>)}</View>
      </>}
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
  levelGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  levelButton: { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: colors.border },
  levelActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12 }, cancel: { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 14 },
  save: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 14 }, white: { color: "white", fontWeight: "700" }, error: { color: colors.danger }, disabled: { opacity: 0.4 }
});
