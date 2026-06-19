import { deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc } from "firebase/firestore";
import { db } from "@/core/firebase";
import { Consumer, DailySummary, Meal, MealIngredient, MealType } from "@/domain/meal";
import { PantryItem, Product, Unit } from "@/domain/product";
import { addNutrients, dateKey, scaleNutrients, sumNutrients } from "@/services/nutrition";
import { addPackages, consumePackages, normalizePackages, packageCapacity, packageTotal, packageUnit } from "@/services/pantryPackages";
import { capacityForPackage, stockCapacity } from "@/services/stockLevel";
import { chemicalLevelQuantity, isChemical, normalizeChemicalItem } from "@/services/productTypes";
import { userCollection, userDoc } from "@/services/userData";

function withoutUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizePantryItem(item: PantryItem): PantryItem {
  if (isChemical(item.product)) return normalizeChemicalItem(item);
  const unit = item.unit ?? item.product.defaultUnit ?? "szt";
  const packages = normalizePackages({ ...item, unit });
  const quantity = packageTotal(packages);
  return {
    ...item,
    packages,
    quantity,
    capacity: packageCapacity(packages) || stockCapacity({ ...item, quantity, unit }),
    unit,
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
    consumerId: meal.consumerId ?? "legacy",
    consumerName: meal.consumerName ?? "Nieprzypisane",
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
  await setDoc(userDoc("products", product.barcode), withoutUndefined({ ...product, type: product.type ?? "food" }), { merge: true });
}

export async function getSavedProduct(barcode: string): Promise<Product | null> {
  const snapshot = await getDoc(userDoc("products", barcode));
  return snapshot.exists() ? { ...snapshot.data() as Product, type: (snapshot.data() as Product).type ?? "food" } : null;
}

export async function updateProductDetails(product: Product): Promise<Product> {
  const updated = { ...product, updatedAt: Date.now() };
  await saveProduct(updated);
  const pantryItem = await getPantryItem(product.barcode);
  if (pantryItem) await savePantryItem({ ...pantryItem, product: updated });
  return updated;
}

export async function deleteSavedProduct(barcode: string) {
  await deleteDoc(userDoc("products", barcode));
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
  await setDoc(userDoc("pantry", item.barcode), withoutUndefined(normalized));
  await saveProduct(normalized.product);
}

export async function saveChemicalPantryItem(product: Product, chemicalLevel: PantryItem["chemicalLevel"], metadata?: { location?: string }) {
  const level = chemicalLevel ?? "full";
  const item: PantryItem = {
    barcode: product.barcode,
    product: { ...product, type: "household_chemical", nutrientsPer100g: {}, defaultUnit: "szt" },
    quantity: chemicalLevelQuantity(level),
    capacity: 100,
    chemicalLevel: level,
    unit: "szt",
    location: metadata?.location,
    status: level === "empty" ? "consumed" : "active",
    updatedAt: Date.now()
  };
  await setDoc(userDoc("pantry", product.barcode), withoutUndefined(item), { merge: true });
  await saveProduct(item.product);
  return item;
}

export async function changePantryQuantity(
  product: Product,
  delta: number,
  selectedUnit?: Unit,
  metadata?: { expiryDate?: string; location?: string; packageId?: string; packageExpiryDates?: (string | undefined)[] }
): Promise<PantryItem> {
  const ref = userDoc("pantry", product.barcode);
  const inputUnit = selectedUnit ?? product.defaultUnit ?? "szt";
  const updated = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists() ? normalizePantryItem(snapshot.data() as PantryItem) : null;
    const unit = packageUnit(product, inputUnit, current?.unit);
    const previousQuantity = current?.quantity ?? 0;
    const stock = delta >= 0
      ? addPackages(current, product, Math.abs(delta), inputUnit, Date.now(), metadata?.expiryDate, metadata?.packageExpiryDates)
      : current
        ? consumePackages(current, Math.abs(delta), inputUnit, metadata?.packageId)
        : (() => { throw new Error(`W spiżarni jest tylko 0 ${unit}.`); })();
    const next: PantryItem = {
      barcode: product.barcode,
      product,
      quantity: stock.quantity,
      capacity: stock.capacity || Math.max(previousQuantity, 1),
      packages: stock.packages,
      unit: stock.unit,
      expiryDate: metadata?.expiryDate ?? current?.expiryDate,
      location: metadata?.location ?? current?.location,
      status: stock.quantity === 0 ? "consumed" : "active",
      updatedAt: Date.now()
    };
    transaction.set(ref, withoutUndefined(next), { merge: true });
    return next;
  });
  await saveProduct(product);
  return updated;
}

export async function listPantry(includeConsumed = false): Promise<PantryItem[]> {
  const snapshot = await getDocs(userCollection("pantry"));
  return snapshot.docs
    .map((item) => normalizePantryItem(item.data() as PantryItem))
    .filter((item) => includeConsumed || item.quantity > 0)
    .sort((left, right) => left.product.name.localeCompare(right.product.name, "pl"));
}

export async function getPantryItem(barcode: string): Promise<PantryItem | null> {
  const snapshot = await getDoc(userDoc("pantry", barcode));
  return snapshot.exists() ? normalizePantryItem(snapshot.data() as PantryItem) : null;
}

