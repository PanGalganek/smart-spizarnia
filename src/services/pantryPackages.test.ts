import { describe, expect, it } from "vitest";
import { PantryItem, PantryPackage, Product } from "@/domain/product";
import { addPackages, consumePackages, packageSummary, restorePackages, setPackageExpiryDate } from "@/services/pantryPackages";

const milk: Product = {
  barcode: "milk",
  name: "Mleko",
  packageAmount: 1000,
  packageUnit: "ml",
  defaultUnit: "ml",
  nutrientsPer100g: { energyKcal: 50 },
  source: "manual",
  updatedAt: 1
};

const pasta: Product = {
  barcode: "pasta",
  name: "Makaron",
  packageAmount: 500,
  packageUnit: "g",
  defaultUnit: "g",
  nutrientsPer100g: { energyKcal: 350 },
  source: "manual",
  updatedAt: 1
};

function item(product: Product, quantity = 0): PantryItem {
  return { barcode: product.barcode, product, quantity, unit: product.packageUnit ?? "g", status: "active" };
}

describe("pantry packages", () => {
  it("stores two milk cartons and consumes from the first opened carton", () => {
    const added = addPackages(null, milk, 2, "szt", 1);
    const consumed = consumePackages({ ...item(milk), ...added }, 200, "ml");
    const summary = packageSummary({ ...item(milk), ...consumed });

    expect(consumed.quantity).toBe(1800);
    expect(summary.text).toBe("1 × 1000 ml + 800 ml");
  });

  it("removes one whole cottage cheese package without showing grams as the main state", () => {
    const cheese = { ...pasta, barcode: "cheese", name: "Serek", packageAmount: 200 };
    const added = addPackages(null, cheese, 3, "szt", 1);
    const consumed = consumePackages({ ...item(cheese), ...added }, 1, "szt");

    expect(consumed.quantity).toBe(400);
    expect(packageSummary({ ...item(cheese), ...consumed }).text).toBe("2 × 200 g");
  });

  it("opens pasta package when using part of it", () => {
    const added = addPackages(null, pasta, 2, "szt", 1);
    const consumed = consumePackages({ ...item(pasta), ...added }, 150, "g");

    expect(packageSummary({ ...item(pasta), ...consumed }).text).toBe("1 × 500 g + 350 g");
  });

  it("uses selected package when opening one of many closed packages", () => {
    const added = addPackages(null, milk, 2, "szt", 1, "2026-06-20");
    const secondPackage = added.packages[1];
    const consumed = consumePackages({ ...item(milk), ...added }, 200, "ml", secondPackage.id);

    expect(consumed.packages.find((pack) => pack.id === secondPackage.id)?.amount).toBe(800);
    expect(packageSummary({ ...item(milk), ...consumed }).activeExpiryDate).toBe("2026-06-20");
  });

  it("stores optional expiry dates for each added package", () => {
    const added = addPackages(null, milk, 3, "szt", 1, undefined, [undefined, "2026-06-18", "2026-06-25"]);

    expect(added.packages.map((pack) => pack.expiryDate)).toEqual([undefined, "2026-06-18", "2026-06-25"]);
  });

  it("updates and clears the expiry date of one selected package", () => {
    const added = addPackages(null, milk, 2, "szt", 1, undefined, ["2026-06-19", "2026-06-30"]);
    const pantryItem = { ...item(milk), ...added, expiryDate: "2026-06-19" };
    const firstPackageId = added.packages[0].id;
    const changed = setPackageExpiryDate(pantryItem, firstPackageId, "2026-07-01");
    const cleared = setPackageExpiryDate(changed, firstPackageId);

    expect(changed.packages?.map((pack) => pack.expiryDate)).toEqual(["2026-07-01", "2026-06-30"]);
    expect(changed.expiryDate).toBeUndefined();
    expect(cleared.packages?.map((pack) => pack.expiryDate)).toEqual([undefined, "2026-06-30"]);
  });
});

function stock(packages: PantryPackage[]): PantryItem {
  return { ...item(milk), packages, quantity: packages.reduce((sum, pack) => sum + pack.amount, 0) };
}
function pack(id: string, expiryDate?: string, amount = 1000, createdAt = 1): PantryPackage {
  return { id, expiryDate, amount, capacity: 1000, unit: "ml", opened: amount < 1000, createdAt };
}

