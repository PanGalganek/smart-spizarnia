import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAppNavigation, useNavigationLayer } from "@/core/navigation/useAppNavigation";
import { colors } from "@/core/theme";
import { Meal } from "@/domain/meal";
import { deleteMeal, renameMeal } from "@/services/inventoryRepository";

type Props = { meals: Meal[]; onChanged: () => Promise<void> };
type DeleteMode = "restore" | "history";

export function MealHistory({ meals, onChanged }: Props) {
  const appNavigation = useAppNavigation();
  const actionLayer = useNavigationLayer("meal-history-action", "modal", { modal: "meal-history-action", mode: "meal-history-edit" });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectedMeal = actionLayer.open ? meals.find((meal) => meal.id === appNavigation.state.selectedId) ?? null : null;
  const editing = appNavigation.state.mode === "meal-history-edit" ? selectedMeal : null;
  const deleting = appNavigation.state.mode?.startsWith("meal-history-delete") ? selectedMeal : null;
  const deleteMode: DeleteMode = appNavigation.state.mode === "meal-history-delete-history" ? "history" : "restore";

  function startEditing(meal: Meal) {
    setName(meal.name);
    setMessage("");
    actionLayer.openLayer({ modal: "meal-history-action", mode: "meal-history-edit", selectedId: meal.id });
  }

  function startDeleting(meal: Meal, mode: DeleteMode) {
    setMessage("");
    actionLayer.openLayer({ modal: "meal-history-action", mode: mode === "history" ? "meal-history-delete-history" : "meal-history-delete-restore", selectedId: meal.id });
  }

  async function saveName() {
    if (!editing || !name.trim()) return;
    try {
      setBusy(true);
      await renameMeal(editing.id, name);
      actionLayer.closeLayer();
      await onChanged();
      setMessage("Nazwa posiłku została zmieniona.");
    } catch {
      setMessage("Nie udało się zmienić nazwy posiłku.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    try {
      setBusy(true);
      const restore = deleteMode === "restore";
      await deleteMeal(deleting, restore);
      actionLayer.closeLayer();
      await onChanged();
      setMessage(restore ? "Cofnięto posiłek i zwrócono produkty do spiżarni." : "Usunięto wpis z historii. Stan spiżarni nie został zmieniony.");
    } catch {
      setMessage("Nie udało się usunąć posiłku.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Historia posiłków</Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {!meals.length ? <Text style={styles.empty}>Nie zapisano jeszcze zadnego posiłku.</Text> : meals.map((item) => {
          const canRestore = item.ingredients.some((ingredient) => ingredient.tracksPantry !== false);
          return <View key={item.id} style={styles.card}>
            {editing?.id === item.id ? (
              <View style={styles.editRow}>
                <TextInput value={name} onChangeText={setName} style={styles.input} />
                <Pressable disabled={busy} onPress={() => void saveName()} style={styles.save}><Text style={styles.white}>Zapisz</Text></Pressable>
                <Pressable onPress={actionLayer.closeLayer} style={styles.cancel}><Text>Anuluj</Text></Pressable>
              </View>
            ) : (
              <View style={styles.header}>
                <View style={styles.heading}><Text style={styles.name}>{item.name}</Text><Text style={styles.date}>{formatDate(item.createdAt)}</Text></View>
                <Text style={styles.kcal}>{item.totals.energyKcal ?? 0} kcal</Text>
              </View>
            )}
            {(item.servings ?? 1) > 1 && <Text style={styles.portions}>Bilans: 1 z {item.servings} porcji | całe danie: {item.recipeTotals?.energyKcal ?? 0} kcal</Text>}
            <Text style={styles.nutrients}>B: {item.totals.proteins ?? 0} g   W: {item.totals.carbohydrates ?? 0} g   T: {item.totals.fat ?? 0} g</Text>
            {item.ingredients.map((ingredient) => <Text key={ingredient.barcode} style={styles.ingredient}>- {ingredient.productName}: {ingredient.amount} {ingredient.unit} | {ingredient.nutrients.energyKcal ?? 0} kcal</Text>)}
            {deleting?.id === item.id ? (
              <View style={styles.confirmBox}>
                <Text style={styles.confirmText}>{deleteMode === "restore" ? "Cofnąć posiłek i zwrócić wszystkie składniki?" : "Trwale usunąć wpis? Produkty nie wrócą do spiżarni."}</Text>
                <Pressable disabled={busy} onPress={() => void remove()} style={deleteMode === "restore" ? styles.restore : styles.delete}><Text style={styles.white}>{deleteMode === "restore" ? "Cofnij posiłek" : "Usuń wpis"}</Text></Pressable>
                <Pressable onPress={actionLayer.closeLayer} style={styles.cancel}><Text>Anuluj</Text></Pressable>
              </View>
            ) : (
              <View style={styles.actions}>
                <Pressable onPress={() => startEditing(item)} style={styles.cancel}><Text>Edytuj nazwę</Text></Pressable>
                {canRestore && <Pressable onPress={() => startDeleting(item, "restore")} style={styles.restore}><Text style={styles.white}>Cofnij</Text></Pressable>}
                <Pressable onPress={() => startDeleting(item, "history")} style={styles.delete}><Text style={styles.white}>Usuń wpis</Text></Pressable>
              </View>
            )}
          </View>;
        })}
    </View>
  );
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderRadius: 20, padding: 20 },
  title: { fontSize: 21, fontWeight: "800", marginBottom: 12 },
  message: { color: colors.primary, fontWeight: "600", marginBottom: 10 },
  card: { backgroundColor: colors.background, borderRadius: 14, padding: 16, marginBottom: 12, gap: 6 },
  header: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  heading: { flex: 1 }, name: { fontSize: 18, fontWeight: "800" }, date: { color: colors.muted, fontSize: 12 },
  kcal: { color: colors.primary, fontSize: 18, fontWeight: "800" }, portions: { color: colors.primary, fontWeight: "800" }, nutrients: { fontWeight: "600", marginTop: 4 }, ingredient: { color: colors.muted },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 8 }, editRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { flex: 1, backgroundColor: colors.surface, borderRadius: 9, padding: 10 },
  save: { backgroundColor: colors.primary, borderRadius: 9, paddingHorizontal: 14, justifyContent: "center" },
  cancel: { backgroundColor: colors.surface, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center" },
  delete: { backgroundColor: colors.danger, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center" },
  restore: { backgroundColor: colors.primary, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center" },
  white: { color: "white", fontWeight: "700" }, confirmBox: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 },
  confirmText: { width: "100%", fontWeight: "700" }, empty: { textAlign: "center", color: colors.muted, marginTop: 50 }
});
