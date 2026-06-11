import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import { ShoppingItem } from "@/domain/shopping";
import { addManualShoppingItem, deleteShoppingItem, listShoppingItems, markShoppingItemPurchased, restoreShoppingItem } from "@/services/shoppingRepository";

type PurchaseStep = "same-product" | "open-scanner";

export function ShoppingScreen() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<ShoppingItem | null>(null);
  const [purchaseStep, setPurchaseStep] = useState<PurchaseStep>("same-product");
  const active = useMemo(() => items.filter((item) => item.status === "active"), [items]);
  const purchased = useMemo(() => items.filter((item) => item.status === "purchased"), [items]);

  const refresh = useCallback(async () => setItems(await listShoppingItems()), []);
  useFocusEffect(useCallback(() => { void refresh().catch(() => setMessage("Nie udało się pobrać listy zakupów.")); }, [refresh]));

  async function addManual() {
    try {
      await addManualShoppingItem(name);
      setName(""); setMessage("Dodano produkt do listy zakupów.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Nie udało się dodać produktu."); }
  }

  function startPurchase(item: ShoppingItem) {
    setSelected(item); setPurchaseStep("same-product");
  }

  async function confirmSameProduct() {
    if (!selected) return;
    await markShoppingItemPurchased(selected);
    setSelected(null); setMessage(`Oznaczono jako kupione: ${selected.name}.`);
    await refresh();
  }

  async function openScannerForReplacement() {
    if (!selected) return;
    await markShoppingItemPurchased(selected);
    setSelected(null);
    await refresh();
    router.push({ pathname: "/scanner", params: { autoScan: "1" } });
  }

  async function finishWithoutScanner() {
    if (!selected) return;
    await markShoppingItemPurchased(selected);
    setSelected(null); setMessage(`Oznaczono jako kupione: ${selected.name}.`);
    await refresh();
  }

  async function remove(item: ShoppingItem) {
    await deleteShoppingItem(item.id); await refresh();
  }

  async function restore(item: ShoppingItem) {
    await restoreShoppingItem(item); await refresh();
  }

  return (
    <ModuleScreen title="Lista zakupów">
      <FlatList
        data={active}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<>
          <View style={styles.addBox}>
            <Text style={styles.heading}>Dodaj ręcznie</Text>
            <View style={styles.addRow}><TextInput value={name} onChangeText={setName} onSubmitEditing={() => void addManual()} placeholder="Np. mleko, pomidor, płyn do naczyń" style={styles.input} /><Pressable onPress={() => void addManual()} style={styles.addButton}><Text style={styles.white}>+ Dodaj</Text></Pressable></View>
          </View>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Do kupienia</Text><Text style={styles.count}>{active.length}</Text></View>
        </>}
        ListEmptyComponent={<Text style={styles.empty}>Lista jest pusta. Dodaj produkt ręcznie albo z kafelka „Zapisane”.</Text>}
        renderItem={({ item }) => <ShoppingRow item={item} onPurchased={() => startPurchase(item)} onDelete={() => void remove(item)} />}
        ListFooterComponent={purchased.length ? <View style={styles.purchasedSection}><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Kupione</Text><Text style={styles.count}>{purchased.length}</Text></View>{purchased.map((item) => <ShoppingRow key={item.id} item={item} onRestore={() => void restore(item)} onDelete={() => void remove(item)} />)}</View> : null}
      />

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.backdrop}><View style={styles.modalCard}>
          {purchaseStep === "same-product" ? <>
            <Text style={styles.modalTitle}>Czy kupiono ten sam produkt?</Text>
            <Text style={styles.modalProduct}>{selected?.name}</Text>
            <Text style={styles.modalText}>Jeśli wybrano inny produkt lub inną markę, można od razu zeskanować jego kod.</Text>
            <View style={styles.modalActions}><Pressable onPress={() => setSelected(null)} style={styles.secondary}><Text>Anuluj</Text></Pressable><Pressable onPress={() => setPurchaseStep("open-scanner")} style={styles.secondary}><Text>Nie, inny</Text></Pressable><Pressable onPress={() => void confirmSameProduct()} style={styles.primary}><Text style={styles.white}>Tak, ten sam</Text></Pressable></View>
          </> : <>
            <Text style={styles.modalTitle}>Otworzyć skaner?</Text>
            <Text style={styles.modalText}>Zeskanuj nowy produkt, aby zapisać jego kod i dane w aplikacji.</Text>
            <View style={styles.modalActions}><Pressable onPress={() => setPurchaseStep("same-product")} style={styles.secondary}><Text>Wstecz</Text></Pressable><Pressable onPress={() => void finishWithoutScanner()} style={styles.secondary}><Text>Nie otwieraj</Text></Pressable><Pressable onPress={() => void openScannerForReplacement()} style={styles.primary}><Text style={styles.white}>Otwórz skaner</Text></Pressable></View>
          </>}
        </View></View>
      </Modal>
    </ModuleScreen>
  );
}

