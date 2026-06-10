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
  nutrientsPer100g: Nutrients;
  source: "open-food-facts" | "manual";
  updatedAt: number;
};

export type PantryItem = {
  barcode: string;
  product: Product;
  quantity: number;
  unit: "szt" | "g" | "ml";
};
