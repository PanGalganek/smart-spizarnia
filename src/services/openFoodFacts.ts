import { Product } from "@/domain/product";
import { fetchWithTimeout } from "@/services/fetchWithTimeout";

const API_URL = "https://world.openfoodfacts.org/api/v2/product";
const LEGACY_API_URL = "https://world.openfoodfacts.org/api/v0/product";
const PRODUCT_FIELDS = [
  "code", "status", "product_name_pl", "product_name", "brands", "image_front_url",
  "serving_size", "product_quantity", "product_quantity_unit", "quantity", "nutriments"
].join(",");

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
  const normalized = barcode.trim();
  if (!normalized) return null;
  const encoded = encodeURIComponent(normalized);
  const data = await fetchProductData([
    `${API_URL}/${encoded}.json?fields=${encodeURIComponent(PRODUCT_FIELDS)}`,
    `${LEGACY_API_URL}/${encoded}.json`
  ]);
  if (!data) return null;
  if (data.status !== 1 || !data.product) return null;

  const item = data.product;
  const packageSize = parsePackageSize(item);
  return {
    barcode: normalized,
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

export function withInferredPackageSize(product: Product): Product {
  const existingUnit = product.packageUnit ?? (product.defaultUnit === "g" || product.defaultUnit === "ml" ? product.defaultUnit : undefined);
  if (product.packageAmount && product.packageAmount > 0 && existingUnit) {
    return {
      ...product,
      packageUnit: existingUnit,
      ...(existingUnit === "g" && !product.netWeightGrams ? { netWeightGrams: product.packageAmount } : {})
    };
  }

  const inferred = parsePackageSize({ serving_size: product.servingSize });
  if (!inferred) return product;
  return {
    ...product,
    packageAmount: inferred.amount,
    packageUnit: inferred.unit,
    ...(inferred.unit === "g" && !product.netWeightGrams ? { netWeightGrams: inferred.amount } : {})
  };
}

async function fetchProductData(urls: string[]): Promise<any | null> {
  let lastError: unknown;
  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 15_000);
      if (response.status === 404) return null;
      if (!response.ok) {
        lastError = new Error(`Open Food Facts returned ${response.status}`);
        continue;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("Open Food Facts is unavailable", { cause: lastError });
}
