import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/core/theme";
import { Consumer } from "@/domain/meal";
import { listConsumers } from "@/services/consumerRepository";

export function ConsumerPicker({ value, onChange, label = "Dla kogo?" }: { value: Consumer | null; onChange: (consumer: Consumer) => void; label?: string }) {
  const [items, setItems] = useState<Consumer[]>([]);
  useEffect(() => { void listConsumers().then(setItems).catch(() => setItems([])); }, []);
  return <View style={styles.box}>
    <Text style={styles.label}>{label}</Text>
    {items.length ? <View style={styles.row}>{items.map((item) => <Pressable key={item.id} onPress={() => onChange(item)} style={[styles.choice, value?.id === item.id && styles.active]}><Text style={value?.id === item.id ? styles.activeText : styles.text}>{item.name}</Text></Pressable>)}</View> : <Text style={styles.empty}>Brak profili. Dodaj osobę w zakładce Posiłki.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  label: { fontWeight: "800" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  active: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { color: colors.text, fontWeight: "700" },
  activeText: { color: "white", fontWeight: "800" },
  empty: { color: colors.muted }
});
