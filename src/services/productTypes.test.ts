import { describe, expect, it } from "vitest";
import { PantryItem, Product } from "@/domain/product";
import {
  chemicalLevelFromQuantity,
  chemicalLevelLabel,
  normalizeChemicalItem,
  productType,
  shouldAskForChemicalShopping,
  withProductType
} from "@/services/productTypes";

const food: Product = {
  barcode: "food-1",
  name: "Mleko",
  type: "food",
  defaultUnit: "ml",
  nutrientsPer100g: { energyKcal: 50 },
  source: "manual",
  updatedAt: 1
};

const chemical = withProductType({ ...food, barcode: "chem-1", name: "Płyn do naczyń" }, "household_chemical");

function pantryItem(product: Product, quantity: number): PantryItem {
  return {
    barcode: product.barcode,
    product,
    quantity,
    unit: "szt",
    status: quantity <= 0 ? "consumed" : "active",
    updatedAt: 1
  };
}

describe("product type helpers", () => {
  it("treats missing product type as food for backward compatibility", () => {
    expect(productType({ ...food, type: undefined })).toBe("food");
  });

  it("strips nutrition data from household chemicals", () => {
    expect(chemical.type).toBe("household_chemical");
    expect(chemical.defaultUnit).toBe("szt");
    expect(chemical.nutrientsPer100g).toEqual({});
  });

  it("maps chemical stock levels to simple labels and quantities", () => {
    expect(chemicalLevelLabel("less_than_half")).toBe("Mniej niż pół");
    expect(chemicalLevelFromQuantity(0)).toBe("empty");
    expect(chemicalLevelFromQuantity(25)).toBe("less_than_half");
    expect(chemicalLevelFromQuantity(50)).toBe("half");
    expect(chemicalLevelFromQuantity(75)).toBe("more_than_half");
    expect(chemicalLevelFromQuantity(100)).toBe("full");
  });

  it("normalizes household chemicals to a fixed percentage scale", () => {
    const item = normalizeChemicalItem({ ...pantryItem(chemical, 75), chemicalLevel: "more_than_half" });

    expect(item.quantity).toBe(75);
    expect(item.capacity).toBe(100);
    expect(item.unit).toBe("szt");
    expect(item.status).toBe("active");
  });

  it("asks for shopping list only when chemical stock crosses the low threshold", () => {
    expect(shouldAskForChemicalShopping({ ...pantryItem(chemical, 50), chemicalLevel: "half" }, { ...pantryItem(chemical, 25), chemicalLevel: "less_than_half" })).toBe(true);
    expect(shouldAskForChemicalShopping({ ...pantryItem(chemical, 25), chemicalLevel: "less_than_half" }, { ...pantryItem(chemical, 0), chemicalLevel: "empty" })).toBe(false);
    expect(shouldAskForChemicalShopping(pantryItem(food, 50), pantryItem(food, 25))).toBe(false);
  });
});
