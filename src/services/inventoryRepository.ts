import { collection, doc, getDocs, runTransaction, setDoc } from "firebase/firestore";
import { db } from "@/core/firebase";
import { Meal, MealIngredient } from "@/domain/meal";
import { PantryItem, Product } from "@/domain/product";
import { sumNutrients } from "@/services/nutrition";

const products = collection(db, "products");
const pantry = collection(db, "pantry");
const meals = collection(db, "meals");

function withoutUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function saveProduct(product: Product) {
  await setDoc(doc(products, product.barcode), withoutUndefined(product), { merge: true });
}

export async function changePantryQuantity(product: Product, delta: number) {
  const storedProduct = withoutUndefined(product);
  const ref = doc(pantry, product.barcode);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists() ? Number(snapshot.data().quantity) : 0;
    transaction.set(ref, {
      barcode: product.barcode,
      product: storedProduct,
      quantity: Math.max(0, current + delta),
      unit: "szt"
    }, { merge: true });
  });
  await saveProduct(product);
}

export async function listPantry(): Promise<PantryItem[]> {
  const snapshot = await getDocs(pantry);
  return snapshot.docs
    .map((item) => item.data() as PantryItem)
    .filter((item) => item.quantity > 0);
}

export async function listSavedProducts(): Promise<Product[]> {
  const snapshot = await getDocs(products);
  return snapshot.docs.map((item) => item.data() as Product);
}

export async function createMeal(name: string, ingredients: MealIngredient[]): Promise<Meal> {
  const mealRef = doc(meals);
  const meal: Meal = {
    id: mealRef.id,
    name,
    ingredients,
    totals: sumNutrients(ingredients.map((item) => item.nutrients)),
    createdAt: Date.now()
  };

  await runTransaction(db, async (transaction) => {
    const pantryRefs = ingredients.map((item) => doc(pantry, item.barcode));
    const snapshots = await Promise.all(pantryRefs.map((ref) => transaction.get(ref)));

    snapshots.forEach((snapshot, index) => {
      const requested = ingredients[index].amount;
      const available = snapshot.exists() ? Number(snapshot.data().quantity) : 0;
      if (requested <= 0 || requested > available) {
        throw new Error(`Za malo produktu: ${ingredients[index].productName}`);
      }
    });

    snapshots.forEach((snapshot, index) => {
      transaction.update(pantryRefs[index], {
        quantity: Number(snapshot.get("quantity")) - ingredients[index].amount
      });
    });
    transaction.set(mealRef, meal);
  });

  return meal;
}

export async function listMeals(): Promise<Meal[]> {
  const snapshot = await getDocs(meals);
  return snapshot.docs
    .map((item) => item.data() as Meal)
    .sort((left, right) => right.createdAt - left.createdAt);
}

export async function renameMeal(mealId: string, name: string) {
  await setDoc(doc(meals, mealId), { name: name.trim() }, { merge: true });
}

export async function deleteMeal(meal: Meal, restoreIngredients: boolean) {
  const mealRef = doc(meals, meal.id);
  await runTransaction(db, async (transaction) => {
    if (restoreIngredients) {
      const pantryRefs = meal.ingredients.map((item) => doc(pantry, item.barcode));
      const snapshots = await Promise.all(pantryRefs.map((ref) => transaction.get(ref)));
      snapshots.forEach((snapshot, index) => {
        const current = snapshot.exists() ? Number(snapshot.get("quantity")) : 0;
        transaction.set(pantryRefs[index], {
          quantity: current + meal.ingredients[index].amount
        }, { merge: true });
      });
    }
    transaction.delete(mealRef);
  });
}
