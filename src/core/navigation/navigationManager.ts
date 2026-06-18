import { router } from "expo-router";

export type AppView = "root" | "login" | "home" | "scanner" | "pantry" | "pantryItem" | "meals" | "saved" | "shopping" | "admin" | "unknown";
export type NavigationLayerKind = "modal" | "scanner" | "form" | "edit" | "subview";

export type AppNavigationState = {
  view: AppView;
  path: string;
  url: string;
  tab: string | null;
  subview: string | null;
  modal: string | null;
  scanner: boolean;
  mode: string | null;
  editingProductId: string | null;
  selectedId: string | null;
  barcode: string | null;
  layerId: string | null;
  layerKind: NavigationLayerKind | null;
  layerName: string | null;
};

type SearchParams = Record<string, string | string[] | undefined>;
type Href = Parameters<typeof router.push>[0];

type LayerDescriptor = {
  id: string;
  kind: NavigationLayerKind;
  name: string;
  onBack?: () => void;
  order: number;
};

const HISTORY_STATE_KEY = "__smartPantryNavigation";
const NAVIGATION_HASH_KEY = "smart-pantry-layer";

const layers = new Map<string, LayerDescriptor>();
const appStack: AppNavigationState[] = [];
const listeners = new Set<() => void>();
const fallbackNavigationState = baseState("root", "/", "");

let currentState: AppNavigationState | null = null;
let layerCounter = 0;
let layerOrderCounter = 0;
let applyingSystemBack = false;

export function createNavigationLayerId(prefix = "layer") {
  layerCounter += 1;
  return `${prefix}-${layerCounter}`;
}

export function deriveNavigationState(pathname: string, params: SearchParams = {}, url = currentUrl()): AppNavigationState {
  const cleanUrl = stripNavigationHash(url);
  const type = firstParam(params.type) ?? "food";
  const location = firstParam(params.location) ?? null;
  const barcode = firstParam(params.barcode) ?? segmentAfter(pathname, "/pantry/");

  if (pathname === "/" || pathname === "") return baseState("root", pathname, cleanUrl);
  if (pathname === "/login") return baseState("login", pathname, cleanUrl);
  if (pathname === "/home") return baseState("home", pathname, cleanUrl);
  if (pathname === "/scanner") return baseState("scanner", pathname, cleanUrl);
  if (pathname === "/meals") return baseState("meals", pathname, cleanUrl);
  if (pathname === "/saved") return baseState("saved", pathname, cleanUrl);
  if (pathname === "/shopping") return baseState("shopping", pathname, cleanUrl);
  if (pathname === "/admin") return baseState("admin", pathname, cleanUrl);
  if (pathname.startsWith("/pantry/")) return { ...baseState("pantryItem", pathname, cleanUrl), tab: type, subview: location, barcode };
  if (pathname === "/pantry") return { ...baseState("pantry", pathname, cleanUrl), tab: type, subview: location };
  return baseState("unknown", pathname, cleanUrl);
}

