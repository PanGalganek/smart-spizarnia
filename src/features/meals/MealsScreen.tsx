import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import { Meal, MealIngredient, MealType } from "@/domain/meal";
import { Nutrients, PantryItem } from "@/domain/product";
import { MealHistory } from "@/features/meals/MealHistory";
import { createMeal, listMeals, listPantry } from "@/services/inventoryRepository";
import { createMealIngredient, sumNutrients } from "@/services/nutrition";

const mealTypes: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Sniadanie" }, { value: "lunch", label: "Obiad" },
  { value: "dinner", label: "Kolacja" }, { value: "snack", label: "Przekaska" }, { value: "custom", label: "Wlasna" }
];

export function MealsScreen() {
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [view, setView] = useState<"creator" | "history">("creator");
  const [type, setType] = useState<MealType>("breakfast");
  const [customName, setCustomName] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextPantry, nextMeals] = await Promise.all([listPantry(), listMeals()]);
      setPantry(nextPantry); setMeals(nextMeals);
    } catch { setMessage("Nie udalo sie pobrac danych."); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const ingredientResult = useMemo(() => {
    const ingredients: MealIngredient[] = [];
    let error = "";
    for (const item of pantry) {
      const amount = parseAmount(amounts[item.barcode]);
      if (amount <= 0) continue;
      try { ingredients.push(createMealIngredient(item, amount)); }
      catch (cause) { error = cause instanceof Error ? cause.message : "Nieprawidlowa ilosc."; }
    }
    return { ingredients, error };
  }, [amounts, pantry]);
  const totals = useMemo(() => sumNutrients(ingredientResult.ingredients.map((item) => item.nutrients)), [ingredientResult.ingredients]);
  const mealName = type === "custom" ? customName.trim() : mealTypes.find((item) => item.value === type)?.label ?? "Posilek";

  async function saveMeal() {
    if (!mealName) return setMessage("Wpisz nazwe posilku.");
    if (ingredientResult.error) return setMessage(ingredientResult.error);
    if (!ingredientResult.ingredients.length) return setMessage("Dodaj przynajmniej jeden skladnik.");
    try {
      setBusy(true); setMessage("");
      await createMeal(mealName, type, ingredientResult.ingredients);
      setAmounts({}); setCustomName(""); await refresh();
      setMessage("Posilek zapisany. Produkty zostaly odjete ze spizarni.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Nie udalo sie zapisac posilku."); }
    finally { setBusy(false); }
  }

  return (
    <ModuleScreen title="Posilki">
      <View style={styles.tabs}><Tab label="Kreator" active={view === "creator"} onPress={() => setView("creator")} /><Tab label={`Historia (${meals.length})`} active={view === "history"} onPress={() => setView("history")} /></View>
      {view === "history" ? <MealHistory meals={meals} onChanged={refresh} /> : (
        <View style={styles.layout}>
          <View style={styles.productsPanel}>
            <Text style={styles.panelTitle}>Produkty ze spizarni</Text>
            <FlatList data={pantry} keyExtractor={(item) => item.barcode} ListEmptyComponent={<Text style={styles.empty}>Najpierw dodaj produkty do spizarni.</Text>} renderItem={({ item }) => (
              <View style={styles.productRow}>
                <View style={styles.productInfo}><Text style={styles.productName}>{item.product.name}</Text><Text style={styles.muted}>Dostepne: {item.quantity} {item.unit}</Text></View>
                <TextInput value={amounts[item.barcode] ?? ""} onChangeText={(value) => setAmounts((current) => ({ ...current, [item.barcode]: value }))} keyboardType="decimal-pad" placeholder="0" style={styles.amountInput} />
                <Text style={styles.unit}>{item.unit}</Text>
              </View>
            )} />
          </View>
          <ScrollView style={styles.summaryPanel} contentContainerStyle={styles.summaryContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.panelTitle}>Nowy posilek</Text>
            <View style={styles.typeRow}>{mealTypes.map((item) => <Pressable key={item.value} onPress={() => setType(item.value)} style={[styles.type, type === item.value && styles.typeActive]}><Text style={type === item.value ? styles.white : undefined}>{item.label}</Text></Pressable>)}</View>
            {type === "custom" && <TextInput value={customName} onChangeText={setCustomName} placeholder="Wlasna nazwa posilku" style={styles.nameInput} />}
            <NutritionSummary totals={totals} />
            <Text style={styles.sectionTitle}>Skladniki ({ingredientResult.ingredients.length})</Text>
            {ingredientResult.ingredients.map((ingredient) => <View key={ingredient.barcode} style={styles.ingredientRow}><Text style={styles.ingredientName}>{ingredient.productName}</Text><Text>{ingredient.amount} {ingredient.unit} | {ingredient.nutrients.energyKcal ?? 0} kcal</Text></View>)}
            {!!ingredientResult.error && <Text style={styles.error}>{ingredientResult.error}</Text>}
            {!!message && <Text style={message.startsWith("Posilek zapisany") ? styles.success : styles.error}>{message}</Text>}
            <Pressable disabled={busy} onPress={() => void saveMeal()} style={[styles.save, busy && styles.disabled]}><Text style={styles.saveText}>{busy ? "Zapisywanie..." : "Zapisz i odejmij skladniki"}</Text></Pressable>
          </ScrollView>
        </View>
      )}
    </ModuleScreen>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.tab, active && styles.activeTab]}><Text style={[styles.tabText, active && styles.white]}>{label}</Text></Pressable>; }
