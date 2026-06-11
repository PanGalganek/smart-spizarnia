import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "@/core/theme";
import { displayLocationName, listLocations } from "@/services/locationRepository";

type Props = { value: string; onChange: (value: string) => void; label?: string };

export function LocationPicker({ value, onChange, label = "Lokalizacja" }: Props) {
  const displayedValue = displayLocationName(value);
  const [locations, setLocations] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => { void listLocations().then(setLocations); }, []);

  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <Pressable onPress={() => setPickerOpen(true)} style={styles.select}>
      <Text style={value ? styles.value : styles.placeholder}>{displayedValue || "Wybierz lokalizację"}</Text>
      <Text style={styles.arrow}>v</Text>
    </Pressable>

    <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <View style={styles.dialogHeader}><Text style={styles.dialogTitle}>Wybierz lokalizację</Text><Pressable onPress={() => setPickerOpen(false)} style={styles.close}><Text style={styles.closeText}>Zamknij</Text></Pressable></View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {!locations.length ? <Text style={styles.empty}>Brak lokalizacji. Dodaj ją w kafelku Spiżarnia.</Text> : locations.map((item) => <Pressable key={item} onPress={() => { onChange(item); setPickerOpen(false); }} style={[styles.option, displayedValue === item && styles.optionActive]}><Text style={[styles.optionText, displayedValue === item && styles.white]}>{item}</Text>{displayedValue === item && <Text style={styles.white}>Wybrana</Text>}</Pressable>)}
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
  removeText: { color: colors.danger, fontWeight: "800" }, white: { color: "white", fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 18 }, dialog: { width: "100%", maxWidth: 460, maxHeight: "78%", backgroundColor: colors.surface, borderRadius: 18, padding: 18 },
  dialogHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }, dialogTitle: { flex: 1, fontSize: 21, fontWeight: "900" }, close: { padding: 8 }, closeText: { color: colors.muted, fontWeight: "700" },
  list: { minHeight: 100, maxHeight: 420 }, listContent: { paddingVertical: 10, gap: 8 }, option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: colors.background, borderRadius: 11, padding: 15 }, optionActive: { backgroundColor: colors.primary }, optionText: { fontSize: 17, fontWeight: "700" }, empty: { color: colors.muted, textAlign: "center", paddingVertical: 30 }, noLocation: { alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }
});
