import { describe, expect, it } from "vitest";
import { parsePackageSize } from "@/services/openFoodFacts";

describe("gramatura Open Food Facts", () => {
  it("odczytuje gramy z pola quantity", () => {
    expect(parsePackageSize({ quantity: "500 g" })).toEqual({ amount: 500, unit: "g" });
  });

  it("przelicza litry na mililitry", () => {
    expect(parsePackageSize({ quantity: "1,5 l" })).toEqual({ amount: 1500, unit: "ml" });
  });

  it("sumuje gramature wielopaku", () => {
    expect(parsePackageSize({ quantity: "6 x 50 g" })).toEqual({ amount: 300, unit: "g" });
  });

  it("korzysta z pol strukturalnych API", () => {
    expect(parsePackageSize({ product_quantity: 750, product_quantity_unit: "ml" })).toEqual({ amount: 750, unit: "ml" });
  });
});
