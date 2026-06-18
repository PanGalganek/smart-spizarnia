import { ChemicalLevel, PantryItem, Product, ProductType } from "@/domain/product";

export const productTypes: { type: ProductType; label: string }[] = [
  { type: "food", label: "Produkty spożywcze" },
  { type: "household_chemical", label: "Produkty chemiczne" }
];

export const chemicalLevels: { value: ChemicalLevel; label: string; quantity: number }[] = [
  { value: "full", label: "Cały", quantity: 100 },
  { value: "more_than_half", label: "Więcej niż pół", quantity: 75 },
  { value: "half", label: "Połowa", quantity: 50 },
  { value: "less_than_half", label: "Mniej niż pół", quantity: 25 },
  { value: "empty", label: "Zużyty", quantity: 0 }
];

export function productType(product?: Product | null): ProductType {
  return product?.type ?? "food";
}

export function isChemical(product?: Product | null) {
  return productType(product) === "household_chemical";
}

export function withProductType(product: Product, type: ProductType): Product {
  if (type === "food") return { ...product, type: "food" };
  return {
    ...product,
    type: "household_chemical",
    defaultUnit: "szt",
    nutritionBasis: undefined,
    nutrientsPer100g: {}
  };
}

export function chemicalLevelLabel(level?: ChemicalLevel) {
  return chemicalLevels.find((item) => item.value === level)?.label ?? "Cały";
}

export function chemicalLevelQuantity(level: ChemicalLevel) {
  return chemicalLevels.find((item) => item.value === level)?.quantity ?? 100;
}

export function chemicalLevelFromQuantity(quantity: number): ChemicalLevel {
  if (quantity <= 0) return "empty";
  if (quantity < 50) return "less_than_half";
  if (quantity === 50) return "half";
  if (quantity < 100) return "more_than_half";
  return "full";
}

export function normalizeChemicalItem(item: PantryItem): PantryItem {
  if (!isChemical(item.product)) return item;
  const level = item.chemicalLevel ?? chemicalLevelFromQuantity(item.quantity);
  return {
    ...item,
    chemicalLevel: level,
    quantity: chemicalLevelQuantity(level),
    capacity: 100,
    unit: "szt",
    status: level === "empty" ? "consumed" : "active"
  };
}

export function shouldAskForChemicalShopping(before: PantryItem, after: PantryItem) {
  if (!isChemical(after.product)) return false;
  const beforeLevel = before.chemicalLevel ?? chemicalLevelFromQuantity(before.quantity);
  const afterLevel = after.chemicalLevel ?? chemicalLevelFromQuantity(after.quantity);
  return !["less_than_half", "empty"].includes(beforeLevel) && ["less_than_half", "empty"].includes(afterLevel);
}
