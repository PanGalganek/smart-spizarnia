import { describe, expect, it } from "vitest";
import { parseUsdaNutrients, translateFoodQuery } from "@/services/usdaFoodData";

describe("wyszukiwanie USDA", () => {
  it("tłumaczy popularne polskie nazwy produktów", () => {
    expect(translateFoodQuery("pomidor")).toBe("tomato");
    expect(translateFoodQuery("Jabłko")).toBe("apple");
  });

  it("mapuje makro i mikroelementy na 100 g", () => {
    const nutrients = parseUsdaNutrients([
      { nutrientId: 1008, unitName: "KCAL", value: 18 },
      { nutrientId: 1003, unitName: "G", value: 0.88 },
      { nutrientId: 1004, unitName: "G", value: 0.2 },
      { nutrientId: 1005, unitName: "G", value: 3.89 },
      { nutrientId: 1092, unitName: "MG", value: 237 },
      { nutrientId: 1093, unitName: "MG", value: 5 },
      { nutrientId: 1162, unitName: "MG", value: 13.7 }
    ]);
    expect(nutrients).toMatchObject({ energyKcal: 18, proteins: 0.88, fat: 0.2, carbohydrates: 3.89, potassium: 237, sodium: 5, salt: 0.01, vitaminC: 13.7 });
  });
});
