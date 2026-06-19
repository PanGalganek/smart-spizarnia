import { describe, expect, it } from "vitest";
import { shouldAutoStartScanner } from "./scannerLaunch";

describe("automatic scanner launch", () => {
  it("waits until navigation reaches the scanner screen", () => {
    expect(shouldAutoStartScanner("1", "shopping", false)).toBe(false);
    expect(shouldAutoStartScanner("1", "scanner", false)).toBe(true);
  });

  it("does not reopen the camera after it was handled", () => {
    expect(shouldAutoStartScanner("1", "scanner", true)).toBe(false);
  });

  it("does not start without an explicit request", () => {
    expect(shouldAutoStartScanner(undefined, "scanner", false)).toBe(false);
    expect(shouldAutoStartScanner("0", "scanner", false)).toBe(false);
  });
});
