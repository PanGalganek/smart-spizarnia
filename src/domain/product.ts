export type Unit = "g" | "ml" | "szt";
export type NutritionBasis = "per100" | "perUnit";
export type PantryStatus = "active" | "consumed";

export type Nutrients = {
  energyKcal?: number;
  proteins?: number;
  carbohydrates?: number;
  fat?: number;
  fiber?: number;
  salt?: number;
};

export type Product = {
  barcode: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  servingSize?: string;
  netWeightGrams?: number;
  defaultUnit?: Unit;
  nutritionBasis?: NutritionBasis;
  nutrientsPer100g: Nutrients;
  source: "open-food-facts" | "manual";
  updatedAt: number;
};

export type PantryItem = {
  barcode: string;
  product: Product;
  quantity: number;
  unit: Unit;
  expiryDate?: string;
  location?: string;
  status?: PantryStatus;
  updatedAt?: number;
};
