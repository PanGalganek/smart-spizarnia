import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, GestureResponderEvent, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { BottomActionBar } from "@/core/components/BottomActionBar";
import { ModuleScreen } from "@/core/components/ModuleScreen";
import { useAppNavigation, useNavigationLayer } from "@/core/navigation/useAppNavigation";
import { colors } from "@/core/theme";
import { Consumer, DailySummary, Meal, MealIngredient, MealType } from "@/domain/meal";
import { Nutrients, PantryItem } from "@/domain/product";
import { MealHistory } from "@/features/meals/MealHistory";
import { AddDepletedPrompt } from "@/features/shopping/AddDepletedPrompt";
import { createMeal, getDailySummary, listMeals, listPantry } from "@/services/inventoryRepository";
import { addConsumer, listConsumers, removeConsumer } from "@/services/consumerRepository";
import { createMealIngredient, dateKey, scaleNutrients, sumNutrients, usesWeightPerPiece } from "@/services/nutrition";
import { wholePackageConsumptionAmount } from "@/services/pantryUnits";
import { productType } from "@/services/productTypes";
import { shouldAskToBuyAgain } from "@/services/shoppingPrompt";

const mealTypes: { value: MealType; label: string; description: string }[] = [
  { value: "breakfast", label: "Śniadanie", description: "Pierwszy posiłek dnia" },
  { value: "lunch", label: "Obiad", description: "Główny posiłek dnia" },
  { value: "dinner", label: "Kolacja", description: "Posiłek wieczorny" },
  { value: "snack", label: "Przekąska", description: "Mniejszy posiłek" },
  { value: "custom", label: "Własna nazwa", description: "Inny rodzaj posiłku" }
];

type Step = "type" | "products" | "amount" | "review";

