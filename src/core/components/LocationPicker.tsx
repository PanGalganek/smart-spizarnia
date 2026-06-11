import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "@/core/theme";
import { addLocation, listLocations, removeLocation } from "@/services/locationRepository";

type Props = { value: string; onChange: (value: string) => void; label?: string };

export function LocationPicker({ value, onChange, label = "Lokalizacja" }: Props) {
  const [locations, setLocations] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLocation, setNewLocation] = useState("");

  useEffect(() => { void listLocations().then(setLocations); }, []);

  async function add() {
    const name = newLocation.trim();
    if (!name) return;
    setLocations(await addLocation(name));
    onChange(name);
    setNewLocation("");
    setAdding(false);
  }

  async function remove() {
    if (!value) return;
    setLocations(await removeLocation(value));
    onChange("");
  }

  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.choices}>{locations.map((item) => <Pressable key={item} onPress={() => onChange(item)} style={[styles.choice, value === item && styles.active]}><Text style={value === item ? styles.white : undefined}>{item}</Text></Pressable>)}</View>
    {adding && <View style={styles.addRow}><TextInput autoFocus value={newLocation} onChangeText={setNewLocation} placeholder="Nowa lokalizacja" style={styles.input} /><Pressable onPress={() => void add()} style={styles.add}><Text style={styles.white}>Dodaj</Text></Pressable></View>}
    <View style={styles.actions}><Pressable onPress={() => setAdding((current) => !current)} style={styles.manage}><Text style={styles.manageText}>+ Nowa lokalizacja</Text></Pressable><Pressable disabled={!value} onPress={() => void remove()} style={[styles.remove, !value && styles.disabled]}><Text style={styles.removeText}>- Usun wybrana</Text></Pressable></View>
  </View>;
}

const styles = StyleSheet.create({
  field: { minWidth: 240, flex: 1, gap: 7 }, label: { fontWeight: "600" }, choices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choice: { backgroundColor: colors.background, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 }, active: { backgroundColor: colors.primary }, white: { color: "white", fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, manage: { paddingVertical: 8 }, manageText: { color: colors.primary, fontWeight: "800" }, remove: { paddingVertical: 8 }, removeText: { color: colors.danger, fontWeight: "800" }, disabled: { opacity: 0.35 },
  addRow: { flexDirection: "row", gap: 8 }, input: { flex: 1, backgroundColor: colors.background, borderRadius: 9, padding: 11 }, add: { backgroundColor: colors.primary, borderRadius: 9, paddingHorizontal: 15, justifyContent: "center" }
});
