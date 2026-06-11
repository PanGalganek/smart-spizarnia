import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, GestureResponderEvent, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { colors } from "@/core/theme";
import { DailySummary, Meal, MealIngredient, MealType } from "@/domain/meal";
import { Nutrients, PantryItem } from "@/domain/product";
import { MealHistory } from "@/features/meals/MealHistory";
import { createMeal, getDailySummary, listMeals, listPantry } from "@/services/inventoryRepository";
import { createMealIngredient, dateKey, sumNutrients } from "@/services/nutrition";

const mealTypes: { value: MealType; label: string; description: string }[] = [
  { value: "breakfast", label: "Sniadanie", description: "Pierwszy posilek dnia" },
  { value: "lunch", label: "Obiad", description: "Glowny posilek dnia" },
  { value: "dinner", label: "Kolacja", description: "Posilek wieczorny" },
  { value: "snack", label: "Przekaska", description: "Mniejszy posilek" },
  { value: "custom", label: "Wlasna nazwa", description: "Inny rodzaj posilku" }
];

type Step = "type" | "products" | "amount" | "review";

export function MealsScreen() {
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary>({ dateKey: dateKey(), totals: {}, mealCount: 0, updatedAt: Date.now() });
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [step, setStep] = useState<Step>("type");
  const [type, setType] = useState<MealType | null>(null);
  const [customName, setCustomName] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [editedItem, setEditedItem] = useState<PantryItem | null>(null);
  const [amountDraft, setAmountDraft] = useState("");
  const [message, setMessage] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextPantry, nextMeals, nextSummary] = await Promise.all([listPantry(), listMeals(), getDailySummary(dateKey())]);
      setPantry(nextPantry);
      setMeals(nextMeals);
      setDailySummary(nextSummary);
    } catch { setMessage("Nie udalo sie pobrac danych."); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const ingredientResult = useMemo(() => buildIngredients(pantry, amounts), [amounts, pantry]);
  const totals = useMemo(() => sumNutrients(ingredientResult.ingredients.map((item) => item.nutrients)), [ingredientResult.ingredients]);
  const mealName = type === "custom" ? customName.trim() : mealTypes.find((item) => item.value === type)?.label ?? "";

  function openCreator() {
    setType(null);
    setCustomName("");
    setAmounts({});
    setEditedItem(null);
    setAmountDraft("");
    setModalMessage("");
    setStep("type");
    setCreatorOpen(true);
  }

  function chooseType(nextType: MealType) {
    setType(nextType);
    setModalMessage("");
    if (nextType !== "custom") setStep("products");
  }

  function continueFromType() {
    if (!type) return setModalMessage("Wybierz rodzaj posilku.");
    if (type === "custom" && !customName.trim()) return setModalMessage("Wpisz wlasna nazwe posilku.");
    setModalMessage("");
    setStep("products");
  }

  function editAmount(item: PantryItem) {
    setEditedItem(item);
    setAmountDraft(amounts[item.barcode] ?? "");
    setModalMessage("");
    setStep("amount");
  }

  function confirmAmount() {
    if (!editedItem) return;
    const amount = parseAmount(amountDraft);
    if (amount <= 0) return setModalMessage("Wpisz ilosc wieksza od zera.");
    if (amount > editedItem.quantity) return setModalMessage(`Dostepne jest tylko ${editedItem.quantity} ${editedItem.unit}.`);
    try { createMealIngredient(editedItem, amount); }
    catch (error) { return setModalMessage(error instanceof Error ? error.message : "Nieprawidlowa ilosc."); }
    setAmounts((current) => ({ ...current, [editedItem.barcode]: String(amount) }));
    setEditedItem(null);
    setModalMessage("");
    setStep("products");
  }

  function removeIngredient(barcode: string) {
    setAmounts((current) => {
      const next = { ...current };
      delete next[barcode];
      return next;
    });
  }

  function continueToReview() {
    if (ingredientResult.error) return setModalMessage(ingredientResult.error);
    if (!ingredientResult.ingredients.length) return setModalMessage("Wybierz przynajmniej jeden produkt.");
    setModalMessage("");
    setStep("review");
  }

  async function saveMeal() {
    if (!type || !mealName || !ingredientResult.ingredients.length) return;
    try {
      setBusy(true);
      setModalMessage("");
      await createMeal(mealName, type, ingredientResult.ingredients);
      await refresh();
      setCreatorOpen(false);
      setMessage(`Zapisano posilek: ${mealName}. Produkty zostaly odjete ze spizarni.`);
    } catch (error) {
      setModalMessage(error instanceof Error ? error.message : "Nie udalo sie zapisac posilku.");
    } finally { setBusy(false); }
  }

  return (
    <ModuleScreen title="Posilki">
      <View style={styles.pageHeader}>
        <View><Text style={styles.pageTitle}>Posilki i dzienny bilans</Text><Text style={styles.muted}>{formatToday()} | Tworz posilki z produktow zapisanych w spizarni.</Text></View>
        <Pressable onPress={openCreator} style={styles.newButton}><Text style={styles.white}>+ Nowy posilek</Text></Pressable>
      </View>
      <DailyNutritionSummary summary={dailySummary} />
      {!!message && <Text style={styles.successBanner}>{message}</Text>}
      <MealHistory meals={meals} onChanged={refresh} />

      <Modal visible={creatorOpen} transparent animationType="fade" onRequestClose={() => setCreatorOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View><Text style={styles.stepLabel}>{stepLabel(step)}</Text><Text style={styles.modalTitle}>{stepTitle(step, editedItem)}</Text></View>
              <Pressable onPress={() => setCreatorOpen(false)} style={styles.close}><Text style={styles.closeText}>Zamknij</Text></Pressable>
            </View>

            {step === "type" && <TypeStep type={type} customName={customName} onType={chooseType} onCustomName={setCustomName} />}
            {step === "products" && <ProductsStep pantry={pantry} amounts={amounts} onEdit={editAmount} onRemove={removeIngredient} />}
            {step === "amount" && editedItem && <AmountStep item={editedItem} value={amountDraft} onChange={setAmountDraft} />}
            {step === "review" && <ReviewStep name={mealName} ingredients={ingredientResult.ingredients} totals={totals} />}

            {!!modalMessage && <Text style={styles.errorBanner}>{modalMessage}</Text>}
            <View style={styles.modalActions}>
              {step !== "type" && <Pressable onPress={() => setStep(step === "amount" ? "products" : step === "review" ? "products" : "type")} style={styles.secondary}><Text>Wstecz</Text></Pressable>}
              <View style={styles.actionSpacer} />
              {step === "type" && type === "custom" && <PrimaryButton label="Dalej: wybierz produkty" onPress={continueFromType} />}
              {step === "products" && <PrimaryButton label="Dalej: podsumowanie" onPress={continueToReview} />}
              {step === "amount" && <PrimaryButton label="Dodaj ilosc" onPress={confirmAmount} />}
              {step === "review" && <PrimaryButton label={busy ? "Zapisywanie..." : "Zapisz i odejmij produkty"} onPress={() => void saveMeal()} disabled={busy} />}
            </View>
          </View>
        </View>
      </Modal>
    </ModuleScreen>
  );
}

function TypeStep({ type, customName, onType, onCustomName }: { type: MealType | null; customName: string; onType: (type: MealType) => void; onCustomName: (value: string) => void }) {
  return <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContent}>{mealTypes.map((item) => <Pressable key={item.value} onPress={() => onType(item.value)} style={[styles.typeCard, type === item.value && styles.selectedCard]}><View style={styles.radio}>{type === item.value && <View style={styles.radioDot} />}</View><View><Text style={styles.typeName}>{item.label}</Text><Text style={styles.muted}>{item.description}</Text></View></Pressable>)}{type === "custom" && <TextInput autoFocus value={customName} onChangeText={onCustomName} placeholder="Nazwa posilku" style={styles.customInput} />}</ScrollView>;
}

