import { describe, expect, it } from "vitest";
import { PantryItem, Product } from "@/domain/product";
import { addPackages, consumePackages, packageSummary } from "@/services/pantryPackages";

const milk: Product = {
  barcode: "milk",
  name: "Mleko",
  packageAmount: 1000,
  packageUnit: "ml",
  defaultUnit: "ml",
  nutrientsPer100g: { energyKcal: 50 },
  source: "manual",
  updatedAt: 1
};

const pasta: Product = {
  barcode: "pasta",
  name: "Makaron",
  packageAmount: 500,
  packageUnit: "g",
  defaultUnit: "g",
  nutrientsPer100g: { energyKcal: 350 },
  source: "manual",
  updatedAt: 1
};

function item(product: Product, quantity = 0): PantryItem {
  return { barcode: product.barcode, product, quantity, unit: product.packageUnit ?? "g", status: "active" };
}

describe("pantry packages", () => {
  it("stores two milk cartons and consumes from the first opened carton", () => {
    const added = addPackages(null, milk, 2, "szt", 1);
    const consumed = consumePackages({ ...item(milk), ...added }, 200, "ml");
    const summary = packageSummary({ ...item(milk), ...consumed });

    expect(consumed.quantity).toBe(1800);
    expect(summary.text).toBe("1 × 1000 ml + 800 ml otwarte");
  });

  it("removes one whole cottage cheese package without showing grams as the main state", () => {
    const cheese = { ...pasta, barcode: "cheese", name: "Serek", packageAmount: 200 };
    const added = addPackages(null, cheese, 3, "szt", 1);
    const consumed = consumePackages({ ...item(cheese), ...added }, 1, "szt");

    expect(consumed.quantity).toBe(400);
    expect(packageSummary({ ...item(cheese), ...consumed }).text).toBe("2 × 200 g");
  });

  it("opens pasta package when using part of it", () => {
    const added = addPackages(null, pasta, 2, "szt", 1);
    const consumed = consumePackages({ ...item(pasta), ...added }, 150, "g");

    expect(packageSummary({ ...item(pasta), ...consumed }).text).toBe("1 × 500 g + 350 g otwarte");
  });
});
