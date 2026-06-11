import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "@/core/theme";
import { Meal } from "@/domain/meal";
import { deleteMeal, renameMeal } from "@/services/inventoryRepository";

type Props = { meals: Meal[]; onChanged: () => Promise<void> };
type DeleteMode = "restore" | "history";

export function MealHistory({ meals, onChanged }: Props) {
  const [editing, setEditing] = useState<Meal | null>(null);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<Meal | null>(null);
  const [deleteMode, setDeleteMode] = useState<DeleteMode>("restore");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function startEditing(meal: Meal) {
    setEditing(meal);
    setName(meal.name);
    setDeleting(null);
    setMessage("");
  }

  async function saveName() {
    if (!editing || !name.trim()) return;
    try {
      setBusy(true);
      await renameMeal(editing.id, name);
      setEditing(null);
      await onChanged();
      setMessage("Nazwa posilku zostala zmieniona.");
    } catch {
      setMessage("Nie udalo sie zmienic nazwy posilku.");
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
      setDeleting(null);
      await onChanged();
      setMessage(restore ? "Cofnieto posilek i zwrocono produkty do spizarni." : "Usunieto wpis z historii. Stan spizarni nie zostal zmieniony.");
    } catch {
      setMessage("Nie udalo sie usunac posilku.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Historia posilkow</Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
      <FlatList
        data={meals}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>Nie zapisano jeszcze zadnego posilku.</Text>}
        renderItem={({ item }) => {
          const canRestore = item.ingredients.some((ingredient) => ingredient.tracksPantry !== false);
          return <View style={styles.card}>
            {editing?.id === item.id ? (
              <View style={styles.editRow}>
                <TextInput value={name} onChangeText={setName} style={styles.input} />
                <Pressable disabled={busy} onPress={() => void saveName()} style={styles.save}><Text style={styles.white}>Zapisz</Text></Pressable>
                <Pressable onPress={() => setEditing(null)} style={styles.cancel}><Text>Anuluj</Text></Pressable>
              </View>
            ) : (
              <View style={styles.header}>
                <View style={styles.heading}><Text style={styles.name}>{item.name}</Text><Text style={styles.date}>{formatDate(item.createdAt)}</Text></View>
                <Text style={styles.kcal}>{item.totals.energyKcal ?? 0} kcal</Text>
              </View>
            )}
            <Text style={styles.nutrients}>B: {item.totals.proteins ?? 0} g   W: {item.totals.carbohydrates ?? 0} g   T: {item.totals.fat ?? 0} g</Text>
            {item.ingredients.map((ingredient) => <Text key={ingredient.barcode} style={styles.ingredient}>- {ingredient.productName}: {ingredient.amount} {ingredient.unit} | {ingredient.nutrients.energyKcal ?? 0} kcal</Text>)}
            {deleting?.id === item.id ? (
              <View style={styles.confirmBox}>
                <Text style={styles.confirmText}>{deleteMode === "restore" ? "Cofnac posilek i zwrocic wszystkie skladniki?" : "Trwale usunac wpis? Produkty nie wroca do spizarni."}</Text>
                <Pressable disabled={busy} onPress={() => void remove()} style={deleteMode === "restore" ? styles.restore : styles.delete}><Text style={styles.white}>{deleteMode === "restore" ? "Cofnij posilek" : "Usun wpis"}</Text></Pressable>
                <Pressable onPress={() => setDeleting(null)} style={styles.cancel}><Text>Anuluj</Text></Pressable>
              </View>
            ) : (
              <View style={styles.actions}>
                <Pressable onPress={() => startEditing(item)} style={styles.cancel}><Text>Edytuj nazwe</Text></Pressable>
                {canRestore && <Pressable onPress={() => { setDeleting(item); setDeleteMode("restore"); setEditing(null); }} style={styles.restore}><Text style={styles.white}>Cofnij</Text></Pressable>}
                <Pressable onPress={() => { setDeleting(item); setDeleteMode("history"); setEditing(null); }} style={styles.delete}><Text style={styles.white}>Usun wpis</Text></Pressable>
              </View>
            )}
          </View>;
        }}
      />
    </View>
  );
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

const styles = StyleSheet.create({
  panel: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, padding: 20 },
  title: { fontSize: 21, fontWeight: "800", marginBottom: 12 },
  message: { color: colors.primary, fontWeight: "600", marginBottom: 10 },
  card: { backgroundColor: colors.background, borderRadius: 14, padding: 16, marginBottom: 12, gap: 6 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  heading: { flex: 1 }, name: { fontSize: 18, fontWeight: "800" }, date: { color: colors.muted, fontSize: 12 },
  kcal: { color: colors.primary, fontSize: 18, fontWeight: "800" }, nutrients: { fontWeight: "600", marginTop: 4 }, ingredient: { color: colors.muted },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 }, editRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, backgroundColor: colors.surface, borderRadius: 9, padding: 10 },
  save: { backgroundColor: colors.primary, borderRadius: 9, paddingHorizontal: 14, justifyContent: "center" },
  cancel: { backgroundColor: colors.surface, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center" },
  delete: { backgroundColor: colors.danger, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center" },
  restore: { backgroundColor: colors.primary, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center" },
  white: { color: "white", fontWeight: "700" }, confirmBox: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 },
  confirmText: { width: "100%", fontWeight: "700" }, empty: { textAlign: "center", color: colors.muted, marginTop: 50 }
});
