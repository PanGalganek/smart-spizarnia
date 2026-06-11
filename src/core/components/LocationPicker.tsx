import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "@/core/theme";
import { addLocation, listLocations, removeLocation } from "@/services/locationRepository";

type Props = { value: string; onChange: (value: string) => void; label?: string };

export function LocationPicker({ value, onChange, label = "Lokalizacja" }: Props) {
  const [locations, setLocations] = useState<string[]>([]);
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
    <View style={styles.actions}>
      <Pressable onPress={() => { setAdding((current) => !current); setMessage(""); }} style={styles.manage}><Text style={styles.manageText}>+ Dodaj lokalizacje</Text></Pressable>
      <Pressable disabled={!value} onPress={() => void remove()} style={[styles.remove, !value && styles.disabled]}><Text style={styles.removeText}>- Usun wybrana</Text></Pressable>
    </View>
    {adding && <View style={styles.addPanel}><Text style={styles.hint}>Wpisz nazwe miejsca, np. Garaz lub Lazienka.</Text><View style={styles.addRow}><TextInput autoFocus value={newLocation} onChangeText={setNewLocation} placeholder="Nowa lokalizacja" style={styles.input} /><Pressable onPress={() => void add()} style={styles.add}><Text style={styles.white}>Dodaj</Text></Pressable></View></View>}
    <Text style={styles.selected}>{value ? `Wybrana lokalizacja: ${value}` : "Nie wybrano lokalizacji"}</Text>
    <View style={styles.choices}>{locations.map((item) => <Pressable key={item} onPress={() => { onChange(item); setMessage(""); }} style={[styles.choice, value === item && styles.active]}><Text style={value === item ? styles.white : undefined}>{item}</Text></Pressable>)}</View>
    {!!message && <Text style={styles.message}>{message}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  field: { minWidth: 240, flex: 1, gap: 9 }, label: { fontWeight: "700", fontSize: 16 }, choices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choice: { backgroundColor: colors.background, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 }, active: { backgroundColor: colors.primary }, white: { color: "white", fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, manage: { flexGrow: 1, alignItems: "center", backgroundColor: "#E8F5E9", borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 }, manageText: { color: colors.primary, fontWeight: "800" }, remove: { flexGrow: 1, alignItems: "center", backgroundColor: "#FFEBEE", borderWidth: 1, borderColor: colors.danger, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 }, removeText: { color: colors.danger, fontWeight: "800" }, disabled: { opacity: 0.35 },
  addPanel: { backgroundColor: colors.background, borderRadius: 10, padding: 10, gap: 8 }, hint: { color: colors.muted, fontSize: 12 }, addRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, input: { minWidth: 160, flex: 1, backgroundColor: colors.surface, borderRadius: 9, padding: 11 }, add: { backgroundColor: colors.primary, borderRadius: 9, paddingHorizontal: 15, paddingVertical: 11, justifyContent: "center" },
  selected: { color: colors.muted, fontWeight: "600" }, message: { color: colors.primary, fontWeight: "700" }
});
