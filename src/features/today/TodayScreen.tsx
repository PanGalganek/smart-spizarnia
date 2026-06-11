import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import { DailySummary, Meal } from "@/domain/meal";
import { MealHistory } from "@/features/meals/MealHistory";
import { getDailySummary, listMeals } from "@/services/inventoryRepository";
import { dateKey } from "@/services/nutrition";

export function TodayScreen() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [summary, setSummary] = useState<DailySummary>({ dateKey: dateKey(), totals: {}, mealCount: 0, updatedAt: Date.now() });
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const day = dateKey();
      const [nextMeals, nextSummary] = await Promise.all([listMeals(day), getDailySummary(day)]);
      setMeals(nextMeals); setSummary(nextSummary); setError("");
    } catch { setError("Nie udalo sie pobrac dziennika dnia."); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  return (
    <ModuleScreen title="Dzisiaj">
      <View style={styles.page}>
        <View style={styles.summary}>
          <Text style={styles.date}>{new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}</Text>
          <Text style={styles.kcal}>{summary.totals.energyKcal ?? 0} kcal</Text>
          <Text style={styles.meals}>{summary.mealCount} posilkow</Text>
          <View style={styles.macros}><Macro label="Bialko" value={summary.totals.proteins} /><Macro label="Weglowodany" value={summary.totals.carbohydrates} /><Macro label="Tluszcz" value={summary.totals.fat} /></View>
          <Text style={styles.note}>Usuniecie posilku z przywroceniem skladnikow automatycznie koryguje podsumowanie.</Text>
        </View>
        <View style={styles.history}>{!!error && <Text style={styles.error}>{error}</Text>}<MealHistory meals={meals} onChanged={refresh} /></View>
      </View>
    </ModuleScreen>
  );
}

function Macro({ label, value }: { label: string; value?: number }) { return <View style={styles.macro}><Text style={styles.macroValue}>{value ?? 0} g</Text><Text style={styles.macroLabel}>{label}</Text></View>; }
const styles = StyleSheet.create({
  page: { flex: 1, flexDirection: "row", gap: 18 }, summary: { width: 280, backgroundColor: colors.surface, borderRadius: 20, padding: 22, gap: 12 }, date: { color: colors.muted, textTransform: "capitalize" }, kcal: { fontSize: 38, fontWeight: "900", color: colors.primary }, meals: { fontSize: 17, fontWeight: "700" },
  macros: { gap: 8 }, macro: { backgroundColor: colors.background, borderRadius: 12, padding: 12 }, macroValue: { fontSize: 19, fontWeight: "800" }, macroLabel: { color: colors.muted }, note: { color: colors.muted, fontSize: 12, lineHeight: 17 }, history: { flex: 1 }, error: { color: colors.danger, marginBottom: 8 }
});
