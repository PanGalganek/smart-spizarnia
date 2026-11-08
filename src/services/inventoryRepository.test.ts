import { beforeEach, describe, expect, it, vi } from "vitest";
import { Meal } from "@/domain/meal";
import { PantryItem, Product } from "@/domain/product";
import { ShoppingItem } from "@/domain/shopping";

// Model document versions and atomic commits so tests exercise transaction retries.
// Firebase rule enforcement and network behavior still require emulator/device tests.
const store = vi.hoisted(() => {
  type Data = Record<string, any>;
  const documents = new Map<string, Data>();
  const versions = new Map<string, number>();
  const removed = Symbol("deleteField");
  let nextId = 0;
  function put(path: string, data?: Data) {
    path = String(path);
    if (data) documents.set(path, structuredClone(data));
    else documents.delete(path);
    versions.set(path, (versions.get(path) ?? 0) + 1);
  }
  function snapshot(path: string) {
    path = String(path);
    const data = documents.get(path);
    return { exists: () => !!data, data: () => data && structuredClone(data) };
  }
  async function runTransaction(_db: unknown, callback: (transaction: any) => Promise<any>) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const reads = new Map<string, number>();
      const writes: (() => void)[] = [];
      const transaction = {
        get: async (path: string) => {
          path = String(path);
          if (writes.length) throw new Error("Transaction reads must precede writes");
          reads.set(path, versions.get(path) ?? 0);
          return snapshot(path);
        },
        set: (path: string, data: Data, options?: { merge?: boolean }) => {
          path = String(path);
          writes.push(() => {
            const next = options?.merge ? { ...documents.get(path), ...data } : { ...data };
            for (const key of Object.keys(next)) if (next[key] === removed) delete next[key];
            put(path, next);
          });
        },
        update: (path: string, patch: Data) => {
          path = String(path);
          writes.push(() => {
            if (!documents.has(path)) throw new Error("Missing document");
            const data = { ...documents.get(path) };
            for (const [key, value] of Object.entries(patch)) {
              if (value === removed) delete data[key];
              else data[key] = value;
            }
            put(path, data);
          });
        },
        delete: (path: string) => writes.push(() => put(path))
      };
      const result = await callback(transaction);
      if ([...reads].some(([path, version]) => (versions.get(path) ?? 0) !== version)) continue;
      writes.forEach((write) => write());
      return result;
    }
    throw new Error("Too many transaction conflicts");
  }
  return { documents, versions, put, snapshot, runTransaction, removed, id: () => `meal-${++nextId}` };
});

vi.mock("@/core/firebase", () => ({ db: {} }));
vi.mock("@/services/userData", () => ({
  userDoc: (collection: string, id: string) => `${collection}/${id}`,
  userCollection: (collection: string) => collection
}));
vi.mock("firebase/firestore", () => ({
  runTransaction: store.runTransaction,
  deleteField: () => store.removed,
  doc: (collection: string) => {
    // Repositories also use the generated reference's id.
    const id = store.id();
    return { id, toString: () => `${collection}/${id}` };
  },
  deleteDoc: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(), setDoc: vi.fn()
}));

import { changePantryQuantity, createMeal, deleteMeal, updatePantryMetadata, updateProductDetails } from "@/services/inventoryRepository";
import { createMealIngredient } from "@/services/nutrition";
import { purchaseKnownProduct } from "@/services/shoppingRepository";

