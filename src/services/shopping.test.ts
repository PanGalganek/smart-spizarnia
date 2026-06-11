import { describe, expect, it } from "vitest";
import { manualShoppingItemId, productShoppingItemId } from "@/services/shopping";

describe("identyfikatory listy zakupów", () => {
  it("łączy różne zapisy tej samej ręcznej nazwy", () => {
    expect(manualShoppingItemId("  Płyn   do naczyń ")).toBe("manual-płyn-do-naczyń");
    expect(manualShoppingItemId("PŁYN DO NACZYŃ")).toBe("manual-płyn-do-naczyń");
  });

  it("tworzy stały identyfikator zapisanego produktu", () => {
    expect(productShoppingItemId("5901234567890")).toBe("product-5901234567890");
  });
});
