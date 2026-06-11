import { describe, expect, it } from "vitest";
import { Product } from "@/domain/product";
import { convertPantryAmount, preferredPantryUnit } from "@/services/pantryUnits";

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
});
