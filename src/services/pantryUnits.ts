import { Product, Unit } from "@/domain/product";

export function preferredPantryUnit(product: Product, inputUnit: Unit): Unit {
  if (inputUnit === "szt" && product.packageAmount && product.packageUnit) return product.packageUnit;
  return inputUnit;
}

export function convertPantryAmount(product: Product, amount: number, inputUnit: Unit, pantryUnit: Unit) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Ilość musi być większa od zera.");
  if (inputUnit === pantryUnit) return round(amount);

  const packageAmount = product.packageAmount ?? (product.packageUnit === "g" ? product.netWeightGrams : undefined);
  const packageUnit = product.packageUnit ?? (product.netWeightGrams ? "g" : undefined);

  if (inputUnit === "szt" && packageAmount && packageUnit === pantryUnit) return round(amount * packageAmount);
  if (pantryUnit === "szt" && packageAmount && packageUnit === inputUnit) return round(amount / packageAmount);

  throw new Error(`Nie można przeliczyć ${inputUnit} na ${pantryUnit}. Użyj jednostki zapisanej w spiżarni.`);
}

export function canUseWholePackage(product: Product) {
  return Boolean(product.packageAmount && product.packageUnit);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
