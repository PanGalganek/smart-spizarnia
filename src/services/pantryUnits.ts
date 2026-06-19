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

export function wholePackageConsumptionAmount(product: Product, pantryUnit: Unit) {
  if (!canUseWholePackage(product)) return undefined;
  // A package containing pieces (for example 12 eggs) is not one edible piece.
  if (product.packageUnit === "szt" && pantryUnit === "szt") return undefined;
  return convertPantryAmount(product, 1, "szt", pantryUnit);
}

export function capConsumptionToAvailable(product: Product, availableAmount: number, pantryUnit: Unit, requestedAmount: number, requestedUnit: Unit) {
  const requestedInPantryUnit = convertPantryAmount(product, requestedAmount, requestedUnit, pantryUnit);
  if (requestedInPantryUnit > availableAmount) return { amount: availableAmount, unit: pantryUnit, capped: true };
  return { amount: requestedAmount, unit: requestedUnit, capped: false };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
