import { describe, expect, it } from "vitest";
import { PantryItem, Product } from "@/domain/product";
import { addPackages, consumePackages, packageSummary, setPackageExpiryDate } from "@/services/pantryPackages";

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
    expect(summary.text).toBe("1 × 1000 ml + 800 ml");
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

    expect(packageSummary({ ...item(pasta), ...consumed }).text).toBe("1 × 500 g + 350 g");
  });

  it("uses selected package when opening one of many closed packages", () => {
    const added = addPackages(null, milk, 2, "szt", 1, "2026-06-20");
    const secondPackage = added.packages[1];
    const consumed = consumePackages({ ...item(milk), ...added }, 200, "ml", secondPackage.id);

    expect(consumed.packages.find((pack) => pack.id === secondPackage.id)?.amount).toBe(800);
    expect(packageSummary({ ...item(milk), ...consumed }).activeExpiryDate).toBe("2026-06-20");
  });

  it("stores optional expiry dates for each added package", () => {
    const added = addPackages(null, milk, 3, "szt", 1, undefined, [undefined, "2026-06-18", "2026-06-25"]);

    expect(added.packages.map((pack) => pack.expiryDate)).toEqual([undefined, "2026-06-18", "2026-06-25"]);
  });

  it("updates and clears the expiry date of one selected package", () => {
    const added = addPackages(null, milk, 2, "szt", 1, undefined, ["2026-06-19", "2026-06-30"]);
    const pantryItem = { ...item(milk), ...added, expiryDate: "2026-06-19" };
    const firstPackageId = added.packages[0].id;
    const changed = setPackageExpiryDate(pantryItem, firstPackageId, "2026-07-01");
    const cleared = setPackageExpiryDate(changed, firstPackageId);

    expect(changed.packages?.map((pack) => pack.expiryDate)).toEqual(["2026-07-01", "2026-06-30"]);
    expect(changed.expiryDate).toBeUndefined();
    expect(cleared.packages?.map((pack) => pack.expiryDate)).toEqual([undefined, "2026-06-30"]);
  });
});