function ProductsStep({ pantry, amounts, onEdit, onRemove }: { pantry: PantryItem[]; amounts: Record<string, string>; onEdit: (item: PantryItem) => void; onRemove: (barcode: string) => void }) {
  return <FlatList style={styles.stepScroll} contentContainerStyle={styles.listContent} data={pantry} keyExtractor={(item) => item.barcode} ListEmptyComponent={<Text style={styles.empty}>Spizarnia jest pusta. Najpierw dodaj produkty w zakladce Spizarnia lub Skaner.</Text>} renderItem={({ item }) => {
    const selected = parseAmount(amounts[item.barcode]);
    return <Pressable onPress={() => onEdit(item)} style={[styles.productCard, selected > 0 && styles.selectedProduct]}><View style={styles.productText}><Text style={styles.productName}>{item.product.name}</Text><Text style={styles.muted}>Dostepne: {item.quantity} {item.unit}</Text></View>{selected > 0 ? <View style={styles.selectedAmount}><Text style={styles.selectedAmountText}>{selected} {item.unit}</Text><Pressable onPress={(event: GestureResponderEvent) => { event.stopPropagation(); onRemove(item.barcode); }} hitSlop={10}><Text style={styles.removeText}>Usun</Text></Pressable></View> : <Text style={styles.addText}>Wybierz</Text>}</Pressable>;
  }} />;
}