export async function deletePantryItem(barcode: string) {
  await deleteDoc(userDoc("pantry", barcode));
}

export async function listSavedProducts(): Promise<Product[]> {
  const snapshot = await getDocs(userCollection("products"));
  return snapshot.docs.map((item) => ({ ...item.data() as Product, type: (item.data() as Product).type ?? "food" }));
}

export async function createMeal(
  name: string,
  type: MealType,
  ingredients: MealIngredient[],
  servings = 1,
  createdAt = Date.now(),
  consumer: Consumer | null = null
): Promise<Meal> {
  if (!ingredients.length) throw new Error("Dodaj przynajmniej jeden składnik.");
  if (!Number.isInteger(servings) || servings < 1 || servings > 100) throw new Error("Podaj liczbę porcji od 1 do 100.");
  if (!consumer) throw new Error("Najpierw wybierz profil osoby.");
  const mealRef = doc(userCollection("meals"));
  const day = dateKey(createdAt);
  const summaryRef = userDoc("dailySummaries", summaryId(day, consumer.id));
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
    const pantryRefs = ingredients.map((item) => userDoc("pantry", item.barcode));
    const pantrySnapshots = await Promise.all(pantryRefs.map((ref) => transaction.get(ref)));
    const summarySnapshot = await transaction.get(summaryRef);

    pantrySnapshots.forEach((snapshot, index) => {
      const ingredient = ingredients[index];
      if (!snapshot.exists()) throw new Error(`Brak produktu: ${ingredient.productName}`);
      const item = normalizePantryItem(snapshot.data() as PantryItem);
      if (item.unit !== ingredient.unit) throw new Error(`Jednostka produktu ulegla zmianie: ${ingredient.productName}`);
      if (ingredient.amount <= 0 || ingredient.amount > item.quantity) throw new Error(`Za malo produktu: ${ingredient.productName}`);
    });

    pantrySnapshots.forEach((snapshot, index) => {
      const item = normalizePantryItem(snapshot.data() as PantryItem);
      const stock = consumePackages(item, ingredients[index].amount, ingredients[index].unit);
      transaction.update(pantryRefs[index], {
        quantity: stock.quantity,
        capacity: stock.capacity,
        packages: withoutUndefined(stock.packages),
        status: stock.quantity === 0 ? "consumed" : "active",
        updatedAt: Date.now()
      });
    });

    const current = summarySnapshot.exists()
      ? summarySnapshot.data() as DailySummary
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
  consumer: Consumer | null = null
): Promise<Meal> {
  if (!consumer) throw new Error("Najpierw wybierz profil osoby.");
  const mealRef = doc(userCollection("meals"));
  const day = dateKey(createdAt);
  const summaryRef = userDoc("dailySummaries", summaryId(day, consumer.id));
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
    const current = summarySnapshot.exists()
      ? summarySnapshot.data() as DailySummary
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
  const snapshot = await getDocs(userCollection("meals"));
  return snapshot.docs
    .map((item) => normalizeMeal(item.data() as Meal))
    .filter((meal) => !day || meal.dateKey === day)
    .sort((left, right) => right.createdAt - left.createdAt);
}

export async function getDailySummary(day: string, consumer: Consumer): Promise<DailySummary> {
  const found = await getDoc(userDoc("dailySummaries", summaryId(day, consumer.id)));
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
  await setDoc(userDoc("meals", mealId), { name: name.trim() }, { merge: true });
}

export async function deleteMeal(mealInput: Meal, restoreIngredients = true) {
  const meal = normalizeMeal(mealInput);
  const mealRef = userDoc("meals", meal.id);
  const summaryRef = userDoc("dailySummaries", summaryId(meal.dateKey, meal.consumerId ?? "legacy"));

  await runTransaction(db, async (transaction) => {
    const restorableIngredients = restoreIngredients ? meal.ingredients.filter((item) => item.tracksPantry !== false) : [];
    const pantryRefs = restorableIngredients.map((item) => userDoc("pantry", item.barcode));
    const pantrySnapshots = await Promise.all(pantryRefs.map((ref) => transaction.get(ref)));
    const summarySnapshot = await transaction.get(summaryRef);

    pantrySnapshots.forEach((snapshot, index) => {
      const ingredient = restorableIngredients[index];
      const current = snapshot.exists() ? normalizePantryItem(snapshot.data() as PantryItem) : null;
      if (!current) throw new Error(`Nie można przywrócić produktu: ${ingredient.productName}`);
      if (current.unit !== ingredient.unit) throw new Error(`Jednostka produktu ulegla zmianie: ${ingredient.productName}`);
    });

    pantrySnapshots.forEach((snapshot, index) => {
      const current = normalizePantryItem(snapshot.data() as PantryItem);
      const stock = addPackages(current, current.product, restorableIngredients[index].amount, restorableIngredients[index].unit);
      transaction.update(pantryRefs[index], {
        quantity: stock.quantity,
        capacity: stock.capacity,
        packages: withoutUndefined(stock.packages),
        status: "active",
        updatedAt: Date.now()
      });
    });

    if (summarySnapshot.exists()) {
      const current = summarySnapshot.data() as DailySummary;
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
