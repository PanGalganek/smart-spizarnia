export type Unit = "g" | "ml" | "szt";
export type NutritionBasis = "per100" | "perUnit";
export type PantryStatus = "active" | "consumed";
export type ProductType = "food" | "household_chemical";
export type ChemicalLevel = "full" | "more_than_half" | "half" | "less_than_half" | "empty";
export type PantryPackage = {
  id: string;
  amount: number;
  capacity: number;
  unit: Unit;
  expiryDate?: string;
  opened?: boolean;
  createdAt?: number;
};

export type Nutrients = {
  energyKcal?: number;
  proteins?: number;
  carbohydrates?: number;
  fat?: number;
  fiber?: number;
  salt?: number;
  sodium?: number;
  potassium?: number;
  calcium?: number;
  iron?: number;
  magnesium?: number;
  vitaminC?: number;
  vitaminA?: number;
};

export type Product = {
  barcode: string;
  name: string;
  type?: ProductType;
  brand?: string;
  imageUrl?: string;
  servingSize?: string;
  netWeightGrams?: number;
  packageAmount?: number;
  packageUnit?: Unit;
  quickUseAmount?: number;
  quickUseUnit?: Unit;
  defaultUnit?: Unit;
  nutritionBasis?: NutritionBasis;
  nutrientsPer100g: Nutrients;
  source: "open-food-facts" | "usda" | "manual";
  updatedAt: number;
};

export type PantryItem = {
  barcode: string;
  product: Product;
  quantity: number;
  chemicalLevel?: ChemicalLevel;
  capacity?: number;
  packages?: PantryPackage[];
  unit: Unit;
  expiryDate?: string;
  location?: string;
  status?: PantryStatus;
  updatedAt?: number;
};
