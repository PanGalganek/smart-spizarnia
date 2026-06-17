import { PantryItem, Product, Unit } from "@/domain/product";
import { normalizePackages, packageCapacity, packageTotal } from "@/services/pantryPackages";

export function stockCapacity(item: PantryItem) {
  if (item.packages?.length) return Math.max(packageCapacity(normalizePackages(item)), packageTotal(normalizePackages(item)), 1);
  const packageAmount = packageAmountInPantryUnit(item.product, item.unit);
  const savedCapacity = Math.max(Number(item.capacity) || 0, item.quantity);
  if (packageAmount) return roundUpToPackages(savedCapacity, packageAmount);
  return Math.max(savedCapacity, 1);
}

export function stockPercentage(item: PantryItem) {
  return Math.max(0, Math.min(100, Math.round((item.quantity / stockCapacity(item)) * 100)));
}

export function capacityAfterStockChange(item: PantryItem | null, quantity: number, addedAmount: number, product: Product, unit: Unit) {
  const packageAmount = packageAmountInPantryUnit(product, unit);
  if (!item || item.quantity <= 0) return packageAmount ? roundUpToPackages(quantity, packageAmount) : Math.max(quantity, 1);
  const previousCapacity = stockCapacity(item);
  if (!packageAmount) return Math.max(previousCapacity, quantity);
  const requiredCapacity = roundUpToPackages(quantity, packageAmount);
  const addedPackagesCapacity = addedAmount >= packageAmount ? previousCapacity + roundUpToPackages(addedAmount, packageAmount) : previousCapacity;
  return Math.max(requiredCapacity, addedPackagesCapacity);
}

export function capacityForPackage(item: PantryItem, packageAmount?: number, packageUnit?: Unit) {
  if (!packageAmount || packageAmount <= 0 || packageUnit !== item.unit) return Math.max(item.quantity, 1);
  return roundUpToPackages(item.quantity, packageAmount);
}

function packageAmountInPantryUnit(product: Product, unit: Unit) {
  return product.packageUnit === unit && product.packageAmount && product.packageAmount > 0 ? product.packageAmount : undefined;
}

function roundUpToPackages(value: number, packageAmount: number) {
  return Math.max(packageAmount, Math.ceil(value / packageAmount) * packageAmount);
}
