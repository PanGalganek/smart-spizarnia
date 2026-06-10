import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import { Meal, MealIngredient } from "@/domain/meal";
import { Nutrients, PantryItem } from "@/domain/product";
import { MealHistory } from "@/features/meals/MealHistory";
import { createMeal, listMeals, listPantry } from "@/services/inventoryRepository";
import { calculateNutrients, sumNutrients } from "@/services/nutrition";

export function MealsScreen() {
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [view, setView] = useState<"creator" | "history">("creator");
  const [name, setName] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextPantry, nextMeals] = await Promise.all([listPantry(), listMeals()]);
      setPantry(nextPantry);
      setMeals(nextMeals);
    } catch {
      setMessage("Nie udalo sie pobrac stanu spizarni.");
    }
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const ingredients = useMemo(() => pantry.flatMap<MealIngredient>((item) => {
    const amount = parseAmount(amounts[item.barcode]);
    if (amount <= 0) return [];
    return [{
      barcode: item.barcode,
      productName: item.product.name,
      amount,
      unit: "szt",
      gramsPerUnit: item.product.netWeightGrams ?? 100,
      nutrients: calculateNutrients(item.product, amount)
    }];
  }), [amounts, pantry]);

  const totals = useMemo(() => sumNutrients(ingredients.map((item) => item.nutrients)), [ingredients]);

  async function saveMeal() {
    if (!name.trim()) {
      setMessage("Wpisz nazwe posilku.");
      return;
    }
    if (!ingredients.length) {
      setMessage("Dodaj przynajmniej jeden skladnik.");
      return;
    }

    const exceedsStock = ingredients.find((ingredient) => {
      const item = pantry.find((entry) => entry.barcode === ingredient.barcode);
      return !item || ingredient.amount > item.quantity;
    });
    if (exceedsStock) {
      setMessage(`Za malo produktu: ${exceedsStock.productName}.`);
      return;
    }

    try {
      setBusy(true);
      setMessage("");
      await createMeal(name.trim(), ingredients);
      setName("");
      setAmounts({});
      await refresh();
      setMessage("Posilek zapisany, a skladniki odjete ze spizarni.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udalo sie zapisac posilku.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModuleScreen title="Posilki">
      <View style={styles.tabs}>
        <Pressable onPress={() => setView("creator")} style={[styles.tab, view === "creator" && styles.activeTab]}><Text style={[styles.tabText, view === "creator" && styles.activeTabText]}>Kreator</Text></Pressable>
        <Pressable onPress={() => setView("history")} style={[styles.tab, view === "history" && styles.activeTab]}><Text style={[styles.tabText, view === "history" && styles.activeTabText]}>Historia ({meals.length})</Text></Pressable>
      </View>
      {view === "history" ? <MealHistory meals={meals} onChanged={refresh} /> : <View style={styles.layout}>
        <View style={styles.productsPanel}>
          <Text style={styles.panelTitle}>Produkty ze spizarni</Text>
          <FlatList
            data={pantry}
            keyExtractor={(item) => item.barcode}
            ListEmptyComponent={<Text style={styles.empty}>Najpierw dodaj produkty do spizarni.</Text>}
            renderItem={({ item }) => (
              <View style={styles.productRow}>
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{item.product.name}</Text>
                  <Text style={styles.muted}>Dostepne: {item.quantity} szt. | {item.product.netWeightGrams ?? 100} g/szt.</Text>
                </View>
                <TextInput
                  value={amounts[item.barcode] ?? ""}
                  onChangeText={(value) => setAmounts((current) => ({ ...current, [item.barcode]: value }))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  style={styles.amountInput}
                />
                <Text>szt.</Text>
              </View>
            )}
          />
        </View>

        <ScrollView style={styles.summaryPanel} contentContainerStyle={styles.summaryContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.panelTitle}>Nowy posilek</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Nazwa, np. Sniadanie" style={styles.nameInput} />
          <NutritionSummary totals={totals} />
          <Text style={styles.sectionTitle}>Skladniki ({ingredients.length})</Text>
          {ingredients.map((ingredient) => (
            <View key={ingredient.barcode} style={styles.ingredientRow}>
              <Text style={styles.ingredientName}>{ingredient.productName}</Text>
              <Text>{ingredient.amount} szt. | {ingredient.nutrients.energyKcal ?? 0} kcal</Text>
            </View>
          ))}
          {!!message && <Text style={message.startsWith("Posilek zapisany") ? styles.success : styles.error}>{message}</Text>}
          <Pressable disabled={busy} onPress={() => void saveMeal()} style={[styles.save, busy && styles.disabled]}>
            <Text style={styles.saveText}>{busy ? "Zapisywanie..." : "Zapisz posilek i odejmij skladniki"}</Text>
          </Pressable>
          <Text style={styles.note}>Gdy masa produktu nie jest znana, aplikacja przyjmuje 100 g na sztuke. Dokladna masa moze byc wpisana w produkcie recznym.</Text>
        </ScrollView>
      </View>}
    </ModuleScreen>
  );
}

function NutritionSummary({ totals }: { totals: Nutrients }) {
  const entries = [
    ["Kalorie", totals.energyKcal, "kcal"],
    ["Bialko", totals.proteins, "g"],
    ["Weglowodany", totals.carbohydrates, "g"],
    ["Tluszcz", totals.fat, "g"],
    ["Blonnik", totals.fiber, "g"],
    ["Sol", totals.salt, "g"]
  ];
  return <View style={styles.nutritionGrid}>{entries.map(([label, value, unit]) => <View key={String(label)} style={styles.nutritionCard}><Text style={styles.nutritionValue}>{value ?? 0}</Text><Text style={styles.muted}>{label} ({unit})</Text></View>)}</View>;
}

function parseAmount(value?: string) {
  const number = Number((value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : 0;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 8, marginBottom: 12 },
  tab: { backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 11 },
  activeTab: { backgroundColor: colors.primary },
  tabText: { fontWeight: "700", color: colors.text },
  activeTabText: { color: "white" },
  layout: { flex: 1, flexDirection: "row", gap: 18 },
  productsPanel: { flex: 1.1, backgroundColor: colors.surface, borderRadius: 20, padding: 20 },
  summaryPanel: { flex: 1, backgroundColor: colors.surface, borderRadius: 20 },
  summaryContent: { padding: 20, gap: 14 },
  panelTitle: { fontSize: 21, fontWeight: "800", marginBottom: 14, color: colors.text },
  productRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  productInfo: { flex: 1 },
  productName: { fontSize: 16, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 13 },
  amountInput: { width: 70, backgroundColor: colors.background, borderRadius: 10, padding: 11, textAlign: "center", fontSize: 16 },
  nameInput: { backgroundColor: colors.background, borderRadius: 12, padding: 14, fontSize: 17 },
  nutritionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  nutritionCard: { width: "31%", backgroundColor: colors.background, borderRadius: 12, padding: 12 },
  nutritionValue: { fontSize: 20, fontWeight: "800", color: colors.primary },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginTop: 4 },
  ingredientRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  ingredientName: { flex: 1, fontWeight: "600" },
  save: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 4 },
  saveText: { color: "white", fontWeight: "800" },
  disabled: { opacity: 0.6 },
  error: { color: colors.danger, fontWeight: "600" },
  success: { color: colors.primary, fontWeight: "600" },
  note: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  empty: { textAlign: "center", color: colors.muted, marginTop: 60 }
});