const product: Product = {
  barcode: "milk", name: "Mleko", packageAmount: 1000, packageUnit: "ml",
  defaultUnit: "ml", source: "manual", nutrientsPer100g: { energyKcal: 50 }, updatedAt: 1
};
const pantryPath = "pantry/milk";
const summaryPath = "dailySummaries/2026-11-08__person";
const meal: Meal = {
  id: "lunch", name: "Obiad", type: "lunch", dateKey: "2026-11-08", createdAt: 1,
  consumerId: "person", consumerName: "Jan", totals: { energyKcal: 100 },
  ingredients: [{ barcode: "milk", productName: "Mleko", amount: 200, unit: "ml", nutritionBasis: "per100", nutrients: { energyKcal: 100 } }]
};
const shopping: ShoppingItem = {
  id: "milk", name: "Mleko", product, source: "saved", status: "active", createdAt: 1, updatedAt: 1
};
function seedPantry(): PantryItem {
  const item: PantryItem = {
    barcode: "milk", product, quantity: 800, capacity: 1000, unit: "ml", location: "Lodówka", status: "active",
    packages: [{ id: "original", amount: 800, capacity: 1000, unit: "ml", expiryDate: "2026-11-12", opened: true, createdAt: 1 }]
  };
  store.put(pantryPath, item);
  return item;
}
function seedMeal() {
  store.put("meals/lunch", meal);
  store.put(summaryPath, { dateKey: meal.dateKey, totals: { energyKcal: 300 }, mealCount: 2, updatedAt: 1 });
}
function pantry() { return store.documents.get(pantryPath) as PantryItem; }

beforeEach(() => {
  store.documents.clear();
  store.versions.clear();
  seedPantry();
});

describe("meal cancellation", () => {
  it("restores stock and subtracts calories only once for repeated stale requests", async () => {
    seedMeal();
    await deleteMeal(meal);
    await deleteMeal(meal);
    expect(pantry().quantity).toBe(1000);
    expect(store.documents.get(summaryPath)).toMatchObject({ mealCount: 1, totals: { energyKcal: 200 } });
    expect(store.documents.has("meals/lunch")).toBe(false);
  });

  it("retries concurrent cancellations without double restoration", async () => {
    seedMeal();
    await Promise.all([deleteMeal(meal), deleteMeal(meal)]);
    expect(pantry().quantity).toBe(1000);
    expect(store.documents.get(summaryPath)?.totals.energyKcal).toBe(200);
  });

  it("uses persisted ingredients, calories and summary identity instead of stale UI data", async () => {
    seedMeal();
    await deleteMeal({ ...meal, ingredients: [], totals: { energyKcal: 999 }, dateKey: "2000-01-01", consumerId: "wrong" });
    expect(pantry().quantity).toBe(1000);
    expect(store.documents.get(summaryPath)?.totals.energyKcal).toBe(200);
  });

  it("deletes history without restoring stock and handles absent meals without writes", async () => {
    seedMeal();
    await deleteMeal(meal, false);
    const version = store.versions.get(summaryPath);
    await deleteMeal(meal, false);
    expect(pantry().quantity).toBe(800);
    expect(store.versions.get(summaryPath)).toBe(version);
  });

  it("leaves all data intact when restoration is impossible", async () => {
    seedMeal();
    store.put(pantryPath);
    await expect(deleteMeal(meal)).rejects.toThrow("Nie można przywrócić produktu");
    expect(store.documents.has("meals/lunch")).toBe(true);
    expect(store.documents.get(summaryPath)?.mealCount).toBe(2);
  });
});

