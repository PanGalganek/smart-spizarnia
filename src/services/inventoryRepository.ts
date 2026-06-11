import { collection, doc, getDocs, runTransaction, setDoc } from "firebase/firestore";
import { db } from "@/core/firebase";
import { DailySummary, Meal, MealIngredient, MealType } from "@/domain/meal";
import { PantryItem, Product, Unit } from "@/domain/product";
import { addNutrients, dateKey, sumNutrients } from "@/services/nutrition";

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
    unit: item.unit ?? item.product.defaultUnit ?? "szt",
    status: item.status ?? (quantity > 0 ? "active" : "consumed")
  };
}

function normalizeMeal(meal: Meal): Meal {
  return {
    ...meal,
    type: meal.type ?? "custom",
    dateKey: meal.dateKey ?? dateKey(meal.createdAt),
    ingredients: meal.ingredients.map((item) => ({
      ...item,
      unit: item.unit ?? "szt",
      nutritionBasis: item.nutritionBasis ?? "per100"
    }))
  };
}

export async function saveProduct(product: Product) {
  await setDoc(doc(products, product.barcode), withoutUndefined(product), { merge: true });
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
) {
  const ref = doc(pantry, product.barcode);
  const unit = selectedUnit ?? product.defaultUnit ?? "szt";
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists() ? normalizePantryItem(snapshot.data() as PantryItem) : null;
    if (current && current.quantity > 0 && current.unit !== unit) throw new Error(`Produkt jest zapisany w jednostce ${current.unit}.`);
    const quantity = Math.max(0, Math.round(((current?.quantity ?? 0) + delta) * 100) / 100);
    transaction.set(ref, withoutUndefined({
      barcode: product.barcode,
      product,
      quantity,
      unit: current?.unit ?? unit,
      expiryDate: metadata?.expiryDate ?? current?.expiryDate,
      location: metadata?.location ?? current?.location,
      status: quantity === 0 ? "consumed" : "active",
      updatedAt: Date.now()
    }), { merge: true });
  });
  await saveProduct(product);
}

export async function listPantry(includeConsumed = false): Promise<PantryItem[]> {
  const snapshot = await getDocs(pantry);
  return snapshot.docs
    .map((item) => normalizePantryItem(item.data() as PantryItem))
    .filter((item) => includeConsumed || item.quantity > 0)
    .sort((left, right) => left.product.name.localeCompare(right.product.name, "pl"));
}

export async function listSavedProducts(): Promise<Product[]> {
  const snapshot = await getDocs(products);
  return snapshot.docs.map((item) => item.data() as Product);
}

export async function createMeal(
  name: string,
  type: MealType,
  ingredients: MealIngredient[],
  createdAt = Date.now()
): Promise<Meal> {
  if (!ingredients.length) throw new Error("Dodaj przynajmniej jeden skladnik.");
  const mealRef = doc(meals);
  const day = dateKey(createdAt);
  const summaryRef = doc(dailySummaries, day);
  const meal: Meal = {
    id: mealRef.id,
    name,
    type,
    ingredients,
    totals: sumNutrients(ingredients.map((item) => item.nutrients)),
    dateKey: day,
    createdAt
  };

  await runTransaction(db, async (transaction) => {
    const pantryRefs = ingredients.map((item) => doc(pantry, item.barcode));
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
      const quantity = Math.round((item.quantity - ingredients[index].amount) * 100) / 100;
      transaction.update(pantryRefs[index], {
        quantity,
        status: quantity === 0 ? "consumed" : "active",
        updatedAt: Date.now()
      });
    });

    const current = summarySnapshot.exists()
      ? summarySnapshot.data() as DailySummary
      : { dateKey: day, totals: {}, mealCount: 0, updatedAt: createdAt };
    transaction.set(summaryRef, withoutUndefined({
      dateKey: day,
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

export async function getDailySummary(day: string): Promise<DailySummary> {
  const summaries = await getDocs(dailySummaries);
  const found = summaries.docs.find((item) => item.id === day);
  if (found) return found.data() as DailySummary;
  const dayMeals = await listMeals(day);
  return {
    dateKey: day,
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
  const summaryRef = doc(dailySummaries, meal.dateKey);

  await runTransaction(db, async (transaction) => {
    const pantryRefs = restoreIngredients ? meal.ingredients.map((item) => doc(pantry, item.barcode)) : [];
    const pantrySnapshots = await Promise.all(pantryRefs.map((ref) => transaction.get(ref)));
    const summarySnapshot = await transaction.get(summaryRef);

    pantrySnapshots.forEach((snapshot, index) => {
      const ingredient = meal.ingredients[index];
      const current = snapshot.exists() ? normalizePantryItem(snapshot.data() as PantryItem) : null;
      if (!current) throw new Error(`Nie mozna przywrocic produktu: ${ingredient.productName}`);
      if (current.unit !== ingredient.unit) throw new Error(`Jednostka produktu ulegla zmianie: ${ingredient.productName}`);
    });

    pantrySnapshots.forEach((snapshot, index) => {
      const current = normalizePantryItem(snapshot.data() as PantryItem);
      transaction.update(pantryRefs[index], {
        quantity: Math.round((current.quantity + meal.ingredients[index].amount) * 100) / 100,
        status: "active",
        updatedAt: Date.now()
      });
    });

    if (summarySnapshot.exists()) {
      const current = summarySnapshot.data() as DailySummary;
      transaction.set(summaryRef, withoutUndefined({
        ...current,
        totals: addNutrients(current.totals ?? {}, meal.totals, -1),
        mealCount: Math.max(0, (current.mealCount ?? 1) - 1),
        updatedAt: Date.now()
      }));
    }
    transaction.delete(mealRef);
  });
}

export function unitLabel(unit: Unit) {
  return unit;
}
