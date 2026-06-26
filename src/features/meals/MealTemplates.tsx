import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAppNavigation, useNavigationLayer } from "@/core/navigation/useAppNavigation";
import { colors } from "@/core/theme";
import { Consumer, MealTemplate, MealTemplateIngredient, MealType } from "@/domain/meal";
import { PantryItem } from "@/domain/product";
import { deleteMealTemplate, templateDefaultAmount, updateMealTemplate, useMealTemplate } from "@/services/mealTemplateRepository";
import { isChemical } from "@/services/productTypes";

type Props = {
  templates: MealTemplate[];
  pantry: PantryItem[];
  consumer: Consumer | null;
  onChanged: () => Promise<void>;
};

export function MealTemplates({ templates, pantry, consumer, onChanged }: Props) {
  const appNavigation = useAppNavigation();
  const editorLayer = useNavigationLayer("meal-template-editor", "modal", { modal: "meal-template-editor", mode: "meal-template-editor" });
  const [draftName, setDraftName] = useState("");
  const [draftIngredients, setDraftIngredients] = useState<MealTemplateIngredient[]>([]);
  const [showProducts, setShowProducts] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const editingTemplate = editorLayer.open ? templates.find((item) => item.id === appNavigation.state.selectedId) ?? null : null;

  function showMessage(text: string, error = false) {
    setMessage(text);
    setMessageError(error);
  }

  function openEditor(template: MealTemplate) {
    setDraftName(template.name);
    setDraftIngredients(template.ingredients.map((item) => ({ ...item })));
    setShowProducts(false);
    showMessage("");
    editorLayer.openLayer({ modal: "meal-template-editor", mode: "meal-template-editor", selectedId: template.id });
  }

  function updateIngredient(barcode: string, amountText: string) {
    const amount = Number(amountText.replace(",", "."));
    setDraftIngredients((current) => current.map((item) => item.barcode === barcode ? { ...item, amount } : item));
  }

  function removeIngredient(barcode: string) {
    setDraftIngredients((current) => current.filter((item) => item.barcode !== barcode));
  }

  function addIngredient(item: PantryItem) {
    if (draftIngredients.some((ingredient) => ingredient.barcode === item.barcode)) return;
    setDraftIngredients((current) => [...current, {
      barcode: item.barcode,
      productName: item.product.name,
      amount: templateDefaultAmount(item),
      unit: item.unit
    }]);
  }

  async function saveTemplate() {
    if (!editingTemplate) return;
    try {
      setBusyId(editingTemplate.id);
      await updateMealTemplate(editingTemplate, { name: draftName, ingredients: draftIngredients });
      editorLayer.closeLayer();
      await onChanged();
      showMessage("Zapisano zmiany szablonu.");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Nie udało się zapisać szablonu.", true);
    } finally {
      setBusyId(null);
    }
  }

  async function useTemplate(template: MealTemplate) {
    if (!consumer) return showMessage("Najpierw dodaj i wybierz profil osoby.", true);
    try {
      setBusyId(template.id);
      const meal = await useMealTemplate(template, consumer);
      await onChanged();
      showMessage(`Dodano „${meal.name}” do bilansu: ${consumer.name}. Produkty zostały odjęte.`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Nie udało się użyć szablonu.", true);
    } finally {
      setBusyId(null);
    }
  }

  async function removeTemplate(template: MealTemplate) {
    try {
      setBusyId(template.id);
      await deleteMealTemplate(template.id);
      setConfirmDeleteId(null);
      await onChanged();
      showMessage("Usunięto szablon. Historia posiłków nie została zmieniona.");
    } catch {
      showMessage("Nie udało się usunąć szablonu.", true);
    } finally {
      setBusyId(null);
    }
  }

  const availableProducts = pantry.filter((item) => !isChemical(item.product) && !draftIngredients.some((ingredient) => ingredient.barcode === item.barcode));

  return <View style={styles.panel}>
    <View style={styles.heading}><View><Text style={styles.title}>Moje szablony</Text><Text style={styles.hint}>Stałe posiłki do szybkiego dodania do dzisiejszego bilansu.</Text></View><Text style={styles.count}>{templates.length}</Text></View>
    {!!message && <Text style={messageError ? styles.errorMessage : styles.successMessage}>{message}</Text>}
    {!templates.length ? <Text style={styles.empty}>Zapisz gotowy posiłek z historii jako szablon, aby używać go jednym kliknięciem.</Text> : templates.map((template) => <View key={template.id} style={styles.card}>
      <View style={styles.cardHeader}><View style={styles.cardHeading}><Text style={styles.name}>{template.name}</Text><Text style={styles.hint}>{mealTypeLabel(template.type)} · {template.ingredients.length} składniki</Text>{template.servings > 1 && <Text style={styles.portions}>Zużyje składniki na {template.servings} porcji, a do wybranego profilu doda 1 porcję.</Text>}</View></View>
      <Text style={styles.ingredients} numberOfLines={2}>{template.ingredients.map((item) => `${item.productName}: ${item.amount} ${item.unit}`).join(" · ")}</Text>
      {confirmDeleteId === template.id ? <View style={styles.confirm}><Text style={styles.confirmText}>Usunąć ten szablon? Historia posiłków pozostanie bez zmian.</Text><View style={styles.actions}><Pressable disabled={busyId === template.id} onPress={() => void removeTemplate(template)} style={[styles.delete, busyId === template.id && styles.disabled]}><Text style={styles.white}>{busyId === template.id ? "Usuwanie..." : "Usuń szablon"}</Text></Pressable><Pressable disabled={busyId === template.id} onPress={() => setConfirmDeleteId(null)} style={styles.cancel}><Text>Anuluj</Text></Pressable></View></View> : <View style={styles.actions}><Pressable disabled={busyId === template.id} onPress={() => void useTemplate(template)} style={[styles.use, busyId === template.id && styles.disabled]}><Text style={styles.white}>{busyId === template.id ? "Sprawdzanie..." : "Dodaj do bilansu"}</Text></Pressable><Pressable disabled={busyId === template.id} onPress={() => openEditor(template)} style={styles.edit}><Text style={styles.editText}>Edytuj</Text></Pressable><Pressable disabled={busyId === template.id} onPress={() => setConfirmDeleteId(template.id)} style={styles.deleteOutline}><Text style={styles.deleteText}>Usuń</Text></Pressable></View>}
    </View>)}

    <Modal visible={editorLayer.open && !!editingTemplate} transparent animationType="fade" onRequestClose={editorLayer.closeLayer}>
      <View style={styles.backdrop}><View style={styles.modalCard}>
        <Text style={styles.modalTitle}>Edytuj szablon</Text>
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Nazwa</Text>
          <TextInput value={draftName} onChangeText={setDraftName} placeholder="Nazwa szablonu" style={styles.nameInput} />
          <Text style={styles.label}>Składniki</Text>
          {draftIngredients.map((ingredient) => <View key={ingredient.barcode} style={styles.ingredientRow}><View style={styles.ingredientName}><Text style={styles.ingredientTitle}>{ingredient.productName}</Text><Text style={styles.hint}>{ingredient.unit}</Text></View><TextInput value={Number.isFinite(ingredient.amount) ? String(ingredient.amount) : ""} onChangeText={(value) => updateIngredient(ingredient.barcode, value)} keyboardType="decimal-pad" style={styles.amountInput} /><Pressable onPress={() => removeIngredient(ingredient.barcode)} style={styles.remove}><Text style={styles.removeText}>Usuń</Text></Pressable></View>)}
          <Pressable onPress={() => setShowProducts((value) => !value)} style={styles.addProduct}><Text style={styles.addProductText}>{showProducts ? "Ukryj produkty" : "+ Dodaj składnik"}</Text></Pressable>
          {showProducts && <View style={styles.productPicker}>{availableProducts.length ? availableProducts.map((item) => <Pressable key={item.barcode} onPress={() => addIngredient(item)} style={styles.productItem}><View><Text style={styles.ingredientTitle}>{item.product.name}</Text><Text style={styles.hint}>Dostępne: {item.quantity} {item.unit}</Text></View><Text style={styles.addText}>Dodaj</Text></Pressable>) : <Text style={styles.hint}>Nie ma innych produktów spożywczych w spiżarni.</Text>}</View>}
        </ScrollView>
        <View style={styles.modalActions}><Pressable disabled={busyId === editingTemplate?.id} onPress={editorLayer.closeLayer} style={styles.cancel}><Text>Anuluj</Text></Pressable><Pressable disabled={busyId === editingTemplate?.id} onPress={() => void saveTemplate()} style={[styles.use, busyId === editingTemplate?.id && styles.disabled]}><Text style={styles.white}>{busyId === editingTemplate?.id ? "Zapisywanie..." : "Zapisz zmiany"}</Text></Pressable></View>
      </View></View>
    </Modal>
  </View>;
}

function mealTypeLabel(type: MealType) {
  return { breakfast: "Śniadanie", lunch: "Obiad", dinner: "Kolacja", snack: "Przekąska", custom: "Własny posiłek" }[type];
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderRadius: 18, padding: 15, marginBottom: 12, gap: 12 },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  title: { fontSize: 20, fontWeight: "900", color: colors.text },
  count: { color: colors.primary, fontSize: 20, fontWeight: "900" },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  empty: { color: colors.muted, lineHeight: 20, paddingVertical: 6 },
  card: { backgroundColor: colors.background, borderRadius: 13, padding: 14, gap: 9 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start" },
  cardHeading: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: 18, fontWeight: "900" },
  portions: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  ingredients: { color: colors.muted, lineHeight: 19 },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  use: { backgroundColor: colors.primary, minHeight: 46, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" },
  edit: { backgroundColor: colors.surface, minHeight: 46, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" },
  editText: { color: colors.text, fontWeight: "800" },
  deleteOutline: { backgroundColor: "#FFEBEE", minHeight: 46, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" },
  deleteText: { color: colors.danger, fontWeight: "800" },
  delete: { backgroundColor: colors.danger, minHeight: 46, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" },
  cancel: { backgroundColor: colors.surface, minHeight: 46, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" },
  white: { color: "white", fontWeight: "900" },
  confirm: { gap: 9 },
  confirmText: { color: colors.text, fontWeight: "800", lineHeight: 20 },
  successMessage: { color: colors.primary, backgroundColor: "#E8F5E9", borderRadius: 10, padding: 11, fontWeight: "800" },
  errorMessage: { color: colors.danger, backgroundColor: "#FFEBEE", borderRadius: 10, padding: 11, fontWeight: "800", lineHeight: 20 },
  disabled: { opacity: 0.55 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "center", padding: 12 },
  modalCard: { width: "100%", maxWidth: 640, maxHeight: "92%", backgroundColor: colors.surface, borderRadius: 20, padding: 18, gap: 14 },
  modalTitle: { color: colors.text, fontSize: 23, fontWeight: "900" },
  modalScroll: { flexGrow: 0 },
  modalContent: { gap: 10, paddingBottom: 4 },
  label: { color: colors.text, fontWeight: "900", marginTop: 2 },
  nameInput: { backgroundColor: colors.background, borderRadius: 10, padding: 13, color: colors.text, fontSize: 16 },
  ingredientRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.background, borderRadius: 10, padding: 10 },
  ingredientName: { flex: 1, minWidth: 90 },
  ingredientTitle: { color: colors.text, fontWeight: "800" },
  amountInput: { width: 76, backgroundColor: colors.surface, borderRadius: 9, padding: 10, textAlign: "center", color: colors.text, fontWeight: "800" },
  remove: { paddingHorizontal: 6, paddingVertical: 9 },
  removeText: { color: colors.danger, fontWeight: "800" },
  addProduct: { minHeight: 44, borderWidth: 1, borderColor: colors.primary, borderRadius: 10, justifyContent: "center", alignItems: "center", paddingHorizontal: 12 },
  addProductText: { color: colors.primary, fontWeight: "900" },
  productPicker: { backgroundColor: colors.background, borderRadius: 10, padding: 8, gap: 6 },
  productItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, backgroundColor: colors.surface, borderRadius: 9, padding: 11 },
  addText: { color: colors.primary, fontWeight: "900" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }
});