export function subscribeNavigation(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getNavigationSnapshot() {
  return currentState ?? fallbackNavigationState;
}

export function isNavigationLayerVisible(id: string) {
  return currentState?.layerId === id || appStack.some((state) => state.layerId === id);
}

export function replaceNavigationState(state: AppNavigationState) {
  const next = cleanStateUrl(mergeRouteState(state));
  currentState = cloneState(next);
  if (canUseHistory()) window.history.replaceState(withNavigationState(window.history.state, currentState), "", historyUrlForState(currentState));
  notify();
}

export function pushNavigationState(nextState: AppNavigationState) {
  const next = cleanStateUrl(nextState);
  if (isSameNavigationState(currentState, next)) return false;
  if (currentState) appStack.push(cloneState(currentState));
  currentState = cloneState(next);
  if (canUseHistory()) window.history.pushState(withNavigationState(window.history.state, currentState), "", historyUrlForState(currentState));
  notify();
  return true;
}

export function navigateTo(nextState: AppNavigationState, href: Href, options: { replace?: boolean } = {}) {
  if (isSameNavigationState(currentState, nextState) && currentUrl() === nextState.url) return;
  if (options.replace) router.replace(href);
  else router.push(href);
}

export function updateNavigationState(patch: Partial<AppNavigationState>, options: { push?: boolean } = {}) {
  const base = currentState ?? deriveNavigationState(currentPathname());
  const next = cleanStateUrl({ ...base, ...patch });
  if (options.push) pushNavigationState(next);
  else {
    currentState = cloneState(next);
    if (canUseHistory()) window.history.replaceState(withNavigationState(window.history.state, currentState), "", historyUrlForState(currentState));
    notify();
  }
}

export function openNavigationLayer(id: string, descriptor: Omit<LayerDescriptor, "id" | "order">, patch: Partial<AppNavigationState> = {}) {
  registerLayerInternal(id, descriptor, patch);
}

export function registerNavigationLayer(id: string, descriptor: Omit<LayerDescriptor, "id" | "order">) {
  registerLayerInternal(id, descriptor, {});
}

function registerLayerInternal(id: string, descriptor: Omit<LayerDescriptor, "id" | "order">, patch: Partial<AppNavigationState>) {
  const existing = layers.get(id);
  if (existing) {
    layers.set(id, { ...existing, ...descriptor, id });
    return;
  }

  const layer: LayerDescriptor = { ...descriptor, id, order: ++layerOrderCounter };
  layers.set(id, layer);

  const base = currentState ?? deriveNavigationState(currentPathname());
  pushNavigationState({ ...applyLayerToState(base, layer), ...patch });
}

export function unregisterNavigationLayer(id: string) {
  unregisterNavigationLayers([id]);
}

export function unregisterNavigationLayers(ids: string[]) {
  const removed = ids.filter((id) => layers.has(id));
  if (!removed.length) return;

  const shouldPopHistory = !applyingSystemBack && Boolean(currentState?.layerId && removed.includes(currentState.layerId));
  removed.forEach((id) => layers.delete(id));

  if (shouldPopHistory && canUseHistory()) {
    const depth = Math.max(1, removed.length);
    window.history.go(-depth);
  }
}

export function closeNavigationLayer(id: string) {
  if (currentState?.layerId === id && canUseHistory()) {
    window.history.go(-layerHistoryDepth(id));
    return;
  }
  unregisterNavigationLayer(id);
  if (currentState?.layerId === id) updateNavigationState(withoutLayer(currentState));
}

export function closeTopLayer() {
  const layer = currentState?.layerId ? layers.get(currentState.layerId) : topLayer();
  if (layer) {
    closeNavigationLayer(layer.id);
    return true;
  }
  if (currentState?.modal || currentState?.scanner || currentState?.mode || currentState?.editingProductId) {
    updateNavigationState(withoutLayer(currentState));
    return true;
  }
  return false;
}

export function goBack() {
  if (closeTopLayer()) return;
  router.back();
}

export function handleSystemBackState(rawState: unknown) {
  const nextState = readNavigationState(rawState);
  const activeLayer = currentState?.layerId ? layers.get(currentState.layerId) : topLayer();

  if (activeLayer && nextState?.layerId === activeLayer.id) {
    currentState = cloneState(nextState);
    restoreStackForState(nextState);
    pruneLayersToVisibleStack();
    notify();
    return true;
  }

  if (activeLayer) {
    applyingSystemBack = true;
    currentState = nextState ? cloneState(nextState) : withoutLayer(currentState ?? deriveNavigationState(currentPathname()));
    restoreStackForState(nextState);
    layers.delete(activeLayer.id);
    pruneLayersToVisibleStack();
    activeLayer.onBack?.();
    notify();
    window.setTimeout(() => { applyingSystemBack = false; }, 0);
    return true;
  }

  if (nextState) {
    currentState = cloneState(nextState);
    restoreStackForState(nextState);
    pruneLayersToVisibleStack();
    notify();
  }
  return false;
}

export function getCurrentNavigationState() {
  return currentState ? cloneState(currentState) : null;
}

export function getNavigationStackSnapshot() {
  return appStack.map(cloneState);
}

export function isApplyingSystemBack() {
  return applyingSystemBack;
}

function applyLayerToState(base: AppNavigationState, layer: LayerDescriptor): AppNavigationState {
  const next = { ...base };
  next.layerId = layer.id;
  next.layerKind = layer.kind;
  next.layerName = layer.name;
  if (layer.kind === "modal") next.modal = layer.name;
  if (layer.kind === "scanner") next.scanner = true;
  if (layer.kind === "form") next.modal = layer.name;
  if (layer.kind === "edit") next.editingProductId = layer.name;
  if (layer.kind === "subview") next.subview = layer.name;
  return next;
}

function withoutLayer(state: AppNavigationState): AppNavigationState {
  return {
    ...state,
    modal: null,
    scanner: false,
    mode: null,
    editingProductId: null,
    selectedId: null,
    layerId: null,
    layerKind: null,
    layerName: null
  };
}

function topLayer() {
  return [...layers.values()].sort((left, right) => right.order - left.order)[0] ?? null;
}

function restoreStackForState(nextState: AppNavigationState | null) {
  if (!nextState) {
    appStack.length = 0;
    return;
  }

  const index = findLastStackIndex(nextState);
  if (index >= 0) {
    appStack.splice(index);
    return;
  }

  appStack.pop();
}

function pruneLayersToVisibleStack() {
  const visibleLayerIds = new Set<string>();
  if (currentState?.layerId) visibleLayerIds.add(currentState.layerId);
  appStack.forEach((state) => {
    if (state.layerId) visibleLayerIds.add(state.layerId);
  });
  [...layers.keys()].forEach((id) => {
    if (!visibleLayerIds.has(id)) layers.delete(id);
  });
}

function findLastStackIndex(state: AppNavigationState) {
  for (let index = appStack.length - 1; index >= 0; index -= 1) {
    if (isSameNavigationState(appStack[index], state)) return index;
  }
  return -1;
}

function layerHistoryDepth(id: string) {
  let depth = 1;
  for (let index = appStack.length - 1; index >= 0; index -= 1) {
    if (appStack[index].layerId !== id) break;
    depth += 1;
  }
  return depth;
}

function readNavigationState(rawState: unknown): AppNavigationState | null {
  if (!rawState || typeof rawState !== "object") return null;
  const value = (rawState as Record<string, unknown>)[HISTORY_STATE_KEY];
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<AppNavigationState>;
  if (!state.view || !state.path || !state.url) return null;
  return {
    view: state.view,
    path: state.path,
    url: state.url,
    tab: state.tab ?? null,
    subview: state.subview ?? null,
    modal: state.modal ?? null,
    scanner: Boolean(state.scanner),
    mode: state.mode ?? null,
    editingProductId: state.editingProductId ?? null,
    selectedId: state.selectedId ?? null,
    barcode: state.barcode ?? null,
    layerId: state.layerId ?? null,
    layerKind: state.layerKind ?? null,
    layerName: state.layerName ?? null
  };
}

function withNavigationState(existingState: unknown, state: AppNavigationState) {
  return {
    ...(existingState && typeof existingState === "object" ? existingState : {}),
    [HISTORY_STATE_KEY]: cloneState(state)
  };
}

function baseState(view: AppView, path: string, url: string): AppNavigationState {
  return {
    view,
    path,
    url,
    tab: null,
    subview: null,
    modal: null,
    scanner: false,
    mode: null,
    editingProductId: null,
    selectedId: null,
    barcode: null,
    layerId: null,
    layerKind: null,
    layerName: null
  };
}

function cloneState(state: AppNavigationState) {
  return { ...state };
}

function isSameNavigationState(left: AppNavigationState | null, right: AppNavigationState) {
  if (!left) return false;
  return navigationKey(left) === navigationKey(right);
}

function navigationKey(state: AppNavigationState) {
  return JSON.stringify({
    view: state.view,
    path: state.path,
    url: state.url,
    tab: state.tab,
    subview: state.subview,
    modal: state.modal,
    scanner: state.scanner,
    mode: state.mode,
    editingProductId: state.editingProductId,
    selectedId: state.selectedId,
    barcode: state.barcode,
    layerId: state.layerId,
    layerKind: state.layerKind,
    layerName: state.layerName
  });
}

function mergeRouteState(routeState: AppNavigationState) {
  if (!currentState) return routeState;
  if (routeState.path !== currentState.path || routeState.url !== currentState.url || routeState.view !== currentState.view) return routeState;
  return {
    ...routeState,
    modal: currentState.modal,
    scanner: currentState.scanner,
    mode: currentState.mode,
    editingProductId: currentState.editingProductId,
    selectedId: currentState.selectedId,
    layerId: currentState.layerId,
    layerKind: currentState.layerKind,
    layerName: currentState.layerName
  };
}

function cleanStateUrl(state: AppNavigationState) {
  return { ...state, url: stripNavigationHash(state.url) };
}

function notify() {
  listeners.forEach((listener) => listener());
}

function canUseHistory() {
  return typeof window !== "undefined" && typeof window.history?.pushState === "function";
}

function currentPathname() {
  return typeof window === "undefined" ? "/" : window.location.pathname.replace(/^\/smart-spizarnia/, "") || "/";
}

function currentUrl() {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function historyUrlForState(state: AppNavigationState) {
  const cleanUrl = stripNavigationHash(state.url);
  if (!state.layerId) return cleanUrl;
  const separator = cleanUrl.includes("#") ? "&" : "#";
  return `${cleanUrl}${separator}${NAVIGATION_HASH_KEY}=${encodeURIComponent(state.layerId)}`;
}

function stripNavigationHash(url: string) {
  const hashIndex = url.indexOf("#");
  if (hashIndex < 0) return url;

  const beforeHash = url.slice(0, hashIndex);
  const hash = url.slice(hashIndex + 1);
  const nextHash = hash
    .split("&")
    .filter((part) => !part.startsWith(`${NAVIGATION_HASH_KEY}=`))
    .join("&");

  return nextHash ? `${beforeHash}#${nextHash}` : beforeHash;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function segmentAfter(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) return null;
  return decodeURIComponent(pathname.slice(prefix.length).split("/")[0] ?? "") || null;
}