describe("package selection and restoration", () => {
  it("consumes the earliest expiry even when it was purchased later", () => {
    const current = stock([pack("older", "2026-12-01", 1000, 1), pack("urgent", "2026-11-10", 1000, 2)]);
    const result = consumePackages(current, 100, "ml");
    expect(result.consumedPackages.map((entry) => entry.id)).toEqual(["urgent"]);
    expect(packageSummary(current).activeExpiryDate).toBe("2026-11-10");
    expect(packageSummary(current).fullPackages[0].id).toBe("urgent");
  });

  it("uses opened stock first even with realistic timestamps far apart", () => {
    const current = stock([pack("closed", "2026-11-10", 1000, 1_700_000_000_000), pack("open", "2026-12-01", 500, 1_800_000_000_000)]);
    expect(consumePackages(current, 100, "ml").consumedPackages[0].id).toBe("open");
    expect(packageSummary(current).activeExpiryDate).toBe("2026-12-01");
  });

  it("orders open packages by expiry and places unknown dates last", () => {
    const current = stock([pack("unknown", undefined, 500), pack("later", "2026-12-01", 500), pack("urgent", "2026-11-10", 500)]);
    const result = consumePackages(current, 1100, "ml");
    expect(result.consumedPackages.map((entry) => [entry.id, entry.amount])).toEqual([["urgent", 500], ["later", 500], ["unknown", 100]]);
    expect(packageSummary(current).activeExpiryDate).toBe("2026-11-10");
  });

  it("breaks equal-expiry ties by creation time", () => {
    const current = stock([pack("newer", "2026-12-01", 1000, 2), pack("older", "2026-12-01", 1000, 1)]);
    expect(consumePackages(current, 100, "ml").consumedPackages[0].id).toBe("older");
  });

  it("honors manual selection before opened stock and rejects a missing selection", () => {
    const current = stock([pack("open", "2026-11-10", 500), pack("selected", "2026-12-01")]);
    expect(consumePackages(current, 100, "ml", "selected").consumedPackages[0].id).toBe("selected");
    expect(() => consumePackages(current, 100, "ml", "missing")).toThrow("już zużyte");
  });

  it("restores fully and partly consumed packages with original identities and expiry dates", () => {
    const current = stock([pack("open", "2026-11-10", 500), pack("closed", "2026-12-01")]);
    const consumed = consumePackages(current, 700, "ml");
    const restored = restorePackages({ ...current, ...consumed }, consumed.consumedPackages, 700);
    expect(restored.quantity).toBe(1500);
    expect(restored.capacity).toBe(2000);
    expect([...restored.packages].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...current.packages!].sort((a, b) => a.id.localeCompare(b.id)));
  });

  it("preserves later expiry edits and unrelated purchases when returning stock", () => {
    const current = stock([pack("original", "2026-11-10")]);
    const consumed = consumePackages(current, 200, "ml");
    const latest = stock([{ ...consumed.packages[0], expiryDate: "2026-11-20" }, pack("purchase", "2027-01-01")]);
    const restored = restorePackages(latest, consumed.consumedPackages, 200);
    expect(restored.quantity).toBe(2000);
    expect(restored.packages.find((entry) => entry.id === "original")).toMatchObject({ amount: 1000, opened: false, expiryDate: "2026-11-20" });
    expect(restored.packages.find((entry) => entry.id === "purchase")).toEqual(latest.packages![1]);
  });

  it("returns stock from two meals in either order", () => {
    const current = stock([pack("original", "2026-11-10")]);
    const first = consumePackages(current, 200, "ml");
    const second = consumePackages({ ...current, ...first }, 300, "ml");
    for (const records of [[first.consumedPackages, second.consumedPackages], [second.consumedPackages, first.consumedPackages]]) {
      const partial = restorePackages({ ...current, ...second }, records[0], records[0][0].amount);
      const restored = restorePackages({ ...current, ...partial }, records[1], records[1][0].amount);
      expect(restored.packages).toEqual(current.packages);
    }
  });

  it("rejects inconsistent or excessive restoration without mutating stock", () => {
    const current = stock([pack("original", "2026-11-10", 900)]);
    expect(() => restorePackages(current, [pack("original", "2026-11-10", 200)], 300)).toThrow("niezgodny");
    expect(() => restorePackages(current, [pack("original", "2026-11-10", 200)], 200)).toThrow("pojemności");
    expect(current.quantity).toBe(900);
    expect(current.packages![0].amount).toBe(900);
  });
});
