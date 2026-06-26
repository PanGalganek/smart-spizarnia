import { MealIngredient, MealTemplate } from "@/domain/meal";
import { PantryItem } from "@/domain/product";
import { createMealIngredient } from "@/services/nutrition";
import { isChemical } from "@/services/productTypes";

export type TemplatePreparation =
  | { ok: true; ingredients: MealIngredient[] }
  | { ok: false; issues: string[] };

export function prepareTemplateIngredients(template: MealTemplate, pantry: PantryItem[]): TemplatePreparation {
  const availableItems = new Map(pantry.map((item) => [item.barcode, item]));
  const issues: string[] = [];
  const ingredients: MealIngredient[] = [];

  for (const savedIngredient of template.ingredients) {
    const item = availableItems.get(savedIngredient.barcode);
    if (!item) {
      issues.push(`${savedIngredient.productName}: brak produktu w spiżarni.`);
      continue;
    }
    if (isChemical(item.product)) {
      issues.push(`${savedIngredient.productName}: produkt chemiczny nie może należeć do posiłku.`);
      continue;
    }
    if (item.unit !== savedIngredient.unit) {
      issues.push(`${savedIngredient.productName}: zmieniono jednostkę produktu.`);
      continue;
    }
    if (!Number.isFinite(savedIngredient.amount) || savedIngredient.amount <= 0) {
      issues.push(`${savedIngredient.productName}: ilość w szablonie jest nieprawidłowa.`);
      continue;
    }
    if (savedIngredient.amount > item.quantity) {
      issues.push(`${savedIngredient.productName}: potrzeba ${savedIngredient.amount} ${savedIngredient.unit}, dostępne ${item.quantity} ${item.unit}.`);
      continue;
    }
    try {
      ingredients.push(createMealIngredient(item, savedIngredient.amount));
    } catch (error) {
      issues.push(error instanceof Error ? error.message : `Nie można użyć produktu: ${savedIngredient.productName}.`);
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true, ingredients };
}
