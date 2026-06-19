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

  it("ponawia zapytanie przez zapasowy endpoint po bledzie sieci", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 1, product: { product_name: "Produkt testowy", nutriments: { "energy-kcal_100g": 42 } } })
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getProductByBarcode("5901696000013")).resolves.toMatchObject({ name: "Produkt testowy", barcode: "5901696000013" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v2/product/");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/v0/product/");
  });

  it("pobiera tylko potrzebne pola z glownego endpointu", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 0 }) });
    vi.stubGlobal("fetch", fetchMock);

    await getProductByBarcode("123");
    expect(String(fetchMock.mock.calls[0][0])).toContain("fields=");
  });
});
