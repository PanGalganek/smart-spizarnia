import { Product } from "@/domain/product";

const API_URL = "https://world.openfoodfacts.org/api/v2/product";

function parseGrams(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.toLowerCase().replace(",", ".").match(/([\d.]+)\s*(kg|g|ml|l)/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  return match[2] === "kg" || match[2] === "l" ? amount * 1000 : amount;
}

export async function getProductByBarcode(barcode: string): Promise<Product | null> {
  const response = await fetch(`${API_URL}/${encodeURIComponent(barcode)}.json`);
  if (!response.ok) throw new Error("Open Food Facts is unavailable");

  const data = await response.json();
  if (data.status !== 1 || !data.product) return null;

  const item = data.product;
  return {
    barcode,
    name: item.product_name_pl || item.product_name || "Produkt bez nazwy",
    brand: item.brands,
    imageUrl: item.image_front_url,
    servingSize: item.serving_size,
    netWeightGrams: parseGrams(item.quantity) ?? parseGrams(item.serving_size),
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
