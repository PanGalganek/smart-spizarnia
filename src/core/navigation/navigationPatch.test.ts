import { describe, expect, it } from "vitest";
import { isNavigationPatch } from "./navigationPatch";

describe("navigation patch validation", () => {
  it("accepts explicit navigation state changes", () => {
    expect(isNavigationPatch({ modal: "scanner-manual-product", mode: "add-product" })).toBe(true);
    expect(isNavigationPatch({ scanner: true })).toBe(true);
  });

  it("rejects a browser press event even when it contains a view property", () => {
    const pressEvent = {
      view: {},
      nativeEvent: { type: "click" },
      preventDefault() {}
    };

    expect(isNavigationPatch(pressEvent)).toBe(false);
  });

  it("rejects objects with navigation-looking fields of the wrong type", () => {
    expect(isNavigationPatch({ view: {} })).toBe(false);
    expect(isNavigationPatch({ scanner: "true" })).toBe(false);
  });
});
