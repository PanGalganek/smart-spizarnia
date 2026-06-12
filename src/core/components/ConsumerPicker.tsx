import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/core/theme";
import { Consumer } from "@/domain/meal";
import { defaultConsumers, listConsumers } from "@/services/consumerRepository";

export function ConsumerPicker({ value, onChange, label = "Dla kogo?" }: { value: Consumer; onChange: (consumer: Consumer) => void; label?: string }) {
  const [items, setItems] = useState(defaultConsumers);
  useEffect(() => { void listConsumers().then(setItems).catch(() => setItems(defaultConsumers)); }, []);
  return <View style={styles.box}><Text style={styles.label}>{label}</Text><View style={styles.row}>{items.map((item) => <Pressable key={item.id} onPress={() => onChange(item)} style={[styles.choice, value.id === item.id && styles.active]}><Text style={value.id === item.id ? styles.activeText : styles.text}>{item.name}</Text></Pressable>)}</View></View>;
}

const styles = StyleSheet.create({
  box: { gap: 8 }, label: { fontWeight: "800" }, row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }, active: { backgroundColor: colors.primary, borderColor: colors.primary }, text: { color: colors.text, fontWeight: "700" }, activeText: { color: "white", fontWeight: "800" }
});