function ShoppingRow({ item, onPurchased, onRestore, onDelete }: { item: ShoppingItem; onPurchased?: () => void; onRestore?: () => void; onDelete: () => void }) {
  return <View style={[styles.item, item.status === "purchased" && styles.purchased]}><View style={styles.itemText}><Text style={[styles.itemName, item.status === "purchased" && styles.strike]}>{item.name}</Text><Text style={styles.source}>{sourceLabel(item)}</Text></View><View style={styles.itemActions}>{onPurchased && <Pressable onPress={onPurchased} style={styles.boughtButton}><Text style={styles.white}>Kupione</Text></Pressable>}{onRestore && <Pressable onPress={onRestore} style={styles.restoreButton}><Text style={styles.restoreText}>Przywróć</Text></Pressable>}<Pressable onPress={onDelete} style={styles.deleteButton}><Text style={styles.deleteText}>Usuń</Text></Pressable></View></View>;
}

function sourceLabel(item: ShoppingItem) {
  if (item.source === "depleted") return "Dodano po zużyciu produktu";
  if (item.source === "saved") return item.productBarcode ? `Zapisany produkt · ${item.productBarcode}` : "Zapisany produkt";
  return "Wpisano ręcznie";
}

const styles = StyleSheet.create({
  content: { paddingBottom: 36 }, addBox: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, marginBottom: 12 }, heading: { fontSize: 20, fontWeight: "900", marginBottom: 12 }, addRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, input: { flex: 1, minWidth: 190, backgroundColor: colors.background, borderRadius: 12, padding: 15, fontSize: 16 }, addButton: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 15, justifyContent: "center" }, white: { color: "white", fontWeight: "800" },
  message: { backgroundColor: "#E8F5E9", color: "#1B5E20", padding: 12, borderRadius: 10, marginBottom: 12, fontWeight: "700" }, sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 12 }, sectionTitle: { fontSize: 21, fontWeight: "900" }, count: { color: colors.muted, fontWeight: "800" }, empty: { textAlign: "center", color: colors.muted, lineHeight: 22, marginVertical: 40 },
  item: { backgroundColor: colors.surface, borderRadius: 15, padding: 16, marginBottom: 10, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }, purchased: { opacity: 0.72 }, itemText: { flex: 1, minWidth: 170 }, itemName: { fontSize: 18, fontWeight: "800" }, strike: { textDecorationLine: "line-through" }, source: { color: colors.muted, fontSize: 12, marginTop: 4 }, itemActions: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, boughtButton: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 }, restoreButton: { backgroundColor: "#E8F5E9", borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11 }, restoreText: { color: colors.primary, fontWeight: "800" }, deleteButton: { backgroundColor: "#FFEBEE", borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11 }, deleteText: { color: colors.danger, fontWeight: "800" }, purchasedSection: { marginTop: 18 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "center", padding: 18 }, modalCard: { width: "100%", maxWidth: 540, backgroundColor: colors.surface, borderRadius: 20, padding: 22 }, modalTitle: { fontSize: 23, fontWeight: "900" }, modalProduct: { fontSize: 19, fontWeight: "800", color: colors.primary, marginTop: 12 }, modalText: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 8 }, modalActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 9, marginTop: 22 }, secondary: { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 13 }, primary: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 13 }
});
