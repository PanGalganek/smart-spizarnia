import { describe, expect, it } from "vitest";
import { PantryItem, Product } from "@/domain/product";
import { calculateNutrients, consumePantryItem, createMealIngredient, createUntrackedMealIngredient, restorePantryItem } from "@/services/nutrition";

function product(overrides: Partial<Product> = {}): Product {
  return {
    barcode: "123", name: "Serek", defaultUnit: "g", nutritionBasis: "per100",
    nutrientsPer100g: { energyKcal: 250, proteins: 10, carbohydrates: 4, fat: 20 },
    source: "manual", updatedAt: 1, ...overrides
  };
}

function pantryItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return { barcode: "123", product: product(), quantity: 500, unit: "g", status: "active", ...overrides };
}

describe("liczenie kalorii", () => {
  it("liczy kalorie i makro dla gramow na podstawie 100 g", () => {
    expect(calculateNutrients(product(), 200, "g")).toEqual({
      energyKcal: 500, proteins: 20, carbohydrates: 8, fat: 40
    });
  });

  it("liczy produkt rozliczany na sztuke", () => {
    const bun = product({ name: "Bulka", defaultUnit: "szt", nutritionBasis: "perUnit", nutrientsPer100g: { energyKcal: 180, proteins: 6 } });
    expect(calculateNutrients(bun, 2, "szt")).toEqual({ energyKcal: 360, proteins: 12 });
  });

  it("liczy kalorie plynu na podstawie 100 ml", () => {
    const milk = product({ name: "Mleko", defaultUnit: "ml", nutrientsPer100g: { energyKcal: 60, proteins: 3 } });
    expect(calculateNutrients(milk, 250, "ml")).toEqual({ energyKcal: 150, proteins: 7.5 });
  });
});

describe("zmiany stanu spizarni", () => {
  it("odejmuje dokladna ilosc i zachowuje jednostke", () => {
    expect(consumePantryItem(pantryItem(), 200)).toMatchObject({ quantity: 300, unit: "g", status: "active" });
  });

  it("oznacza produkt jako zuzyty po zejsciu do zera", () => {
    expect(consumePantryItem(pantryItem({ quantity: 200 }), 200)).toMatchObject({ quantity: 0, status: "consumed" });
  });

  it("blokuje zuzycie wiekszej ilosci niz dostepna", () => {
    expect(() => consumePantryItem(pantryItem({ quantity: 100 }), 200)).toThrow("Za malo produktu: Serek");
  });

  it("cofniecie przywraca dokladnie poprzedni stan", () => {
    const original = pantryItem({ quantity: 500 });
    const consumed = consumePantryItem(original, 200);
    expect(restorePantryItem(consumed, 200)).toMatchObject({ quantity: 500, status: "active" });
  });
});

describe("brak danych kalorycznych", () => {
  it("nie pozwala dodac produktu bez kcal do posilku", () => {
    const item = pantryItem({ product: product({ nutrientsPer100g: { proteins: 10 } }) });
    expect(() => createMealIngredient(item, 50)).toThrow("Uzupelnij kalorie produktu: Serek");
  });

  it("wymaga masy sztuki dla produktu liczonego na 100 g", () => {
    const item = pantryItem({
      unit: "szt",
      quantity: 2,
      product: product({ defaultUnit: "szt", nutritionBasis: "per100" })
    });
    expect(() => createMealIngredient(item, 1)).toThrow("Uzupelnij mase jednej sztuki");
  });
});

describe("produkt spozyty bez dodawania do spizarni", () => {
  it("liczy wartosci i oznacza skladnik jako niepowiazany ze stanem", () => {
    expect(createUntrackedMealIngredient(product({ name: "Baton" }), 50, "g")).toMatchObject({
      productName: "Baton",
      amount: 50,
      tracksPantry: false,
      nutrients: { energyKcal: 125, proteins: 5, carbohydrates: 2, fat: 10 }
    });
  });

  it("nadal wymaga kalorii", () => {
    expect(() => createUntrackedMealIngredient(product({ nutrientsPer100g: {} }), 1, "g")).toThrow("Uzupelnij kalorie produktu");
  });
});
