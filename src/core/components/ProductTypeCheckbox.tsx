import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/core/theme";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function ProductTypeCheckbox({ checked, onChange }: Props) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={[styles.row, checked && styles.rowChecked]}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.label}>Produkt chemiczny</Text>
        <Text style={styles.description}>Zaznacz dla chemii gospodarczej. Domyślnie produkt jest spożywczy.</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: 12, padding: 13 },
  rowChecked: { borderColor: colors.primary, backgroundColor: "#E8F5E9" },
  checkbox: { width: 28, height: 28, borderWidth: 2, borderColor: colors.muted, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  checkboxChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkmark: { color: "white", fontSize: 20, fontWeight: "900", lineHeight: 22 },
  textContainer: { flex: 1, minWidth: 0 },
  label: { color: colors.text, fontSize: 16, fontWeight: "900" },
  description: { color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 16 }
});
