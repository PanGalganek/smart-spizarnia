import { afterEach, describe, expect, it, vi } from "vitest";
import { getProductByBarcode, parsePackageSize } from "@/services/openFoodFacts";

afterEach(() => vi.unstubAllGlobals());

describe("gramatura Open Food Facts", () => {
  it("odczytuje gramy z pola quantity", () => {
    expect(parsePackageSize({ quantity: "500 g" })).toEqual({ amount: 500, unit: "g" });
  });

  it("przelicza litry na mililitry", () => {
    expect(parsePackageSize({ quantity: "1,5 l" })).toEqual({ amount: 1500, unit: "ml" });
  });

  it("sumuje gramature wielopaku", () => {
    expect(parsePackageSize({ quantity: "6 x 50 g" })).toEqual({ amount: 300, unit: "g" });
  });

  it("korzysta z pol strukturalnych API", () => {
    expect(parsePackageSize({ product_quantity: 750, product_quantity_unit: "ml" })).toEqual({ amount: 750, unit: "ml" });
  });
});

describe("odpowiedzi Open Food Facts", () => {
  it("traktuje kod nieobecny w bazie jako brak produktu", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(getProductByBarcode("5901044033700")).resolves.toBeNull();
  });

  it("zglasza blad przy awarii serwera", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(getProductByBarcode("123")).rejects.toThrow("Open Food Facts is unavailable");
  });
});
