import { describe, expect, it } from "vitest";
import { PantryItem } from "@/domain/product";
import { capacityAfterStockChange, capacityForPackage, stockCapacity, stockPercentage } from "@/services/stockLevel";

const item = { quantity: 50, capacity: 200, unit: "g", product: { packageAmount: 200, packageUnit: "g" } } as PantryItem;

describe("stock level", () => {
  it("shows the remaining percentage against the full stock", () => expect(stockPercentage(item)).toBe(25));
  it("rounds capacity up to complete packages", () => expect(stockCapacity({ ...item, quantity: 300 })).toBe(400));
  it("treats two full packages as 100 percent", () => expect(stockPercentage({ ...item, quantity: 2000, capacity: 2000, product: { ...item.product, packageAmount: 1000 } })).toBe(100));
  it("shows a partially used second package", () => expect(stockPercentage({ ...item, quantity: 1500, capacity: 2000, product: { ...item.product, packageAmount: 1000 } })).toBe(75));
  it("expands capacity when another full package is added", () => expect(capacityAfterStockChange(item, 250, 200, item.product, "g")).toBe(400));
  it("recalculates capacity after manual package size entry", () => expect(capacityForPackage({ ...item, quantity: 1500 }, 1000, "g")).toBe(2000));
});
