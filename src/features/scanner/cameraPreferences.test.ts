import { describe, expect, it } from "vitest";
import { preferredCameraHeight, preferredCameraIndex, preferredCameraWidth } from "./cameraPreferences";

describe("scanner camera preferences", () => {
  it("requests the reliable portrait resolution", () => {
    expect([preferredCameraWidth, preferredCameraHeight]).toEqual([1440, 2560]);
  });

  it("selects the second rear camera when the phone exposes more than one", () => {
    expect(preferredCameraIndex(3)).toBe(1);
    expect(preferredCameraIndex(1)).toBe(0);
  });
});
