import { describe, expect, it } from "vitest";
import { MealTemplate } from "@/domain/meal";
import { PantryItem, Product } from "@/domain/product";
import { prepareTemplateIngredients } from "@/services/mealTemplateValidation";

function product(overrides: Partial<Product> = {}): Product {
  return {
    barcode: "mleko", name: "Mleko", defaultUnit: "ml", nutritionBasis: "per100",
    nutrientsPer100g: { energyKcal: 60, proteins: 3.2 }, source: "manual", updatedAt: 1, ...overrides
  };
}

function pantryItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return { barcode: "mleko", product: product(), quantity: 1000, unit: "ml", status: "active", ...overrides };
}

function template(overrides: Partial<MealTemplate> = {}): MealTemplate {
  return {
    id: "sniadanie", name: "Śniadanie", type: "breakfast", servings: 1, createdAt: 1, updatedAt: 1,
    ingredients: [{ barcode: "mleko", productName: "Mleko", amount: 250, unit: "ml" }],
    ...overrides
  };
}

describe("szablony posiłków", () => {
  it("przygotowuje składniki z aktualnej spiżarni i liczy wartości odżywcze", () => {
    const result = prepareTemplateIngredients(template(), [pantryItem()]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ingredients[0]).toMatchObject({ amount: 250, unit: "ml", nutrients: { energyKcal: 150, proteins: 8 } });
  });

  it("blokuje cały szablon, gdy brakuje wymaganej ilości", () => {
    const result = prepareTemplateIngredients(template(), [pantryItem({ quantity: 100 })]);
    expect(result).toEqual({ ok: false, issues: ["Mleko: potrzeba 250 ml, dostępne 100 ml."] });
  });

  it("blokuje szablon, gdy produktu nie ma już w spiżarni", () => {
    const result = prepareTemplateIngredients(template(), []);
    expect(result).toEqual({ ok: false, issues: ["Mleko: brak produktu w spiżarni."] });
  });

  it("nie dopuszcza produktu chemicznego do szablonu posiłku", () => {
    const result = prepareTemplateIngredients(template(), [pantryItem({ product: product({ type: "household_chemical", nutrientsPer100g: {} }) })]);
    expect(result).toEqual({ ok: false, issues: ["Mleko: produkt chemiczny nie może należeć do posiłku."] });
  });
});
