import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc } from "firebase/firestore";
import { db } from "@/core/firebase";
import { Consumer, DailySummary, Meal, MealIngredient, MealType } from "@/domain/meal";
import { PantryItem, Product, Unit } from "@/domain/product";
import { addNutrients, dateKey, scaleNutrients, sumNutrients } from "@/services/nutrition";
import { convertPantryAmount, preferredPantryUnit } from "@/services/pantryUnits";
import { capacityAfterStockChange, capacityForPackage, stockCapacity } from "@/services/stockLevel";

const products = collection(db, "products");
const pantry = collection(db, "pantry");
const meals = collection(db, "meals");
const dailySummaries = collection(db, "dailySummaries");

function withoutUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizePantryItem(item: PantryItem): PantryItem {
  const quantity = Number(item.quantity) || 0;
  return {
    ...item,
    quantity,
    capacity: stockCapacity({ ...item, quantity }),
    unit: item.unit ?? item.product.defaultUnit ?? "szt",
    status: item.status ?? (quantity > 0 ? "active" : "consumed")
  };
}

function normalizeMeal(meal: Meal): Meal {
  const servings = Math.max(1, Number(meal.servings) || 1);
  return {
    ...meal,
    type: meal.type ?? "custom",
    dateKey: meal.dateKey ?? dateKey(meal.createdAt),
    servings,
    consumerId: meal.consumerId ?? "bartek",
    consumerName: meal.consumerName ?? "Bartek",
    recipeTotals: meal.recipeTotals ?? (servings === 1 ? meal.totals : undefined),
    ingredients: meal.ingredients.map((item) => ({
      ...item,
      unit: item.unit ?? "szt",
      nutritionBasis: item.nutritionBasis ?? "per100",
      tracksPantry: item.tracksPantry ?? true
    }))
  };
}

export async function saveProduct(product: Product) {
  await setDoc(doc(products, product.barcode), withoutUndefined(product), { merge: true });
}

export async function getSavedProduct(barcode: string): Promise<Product | null> {
  const snapshot = await getDoc(doc(products, barcode));
  return snapshot.exists() ? snapshot.data() as Product : null;
}

export async function updateProductDetails(product: Product): Promise<Product> {
  const updated = { ...product, updatedAt: Date.now() };
  await saveProduct(updated);
  const pantryItem = await getPantryItem(product.barcode);
  if (pantryItem) await savePantryItem({ ...pantryItem, product: updated });
  return updated;
}

export async function deleteSavedProduct(barcode: string) {
  await deleteDoc(doc(products, barcode));
}

export async function updateProductPackage(product: Product, packageAmount: number, packageUnit: Unit): Promise<Product> {
  if (!Number.isFinite(packageAmount) || packageAmount <= 0) throw new Error("Pojemność opakowania musi być większa od zera.");
  const updated: Product = {
    ...product,
    packageAmount,
    packageUnit,
    netWeightGrams: packageUnit === "g" ? packageAmount : product.netWeightGrams,
    updatedAt: Date.now()
  };
  await saveProduct(updated);
  const pantryItem = await getPantryItem(product.barcode);
  if (pantryItem) {
    await savePantryItem({
      ...pantryItem,
      product: updated,
      capacity: capacityForPackage(pantryItem, packageAmount, packageUnit)
    });
  }
  return updated;
}

export async function savePantryItem(item: PantryItem) {
  const normalized = normalizePantryItem({ ...item, updatedAt: Date.now() });
  await setDoc(doc(pantry, item.barcode), withoutUndefined(normalized), { merge: true });
  await saveProduct(item.product);
}

export async function changePantryQuantity(
  product: Product,
  delta: number,
  selectedUnit?: Unit,
  metadata?: { expiryDate?: string; location?: string }
): Promise<PantryItem> {
  const ref = doc(pantry, product.barcode);
  const inputUnit = selectedUnit ?? product.defaultUnit ?? "szt";
  const updated = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists() ? normalizePantryItem(snapshot.data() as PantryItem) : null;
    const unit = current?.unit ?? preferredPantryUnit(product, inputUnit);
    const convertedDelta = convertPantryAmount(product, Math.abs(delta), inputUnit, unit) * Math.sign(delta);
    const previousQuantity = current?.quantity ?? 0;
    if (convertedDelta < 0 && Math.abs(convertedDelta) > previousQuantity) throw new Error(`W spiżarni jest tylko ${previousQuantity} ${unit}.`);
    const quantity = Math.round((previousQuantity + convertedDelta) * 100) / 100;
    const next: PantryItem = {
      barcode: product.barcode,
      product,
      quantity,
      capacity: convertedDelta > 0
        ? capacityAfterStockChange(current, quantity, convertedDelta, product, current?.unit ?? unit)
        : current ? stockCapacity(current) : Math.max(previousQuantity, 1),
      unit: current?.unit ?? unit,
      expiryDate: metadata?.expiryDate ?? current?.expiryDate,
      location: metadata?.location ?? current?.location,
      status: quantity === 0 ? "consumed" : "active",
      updatedAt: Date.now()
    };
    transaction.set(ref, withoutUndefined(next), { merge: true });
    return next;
  });
  await saveProduct(product);
  return updated;
}