describe("pantry metadata", () => {
  it("preserves stock consumed on another device and clears optional fields", async () => {
    const current = seedPantry();
    store.put(pantryPath, { ...current, quantity: 500, packages: [{ ...current.packages![0], amount: 500 }], expiryDate: "2026-11-12" });
    await updatePantryMetadata("milk", { location: "Szafka", expiryDate: undefined });
    expect(pantry()).toMatchObject({ quantity: 500, location: "Szafka", packages: [{ amount: 500 }] });
    expect(pantry()).not.toHaveProperty("expiryDate");
    await updatePantryMetadata("milk", { location: undefined });
    expect(pantry()).not.toHaveProperty("location");
  });

  it("updates one expiry without replacing newer amounts or other packages", async () => {
    const current = seedPantry();
    const second = { ...current.packages![0], id: "second", expiryDate: "2026-12-01" };
    store.put(pantryPath, { ...current, quantity: 1300, packages: [{ ...current.packages![0], amount: 500 }, second] });
    await updatePantryMetadata("milk", { packageExpiry: { packageId: "original", expiryDate: "2026-11-15" } });
    expect(pantry().quantity).toBe(1300);
    expect(pantry().packages).toEqual([{ ...current.packages![0], amount: 500, expiryDate: "2026-11-15" }, second]);
    await updatePantryMetadata("milk", { packageExpiry: { packageId: "original" } });
    expect(pantry().packages![0]).not.toHaveProperty("expiryDate");
  });

  it("does not recreate a consumed package or deleted product", async () => {
    await expect(updatePantryMetadata("milk", { packageExpiry: { packageId: "consumed" } })).rejects.toThrow("już zużyte");
    expect(pantry().quantity).toBe(800);
    store.put(pantryPath);
    await expect(updatePantryMetadata("milk", { location: "Szafka" })).rejects.toThrow("nie ma już");
    expect(store.documents.has(pantryPath)).toBe(false);
  });

  it("keeps a purchase made concurrently with an expiry edit", async () => {
    await Promise.all([
      purchaseKnownProduct(shopping, 1, "szt"),
      updatePantryMetadata("milk", { packageExpiry: { packageId: "original", expiryDate: "2026-11-20" } })
    ]);
    expect(pantry().quantity).toBe(1800);
    expect(pantry().packages).toHaveLength(2);
    expect(pantry().packages!.find((pack) => pack.id === "original")?.expiryDate).toBe("2026-11-20");
  });

  it("can edit a legacy package using the identity displayed before the transaction", async () => {
    store.put(pantryPath, { ...seedPantry(), packages: undefined, expiryDate: "2026-11-12" });
    await updatePantryMetadata("milk", { packageExpiry: { packageId: "legacy-open", expiryDate: "2026-11-20" } });
    expect(pantry().quantity).toBe(800);
    expect(pantry().packages![0]).toMatchObject({ id: "legacy-open", amount: 800, expiryDate: "2026-11-20" });
  });

  it("preserves stock when product details are changed concurrently with metadata", async () => {
    await Promise.all([updateProductDetails({ ...product, name: "Nowa nazwa" }), updatePantryMetadata("milk", { location: "Szafka" })]);
    expect(pantry()).toMatchObject({ quantity: 800, location: "Szafka", product: { name: "Nowa nazwa" } });
    expect(pantry().packages![0].expiryDate).toBe("2026-11-12");
  });
});

describe("shopping purchases", () => {
  it("adds new packages while preserving existing package identity, expiry and open state", async () => {
    const original = seedPantry();
    await purchaseKnownProduct(shopping, 2, "szt");
    expect(pantry()).toMatchObject({ quantity: 2800, capacity: 3000, location: "Lodówka", unit: "ml" });
    expect(pantry().packages).toHaveLength(3);
    expect(pantry().packages![0]).toEqual(original.packages![0]);
    expect(pantry().packages!.slice(1).every((pack) => pack.amount === 1000 && !pack.opened && !pack.expiryDate)).toBe(true);
    expect(store.documents.get("shoppingList/milk")?.status).toBe("purchased");
  });

  it("retains legacy stock expiry without assigning it to newly purchased packages", async () => {
    store.put(pantryPath, { ...seedPantry(), packages: undefined, expiryDate: "2026-11-12" });
    await purchaseKnownProduct(shopping, 1, "szt");
    expect(pantry().packages!.map((pack) => pack.expiryDate)).toEqual(["2026-11-12", undefined]);
    expect(pantry()).not.toHaveProperty("expiryDate");
  });

  it("creates stock on first purchase and rejects invalid quantities without marking purchased", async () => {
    store.put(pantryPath);
    await expect(purchaseKnownProduct(shopping, -1, "szt")).rejects.toThrow();
    expect(store.documents.has("shoppingList/milk")).toBe(false);
    await purchaseKnownProduct(shopping, 1, "szt");
    expect(pantry().quantity).toBe(1000);
    expect(pantry().packages).toHaveLength(1);
  });
});

