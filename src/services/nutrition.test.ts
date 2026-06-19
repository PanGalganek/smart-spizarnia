import { describe, expect, it } from "vitest";
import { PantryItem, Product } from "@/domain/product";
import { calculateNutrients, consumePantryItem, createMealIngredient, createUntrackedMealIngredient, restorePantryItem, scaleNutrients } from "@/services/nutrition";

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

  it("liczy produkt rozliczany na sztukę", () => {
    const bun = product({ name: "Bulka", defaultUnit: "szt", nutritionBasis: "perUnit", nutrientsPer100g: { energyKcal: 180, proteins: 6 } });
    expect(calculateNutrients(bun, 2, "szt")).toEqual({ energyKcal: 360, proteins: 12 });
  });

  it("liczy kalorie plynu na podstawie 100 ml", () => {
    const milk = product({ name: "Mleko", defaultUnit: "ml", nutrientsPer100g: { energyKcal: 60, proteins: 3 } });
    expect(calculateNutrients(milk, 250, "ml")).toEqual({ energyKcal: 150, proteins: 7.5 });
  });
});

describe("zmiany stanu spiżarni", () => {
  it("odejmuje dokładną ilość i zachowuje jednostke", () => {
    expect(consumePantryItem(pantryItem(), 200)).toMatchObject({ quantity: 300, unit: "g", status: "active" });
  });

  it("oznacza produkt jako zużyty po zejściu do zera", () => {
    expect(consumePantryItem(pantryItem({ quantity: 200 }), 200)).toMatchObject({ quantity: 0, status: "consumed" });
  });

  it("blokuje zużycie większej ilości niż dostępna", () => {
    expect(() => consumePantryItem(pantryItem({ quantity: 100 }), 200)).toThrow("Za malo produktu: Serek");
  });

  it("cofnięcie przywraca dokładnie poprzedni stan", () => {
    const original = pantryItem({ quantity: 500 });
    const consumed = consumePantryItem(original, 200);
    expect(restorePantryItem(consumed, 200)).toMatchObject({ quantity: 500, status: "active" });
  });
});

describe("brak danych kalorycznych", () => {
  it("nie pozwala dodać produktu bez kcal do posiłku", () => {
    const item = pantryItem({ product: product({ nutrientsPer100g: { proteins: 10 } }) });
    expect(() => createMealIngredient(item, 50)).toThrow("Uzupełnij kalorie produktu: Serek");
  });

  it("wymaga masy sztuki dla produktu liczonego na 100 g", () => {
    const item = pantryItem({
      unit: "szt",
      quantity: 2,
      product: product({ defaultUnit: "szt", nutritionBasis: "per100" })
    });
    expect(() => createMealIngredient(item, 1)).toThrow("Uzupełnij masę jednej sztuki");
  });

  it("liczy jajko po podaniu masy pojedynczej sztuki", () => {
    const item = pantryItem({
      unit: "szt",
      quantity: 2,
      product: product({ name: "Jajko", defaultUnit: "szt", nutritionBasis: "per100", netWeightGrams: 50, nutrientsPer100g: { energyKcal: 140, proteins: 12 } })
    });
    expect(createMealIngredient(item, 1).nutrients).toEqual({ energyKcal: 70, proteins: 6 });
  });
});

describe("produkt spożyty bez dodawania do spiżarni", () => {
  it("liczy wartości i oznacza składnik jako niepowiązany ze stanem", () => {
    expect(createUntrackedMealIngredient(product({ name: "Baton" }), 50, "g")).toMatchObject({
      productName: "Baton",
      amount: 50,
      tracksPantry: false,
      nutrients: { energyKcal: 125, proteins: 5, carbohydrates: 2, fat: 10 }
    });
  });

  it("nadal wymaga kalorii", () => {
    expect(() => createUntrackedMealIngredient(product({ nutrientsPer100g: {} }), 1, "g")).toThrow("Uzupełnij kalorie produktu");
  });
});

describe("dzielenie posiłku na porcje", () => {
  it("dzieli kalorie oraz wszystkie makro i mikroelementy", () => {
    expect(scaleNutrients({ energyKcal: 800, proteins: 40, potassium: 1200, vitaminC: 30 }, 4)).toEqual({
      energyKcal: 200, proteins: 10, potassium: 300, vitaminC: 7.5
    });
  });

  it("odrzuca nieprawidłową liczbę porcji", () => {
    expect(() => scaleNutrients({ energyKcal: 100 }, 0)).toThrow("Liczba porcji");
  });
});
