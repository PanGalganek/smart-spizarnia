import { Nutrients, NutritionBasis, Unit } from "@/domain/product";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "custom";

export type MealIngredient = {
  barcode: string;
  productName: string;
  amount: number;
  unit: Unit;
  nutritionBasis: NutritionBasis;
  nutrients: Nutrients;
  tracksPantry?: boolean;
};

export type Meal = {
  id: string;
  name: string;
  type: MealType;
  ingredients: MealIngredient[];
  servings?: number;
  recipeTotals?: Nutrients;
  totals: Nutrients;
  dateKey: string;
  createdAt: number;
  consumerId?: string;
  consumerName?: string;
};

export type DailySummary = {
  dateKey: string;
  totals: Nutrients;
  mealCount: number;
  updatedAt: number;
  consumerId?: string;
  consumerName?: string;
};

export type Consumer = {
  id: string;
  name: string;
  protected?: boolean;
};
