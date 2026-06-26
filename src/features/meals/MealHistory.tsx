import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAppNavigation, useNavigationLayer } from "@/core/navigation/useAppNavigation";
import { colors } from "@/core/theme";
import { Meal } from "@/domain/meal";
import { deleteMeal, renameMeal } from "@/services/inventoryRepository";

type Props = { meals: Meal[]; onChanged: () => Promise<void>; onCreateTemplate: (meal: Meal) => Promise<void> };
type DeleteMode = "restore" | "history";

export function MealHistory({ meals, onChanged, onCreateTemplate }: Props) {
  const appNavigation = useAppNavigation();
  const listLayer = useNavigationLayer("meal-history-list", "modal", { modal: "meal-history-list", mode: "meal-history-list" });
  const actionLayer = useNavigationLayer("meal-history-action", "modal", { modal: "meal-history-action", mode: "meal-history-edit" });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [templateBusyId, setTemplateBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const selectedMeal = actionLayer.open ? meals.find((meal) => meal.id === appNavigation.state.selectedId) ?? null : null;
  const editing = appNavigation.state.mode === "meal-history-edit" ? selectedMeal : null;
  const deleting = appNavigation.state.mode?.startsWith("meal-history-delete") ? selectedMeal : null;
  const deleteMode: DeleteMode = appNavigation.state.mode === "meal-history-delete-history" ? "history" : "restore";
  const visibleMeals = meals.filter((meal) => meal.name.toLocaleLowerCase("pl-PL").includes(search.trim().toLocaleLowerCase("pl-PL")));

  function openList() {
    setSearch("");
    setMessage("");
    listLayer.openLayer();
  }

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

  async function saveAsTemplate(meal: Meal) {
    try {
      setTemplateBusyId(meal.id);
      await onCreateTemplate(meal);
      setMessage("Posiłek zapisano jako szablon.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się zapisać szablonu.");
    } finally {
      setTemplateBusyId(null);
    }
  }

  return <>
    <View style={styles.panel}>
      <View style={styles.heading}><Text style={styles.title}>Historia posiłków</Text><Text style={styles.count}>{meals.length}</Text></View>
      {!meals.length ? <Text style={styles.empty}>Nie zapisano jeszcze posiłku dla wybranego profilu.</Text> : <Pressable onPress={openList} style={styles.openButton}><Text style={styles.openButtonText}>Otwórz historię posiłków ({meals.length})</Text></Pressable>}
    </View>

    <Modal visible={listLayer.open} transparent animationType="fade" onRequestClose={listLayer.closeLayer}>
      <View style={styles.backdrop}><View style={styles.modalCard}>
        <View style={styles.heading}><Text style={styles.modalTitle}>Historia posiłków</Text><Text style={styles.count}>{meals.length}</Text></View>
        <TextInput value={search} onChangeText={setSearch} placeholder="Szukaj posiłku..." style={styles.searchInput} />
        {!!message && <Text style={styles.message}>{message}</Text>}
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          {!visibleMeals.length ? <Text style={styles.empty}>Nie znaleziono posiłku.</Text> : visibleMeals.map((item) => <MealCard
            key={item.id}
            meal={item}
            editing={editing?.id === item.id}
            deleting={deleting?.id === item.id}
            deleteMode={deleteMode}
            name={name}
            busy={busy}
            templateBusy={templateBusyId === item.id}
            onNameChange={setName}
            onSaveName={() => void saveName()}
            onCancelAction={actionLayer.closeLayer}
            onStartEditing={() => startEditing(item)}
            onStartDeleting={(mode) => startDeleting(item, mode)}
            onRemove={() => void remove()}
            onSaveTemplate={() => void saveAsTemplate(item)}
          />)}
        </ScrollView>
        <View style={styles.modalActions}><Pressable onPress={listLayer.closeLayer} style={styles.cancel}><Text>Zamknij</Text></Pressable></View>
      </View></View>
    </Modal>
  </>;
}

function MealCard({ meal, editing, deleting, deleteMode, name, busy, templateBusy, onNameChange, onSaveName, onCancelAction, onStartEditing, onStartDeleting, onRemove, onSaveTemplate }: {
  meal: Meal;
  editing: boolean;
  deleting: boolean;
  deleteMode: DeleteMode;
  name: string;
  busy: boolean;
  templateBusy: boolean;
  onNameChange: (value: string) => void;
  onSaveName: () => void;
  onCancelAction: () => void;
  onStartEditing: () => void;
  onStartDeleting: (mode: DeleteMode) => void;
  onRemove: () => void;
  onSaveTemplate: () => void;
}) {
  const canRestore = meal.ingredients.some((ingredient) => ingredient.tracksPantry !== false);
  const canSaveTemplate = meal.ingredients.length > 0 && meal.ingredients.every((ingredient) => ingredient.tracksPantry !== false);
  return <View style={styles.card}>
    {editing ? <View style={styles.editRow}><TextInput value={name} onChangeText={onNameChange} style={styles.input} /><Pressable disabled={busy} onPress={onSaveName} style={styles.save}><Text style={styles.white}>Zapisz</Text></Pressable><Pressable onPress={onCancelAction} style={styles.cancel}><Text>Anuluj</Text></Pressable></View> : <View style={styles.cardHeader}><View style={styles.cardHeading}><Text style={styles.name}>{meal.name}</Text><Text style={styles.date}>{formatDate(meal.createdAt)}</Text></View><Text style={styles.kcal}>{meal.totals.energyKcal ?? 0} kcal</Text></View>}
    {(meal.servings ?? 1) > 1 && <Text style={styles.portions}>Bilans: 1 z {meal.servings} porcji | całe danie: {meal.recipeTotals?.energyKcal ?? 0} kcal</Text>}
    <Text style={styles.nutrients}>B: {meal.totals.proteins ?? 0} g   W: {meal.totals.carbohydrates ?? 0} g   T: {meal.totals.fat ?? 0} g</Text>
    {meal.ingredients.map((ingredient) => <Text key={ingredient.barcode} style={styles.ingredient}>- {ingredient.productName}: {ingredient.amount} {ingredient.unit} | {ingredient.nutrients.energyKcal ?? 0} kcal</Text>)}
    {deleting ? <View style={styles.confirm}><Text style={styles.confirmText}>{deleteMode === "restore" ? "Cofnąć posiłek i zwrócić wszystkie składniki?" : "Trwale usunąć wpis? Produkty nie wrócą do spiżarni."}</Text><View style={styles.actions}><Pressable disabled={busy} onPress={onRemove} style={deleteMode === "restore" ? styles.restore : styles.delete}><Text style={styles.white}>{deleteMode === "restore" ? "Cofnij posiłek" : "Usuń wpis"}</Text></Pressable><Pressable onPress={onCancelAction} style={styles.cancel}><Text>Anuluj</Text></Pressable></View></View> : <View style={styles.actions}>{canSaveTemplate && <Pressable disabled={templateBusy} onPress={onSaveTemplate} style={[styles.template, templateBusy && styles.disabled]}><Text style={styles.white}>{templateBusy ? "Zapisywanie..." : "Zapisz jako szablon"}</Text></Pressable>}<Pressable onPress={onStartEditing} style={styles.cancel}><Text>Edytuj nazwę</Text></Pressable>{canRestore && <Pressable onPress={() => onStartDeleting("restore")} style={styles.restore}><Text style={styles.white}>Cofnij</Text></Pressable>}<Pressable onPress={() => onStartDeleting("history")} style={styles.delete}><Text style={styles.white}>Usuń wpis</Text></Pressable></View>}
  </View>;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderRadius: 18, padding: 15, marginBottom: 12, gap: 12 },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  title: { fontSize: 20, fontWeight: "900", color: colors.text },
  modalTitle: { fontSize: 23, fontWeight: "900", color: colors.text },
  count: { color: colors.primary, fontSize: 20, fontWeight: "900" },
  empty: { color: colors.muted, lineHeight: 20, paddingVertical: 6 },
  openButton: { minHeight: 48, backgroundColor: colors.primary, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  openButtonText: { color: "white", fontWeight: "900" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "center", padding: 12 },
  modalCard: { width: "100%", maxWidth: 720, maxHeight: "92%", backgroundColor: colors.surface, borderRadius: 20, padding: 18, gap: 14 },
  searchInput: { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, color: colors.text, fontSize: 16 },
  message: { color: colors.primary, backgroundColor: "#E8F5E9", borderRadius: 10, padding: 11, fontWeight: "800" },
  modalScroll: { flexGrow: 0 },
  modalContent: { gap: 10, paddingBottom: 4 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  card: { backgroundColor: colors.background, borderRadius: 14, padding: 14, gap: 6 },
  cardHeader: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  cardHeading: { flex: 1, minWidth: 120 },
  name: { fontSize: 18, fontWeight: "900", color: colors.text },
  date: { color: colors.muted, fontSize: 12 },
  kcal: { color: colors.primary, fontSize: 18, fontWeight: "900" },
  portions: { color: colors.primary, fontWeight: "800" },
  nutrients: { color: colors.text, fontWeight: "700", marginTop: 4 },
  ingredient: { color: colors.muted },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  editRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { flex: 1, minWidth: 150, backgroundColor: colors.surface, borderRadius: 9, padding: 10, color: colors.text },
  save: { backgroundColor: colors.primary, borderRadius: 9, paddingHorizontal: 14, justifyContent: "center" },
  cancel: { backgroundColor: colors.surface, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center" },
  delete: { backgroundColor: colors.danger, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center" },
  restore: { backgroundColor: colors.primary, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center" },
  template: { backgroundColor: "#6A1B9A", borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center" },
  white: { color: "white", fontWeight: "800" },
  confirm: { gap: 8, marginTop: 8 },
  confirmText: { color: colors.text, fontWeight: "800", lineHeight: 20 },
  disabled: { opacity: 0.55 }
});
