import { Nutrients, Product } from "@/domain/product";

const nutrientKeys: (keyof Nutrients)[] = [
  "energyKcal",
  "proteins",
  "carbohydrates",
  "fat",
  "fiber",
  "salt"
];

export function calculateNutrients(product: Product, quantity: number): Nutrients {
  const grams = (product.netWeightGrams ?? 100) * quantity;
  const factor = grams / 100;
  return nutrientKeys.reduce<Nutrients>((result, key) => {
    const value = product.nutrientsPer100g[key];
    if (value !== undefined) result[key] = round(value * factor);
    return result;
  }, {});
}

export function sumNutrients(values: Nutrients[]): Nutrients {
  return values.reduce<Nutrients>((total, nutrients) => {
    for (const key of nutrientKeys) {
      const value = nutrients[key];
      if (value !== undefined) total[key] = round((total[key] ?? 0) + value);
    }
    return total;
  }, {});
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
