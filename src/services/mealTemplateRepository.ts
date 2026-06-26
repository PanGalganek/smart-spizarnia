import { deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import { Consumer, Meal, MealTemplate, MealTemplateIngredient } from "@/domain/meal";
import { PantryItem } from "@/domain/product";
import { db } from "@/core/firebase";
import { createMeal, listPantry } from "@/services/inventoryRepository";
import { prepareTemplateIngredients } from "@/services/mealTemplateValidation";
import { userCollection, userDoc } from "@/services/userData";

export async function listMealTemplates(): Promise<MealTemplate[]> {
  const snapshot = await getDocs(userCollection("mealTemplates"));
  return snapshot.docs
    .map((entry) => normalizeMealTemplate(entry.data() as MealTemplate))
    .sort((left, right) => left.name.localeCompare(right.name, "pl"));
}

export async function createMealTemplateFromMeal(meal: Meal): Promise<MealTemplate> {
  if (!meal.ingredients.length) throw new Error("Posiłek nie ma składników do zapisania.");
  if (meal.ingredients.some((item) => item.tracksPantry === false)) {
    throw new Error("Nie można zapisać szablonu z produktem dodanym poza spiżarnią.");
  }
  const templateRef = doc(userCollection("mealTemplates"));
  const now = Date.now();
  const template: MealTemplate = {
    id: templateRef.id,
    name: meal.name.trim(),
    type: meal.type,
    ingredients: meal.ingredients.map(toTemplateIngredient),
    servings: Math.max(1, Math.min(100, Number(meal.servings) || 1)),
    createdAt: now,
    updatedAt: now
  };
  validateTemplate(template);
  await setDoc(templateRef, template);
  return template;
}

export async function updateMealTemplate(template: MealTemplate, patch: Pick<MealTemplate, "name" | "ingredients">): Promise<MealTemplate> {
  const updated = normalizeMealTemplate({ ...template, ...patch, updatedAt: Date.now() });
  validateTemplate(updated);
  await setDoc(userDoc("mealTemplates", updated.id), updated);
  return updated;
}

export async function deleteMealTemplate(templateId: string) {
  await deleteDoc(userDoc("mealTemplates", templateId));
}

export async function useMealTemplate(template: MealTemplate, consumer: Consumer): Promise<Meal> {
  const pantry = await listPantry();
  const prepared = prepareTemplateIngredients(template, pantry);
  if (!prepared.ok) throw new Error(`Nie można użyć szablonu:\n${prepared.issues.join("\n")}`);

  // createMeal repeats the stock check inside one Firestore transaction. If the
  // pantry changes after this pre-check, no item is deducted and no meal is saved.
  return createMeal(template.name, template.type, prepared.ingredients, template.servings, Date.now(), consumer);
}

export function templateDefaultAmount(item: PantryItem) {
  const suggested = item.product.quickUseAmount ?? (item.unit === "szt" ? 1 : 100);
  return Math.max(0.01, Math.min(item.quantity, suggested));
}

function normalizeMealTemplate(template: MealTemplate): MealTemplate {
  return {
    ...template,
    name: String(template.name ?? "").trim(),
    servings: Math.max(1, Math.min(100, Number(template.servings) || 1)),
    ingredients: (template.ingredients ?? []).map((item) => ({
      barcode: item.barcode,
      productName: item.productName,
      amount: Math.round(Number(item.amount) * 100) / 100,
      unit: item.unit
    }))
  };
}

function toTemplateIngredient(ingredient: Meal["ingredients"][number]): MealTemplateIngredient {
  return {
    barcode: ingredient.barcode,
    productName: ingredient.productName,
    amount: ingredient.amount,
    unit: ingredient.unit
  };
}

function validateTemplate(template: MealTemplate) {
  if (!template.name) throw new Error("Wpisz nazwę szablonu.");
  if (!template.ingredients.length) throw new Error("Szablon musi zawierać przynajmniej jeden produkt.");
  if (template.ingredients.length > 50) throw new Error("Szablon może zawierać maksymalnie 50 produktów.");
  const seen = new Set<string>();
  for (const ingredient of template.ingredients) {
    if (!ingredient.barcode || !ingredient.productName || !Number.isFinite(ingredient.amount) || ingredient.amount <= 0) {
      throw new Error("Popraw składniki szablonu.");
    }
    if (seen.has(ingredient.barcode)) throw new Error(`Produkt powtarza się w szablonie: ${ingredient.productName}.`);
    seen.add(ingredient.barcode);
  }
}