export function MealsScreen() {
  const { width, height } = useWindowDimensions();
  const compact = width < 700;
  const appNavigation = useAppNavigation();
  const creatorLayer = useNavigationLayer("meal-creator", "modal", { modal: "meal-creator", mode: stepMode("type") });
  const profileDeleteLayer = useNavigationLayer("meal-profile-delete", "modal", { modal: "meal-profile-delete", mode: "meal-profile-delete" });
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary>({ dateKey: dateKey(), totals: {}, mealCount: 0, updatedAt: Date.now() });
  const [type, setType] = useState<MealType | null>(null);
  const [customName, setCustomName] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [amountDraft, setAmountDraft] = useState("");
  const [servings, setServings] = useState("1");
  const [message, setMessage] = useState("");
  const [depletedProducts, setDepletedProducts] = useState<PantryItem["product"][]>([]);
  const [modalMessage, setModalMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [consumer, setConsumer] = useState<Consumer | null>(null);
  const [newConsumer, setNewConsumer] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const creatorOpen = creatorLayer.open;
  const step = creatorOpen ? stepFromMode(appNavigation.state.mode) : "type";
  const editedItem = step === "amount" ? pantry.find((item) => item.barcode === appNavigation.state.selectedId) ?? null : null;
  const consumerToDelete = profileDeleteLayer.open ? consumers.find((item) => item.id === appNavigation.state.selectedId) ?? null : null;
  const selectedConsumerId = consumer?.id;

  const refresh = useCallback(async () => {
    try {
      const [nextPantry, nextMeals, savedConsumers] = await Promise.all([listPantry(), listMeals(), listConsumers()]);
      const nextConsumers = savedConsumers;
      const selectedConsumer = nextConsumers.find((item) => item.id === selectedConsumerId) ?? nextConsumers[0] ?? null;
      const nextSummary = selectedConsumer
        ? await getDailySummary(dateKey(), selectedConsumer)
        : { dateKey: dateKey(), totals: {}, mealCount: 0, updatedAt: Date.now() };
      setPantry(nextPantry.filter((item) => productType(item.product) === "food"));
      setMeals(nextMeals);
      setDailySummary(nextSummary);
      setConsumers(nextConsumers);
      setConsumer((current) => current?.id === selectedConsumer?.id ? current : selectedConsumer);
    } catch { setMessage("Nie udało się pobrać danych."); }
  }, [selectedConsumerId]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const ingredientResult = useMemo(() => buildIngredients(pantry, amounts), [amounts, pantry]);
  const totals = useMemo(() => sumNutrients(ingredientResult.ingredients.map((item) => item.nutrients)), [ingredientResult.ingredients]);
  const servingCount = parseServings(servings);
  const portionTotals = useMemo(() => scaleNutrients(totals, servingCount || 1), [servingCount, totals]);
  const mealName = type === "custom" ? customName.trim() : mealTypes.find((item) => item.value === type)?.label ?? "";

  function openCreator() {
    setType(null);
    setCustomName("");
    setAmounts({});
    setAmountDraft("");
    setServings("1");
    setModalMessage("");
    creatorLayer.openLayer();
  }

  function chooseType(nextType: MealType) {
    setType(nextType);
    setModalMessage("");
    if (nextType !== "custom") setCreatorStep("products");
  }

  function continueFromType() {
    if (!type) return setModalMessage("Wybierz rodzaj posiłku.");
    if (type === "custom" && !customName.trim()) return setModalMessage("Wpisz własną nazwę posiłku.");
    setModalMessage("");
    setCreatorStep("products");
  }

  function editAmount(item: PantryItem) {
    setAmountDraft(amounts[item.barcode] ?? "");
    setModalMessage("");
    setCreatorStep("amount", item.barcode);
  }

  function confirmAmount() {
    if (!editedItem) return;
    const amount = parseAmount(amountDraft);
    if (amount <= 0) return setModalMessage("Wpisz ilość większą od zera.");
    if (amount > editedItem.quantity) return setModalMessage(`Dostępne jest tylko ${editedItem.quantity} ${editedItem.unit}.`);
    if (usesWeightPerPiece(editedItem.product, editedItem.unit) && !editedItem.product.netWeightGrams) {
      return setModalMessage(`Uzupełnij masę jednej sztuki w Zapisane > ${editedItem.product.name} > Edytuj dane produktu.`);
    }
    try { createMealIngredient(editedItem, amount); }
    catch (error) { return setModalMessage(error instanceof Error ? error.message : "Nieprawidłowa ilość."); }
    setAmounts((current) => ({ ...current, [editedItem.barcode]: String(amount) }));
    setModalMessage("");
    setCreatorStep("products", null, false);
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
    setCreatorStep("review");
  }

  async function saveMeal() {
    if (!type || !mealName || !ingredientResult.ingredients.length) return;
    if (!consumer) return setModalMessage("Najpierw dodaj i wybierz profil osoby.");
    if (!servingCount) return setModalMessage("Podaj liczbę porcji od 1 do 100.");
    try {
      setBusy(true);
      setModalMessage("");
      await createMeal(mealName, type, ingredientResult.ingredients, servingCount, Date.now(), consumer);
      const depleted = pantry
        .filter((item) => {
          const amount = parseAmount(amounts[item.barcode]);
          if (!amount) return false;
          return shouldAskToBuyAgain(item, { ...item, quantity: Math.max(0, Math.round((item.quantity - amount) * 100) / 100) });
        })
        .map((item) => item.product);
      await refresh();
      creatorLayer.closeLayer();
      setMessage(`Zapisano dla: ${consumer.name}, 1 z ${servingCount} porcji: ${mealName}. Produkty zostały odjęte ze spiżarni.`);
      setDepletedProducts(depleted);
    } catch (error) {
      setModalMessage(error instanceof Error ? error.message : "Nie udało się zapisać posiłku.");
    } finally { setBusy(false); }
  }

  async function createConsumer() {
    try {
      const created = await addConsumer(newConsumer);
      setNewConsumer(""); setConsumers(await listConsumers()); setConsumer(created);
      setMessage(`Dodano osobę: ${created.name}.`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Nie udało się dodać osoby."); }
  }

  function setCreatorStep(nextStep: Step, selectedId: string | null = null, push = true) {
    setModalMessage("");
    appNavigation.updateState({ mode: stepMode(nextStep), selectedId }, { push });
  }

  function requestConsumerRemoval(item: Consumer) {
    setMessage("");
    profileDeleteLayer.openLayer({ modal: "meal-profile-delete", mode: "meal-profile-delete", selectedId: item.id });
  }

  async function confirmConsumerRemoval() {
    if (!consumerToDelete) return;
    try {
      setProfileBusy(true);
      await removeConsumer(consumerToDelete);
      const nextConsumers = await listConsumers();
      const nextSelected = consumer?.id === consumerToDelete.id
        ? nextConsumers[0] ?? null
        : nextConsumers.find((item) => item.id === consumer?.id) ?? nextConsumers[0] ?? null;
      setConsumers(nextConsumers);
      setConsumer(nextSelected);
      setDailySummary(nextSelected
        ? await getDailySummary(dateKey(), nextSelected)
        : { dateKey: dateKey(), totals: {}, mealCount: 0, updatedAt: Date.now() });
      profileDeleteLayer.closeLayer();
      setMessage(`Usunięto profil: ${consumerToDelete.name}. Historia posiłków pozostała zapisana.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Nie udało się usunąć profilu.");
    } finally {
      setProfileBusy(false);
    }
  }

  function backInCreator() {
    if (step === "amount" || step === "review") {
      setCreatorStep("products", null, false);
      return;
    }
    setCreatorStep("type", null, false);
  }

  return (
    <ModuleScreen title="Posiłki">
      <AddDepletedPrompt products={depletedProducts} onClose={() => setDepletedProducts([])} onAdded={() => setMessage("Zużyte produkty dodano do listy zakupów.")} />
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.pageHeader, compact && styles.compactPageHeader]}>
          <View style={styles.pageHeading}><Text style={styles.pageTitle}>Posiłki i dzienny bilans</Text><Text style={styles.muted}>{formatToday()} | Twórz posiłki z produktów zapisanych w spiżarni.</Text></View>
          <Pressable onPress={openCreator} style={[styles.newButton, compact && styles.compactNewButton]}><Text style={styles.white}>+ Nowy posiłek</Text></Pressable>
        </View>
        <View style={styles.consumerPanel}>
          <Text style={styles.consumerTitle}>Profile posiłków tego konta</Text>
          <Text style={styles.consumerHint}>Wybierz osobę, której bilans i historia mają być pokazane.</Text>
          {consumers.length ? <View style={styles.consumerList}>{consumers.map((item) => <View key={item.id} style={styles.consumerEntry}><Pressable onPress={() => setConsumer(item)} style={[styles.consumerChip, consumer?.id === item.id && styles.consumerChipActive]}><Text style={consumer?.id === item.id ? styles.white : styles.consumerChipText}>{item.name}</Text></Pressable><Pressable onPress={() => requestConsumerRemoval(item)} style={styles.removeConsumerButton}><Text style={styles.removeConsumerText}>Usuń</Text></Pressable></View>)}</View> : <Text style={styles.emptyConsumers}>Brak profili. Dodaj pierwszą osobę, aby liczyć kalorie.</Text>}
          <View style={styles.addConsumerRow}><TextInput value={newConsumer} onChangeText={setNewConsumer} onSubmitEditing={() => void createConsumer()} placeholder="Imię lub nazwa profilu" style={styles.addConsumerInput} /><Pressable onPress={() => void createConsumer()} style={styles.addConsumerButton}><Text style={styles.white}>+ Dodaj profil</Text></Pressable></View>
        </View>
        <DailyNutritionSummary summary={dailySummary} />
        {!!message && <Text style={styles.successBanner}>{message}</Text>}
        <MealHistory meals={consumer ? meals.filter((meal) => meal.consumerId === consumer.id) : []} onChanged={refresh} />
      </ScrollView>

      <Modal visible={profileDeleteLayer.open && !!consumerToDelete} transparent animationType="fade" onRequestClose={profileDeleteLayer.closeLayer}>
        <View style={styles.backdrop}><View style={styles.confirmProfileCard}>
          <Text style={styles.confirmProfileTitle}>Usunąć profil „{consumerToDelete?.name}”?</Text>
          <Text style={styles.confirmProfileText}>Profil zniknie z wyboru na tym koncie. Dotychczasowa historia posiłków pozostanie zapisana.</Text>
          <Pressable disabled={profileBusy} onPress={() => void confirmConsumerRemoval()} style={[styles.confirmProfileDelete, profileBusy && styles.disabled]}><Text style={styles.white}>{profileBusy ? "Usuwanie..." : "Usuń profil"}</Text></Pressable>
          <BottomActionBar label="Anuluj" onPress={profileDeleteLayer.closeLayer} />
        </View></View>
      </Modal>

      <Modal visible={creatorOpen} transparent animationType="fade" onRequestClose={creatorLayer.closeLayer}>
        <View style={[styles.backdrop, compact && styles.compactBackdrop]}>
          <View style={[styles.modalCard, compact && styles.compactModalCard, { maxHeight: Math.max(320, height - (compact ? 16 : 48)) }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeading}><Text style={styles.stepLabel}>{stepLabel(step)}</Text><Text style={[styles.modalTitle, compact && styles.compactModalTitle]}>{stepTitle(step, editedItem)}</Text></View>
            </View>

            {step === "type" && <TypeStep type={type} customName={customName} onType={chooseType} onCustomName={setCustomName} />}
            {step === "products" && <ProductsStep pantry={pantry} amounts={amounts} onEdit={editAmount} onRemove={removeIngredient} />}
            {step === "amount" && editedItem && <AmountStep item={editedItem} value={amountDraft} onChange={(value) => { setAmountDraft(value); setModalMessage(""); }} />}
            {step === "review" && consumer && <ReviewStep name={`${mealName} - ${consumer.name}`} ingredients={ingredientResult.ingredients} totals={totals} portionTotals={portionTotals} servings={servings} onServings={setServings} />}

            {!!modalMessage && <Text style={styles.errorBanner}>{modalMessage}</Text>}
            {(step !== "type" || type === "custom") && <View style={[styles.modalActions, compact && styles.compactModalActions]}>
              <View style={styles.actionSpacer} />
              {step === "type" && type === "custom" && <PrimaryButton label="Dalej: wybierz produkty" onPress={continueFromType} />}
              {step === "products" && <PrimaryButton label="Dalej: podsumowanie" onPress={continueToReview} />}
              {step === "amount" && <PrimaryButton label="Dodaj ilość" onPress={confirmAmount} />}
              {step === "review" && <PrimaryButton label={busy ? "Zapisywanie..." : "Zapisz i odejmij produkty"} onPress={() => void saveMeal()} disabled={busy} />}
            </View>}
            <BottomActionBar label={step === "type" ? "Zamknij" : "Wstecz"} onPress={step === "type" ? creatorLayer.closeLayer : backInCreator} />
          </View>
        </View>
      </Modal>
    </ModuleScreen>
  );
}

function TypeStep({ type, customName, onType, onCustomName }: { type: MealType | null; customName: string; onType: (type: MealType) => void; onCustomName: (value: string) => void }) {
  return <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContent}><Text style={styles.typeHint}>Kliknij rodzaj posiłku, aby od razu przejść do produktów.</Text>{mealTypes.map((item) => <Pressable key={item.value} onPress={() => onType(item.value)} style={[styles.typeCard, type === item.value && styles.selectedCard]}><View style={styles.radio}>{type === item.value && <View style={styles.radioDot} />}</View><View><Text style={styles.typeName}>{item.label}</Text><Text style={styles.muted}>{item.description}</Text></View></Pressable>)}{type === "custom" && <TextInput autoFocus value={customName} onChangeText={onCustomName} placeholder="Nazwa posiłku" style={styles.customInput} />}</ScrollView>;
}

function ProductsStep({ pantry, amounts, onEdit, onRemove }: { pantry: PantryItem[]; amounts: Record<string, string>; onEdit: (item: PantryItem) => void; onRemove: (barcode: string) => void }) {
  return <FlatList style={styles.stepScroll} contentContainerStyle={styles.listContent} data={pantry} keyExtractor={(item) => item.barcode} ListEmptyComponent={<Text style={styles.empty}>Spiżarnia jest pusta. Najpierw dodaj produkty w zakładce Spiżarnia lub Skaner.</Text>} renderItem={({ item }) => {
    const selected = parseAmount(amounts[item.barcode]);
    return <Pressable onPress={() => onEdit(item)} style={[styles.productCard, selected > 0 && styles.selectedProduct]}><View style={styles.productText}><Text style={styles.productName}>{item.product.name}</Text><Text style={styles.muted}>Dostępne: {item.quantity} {item.unit}</Text></View>{selected > 0 ? <View style={styles.selectedAmount}><Text style={styles.selectedAmountText}>{selected} {item.unit}</Text><Pressable onPress={(event: GestureResponderEvent) => { event.stopPropagation(); onRemove(item.barcode); }} hitSlop={10}><Text style={styles.removeText}>Usuń</Text></Pressable></View> : <Text style={styles.addText}>Wybierz</Text>}</Pressable>;
  }} />;
}

function AmountStep({ item, value, onChange }: { item: PantryItem; value: string; onChange: (value: string) => void }) {
  const amount = parseAmount(value);
  const missingUnitWeight = usesWeightPerPiece(item.product, item.unit) && !item.product.netWeightGrams;
  let kcal = 0;
  try { if (amount > 0) kcal = createMealIngredient(item, Math.min(amount, item.quantity)).nutrients.energyKcal ?? 0; } catch { /* A clear instruction is shown below. */ }
  const packageAmount = wholePackageConsumptionAmount(item.product, item.unit);
  return <ScrollView style={styles.amountStepScroll} contentContainerStyle={styles.amountStep} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><Text style={styles.available}>Dostępne w spiżarni: {item.quantity} {item.unit}</Text>{packageAmount && packageAmount <= item.quantity && <Pressable onPress={() => onChange(String(packageAmount))} style={styles.wholePackage}><Text style={styles.wholePackageText}>Zużyj całe opakowanie: 1 szt. ({item.product.packageAmount} {item.product.packageUnit})</Text></Pressable>}<View style={styles.amountEntry}><TextInput autoFocus selectTextOnFocus value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder="0" style={styles.amountInput} /><Text style={styles.amountUnit}>{item.unit}</Text></View><Text style={[styles.caloriePreview, missingUnitWeight && styles.missingDataText]}>{missingUnitWeight ? "Brak masy jednej sztuki. Uzupełnij ją w edycji produktu w zakładce Zapisane." : `Wybrana ilość: ${amount || 0} ${item.unit} | ok. ${kcal} kcal`}</Text></ScrollView>;
}

function ReviewStep({ name, ingredients, totals, portionTotals, servings, onServings }: { name: string; ingredients: MealIngredient[]; totals: Nutrients; portionTotals: Nutrients; servings: string; onServings: (value: string) => void }) {
  return <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="always"><Text style={styles.reviewName}>{name}</Text><View style={styles.servingsBox}><View style={styles.servingsText}><Text style={styles.sectionTitle}>Ile porcji powstało?</Text><Text style={styles.muted}>Ze spiżarni odejmiemy całe zużycie. Do Twojego bilansu trafi 1 porcja.</Text></View><TextInput value={servings} onChangeText={onServings} keyboardType="number-pad" selectTextOnFocus style={styles.servingsInput} /></View><Text style={styles.portionTitle}>Wartości jednej porcji</Text><NutritionSummary totals={portionTotals} /><Text style={styles.recipeInfo}>Całe danie: {totals.energyKcal ?? 0} kcal</Text><Text style={styles.sectionTitle}>Składniki całego dania</Text>{ingredients.map((ingredient) => <View key={ingredient.barcode} style={styles.reviewRow}><Text style={styles.reviewProduct}>{ingredient.productName}</Text><Text>{ingredient.amount} {ingredient.unit} | {ingredient.nutrients.energyKcal ?? 0} kcal</Text></View>)}</ScrollView>;
}

function NutritionSummary({ totals }: { totals: Nutrients }) {
  const entries = [["Kalorie", totals.energyKcal, "kcal"], ["Białko", totals.proteins, "g"], ["Węglowodany", totals.carbohydrates, "g"], ["Tłuszcz", totals.fat, "g"]];
  return <View style={styles.nutritionGrid}>{entries.map(([label, value, unit]) => <View key={String(label)} style={styles.nutritionCard}><Text style={styles.nutritionValue}>{value ?? 0}</Text><Text style={styles.muted}>{label} ({unit})</Text></View>)}</View>;
}

function DailyNutritionSummary({ summary }: { summary: DailySummary }) {
  const entries = [
    ["Kalorie", summary.totals.energyKcal, "kcal", true],
    ["Białko", summary.totals.proteins, "g", false],
    ["Węglowodany", summary.totals.carbohydrates, "g", false],
    ["Tłuszcz", summary.totals.fat, "g", false],
    ["Błonnik", summary.totals.fiber, "g", false],
    ["Sól", summary.totals.salt, "g", false],
    ["Potas", summary.totals.potassium, "mg", false],
    ["Wapń", summary.totals.calcium, "mg", false],
    ["Żelazo", summary.totals.iron, "mg", false],
    ["Magnez", summary.totals.magnesium, "mg", false],
    ["Wit. C", summary.totals.vitaminC, "mg", false]
  ] as const;
  return <View style={styles.dailyPanel}><View style={styles.dailyHeading}><Text style={styles.dailyTitle}>Spożycie dzisiaj</Text><Text style={styles.dailyCount}>{summary.mealCount} posiłków</Text></View><View style={styles.dailyGrid}>{entries.map(([label, value, unit, highlighted]) => <View key={label} style={styles.dailyItem}><Text style={[styles.dailyValue, highlighted && styles.dailyKcal]}>{value ?? 0} {unit}</Text><Text style={styles.dailyLabel}>{label}</Text></View>)}</View></View>;
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) { return <Pressable disabled={disabled} onPress={onPress} style={[styles.primary, disabled && styles.disabled]}><Text style={styles.white}>{label}</Text></Pressable>; }
function buildIngredients(pantry: PantryItem[], amounts: Record<string, string>) { const ingredients: MealIngredient[] = []; let error = ""; for (const item of pantry) { const amount = parseAmount(amounts[item.barcode]); if (amount <= 0) continue; try { ingredients.push(createMealIngredient(item, amount)); } catch (cause) { error = cause instanceof Error ? cause.message : "Nieprawidłowa ilość."; } } return { ingredients, error }; }
function parseAmount(value?: string) { const number = Number((value ?? "").replace(",", ".")); return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : 0; }
function parseServings(value?: string) { const number = Number(value); return Number.isInteger(number) && number >= 1 && number <= 100 ? number : 0; }
function stepLabel(step: Step) { return step === "type" ? "KROK 1 Z 3" : step === "review" ? "KROK 3 Z 3" : "KROK 2 Z 3"; }
function stepTitle(step: Step, item: PantryItem | null) { if (step === "type") return "Jaki to posiłek?"; if (step === "products") return "Wybierz produkty"; if (step === "amount") return `Podaj ilość: ${item?.product.name ?? "produkt"}`; return "Sprawdź posiłek"; }
function stepMode(step: Step) { return `meal-${step}`; }
function stepFromMode(mode: string | null): Step {
  if (mode === "meal-products") return "products";
  if (mode === "meal-amount") return "amount";
  if (mode === "meal-review") return "review";
  return "type";
}
function formatToday() { return new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" }); }

const styles = StyleSheet.create({
  pageScroll: { flex: 1, minHeight: 0 }, pageContent: { paddingBottom: 36 }, pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 14 }, compactPageHeader: { alignItems: "stretch", flexDirection: "column" }, pageHeading: { flex: 1, minWidth: 0 }, pageTitle: { fontSize: 22, fontWeight: "800" }, muted: { color: colors.muted, fontSize: 13, flexShrink: 1 }, newButton: { backgroundColor: colors.primary, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 12 }, compactNewButton: { alignItems: "center", width: "100%" }, white: { color: "white", fontWeight: "800" },
  consumerPanel: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 10, marginBottom: 12 }, consumerTitle: { fontSize: 17, fontWeight: "900" }, consumerHint: { color: colors.muted, fontSize: 13 }, consumerList: { gap: 8 }, consumerEntry: { flexDirection: "row", alignItems: "center", gap: 8 }, consumerChip: { flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 }, consumerChipActive: { backgroundColor: colors.primary, borderColor: colors.primary }, consumerChipText: { fontWeight: "800" }, removeConsumerButton: { backgroundColor: "#FFEBEE", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 }, removeConsumerText: { color: colors.danger, fontWeight: "800" }, emptyConsumers: { color: colors.muted, fontWeight: "700" }, addConsumerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, addConsumerInput: { flex: 1, minWidth: 170, backgroundColor: colors.background, borderRadius: 10, padding: 11 }, addConsumerButton: { minHeight: 48, backgroundColor: "#1565C0", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" }, confirmProfileCard: { width: "100%", maxWidth: 520, backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 14 }, confirmProfileTitle: { fontSize: 22, fontWeight: "900" }, confirmProfileText: { color: colors.muted, fontSize: 16, lineHeight: 22 }, confirmProfileDelete: { backgroundColor: colors.danger, borderRadius: 11, padding: 15, alignItems: "center" },
  dailyPanel: { backgroundColor: colors.surface, borderRadius: 18, padding: 15, marginBottom: 12 }, dailyHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }, dailyTitle: { fontSize: 19, fontWeight: "900" }, dailyCount: { color: colors.muted, fontWeight: "700" }, dailyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, dailyItem: { flexGrow: 1, flexBasis: 90, minWidth: 90, backgroundColor: colors.background, borderRadius: 11, padding: 10 }, dailyValue: { fontSize: 15, fontWeight: "900", color: colors.text }, dailyKcal: { color: colors.primary, fontSize: 19 }, dailyLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  successBanner: { color: "#1B5E20", backgroundColor: "#E8F5E9", borderRadius: 10, padding: 12, fontWeight: "700", marginBottom: 12 }, backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "center", padding: 24 }, compactBackdrop: { padding: 8 }, modalCard: { width: "90%", maxWidth: 900, height: "86%", backgroundColor: colors.surface, borderRadius: 22, padding: 22 }, compactModalCard: { width: "100%", height: "100%", borderRadius: 16, padding: 14 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", flexShrink: 0, gap: 8, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }, modalHeading: { flex: 1, minWidth: 0 }, stepLabel: { color: colors.primary, fontWeight: "800", fontSize: 12 }, modalTitle: { fontSize: 25, fontWeight: "900", marginTop: 3 }, compactModalTitle: { fontSize: 21 }, stepScroll: { flex: 1, minHeight: 0 }, stepContent: { paddingVertical: 16, gap: 10 },
  typeHint: { color: colors.primary, fontWeight: "800", marginBottom: 2 }, typeCard: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 2, borderColor: colors.border, borderRadius: 14, padding: 15 }, selectedCard: { borderColor: colors.primary, backgroundColor: "#EDF7EE" }, radio: { width: 22, height: 22, borderWidth: 2, borderColor: colors.primary, borderRadius: 11, alignItems: "center", justifyContent: "center" }, radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary }, typeName: { fontSize: 17, fontWeight: "800" }, customInput: { backgroundColor: colors.background, borderRadius: 12, padding: 14, fontSize: 17 },
  listContent: { paddingVertical: 14, gap: 9 }, productCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 15 }, selectedProduct: { borderColor: colors.primary, backgroundColor: "#EDF7EE" }, productText: { flex: 1 }, productName: { fontSize: 17, fontWeight: "800" }, addText: { color: colors.primary, fontWeight: "800" }, selectedAmount: { alignItems: "flex-end", gap: 4 }, selectedAmountText: { color: colors.primary, fontSize: 17, fontWeight: "900" }, removeText: { color: colors.danger, fontWeight: "700", fontSize: 12 }, empty: { color: colors.muted, textAlign: "center", marginTop: 70, lineHeight: 21 },
  amountStepScroll: { flex: 1, minHeight: 0 }, amountStep: { flexGrow: 1, alignItems: "center", justifyContent: "flex-start", gap: 18, paddingHorizontal: 4, paddingTop: 28, paddingBottom: 18 }, available: { color: colors.muted, fontSize: 17, textAlign: "center" }, wholePackage: { backgroundColor: "#E8F5E9", borderWidth: 1, borderColor: colors.primary, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 11 }, wholePackageText: { color: colors.primary, fontWeight: "800", textAlign: "center" }, amountEntry: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }, amountInput: { width: "70%", maxWidth: 220, backgroundColor: colors.background, borderWidth: 2, borderColor: colors.primary, borderRadius: 14, padding: 18, fontSize: 30, fontWeight: "900", textAlign: "center" }, amountUnit: { fontSize: 25, fontWeight: "900" }, caloriePreview: { fontSize: 16, color: colors.muted, textAlign: "center" }, missingDataText: { color: colors.danger, fontWeight: "700", maxWidth: 360 },
  reviewName: { fontSize: 23, fontWeight: "900" }, servingsBox: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#EDF7EE", borderRadius: 13, padding: 13 }, servingsText: { flex: 1, minWidth: 0 }, servingsInput: { width: 76, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary, borderRadius: 11, padding: 12, textAlign: "center", fontSize: 22, fontWeight: "900" }, portionTitle: { color: colors.primary, fontSize: 18, fontWeight: "900", marginTop: 4 }, recipeInfo: { color: colors.muted, fontWeight: "700" }, nutritionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 }, nutritionCard: { flexGrow: 1, flexBasis: 120, backgroundColor: colors.background, borderRadius: 12, padding: 13 }, nutritionValue: { fontSize: 21, fontWeight: "900", color: colors.primary }, sectionTitle: { fontSize: 18, fontWeight: "800", marginTop: 4 }, reviewRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 10 }, reviewProduct: { flex: 1, minWidth: 120, fontWeight: "700" },
  errorBanner: { color: colors.danger, backgroundColor: "#FFEBEE", borderRadius: 10, padding: 12, fontWeight: "700", marginTop: 10 }, modalActions: { flexDirection: "row", alignItems: "center", flexShrink: 0, gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, marginTop: 8 }, compactModalActions: { flexWrap: "wrap" }, actionSpacer: { flex: 1 }, primary: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 14 }, disabled: { opacity: 0.55 }
});
