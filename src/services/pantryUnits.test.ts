import { describe, expect, it } from "vitest";
import { Product } from "@/domain/product";
import { capConsumptionToAvailable, convertPantryAmount, preferredPantryUnit, wholePackageConsumptionAmount } from "@/services/pantryUnits";

const cream: Product = {
  barcode: "1", name: "Śmietana", packageAmount: 200, packageUnit: "ml", defaultUnit: "ml",
  nutrientsPer100g: { energyKcal: 200 }, source: "manual", updatedAt: 1
};

describe("przeliczanie opakowań w spiżarni", () => {
  it("przelicza całe opakowanie na mililitry", () => {
    expect(preferredPantryUnit(cream, "szt")).toBe("ml");
    expect(convertPantryAmount(cream, 1, "szt", "ml")).toBe(200);
  });

  it("przelicza kilka opakowań", () => {
    expect(convertPantryAmount(cream, 3, "szt", "ml")).toBe(600);
  });

  it("blokuje przeliczenie bez znanej gramatury", () => {
    expect(() => convertPantryAmount({ ...cream, packageAmount: undefined }, 1, "szt", "ml")).toThrow("Nie można przeliczyć");
  });
  it("przycina szybkie zużycie do pozostałej ilości produktu", () => {
    expect(capConsumptionToAvailable(cream, 60, "ml", 80, "ml")).toEqual({ amount: 60, unit: "ml", capped: true });
  });

  it("nie myli kartonu jaj z pojedynczym jajkiem", () => {
    const eggs = { ...cream, name: "Jajka", packageAmount: 12, packageUnit: "szt" as const, defaultUnit: "szt" as const };
    expect(wholePackageConsumptionAmount(eggs, "szt")).toBeUndefined();
  });
});