const consumer = { id: "person", name: "Jan" };
const mealTime = new Date(2026, 10, 8, 12).getTime();
function cook(amount: number) {
  return createMeal("Obiad", "lunch", [createMealIngredient(pantry(), amount)], 1, mealTime, consumer);
}

describe("persisted meal package history", () => {
  it("keeps legacy dates on existing packages without leaking them to a new package", async () => {
    store.put(pantryPath, { ...seedPantry(), packages: undefined, expiryDate: "2026-11-12" });
    await changePantryQuantity(product, 1, "szt");
    expect(pantry()).not.toHaveProperty("expiryDate");
    expect(pantry().packages!.map((entry) => entry.expiryDate)).toEqual(["2026-11-12", undefined]);
    await cook(800);
    expect(pantry().packages!.map((entry) => entry.expiryDate)).toEqual([undefined]);
  });

  it("records the actual packages consumed and restores their dates after total depletion", async () => {
    const original = seedPantry();
    const created = await cook(800);
    expect(pantry().quantity).toBe(0);
    expect(pantry().packages).toEqual([]);
    expect(created.ingredients[0].consumedPackages).toEqual(original.packages);
    expect(store.documents.get(`meals/${created.id}`)?.ingredients).toEqual(created.ingredients);
    await deleteMeal(created);
    expect(pantry().quantity).toBe(800);
    expect(pantry().packages).toEqual(original.packages);
    expect(store.documents.has(summaryPath)).toBe(false);
  });

  it("preserves a later purchase and date edit during cancellation", async () => {
    const created = await cook(200);
    await purchaseKnownProduct(shopping, 1, "szt");
    await updatePantryMetadata("milk", { packageExpiry: { packageId: "original", expiryDate: "2026-11-25" } });
    const purchased = pantry().packages!.find((entry) => entry.id !== "original");
    await deleteMeal(created);
    expect(pantry().quantity).toBe(1800);
    expect(pantry().packages!.find((entry) => entry.id === "original")).toMatchObject({ amount: 800, expiryDate: "2026-11-25" });
    expect(pantry().packages!.find((entry) => entry.id !== "original")).toEqual(purchased);
  });

  it("keeps exact histories after concurrent meals retry and cancellation is repeated", async () => {
    const original = seedPantry();
    const created = await Promise.all([cook(200), cook(300)]);
    expect(pantry().quantity).toBe(300);
    for (const entry of created) {
      expect(entry.ingredients[0].consumedPackages![0]).toMatchObject({ id: "original", amount: entry.ingredients[0].amount, expiryDate: "2026-11-12" });
    }
    await Promise.all([deleteMeal(created[0]), deleteMeal(created[1])]);
    await deleteMeal(created[0]);
    expect(pantry().packages).toEqual(original.packages);
    expect(pantry().quantity).toBe(800);
    expect(store.documents.has(summaryPath)).toBe(false);
  });

  it("does not return stock when a new meal is removed from history only", async () => {
    const created = await cook(200);
    await deleteMeal(created, false);
    expect(pantry().quantity).toBe(600);
    expect(store.documents.has(`meals/${created.id}`)).toBe(false);
  });

  it("rejects duplicate ingredients before changing stock", async () => {
    const ingredient = createMealIngredient(pantry(), 100);
    await expect(createMeal("Obiad", "lunch", [ingredient, ingredient], 1, mealTime, consumer)).rejects.toThrow("tylko raz");
    expect(pantry().quantity).toBe(800);
    expect([...store.documents.keys()].some((key) => key.startsWith("meals/"))).toBe(false);
  });

  it("rejects corrupted package history without deleting the meal or changing summary", async () => {
    const created = await cook(200);
    store.put(`meals/${created.id}`, { ...created, ingredients: [{ ...created.ingredients[0], consumedPackages: [] }] });
    await expect(deleteMeal(created)).rejects.toThrow("niezgodny");
    expect(pantry().quantity).toBe(600);
    expect(store.documents.has(`meals/${created.id}`)).toBe(true);
    expect(store.documents.get(summaryPath)?.mealCount).toBe(1);
  });
});
