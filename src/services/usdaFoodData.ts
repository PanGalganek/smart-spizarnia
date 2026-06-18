import { Nutrients, Product } from "@/domain/product";
import { fetchWithTimeout } from "@/services/fetchWithTimeout";

const API_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const API_KEY = "DEMO_KEY";

type UsdaNutrient = { nutrientId?: number; nutrientNumber?: string; nutrientName?: string; unitName?: string; value?: number };
type UsdaFood = { fdcId: number; description: string; dataType?: string; foodCategory?: string; foodNutrients?: UsdaNutrient[] };
type SearchResponse = { foods?: UsdaFood[] };

export type UsdaFoodResult = {
  fdcId: number;
  description: string;
  dataType: string;
  product: Product;
};

const polishQueries: Record<string, string> = {
  pomidor: "tomato", pomidory: "tomato", ziemniak: "potato", ziemniaki: "potato",
  marchew: "carrot", cebula: "onion", czosnek: "garlic", ogorek: "cucumber",
  jablko: "apple", banan: "banana", gruszka: "pear", truskawka: "strawberry",
  kurczak: "chicken", wolowina: "beef", wieprzowina: "pork", jajko: "egg",
  ryz: "rice", makaron: "pasta", mleko: "milk", maslo: "butter"
};

export async function searchUsdaFoods(query: string): Promise<UsdaFoodResult[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  const translated = translateFoodQuery(normalized);
  const params = new URLSearchParams({
    api_key: API_KEY,
    query: translated,
    pageSize: "10",
    dataType: "Foundation,SR Legacy"
  });
  const response = await fetchWithTimeout(`${API_URL}?${params.toString()}`);
  if (!response.ok) throw new Error("USDA FoodData Central is unavailable");
  const data = await response.json() as SearchResponse;
  return (data.foods ?? [])
    .map((food) => toResult(food))
    .filter((result): result is UsdaFoodResult => !!result && result.product.nutrientsPer100g.energyKcal !== undefined);
}

export function parseUsdaNutrients(foodNutrients: UsdaNutrient[] = []): Nutrients {
  const value = (id: number, unit?: string) => {
    const nutrient = foodNutrients.find((item) => item.nutrientId === id && (!unit || item.unitName?.toUpperCase() === unit));
    return typeof nutrient?.value === "number" ? round(nutrient.value) : undefined;
  };
  const sodium = value(1093, "MG");
  return compact({
    energyKcal: value(1008, "KCAL"),
    proteins: value(1003, "G"),
    fat: value(1004, "G"),
    carbohydrates: value(1005, "G"),
    fiber: value(1079, "G"),
    sodium,
    salt: sodium === undefined ? undefined : round(sodium * 2.5 / 1000),
    calcium: value(1087, "MG"),
    iron: value(1089, "MG"),
    magnesium: value(1090, "MG"),
    potassium: value(1092, "MG"),
    vitaminC: value(1162, "MG"),
    vitaminA: value(1106, "UG")
  });
}

export function translateFoodQuery(query: string) {
  const key = query.toLocaleLowerCase("pl").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");
  return polishQueries[key] ?? query;
}

function toResult(food: UsdaFood): UsdaFoodResult | null {
  if (!food.fdcId || !food.description) return null;
  return {
    fdcId: food.fdcId,
    description: food.description,
    dataType: food.dataType ?? "USDA",
    product: {
      barcode: `usda-${food.fdcId}`,
      name: food.description,
      brand: `USDA ${food.dataType ?? "FoodData Central"}`,
      defaultUnit: "g",
      nutritionBasis: "per100",
      nutrientsPer100g: parseUsdaNutrients(food.foodNutrients),
      source: "usda",
      updatedAt: Date.now()
    }
  };
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function round(value: number) { return Math.round(value * 100) / 100; }