export async function listPantry(includeConsumed = false): Promise<PantryItem[]> {
  const snapshot = await getDocs(pantry);
  return snapshot.docs
    .map((item) => normalizePantryItem(item.data() as PantryItem))
    .filter((item) => includeConsumed || item.quantity > 0)
    .sort((left, right) => left.product.name.localeCompare(right.product.name, "pl"));
}

export async function getPantryItem(barcode: string): Promise<PantryItem | null> {
  const snapshot = await getDoc(doc(pantry, barcode));
  return snapshot.exists() ? normalizePantryItem(snapshot.data() as PantryItem) : null;
}

export async function deletePantryItem(barcode: string) {
  await deleteDoc(doc(pantry, barcode));
}

export async function listSavedProducts(): Promise<Product[]> {
  const snapshot = await getDocs(products);
  return snapshot.docs.map((item) => item.data() as Product);
}

export async function createMeal(
  name: string,
  type: MealType,
  ingredients: MealIngredient[],
  servings = 1,
  createdAt = Date.now(),
  consumer: Consumer = { id: "bartek", name: "Bartek" }
): Promise<Meal> {
  if (!ingredients.length) throw new Error("Dodaj przynajmniej jeden składnik.");
  if (!Number.isInteger(servings) || servings < 1 || servings > 100) throw new Error("Podaj liczbę porcji od 1 do 100.");
  const mealRef = doc(meals);
  const day = dateKey(createdAt);
  const summaryRef = doc(dailySummaries, summaryId(day, consumer.id));
  const legacySummaryRef = doc(dailySummaries, day);
  const recipeTotals = sumNutrients(ingredients.map((item) => item.nutrients));
  const meal: Meal = {
    id: mealRef.id,
    name,
    type,
    ingredients,
    servings,
    recipeTotals,
    totals: scaleNutrients(recipeTotals, servings),
    dateKey: day,
    createdAt,
    consumerId: consumer.id,
    consumerName: consumer.name
  };

  await runTransaction(db, async (transaction) => {
    const pantryRefs = ingredients.map((item) => doc(pantry, item.barcode));
    const pantrySnapshots = await Promise.all(pantryRefs.map((ref) => transaction.get(ref)));
    const summarySnapshot = await transaction.get(summaryRef);
    const legacySummarySnapshot = consumer.id === "bartek" ? await transaction.get(legacySummaryRef) : null;

    pantrySnapshots.forEach((snapshot, index) => {
      const ingredient = ingredients[index];
      if (!snapshot.exists()) throw new Error(`Brak produktu: ${ingredient.productName}`);
      const item = normalizePantryItem(snapshot.data() as PantryItem);
      if (item.unit !== ingredient.unit) throw new Error(`Jednostka produktu ulegla zmianie: ${ingredient.productName}`);
      if (ingredient.amount <= 0 || ingredient.amount > item.quantity) throw new Error(`Za malo produktu: ${ingredient.productName}`);
    });

    pantrySnapshots.forEach((snapshot, index) => {
      const item = normalizePantryItem(snapshot.data() as PantryItem);
      const quantity = Math.round((item.quantity - ingredients[index].amount) * 100) / 100;
      transaction.update(pantryRefs[index], {
        quantity,
        status: quantity === 0 ? "consumed" : "active",
        updatedAt: Date.now()
      });
    });

    const current = summarySnapshot.exists()
      ? summarySnapshot.data() as DailySummary
      : legacySummarySnapshot?.exists()
        ? legacySummarySnapshot.data() as DailySummary
      : { dateKey: day, totals: {}, mealCount: 0, updatedAt: createdAt };
    transaction.set(summaryRef, withoutUndefined({
      dateKey: day,
      consumerId: consumer.id,
      consumerName: consumer.name,
      totals: addNutrients(current.totals ?? {}, meal.totals),
      mealCount: (current.mealCount ?? 0) + 1,
      updatedAt: Date.now()
    }));
    transaction.set(mealRef, withoutUndefined(meal));
  });

  return meal;
}