function AmountStep({ item, value, onChange }: { item: PantryItem; value: string; onChange: (value: string) => void }) {
  const amount = parseAmount(value);
  let kcal = 0;
  try { if (amount > 0) kcal = createMealIngredient(item, Math.min(amount, item.quantity)).nutrients.energyKcal ?? 0; } catch { /* Validation message is shown after confirmation. */ }
  return <View style={styles.amountStep}><Text style={styles.amountProduct}>{item.product.name}</Text><Text style={styles.available}>Dostepne w spizarni: {item.quantity} {item.unit}</Text><View style={styles.amountEntry}><TextInput autoFocus selectTextOnFocus value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder="0" style={styles.amountInput} /><Text style={styles.amountUnit}>{item.unit}</Text></View><Text style={styles.caloriePreview}>Wybrana ilosc: {amount || 0} {item.unit} | ok. {kcal} kcal</Text></View>;
}

function ReviewStep({ name, ingredients, totals }: { name: string; ingredients: MealIngredient[]; totals: Nutrients }) {
  return <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContent}><Text style={styles.reviewName}>{name}</Text><NutritionSummary totals={totals} /><Text style={styles.sectionTitle}>Skladniki</Text>{ingredients.map((ingredient) => <View key={ingredient.barcode} style={styles.reviewRow}><Text style={styles.reviewProduct}>{ingredient.productName}</Text><Text>{ingredient.amount} {ingredient.unit} | {ingredient.nutrients.energyKcal ?? 0} kcal</Text></View>)}</ScrollView>;
}

function NutritionSummary({ totals }: { totals: Nutrients }) {
  const entries = [["Kalorie", totals.energyKcal, "kcal"], ["Bialko", totals.proteins, "g"], ["Weglowodany", totals.carbohydrates, "g"], ["Tluszcz", totals.fat, "g"]];
  return <View style={styles.nutritionGrid}>{entries.map(([label, value, unit]) => <View key={String(label)} style={styles.nutritionCard}><Text style={styles.nutritionValue}>{value ?? 0}</Text><Text style={styles.muted}>{label} ({unit})</Text></View>)}</View>;
}

