import { Product } from "@/domain/product";

const API_URL = "https://world.openfoodfacts.org/api/v2/product";

type PackageSize = { amount: number; unit: "g" | "ml" };

export function parsePackageSize(item: Record<string, unknown>): PackageSize | undefined {
  const numericAmount = Number(item.product_quantity);
  const numericUnit = normalizeUnit(String(item.product_quantity_unit ?? ""));
  if (Number.isFinite(numericAmount) && numericAmount > 0 && numericUnit) {
    return convertPackageSize(numericAmount, numericUnit);
  }

  const value = String(item.quantity ?? item.serving_size ?? "").toLowerCase().replace(/,/g, ".");
  const multipack = value.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/);
  if (multipack) return convertPackageSize(Number(multipack[1]) * Number(multipack[2]), multipack[3]);
  const single = value.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/);
  return single ? convertPackageSize(Number(single[1]), single[2]) : undefined;
}

function normalizeUnit(value: string) {
  const match = value.toLowerCase().trim().match(/^(kg|g|ml|cl|l)$/);
  return match?.[1];
}

function convertPackageSize(amount: number, unit: string): PackageSize | undefined {
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  if (unit === "kg") return { amount: amount * 1000, unit: "g" };
  if (unit === "l") return { amount: amount * 1000, unit: "ml" };
  if (unit === "cl") return { amount: amount * 10, unit: "ml" };
  if (unit === "g" || unit === "ml") return { amount, unit };
  return undefined;
}

export async function getProductByBarcode(barcode: string): Promise<Product | null> {
  const response = await fetch(`${API_URL}/${encodeURIComponent(barcode)}.json`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Open Food Facts is unavailable");

  const data = await response.json();
  if (data.status !== 1 || !data.product) return null;

  const item = data.product;
  const packageSize = parsePackageSize(item);
  return {
    barcode,
    name: item.product_name_pl || item.product_name || "Produkt bez nazwy",
    brand: item.brands,
    imageUrl: item.image_front_url,
    servingSize: item.serving_size,
    ...(packageSize?.unit === "g" ? { netWeightGrams: packageSize.amount } : {}),
    ...(packageSize ? { packageAmount: packageSize.amount, packageUnit: packageSize.unit } : {}),
    defaultUnit: packageSize?.unit ?? "szt",
    nutritionBasis: "per100",
    nutrientsPer100g: {
      energyKcal: item.nutriments?.["energy-kcal_100g"],
      proteins: item.nutriments?.proteins_100g,
      carbohydrates: item.nutriments?.carbohydrates_100g,
      fat: item.nutriments?.fat_100g,
      fiber: item.nutriments?.fiber_100g,
      salt: item.nutriments?.salt_100g
    },
    source: "open-food-facts",
    updatedAt: Date.now()
  };
}
