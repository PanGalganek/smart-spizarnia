import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "@/core/theme";
import { addLocation, listLocations, removeLocation } from "@/services/locationRepository";

type Props = { value: string; onChange: (value: string) => void; label?: string };

export function LocationPicker({ value, onChange, label = "Lokalizacja" }: Props) {
  const [locations, setLocations] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLocation, setNewLocation] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { void listLocations().then(setLocations); }, []);

  async function add() {
    const name = newLocation.trim();
    if (!name) return setMessage("Wpisz nazwe nowej lokalizacji.");
    try {
      setLocations(await addLocation(name));
      onChange(name);
      setNewLocation("");
      setAdding(false);
      setPickerOpen(false);
      setMessage(`Dodano lokalizacje: ${name}.`);
    } catch { setMessage("Nie udalo sie dodac lokalizacji."); }
  }

  async function remove() {
    if (!value) return setMessage("Najpierw wybierz lokalizacje do usuniecia.");
    try {
      const removed = value;
      setLocations(await removeLocation(value));
      onChange("");
      setMessage(`Usunieto lokalizacje: ${removed}.`);
    } catch { setMessage("Nie udalo sie usunac lokalizacji."); }
  }

  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <Pressable onPress={() => { setPickerOpen(true); setMessage(""); }} style={styles.select}>
      <Text style={value ? styles.value : styles.placeholder}>{value || "Wybierz lokalizacje"}</Text>
      <Text style={styles.arrow}>v</Text>
    </Pressable>
    <View style={styles.actions}>
      <Pressable onPress={() => { setAdding((current) => !current); setMessage(""); }} style={styles.manage}><Text style={styles.manageText}>+ Dodaj lokalizacje</Text></Pressable>
      <Pressable disabled={!value} onPress={() => void remove()} style={[styles.remove, !value && styles.disabled]}><Text style={styles.removeText}>- Usun wybrana</Text></Pressable>
    </View>
    {adding && <View style={styles.addPanel}><TextInput autoFocus value={newLocation} onChangeText={setNewLocation} placeholder="Nowa lokalizacja" style={styles.input} /><Pressable onPress={() => void add()} style={styles.add}><Text style={styles.white}>Dodaj</Text></Pressable></View>}
    {!!message && <Text style={styles.message}>{message}</Text>}

    <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <View style={styles.dialogHeader}><Text style={styles.dialogTitle}>Wybierz lokalizacje</Text><Pressable onPress={() => setPickerOpen(false)} style={styles.close}><Text style={styles.closeText}>Zamknij</Text></Pressable></View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {!locations.length ? <Text style={styles.empty}>Brak lokalizacji. Dodaj pierwsza lokalizacje.</Text> : locations.map((item) => <Pressable key={item} onPress={() => { onChange(item); setPickerOpen(false); setMessage(""); }} style={[styles.option, value === item && styles.optionActive]}><Text style={[styles.optionText, value === item && styles.white]}>{item}</Text>{value === item && <Text style={styles.white}>Wybrana</Text>}</Pressable>)}
          </ScrollView>
          <Pressable onPress={() => { onChange(""); setPickerOpen(false); }} style={styles.noLocation}><Text style={styles.removeText}>Bez lokalizacji</Text></Pressable>
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  field: { width: "100%", gap: 9 }, label: { fontWeight: "700", fontSize: 16 },
  select: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 }, value: { color: colors.text, fontSize: 16, fontWeight: "700" }, placeholder: { color: colors.muted, fontSize: 16 }, arrow: { color: colors.primary, fontSize: 13 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, manage: { flexGrow: 1, alignItems: "center", backgroundColor: "#E8F5E9", borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 }, manageText: { color: colors.primary, fontWeight: "800" }, remove: { flexGrow: 1, alignItems: "center", backgroundColor: "#FFEBEE", borderWidth: 1, borderColor: colors.danger, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 }, removeText: { color: colors.danger, fontWeight: "800" }, disabled: { opacity: 0.35 },
  addPanel: { flexDirection: "row", flexWrap: "wrap", backgroundColor: colors.background, borderRadius: 10, padding: 10, gap: 8 }, input: { minWidth: 160, flex: 1, backgroundColor: colors.surface, borderRadius: 9, padding: 11 }, add: { backgroundColor: colors.primary, borderRadius: 9, paddingHorizontal: 15, paddingVertical: 11, justifyContent: "center" }, white: { color: "white", fontWeight: "700" }, message: { color: colors.primary, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 18 }, dialog: { width: "100%", maxWidth: 460, maxHeight: "78%", backgroundColor: colors.surface, borderRadius: 18, padding: 18 },
  dialogHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }, dialogTitle: { flex: 1, fontSize: 21, fontWeight: "900" }, close: { padding: 8 }, closeText: { color: colors.muted, fontWeight: "700" },
  list: { minHeight: 100, maxHeight: 420 }, listContent: { paddingVertical: 10, gap: 8 }, option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: colors.background, borderRadius: 11, padding: 15 }, optionActive: { backgroundColor: colors.primary }, optionText: { fontSize: 17, fontWeight: "700" }, empty: { color: colors.muted, textAlign: "center", paddingVertical: 30 }, noLocation: { alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }
});
