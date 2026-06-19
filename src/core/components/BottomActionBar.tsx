import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/core/theme";

type BottomActionBarProps = {
  visible?: boolean;
  label: string;
  onPress: () => void;
};

export function BottomActionBar({ visible = true, label, onPress }: BottomActionBarProps) {
  if (!visible) return null;

  return (
    <View style={styles.bar}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18
  },
  button: {
    alignSelf: "flex-end",
    minHeight: 54,
    minWidth: 132,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 14
  },
  pressed: { opacity: 0.75 },
  label: { color: "white", fontSize: 17, fontWeight: "900" }
});
