import { Nutrients } from "@/domain/product";

export type MealIngredient = {
  barcode: string;
  productName: string;
  amount: number;
  unit: "szt";
  gramsPerUnit: number;
  nutrients: Nutrients;
};

export type Meal = {
  id: string;
  name: string;
  ingredients: MealIngredient[];
  totals: Nutrients;
  createdAt: number;
};
