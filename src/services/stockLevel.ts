import { PantryItem } from "@/domain/product";

export function stockCapacity(item: PantryItem) {
  if (item.capacity && item.capacity > 0) return Math.max(item.capacity, item.quantity);
  if (item.product.packageUnit === item.unit && item.product.packageAmount) {
    return Math.max(item.product.packageAmount, item.quantity);
  }
  return Math.max(item.quantity, 1);
}

export function stockPercentage(item: PantryItem) {
  return Math.max(0, Math.min(100, Math.round((item.quantity / stockCapacity(item)) * 100)));
}
