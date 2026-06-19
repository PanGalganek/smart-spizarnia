import type { AppNavigationState } from "@/core/navigation/navigationManager";

const nullableStringKeys = [
  "view",
  "path",
  "url",
  "tab",
  "subview",
  "modal",
  "mode",
  "editingProductId",
  "selectedId",
  "barcode",
  "layerId",
  "layerKind",
  "layerName"
] as const;

export function isNavigationPatch(value: unknown): value is Partial<AppNavigationState> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;

  if ("nativeEvent" in candidate || "preventDefault" in candidate) return false;
  if ("scanner" in candidate && typeof candidate.scanner === "boolean") return true;

  return nullableStringKeys.some((key) =>
    key in candidate && (typeof candidate[key] === "string" || candidate[key] === null)
  );
}
