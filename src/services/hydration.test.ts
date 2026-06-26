import { describe, expect, it } from "vitest";
import { hydrationDailyId, hydrationPercentage, hydrationRemainingMl, isValidWaterAmount, normalizeHydrationGoal } from "@/domain/hydration";

describe("nawodnienie", () => {
  it("buduje osobny identyfikator dnia dla profilu", () => {
    expect(hydrationDailyId("bartek", "2026-06-26")).toBe("bartek_2026-06-26");
  });

  it("ogranicza cel do rozsądnego zakresu", () => {
    expect(normalizeHydrationGoal(0)).toBe(250);
    expect(normalizeHydrationGoal(2_500)).toBe(2_500);
    expect(normalizeHydrationGoal(20_000)).toBe(10_000);
  });

  it("liczy postęp i pozostałą ilość", () => {
    expect(hydrationPercentage(750, 2_000)).toBe(38);
    expect(hydrationRemainingMl(750, 2_000)).toBe(1_250);
  });

  it("odrzuca nieprawidłową ilość wody", () => {
    expect(isValidWaterAmount(250)).toBe(true);
    expect(isValidWaterAmount(0)).toBe(false);
    expect(isValidWaterAmount(3_001)).toBe(false);
  });
});
