import { describe, expect, it } from "vitest";
import { PantryItem } from "@/domain/product";
import { stockCapacity, stockPercentage } from "@/services/stockLevel";

const item = { quantity: 50, capacity: 200, unit: "g", product: { packageAmount: 200, packageUnit: "g" } } as PantryItem;

describe("stock level", () => {
  it("shows the remaining percentage against the full stock", () => expect(stockPercentage(item)).toBe(25));
  it("never uses a capacity lower than the current quantity", () => expect(stockCapacity({ ...item, quantity: 300 })).toBe(300));
});