export async function createUntrackedMeal(
  name: string,
  type: MealType,
  ingredient: MealIngredient,
  createdAt = Date.now(),
  consumer: Consumer = { id: "bartek", name: "Bartek" }
): Promise<Meal> {
  const mealRef = doc(meals);
  const day = dateKey(createdAt);
  const summaryRef = doc(dailySummaries, summaryId(day, consumer.id));
  const legacySummaryRef = doc(dailySummaries, day);
  const meal: Meal = {
    id: mealRef.id,
    name,
    type,
    ingredients: [{ ...ingredient, tracksPantry: false }],
    totals: ingredient.nutrients,
    dateKey: day,
    createdAt,
    consumerId: consumer.id,
    consumerName: consumer.name
  };

  await runTransaction(db, async (transaction) => {
    const summarySnapshot = await transaction.get(summaryRef);
    const legacySummarySnapshot = consumer.id === "bartek" ? await transaction.get(legacySummaryRef) : null;
    const current = summarySnapshot.exists()
      ? summarySnapshot.data() as DailySummary
      : legacySummarySnapshot?.exists()
        ? legacySummarySnapshot.data() as DailySummary
      : { dateKey: day, totals: {}, mealCount: 0, updatedAt: createdAt };
    transaction.set(summaryRef, withoutUndefined({
      dateKey: day,
      consumerId: consumer.id,
      consumerName: consumer.name,
      totals: addNutrients(current.totals ?? {}, meal.totals),
      mealCount: (current.mealCount ?? 0) + 1,
      updatedAt: Date.now()
    }));
    transaction.set(mealRef, withoutUndefined(meal));
  });
  return meal;
}

export async function listMeals(day?: string): Promise<Meal[]> {
  const snapshot = await getDocs(meals);
  return snapshot.docs
    .map((item) => normalizeMeal(item.data() as Meal))
    .filter((meal) => !day || meal.dateKey === day)
    .sort((left, right) => right.createdAt - left.createdAt);
}

export async function getDailySummary(day: string, consumer: Consumer = { id: "bartek", name: "Bartek" }): Promise<DailySummary> {
  const found = await getDoc(doc(dailySummaries, summaryId(day, consumer.id)));
  if (found.exists()) return found.data() as DailySummary;
  const dayMeals = (await listMeals(day)).filter((meal) => meal.consumerId === consumer.id);
  return {
    dateKey: day,
    consumerId: consumer.id,
    consumerName: consumer.name,
    totals: sumNutrients(dayMeals.map((meal) => meal.totals)),
    mealCount: dayMeals.length,
    updatedAt: Date.now()
  };
}

export async function renameMeal(mealId: string, name: string) {
  await setDoc(doc(meals, mealId), { name: name.trim() }, { merge: true });
}

export async function deleteMeal(mealInput: Meal, restoreIngredients = true) {
  const meal = normalizeMeal(mealInput);
  const mealRef = doc(meals, meal.id);
  const summaryRef = doc(dailySummaries, summaryId(meal.dateKey, meal.consumerId ?? "bartek"));
  const legacySummaryRef = doc(dailySummaries, meal.dateKey);

  await runTransaction(db, async (transaction) => {
    const restorableIngredients = restoreIngredients ? meal.ingredients.filter((item) => item.tracksPantry !== false) : [];
    const pantryRefs = restorableIngredients.map((item) => doc(pantry, item.barcode));
    const pantrySnapshots = await Promise.all(pantryRefs.map((ref) => transaction.get(ref)));
    const summarySnapshot = await transaction.get(summaryRef);
    const legacySummarySnapshot = !summarySnapshot.exists() && (meal.consumerId ?? "bartek") === "bartek" ? await transaction.get(legacySummaryRef) : null;

    pantrySnapshots.forEach((snapshot, index) => {
      const ingredient = restorableIngredients[index];
      const current = snapshot.exists() ? normalizePantryItem(snapshot.data() as PantryItem) : null;
      if (!current) throw new Error(`Nie można przywrócić produktu: ${ingredient.productName}`);
      if (current.unit !== ingredient.unit) throw new Error(`Jednostka produktu ulegla zmianie: ${ingredient.productName}`);
    });

    pantrySnapshots.forEach((snapshot, index) => {
      const current = normalizePantryItem(snapshot.data() as PantryItem);
      transaction.update(pantryRefs[index], {
        quantity: Math.round((current.quantity + restorableIngredients[index].amount) * 100) / 100,
        status: "active",
        updatedAt: Date.now()
      });
    });

    if (summarySnapshot.exists() || legacySummarySnapshot?.exists()) {
      const current = (summarySnapshot.exists() ? summarySnapshot.data() : legacySummarySnapshot?.data()) as DailySummary;
      const mealCount = Math.max(0, (current.mealCount ?? 1) - 1);
      if (mealCount === 0) transaction.delete(summaryRef);
      else transaction.set(summaryRef, withoutUndefined({
          ...current,
          totals: addNutrients(current.totals ?? {}, meal.totals, -1),
          mealCount,
          updatedAt: Date.now()
        }));
    }
    transaction.delete(mealRef);
  });
}

function summaryId(day: string, consumerId: string) {
  return `${day}__${consumerId}`;
}

export function unitLabel(unit: Unit) {
  return unit;
}
