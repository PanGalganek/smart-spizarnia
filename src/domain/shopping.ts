import { Product } from "@/domain/product";

export type ShoppingItemStatus = "active" | "purchased";
export type ShoppingItemSource = "depleted" | "saved" | "manual";

export type ShoppingItem = {
  id: string;
  name: string;
  productBarcode?: string;
  product?: Product;
  source: ShoppingItemSource;
  status: ShoppingItemStatus;
  createdAt: number;
  updatedAt: number;
  purchasedAt?: number;
};
