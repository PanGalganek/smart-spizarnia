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
  const listLayer = useNavigationLayer("meal-template-list", "modal", { modal: "meal-template-list", mode: "meal-template-list" });
  const editorLayer = useNavigationLayer("meal-template-editor", "modal", { modal: "meal-template-editor", mode: "meal-template-editor" });
  const [draftName, setDraftName] = useState("");
  const [draftIngredients, setDraftIngredients] = useState<MealTemplateIngredient[]>([]);
  const [showProducts, setShowProducts] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [search, setSearch] = useState("");
  const editingTemplate = editorLayer.open ? templates.find((item) => item.id === appNavigation.state.selectedId) ?? null : null;
  const availableProducts = pantry.filter((item) => !isChemical(item.product) && !draftIngredients.some((ingredient) => ingredient.barcode === item.barcode));
  const visibleTemplates = templates.filter((template) => template.name.toLocaleLowerCase("pl-PL").includes(search.trim().toLocaleLowerCase("pl-PL")));

  function showMessage(text: string, error = false) {
    setMessage(text);
    setMessageError(error);
  }

  function openList() {
    setSearch("");
    setConfirmDeleteId(null);
    showMessage("");
    listLayer.openLayer();
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

  return <>
    <View style={styles.panel}>
      <View style={styles.heading}><View style={styles.headingText}><Text style={styles.title}>Moje szablony</Text><Text style={styles.hint}>Stałe posiłki do szybkiego dodania do dzisiejszego bilansu.</Text></View><Text style={styles.count}>{templates.length}</Text></View>
      {!templates.length ? <Text style={styles.empty}>Zapisz gotowy posiłek z historii jako szablon, aby używać go jednym kliknięciem.</Text> : <Pressable onPress={openList} style={styles.openButton}><Text style={styles.openButtonText}>Otwórz listę szablonów ({templates.length})</Text></Pressable>}
    </View>

    <Modal visible={listLayer.open} transparent animationType="fade" onRequestClose={listLayer.closeLayer}>
      <View style={styles.backdrop}><View style={styles.modalCard}>
        <View style={styles.listHeader}><Text style={styles.modalTitle}>Moje szablony</Text><Text style={styles.count}>{templates.length}</Text></View>
        <TextInput value={search} onChangeText={setSearch} placeholder="Szukaj szablonu..." style={styles.searchInput} />
        {!!message && <Text style={messageError ? styles.errorMessage : styles.successMessage}>{message}</Text>}
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          {!visibleTemplates.length ? <Text style={styles.empty}>Nie znaleziono szablonu.</Text> : visibleTemplates.map((template) => <TemplateCard
            key={template.id}
            template={template}
            busy={busyId === template.id}
            confirmingDelete={confirmDeleteId === template.id}
            onUse={() => void useTemplate(template)}
            onEdit={() => openEditor(template)}
            onAskDelete={() => setConfirmDeleteId(template.id)}
            onDelete={() => void removeTemplate(template)}
            onCancelDelete={() => setConfirmDeleteId(null)}
          />)}
        </ScrollView>
        <View style={styles.modalActions}><Pressable onPress={listLayer.closeLayer} style={styles.cancel}><Text>Zamknij</Text></Pressable></View>
      </View></View>
    </Modal>

    <Modal visible={editorLayer.open && !!editingTemplate} transparent animationType="fade" onRequestClose={editorLayer.closeLayer}>
      <View style={styles.backdrop}><View style={styles.modalCard}>
        <Text style={styles.modalTitle}>Edytuj szablon</Text>
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Nazwa</Text>
          <TextInput value={draftName} onChangeText={setDraftName} placeholder="Nazwa szablonu" style={styles.nameInput} />
          <Text style={styles.label}>Składniki</Text>
          {draftIngredients.map((ingredient) => <View key={ingredient.barcode} style={styles.ingredientRow}><View style={styles.ingredientName}><Text style={styles.ingredientTitle}>{ingredient.productName}</Text><Text style={styles.hint}>{ingredient.unit}</Text></View><TextInput value={Number.isFinite(ingredient.amount) ? String(ingredient.amount) : ""} onChangeText={(value) => updateIngredient(ingredient.barcode, value)} keyboardType="decimal-pad" style={styles.amountInput} /><Pressable onPress={() => setDraftIngredients((current) => current.filter((item) => item.barcode !== ingredient.barcode))} style={styles.remove}><Text style={styles.removeText}>Usuń</Text></Pressable></View>)}
          <Pressable onPress={() => setShowProducts((value) => !value)} style={styles.addProduct}><Text style={styles.addProductText}>{showProducts ? "Ukryj produkty" : "+ Dodaj składnik"}</Text></Pressable>
          {showProducts && <View style={styles.productPicker}>{availableProducts.length ? availableProducts.map((item) => <Pressable key={item.barcode} onPress={() => addIngredient(item)} style={styles.productItem}><View><Text style={styles.ingredientTitle}>{item.product.name}</Text><Text style={styles.hint}>Dostępne: {item.quantity} {item.unit}</Text></View><Text style={styles.addText}>Dodaj</Text></Pressable>) : <Text style={styles.hint}>Nie ma innych produktów spożywczych w spiżarni.</Text>}</View>}
        </ScrollView>
        <View style={styles.modalActions}><Pressable disabled={busyId === editingTemplate?.id} onPress={editorLayer.closeLayer} style={styles.cancel}><Text>Anuluj</Text></Pressable><Pressable disabled={busyId === editingTemplate?.id} onPress={() => void saveTemplate()} style={[styles.use, busyId === editingTemplate?.id && styles.disabled]}><Text style={styles.white}>{busyId === editingTemplate?.id ? "Zapisywanie..." : "Zapisz zmiany"}</Text></Pressable></View>
      </View></View>
    </Modal>
  </>;
}