function NutritionSummary({ totals }: { totals: Nutrients }) {
  const entries = [["Kalorie", totals.energyKcal, "kcal"], ["Bialko", totals.proteins, "g"], ["Weglowodany", totals.carbohydrates, "g"], ["Tluszcz", totals.fat, "g"]];
  return <View style={styles.nutritionGrid}>{entries.map(([label, value, unit]) => <View key={String(label)} style={styles.nutritionCard}><Text style={styles.nutritionValue}>{value ?? 0}</Text><Text style={styles.muted}>{label} ({unit})</Text></View>)}</View>;
}
function parseAmount(value?: string) { const number = Number((value ?? "").replace(",", ".")); return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : 0; }

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 8, marginBottom: 12 }, tab: { backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 11 }, activeTab: { backgroundColor: colors.primary }, tabText: { fontWeight: "700" }, white: { color: "white", fontWeight: "700" },
  layout: { flex: 1, flexDirection: "row", gap: 18 }, productsPanel: { flex: 1.1, backgroundColor: colors.surface, borderRadius: 20, padding: 20 }, summaryPanel: { flex: 1, backgroundColor: colors.surface, borderRadius: 20 }, summaryContent: { padding: 20, gap: 14 }, panelTitle: { fontSize: 21, fontWeight: "800", marginBottom: 10 },
  productRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }, productInfo: { flex: 1 }, productName: { fontSize: 16, fontWeight: "700" }, muted: { color: colors.muted, fontSize: 13 }, amountInput: { width: 80, backgroundColor: colors.background, borderRadius: 10, padding: 11, textAlign: "center", fontSize: 16 }, unit: { width: 28, fontWeight: "700" },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, type: { backgroundColor: colors.background, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 10 }, typeActive: { backgroundColor: colors.primary }, nameInput: { backgroundColor: colors.background, borderRadius: 12, padding: 14, fontSize: 17 },
  nutritionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, nutritionCard: { width: "48%", backgroundColor: colors.background, borderRadius: 12, padding: 12 }, nutritionValue: { fontSize: 20, fontWeight: "800", color: colors.primary }, sectionTitle: { fontSize: 17, fontWeight: "700" }, ingredientRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 }, ingredientName: { flex: 1, fontWeight: "600" },
  save: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center" }, saveText: { color: "white", fontWeight: "800" }, disabled: { opacity: 0.6 }, error: { color: colors.danger, fontWeight: "600" }, success: { color: colors.primary, fontWeight: "600" }, empty: { textAlign: "center", color: colors.muted, marginTop: 60 }
});
