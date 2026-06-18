import { router } from "expo-router";
import { useMemo, useRef, useSyncExternalStore } from "react";
import {
  AppNavigationState,
  closeNavigationLayer,
  closeTopLayer,
  createNavigationLayerId,
  deriveNavigationState,
  getNavigationSnapshot,
  isNavigationLayerVisible,
  goBack,
  navigateTo,
  NavigationLayerKind,
  openNavigationLayer,
  replaceNavigationState,
  subscribeNavigation,
  updateNavigationState
} from "@/core/navigation/navigationManager";

type RouteHref = Parameters<typeof router.push>[0];

export function useAppNavigation() {
  const state = useSyncExternalStore(subscribeNavigation, getNavigationSnapshot, getNavigationSnapshot);

  return useMemo(() => ({
    state,
    navigateToRoute,
    replaceWithRoute,
    goBack,
    closeTopLayer,
    updateState: updateNavigationState,
    openLayer: openNavigationLayer,
    closeLayer: closeNavigationLayer
  }), [state]);
}

export function useNavigationLayer(name: string, kind: NavigationLayerKind = "modal", patch: Partial<AppNavigationState> = {}, onBack?: () => void) {
  const appNavigation = useAppNavigation();
  const id = useRef(createNavigationLayerId(name));
  const open = isNavigationLayerVisible(id.current);

  return {
    open,
    openLayer: (nextPatch?: unknown) => openNavigationLayer(id.current, { kind, name, onBack }, isNavigationPatch(nextPatch) ? nextPatch : patch),
    closeLayer: () => closeNavigationLayer(id.current),
    id: id.current
  };
}

export function navigateToRoute(href: RouteHref) {
  const path = hrefPath(href);
  navigateTo(deriveNavigationState(path, hrefParams(href), hrefUrl(href)), href);
}

export function replaceWithRoute(href: RouteHref) {
  const path = hrefPath(href);
  replaceNavigationState(deriveNavigationState(path, hrefParams(href), hrefUrl(href)));
  navigateTo(deriveNavigationState(path, hrefParams(href), hrefUrl(href)), href, { replace: true });
}

function hrefPath(href: RouteHref) {
  if (typeof href === "string") return href.split("?")[0] || "/";
  const pathname = typeof href.pathname === "string" ? href.pathname : "/";
  return pathname.replace("[barcode]", String(href.params?.barcode ?? ""));
}

function hrefParams(href: RouteHref) {
  if (typeof href === "string") return {};
  return Object.fromEntries(Object.entries(href.params ?? {}).map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : String(value)]));
}

function hrefUrl(href: RouteHref) {
  if (typeof href === "string") return href;
  const params = hrefParams(href);
  const path = hrefPath(href);
  const search = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(Array.isArray(value) ? value[0] ?? "" : value)}`)
    .join("&");
  return search ? `${path}?${search}` : path;
}

function isNavigationPatch(value: unknown): value is Partial<AppNavigationState> {
  if (!value || typeof value !== "object") return false;
  return ["view", "path", "url", "tab", "subview", "modal", "scanner", "mode", "editingProductId", "selectedId", "barcode", "layerId", "layerKind", "layerName"]
    .some((key) => key in value);
}
