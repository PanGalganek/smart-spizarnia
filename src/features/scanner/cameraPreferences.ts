export const preferredCameraWidth = 1440;
export const preferredCameraHeight = 2560;

export function preferredCameraIndex(cameraCount: number) {
  return cameraCount > 1 ? 1 : 0;
}
