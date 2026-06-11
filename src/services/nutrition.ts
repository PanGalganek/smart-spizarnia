import { MealIngredient } from "@/domain/meal";
import { Nutrients, PantryItem, Product, Unit } from "@/domain/product";

export const nutrientKeys: (keyof Nutrients)[] = [
  "energyKcal", "proteins", "carbohydrates", "fat", "fiber", "salt"
];

export function calculateNutrients(product: Product, amount: number, unit: Unit): Nutrients {
  if (!Number.isFinite(amount) || amount <= 0) return {};
  const basis = product.nutritionBasis ?? "per100";
  const factor = basis === "perUnit" ? amount : amountInBaseUnits(product, amount, unit) / 100;

  return nutrientKeys.reduce<Nutrients>((result, key) => {
    const value = product.nutrientsPer100g[key];
    if (value !== undefined) result[key] = round(value * factor);
    return result;
  }, {});
}

export function createMealIngredient(item: PantryItem, amount: number): MealIngredient {
  validateConsumption(item, amount);
  return {
    barcode: item.barcode,
    productName: item.product.name,
    amount: round(amount),
    unit: item.unit,
    nutritionBasis: item.product.nutritionBasis ?? "per100",
    nutrients: calculateNutrients(item.product, amount, item.unit)
  };
}

export function validateConsumption(item: PantryItem, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Ilosc musi byc wieksza od zera.");
  if (amount > item.quantity) throw new Error(`Za malo produktu: ${item.product.name}`);
  if (
    item.unit === "szt" &&
    (item.product.nutritionBasis ?? "per100") === "per100" &&
    !item.product.netWeightGrams
  ) {
    throw new Error(`Uzupelnij mase jednej sztuki: ${item.product.name}`);
  }
  if (item.product.nutrientsPer100g.energyKcal === undefined) {
    throw new Error(`Uzupelnij kalorie produktu: ${item.product.name}`);
  }
}

export function consumePantryItem(item: PantryItem, amount: number): PantryItem {
  validateConsumption(item, amount);
  const quantity = round(item.quantity - amount);
  return { ...item, quantity, status: quantity === 0 ? "consumed" : "active" };
}

export function restorePantryItem(item: PantryItem, amount: number): PantryItem {
  return { ...item, quantity: round(item.quantity + amount), status: "active" };
}

export function sumNutrients(values: Nutrients[]): Nutrients {
  return values.reduce<Nutrients>((total, nutrients) => addNutrients(total, nutrients), {});
}

export function addNutrients(left: Nutrients, right: Nutrients, multiplier = 1): Nutrients {
  return nutrientKeys.reduce<Nutrients>((result, key) => {
    const value = (left[key] ?? 0) + (right[key] ?? 0) * multiplier;
    if (left[key] !== undefined || right[key] !== undefined) result[key] = round(Math.max(0, value));
    return result;
  }, {});
}

export function dateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function amountInBaseUnits(product: Product, amount: number, unit: Unit) {
  if (unit === "szt") {
    if (!product.netWeightGrams) throw new Error(`Brak masy jednej sztuki: ${product.name}`);
    return amount * product.netWeightGrams;
  }
  return amount;
}

export function round(value: number) {
  return Math.round(value * 100) / 100;
}
