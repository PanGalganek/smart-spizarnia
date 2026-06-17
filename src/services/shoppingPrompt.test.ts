import { describe, expect, it } from "vitest";
import { PantryItem } from "@/domain/product";
import { shouldAskToBuyAgain } from "@/services/shoppingPrompt";

const baseItem: PantryItem = {
  barcode: "590-test",
  product: {
    barcode: "590-test",
    name: "Serek",
    packageAmount: 200,
    packageUnit: "g",
    defaultUnit: "g",
    nutrientsPer100g: { energyKcal: 100 },
    source: "manual",
    updatedAt: 1
  },
  quantity: 200,
  capacity: 800,
  unit: "g",
  status: "active"
};

describe("shouldAskToBuyAgain", () => {
  it("asks when stock crosses below 30 percent", () => {
    expect(shouldAskToBuyAgain({ ...baseItem, quantity: 260 }, { ...baseItem, quantity: 200 })).toBe(true);
  });

  it("asks when product reaches zero", () => {
    expect(shouldAskToBuyAgain({ ...baseItem, quantity: 50 }, { ...baseItem, quantity: 0 })).toBe(true);
  });

  it("does not ask repeatedly when stock was already below 30 percent", () => {
    expect(shouldAskToBuyAgain({ ...baseItem, quantity: 200 }, { ...baseItem, quantity: 150 })).toBe(false);
  });
});