function DailyNutritionSummary({ summary }: { summary: DailySummary }) {
  const entries = [
    ["Kalorie", summary.totals.energyKcal, "kcal", true],
    ["Bialko", summary.totals.proteins, "g", false],
    ["Weglowodany", summary.totals.carbohydrates, "g", false],
    ["Tluszcz", summary.totals.fat, "g", false],
    ["Blonnik", summary.totals.fiber, "g", false],
    ["Sol", summary.totals.salt, "g", false]
  ] as const;
  return <View style={styles.dailyPanel}><View style={styles.dailyHeading}><Text style={styles.dailyTitle}>Spozycie dzisiaj</Text><Text style={styles.dailyCount}>{summary.mealCount} posilkow</Text></View><View style={styles.dailyGrid}>{entries.map(([label, value, unit, highlighted]) => <View key={label} style={styles.dailyItem}><Text style={[styles.dailyValue, highlighted && styles.dailyKcal]}>{value ?? 0} {unit}</Text><Text style={styles.dailyLabel}>{label}</Text></View>)}</View></View>;
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) { return <Pressable disabled={disabled} onPress={onPress} style={[styles.primary, disabled && styles.disabled]}><Text style={styles.white}>{label}</Text></Pressable>; }
function buildIngredients(pantry: PantryItem[], amounts: Record<string, string>) { const ingredients: MealIngredient[] = []; let error = ""; for (const item of pantry) { const amount = parseAmount(amounts[item.barcode]); if (amount <= 0) continue; try { ingredients.push(createMealIngredient(item, amount)); } catch (cause) { error = cause instanceof Error ? cause.message : "Nieprawidlowa ilosc."; } } return { ingredients, error }; }
function parseAmount(value?: string) { const number = Number((value ?? "").replace(",", ".")); return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : 0; }
function stepLabel(step: Step) { return step === "type" ? "KROK 1 Z 3" : step === "review" ? "KROK 3 Z 3" : "KROK 2 Z 3"; }
function stepTitle(step: Step, item: PantryItem | null) { if (step === "type") return "Jaki to posilek?"; if (step === "products") return "Wybierz produkty"; if (step === "amount") return `Podaj ilosc: ${item?.product.name ?? "produkt"}`; return "Sprawdz posilek"; }
function formatToday() { return new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" }); }

const styles = StyleSheet.create({
  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }, pageTitle: { fontSize: 22, fontWeight: "800" }, muted: { color: colors.muted, fontSize: 13 }, newButton: { backgroundColor: colors.primary, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 12 }, white: { color: "white", fontWeight: "800" },
  dailyPanel: { backgroundColor: colors.surface, borderRadius: 18, padding: 15, marginBottom: 12 }, dailyHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }, dailyTitle: { fontSize: 19, fontWeight: "900" }, dailyCount: { color: colors.muted, fontWeight: "700" }, dailyGrid: { flexDirection: "row", gap: 8 }, dailyItem: { flex: 1, minWidth: 90, backgroundColor: colors.background, borderRadius: 11, padding: 10 }, dailyValue: { fontSize: 15, fontWeight: "900", color: colors.text }, dailyKcal: { color: colors.primary, fontSize: 19 }, dailyLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  successBanner: { color: "#1B5E20", backgroundColor: "#E8F5E9", borderRadius: 10, padding: 12, fontWeight: "700", marginBottom: 12 }, backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "center", padding: 24 }, modalCard: { width: "90%", maxWidth: 900, height: "86%", backgroundColor: colors.surface, borderRadius: 22, padding: 22 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }, stepLabel: { color: colors.primary, fontWeight: "800", fontSize: 12 }, modalTitle: { fontSize: 25, fontWeight: "900", marginTop: 3 }, close: { padding: 10 }, closeText: { color: colors.muted, fontWeight: "700" }, stepScroll: { flex: 1 }, stepContent: { paddingVertical: 16, gap: 10 },
  typeCard: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 2, borderColor: colors.border, borderRadius: 14, padding: 15 }, selectedCard: { borderColor: colors.primary, backgroundColor: "#EDF7EE" }, radio: { width: 22, height: 22, borderWidth: 2, borderColor: colors.primary, borderRadius: 11, alignItems: "center", justifyContent: "center" }, radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary }, typeName: { fontSize: 17, fontWeight: "800" }, customInput: { backgroundColor: colors.background, borderRadius: 12, padding: 14, fontSize: 17 },
  listContent: { paddingVertical: 14, gap: 9 }, productCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 15 }, selectedProduct: { borderColor: colors.primary, backgroundColor: "#EDF7EE" }, productText: { flex: 1 }, productName: { fontSize: 17, fontWeight: "800" }, addText: { color: colors.primary, fontWeight: "800" }, selectedAmount: { alignItems: "flex-end", gap: 4 }, selectedAmountText: { color: colors.primary, fontSize: 17, fontWeight: "900" }, removeText: { color: colors.danger, fontWeight: "700", fontSize: 12 }, empty: { color: colors.muted, textAlign: "center", marginTop: 70, lineHeight: 21 },
  amountStep: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }, amountProduct: { fontSize: 26, fontWeight: "900" }, available: { color: colors.muted, fontSize: 17 }, amountEntry: { flexDirection: "row", alignItems: "center", gap: 12 }, amountInput: { width: 220, backgroundColor: colors.background, borderWidth: 2, borderColor: colors.primary, borderRadius: 14, padding: 18, fontSize: 30, fontWeight: "900", textAlign: "center" }, amountUnit: { fontSize: 25, fontWeight: "900" }, caloriePreview: { fontSize: 16, color: colors.muted },
  reviewName: { fontSize: 23, fontWeight: "900" }, nutritionGrid: { flexDirection: "row", gap: 9 }, nutritionCard: { flex: 1, backgroundColor: colors.background, borderRadius: 12, padding: 13 }, nutritionValue: { fontSize: 21, fontWeight: "900", color: colors.primary }, sectionTitle: { fontSize: 18, fontWeight: "800", marginTop: 4 }, reviewRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 10 }, reviewProduct: { flex: 1, fontWeight: "700" },
  errorBanner: { color: colors.danger, backgroundColor: "#FFEBEE", borderRadius: 10, padding: 12, fontWeight: "700", marginTop: 10 }, modalActions: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, marginTop: 8 }, actionSpacer: { flex: 1 }, secondary: { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 14 }, primary: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 14 }, disabled: { opacity: 0.55 }
});
