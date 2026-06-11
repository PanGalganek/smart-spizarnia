import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { colors } from "@/core/theme";
import { Product } from "@/domain/product";
import { addProductToShoppingList } from "@/services/shoppingRepository";

export function AddDepletedPrompt({ products, onClose, onAdded }: { products: Product[]; onClose: () => void; onAdded?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!products.length) return null;
  const names = products.map((product) => product.name).join(", ");

  async function addAll() {
    try {
      setBusy(true); setError("");
      await Promise.all(products.map((product) => addProductToShoppingList(product, "depleted")));
      onAdded?.();
      onClose();
    } catch {
      setError("Nie udało się dodać produktu. Sprawdź połączenie i spróbuj ponownie.");
    } finally { setBusy(false); }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Produkt został zużyty</Text>
          <Text style={styles.text}>{names}</Text>
          <Text style={styles.question}>Dodać {products.length > 1 ? "te produkty" : "ten produkt"} do listy zakupów?</Text>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.secondary}><Text>Nie teraz</Text></Pressable>
            <Pressable disabled={busy} onPress={() => void addAll()} style={[styles.primary, busy && styles.disabled]}><Text style={styles.white}>{busy ? "Dodawanie..." : "Dodaj do listy"}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 480, backgroundColor: colors.surface, borderRadius: 20, padding: 22 },
  title: { fontSize: 22, fontWeight: "900", color: colors.text },
  text: { fontSize: 18, fontWeight: "700", marginTop: 12 },
  question: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 8 },
  actions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 10, marginTop: 22 },
  secondary: { backgroundColor: colors.background, borderRadius: 11, paddingHorizontal: 18, paddingVertical: 14 },
  primary: { backgroundColor: colors.primary, borderRadius: 11, paddingHorizontal: 18, paddingVertical: 14 },
  white: { color: "white", fontWeight: "800" }, error: { color: colors.danger, marginTop: 10, fontWeight: "700" }, disabled: { opacity: 0.55 }
});
