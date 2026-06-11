import { describe, expect, it } from "vitest";
import { getExpiryWarning } from "@/services/expiry";

const today = new Date(2026, 5, 11, 18, 30);

describe("ostrzezenia daty waznosci", () => {
  it("rozpoznaje produkt po terminie", () => {
    expect(getExpiryWarning("2026-06-09", today)).toMatchObject({ level: "expired", days: -2 });
  });

  it("ostrzega o terminie dzisiaj i w ciagu tygodnia", () => {
    expect(getExpiryWarning("2026-06-11", today)?.level).toBe("today");
    expect(getExpiryWarning("2026-06-14", today)?.level).toBe("urgent");
    expect(getExpiryWarning("2026-06-18", today)?.level).toBe("soon");
  });

  it("nie ostrzega dla odleglej lub brakujacej daty", () => {
    expect(getExpiryWarning("2026-06-19", today)).toBeNull();
    expect(getExpiryWarning()).toBeNull();
  });
});