function TemplateCard({ template, busy, confirmingDelete, onUse, onEdit, onAskDelete, onDelete, onCancelDelete }: {
  template: MealTemplate;
  busy: boolean;
  confirmingDelete: boolean;
  onUse: () => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}) {
  return <View style={styles.card}>
    <Text style={styles.name}>{template.name}</Text>
    <Text style={styles.hint}>{mealTypeLabel(template.type)} · {template.ingredients.length} składniki</Text>
    {template.servings > 1 && <Text style={styles.portions}>Zużyje składniki na {template.servings} porcji, a do wybranego profilu doda 1 porcję.</Text>}
    <Text style={styles.ingredients} numberOfLines={2}>{template.ingredients.map((item) => `${item.productName}: ${item.amount} ${item.unit}`).join(" · ")}</Text>
    {confirmingDelete ? <View style={styles.confirm}><Text style={styles.confirmText}>Usunąć ten szablon? Historia posiłków pozostanie bez zmian.</Text><View style={styles.actions}><Pressable disabled={busy} onPress={onDelete} style={[styles.delete, busy && styles.disabled]}><Text style={styles.white}>{busy ? "Usuwanie..." : "Usuń szablon"}</Text></Pressable><Pressable disabled={busy} onPress={onCancelDelete} style={styles.cancel}><Text>Anuluj</Text></Pressable></View></View> : <View style={styles.actions}><Pressable disabled={busy} onPress={onUse} style={[styles.use, busy && styles.disabled]}><Text style={styles.white}>{busy ? "Sprawdzanie..." : "Dodaj do bilansu"}</Text></Pressable><Pressable disabled={busy} onPress={onEdit} style={styles.edit}><Text style={styles.editText}>Edytuj</Text></Pressable><Pressable disabled={busy} onPress={onAskDelete} style={styles.deleteOutline}><Text style={styles.deleteText}>Usuń</Text></Pressable></View>}
  </View>;
}

function mealTypeLabel(type: MealType) {
  return { breakfast: "Śniadanie", lunch: "Obiad", dinner: "Kolacja", snack: "Przekąska", custom: "Własny posiłek" }[type];
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderRadius: 18, padding: 15, marginBottom: 12, gap: 12 },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  headingText: { flex: 1, minWidth: 0 },
  title: { fontSize: 20, fontWeight: "900", color: colors.text },
  count: { color: colors.primary, fontSize: 20, fontWeight: "900" },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  empty: { color: colors.muted, lineHeight: 20, paddingVertical: 6 },
  openButton: { minHeight: 48, backgroundColor: colors.primary, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  openButtonText: { color: "white", fontWeight: "900" },
  card: { backgroundColor: colors.background, borderRadius: 13, padding: 14, gap: 8 },
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
  listHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  modalTitle: { color: colors.text, fontSize: 23, fontWeight: "900" },
  searchInput: { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, color: colors.text, fontSize: 16 },
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
