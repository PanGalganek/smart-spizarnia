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
const HISTORY_GUARD_KEY = "__smartPantryBackGuard";
const DOUBLE_BACK_EXIT_MS = 2200;

const layers = new Map<string, LayerDescriptor>();
const appStack: AppNavigationState[] = [];
const listeners = new Set<() => void>();
const fallbackNavigationState = baseState("root", "/", "");

let currentState: AppNavigationState | null = null;
let layerCounter = 0;
let layerOrderCounter = 0;
let applyingSystemBack = false;
let lastSystemBackAt = 0;

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
  writeCurrentHistoryEntry(currentState);
  notify();
}

export function pushNavigationState(nextState: AppNavigationState) {
  const next = cleanStateUrl(nextState);
  if (isSameNavigationState(currentState, next)) return false;
  resetSystemBackExitWindow();
  if (currentState) appStack.push(cloneState(currentState));
  currentState = cloneState(next);
  if (canUseHistory()) window.history.pushState(withNavigationState(withoutBackGuard(window.history.state), currentState), "", historyUrlForState(currentState));
  armBackGuard();
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
    writeCurrentHistoryEntry(currentState);
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

  removed.forEach((id) => layers.delete(id));
  if (currentState?.layerId && removed.includes(currentState.layerId)) {
    currentState = withoutLayer(currentState);
    writeCurrentHistoryEntry(currentState);
    notify();
  }
}

export function closeNavigationLayer(id: string) {
  closeLayerById(id, { callOnBack: false });
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
  handleBackNavigation();
}

export function handleBackNavigation(rawState?: unknown) {
  if (!currentState) currentState = readNavigationState(rawState) ?? deriveNavigationState(currentPathname());
  const state = currentState;
  const targetState = readNavigationState(rawState);
  const activeLayer = state.layerId ? layers.get(state.layerId) : topLayer();

  if (activeLayer) {
    if (targetState?.layerId === activeLayer.id && !isSameNavigationState(targetState, state)) {
      currentState = cloneState(targetState);
      restoreStackForState(targetState);
      writeCurrentHistoryEntry(currentState);
      notify();
      return true;
    }
    if (!targetState || targetState.layerId === activeLayer.id) {
      const previousStep = previousStepInsideLayer(activeLayer.id);
      if (previousStep) {
        currentState = previousStep;
        writeCurrentHistoryEntry(currentState);
        notify();
        return true;
      }
    }
    return closeLayerById(activeLayer.id, { callOnBack: true, fromBack: true });
  }

  if (state.modal || state.scanner || state.mode || state.editingProductId) {
    currentState = withoutLayer(state);
    writeCurrentHistoryEntry(currentState);
    notify();
    return true;
  }

  if (state.view === "pantryItem") {
    replaceWithNavigationState(pantryListStateFromItem(state));
    return true;
  }

  if (state.view === "pantry" && state.subview) {
    replaceWithNavigationState({ ...state, path: "/pantry", url: pantryUrl(state.tab), subview: null, barcode: null });
    return true;
  }

  const previousTab = previousTabState(state);
  if (previousTab) {
    replaceWithNavigationState(previousTab);
    return true;
  }

  if (state.view !== "home" && state.view !== "login" && state.view !== "root") {
    replaceWithNavigationState(baseState("home", "/home", "/home"));
    return true;
  }

  return false;
}

export function handleSystemBackState(rawState: unknown) {
  return handleSystemBackPress(rawState);
}

export function handleSystemBackPress(rawState?: unknown) {
  if (!currentState) currentState = readNavigationState(rawState) ?? deriveNavigationState(currentPathname());

  const now = Date.now();
  if (now - lastSystemBackAt < DOUBLE_BACK_EXIT_MS) {
    lastSystemBackAt = 0;
    exitApplication();
    return true;
  }

  lastSystemBackAt = now;
  armBackGuard();
  return true;
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

function closeLayerById(id: string, options: { callOnBack?: boolean; fromBack?: boolean } = {}) {
  const layer = layers.get(id);
  if (!layer) return false;
  if (options.fromBack && hasPotentialFormChanges(layer) && !confirmDiscardChanges()) return true;
  if (options.fromBack) applyingSystemBack = true;

  const nextState = previousStateAfterClosingLayer(id) ?? withoutLayer(currentState ?? deriveNavigationState(currentPathname()));
  layers.delete(id);
  currentState = cleanStateUrl(nextState);
  pruneLayersToVisibleStack();
  if (options.callOnBack) layer.onBack?.();
  writeCurrentHistoryEntry(currentState);
  notify();

  if (options.fromBack && typeof window !== "undefined") {
    window.setTimeout(() => { applyingSystemBack = false; }, 0);
  } else {
    applyingSystemBack = false;
  }
  return true;
}

function hasPotentialFormChanges(layer: LayerDescriptor) {
  return layer.kind === "form" || layer.kind === "edit";
}

function confirmDiscardChanges() {
  if (typeof window === "undefined" || typeof window.confirm !== "function") return true;
  return window.confirm("Masz niezapisane zmiany. Czy na pewno chcesz wrócić?");
}

function previousStateAfterClosingLayer(id: string) {
  while (appStack.length) {
    const previous = appStack.pop();
    if (!previous || previous.layerId === id) continue;
    return cloneState(previous);
  }
  return currentState ? withoutLayer(currentState) : null;
}

function previousStepInsideLayer(id: string) {
  while (appStack.length) {
    const previous = appStack.pop();
    if (!previous) continue;
    if (previous.layerId === id) return cloneState(previous);
    appStack.push(previous);
    return null;
  }
  return null;
}

function replaceWithNavigationState(state: AppNavigationState) {
  const next = cleanStateUrl(state);
  currentState = cloneState(next);
  appStack.length = 0;
  pruneLayersToVisibleStack();
  writeCurrentHistoryEntry(currentState);
  notify();
  router.replace(hrefForState(currentState));
}

function previousTabState(state: AppNavigationState) {
  if (!state.tab) return null;
  for (let index = appStack.length - 1; index >= 0; index -= 1) {
    const candidate = appStack[index];
    if (
      candidate.view === state.view &&
      candidate.path === state.path &&
      candidate.subview === state.subview &&
      candidate.tab !== state.tab &&
      !candidate.layerId
    ) {
      appStack.splice(index);
      return cloneState(candidate);
    }
  }
  return null;
}

function pantryListStateFromItem(state: AppNavigationState) {
  return {
    ...baseState("pantry", "/pantry", pantryUrl(state.tab, state.subview)),
    tab: state.tab ?? "food",
    subview: state.subview
  };
}

function pantryUrl(tab: string | null, location?: string | null) {
  const params = new URLSearchParams();
  if (tab) params.set("type", tab);
  if (location) params.set("location", location);
  const query = params.toString();
  return query ? `/pantry?${query}` : "/pantry";
}

function hrefForState(state: AppNavigationState): Href {
  if (state.view === "pantry") {
    const params: Record<string, string> = {};
    if (state.tab) params.type = state.tab;
    if (state.subview) params.location = state.subview;
    return { pathname: "/pantry", params };
  }
  if (state.view === "pantryItem" && state.barcode) {
    const params: Record<string, string> = { barcode: state.barcode };
    if (state.tab) params.type = state.tab;
    if (state.subview) params.location = state.subview;
    return { pathname: "/pantry/[barcode]", params };
  }
  return state.path || "/home";
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

function writeCurrentHistoryEntry(state: AppNavigationState) {
  if (!canUseHistory()) return;
  resetSystemBackExitWindow();
  if (historyIsGuardFor(state)) return;
  window.history.replaceState(withNavigationState(withoutBackGuard(window.history.state), state), "", historyUrlForState(state));
  armBackGuard();
}

function armBackGuard() {
  if (!canUseHistory() || !currentState || !shouldUseBackGuard(currentState)) return;
  if (historyIsGuardFor(currentState)) return;
  window.history.pushState(withBackGuard(withNavigationState(withoutBackGuard(window.history.state), currentState)), "", historyUrlForState(currentState));
}

function historyIsGuardFor(state: AppNavigationState) {
  if (!canUseHistory()) return false;
  const rawState = window.history.state;
  return Boolean(rawState && typeof rawState === "object" && (rawState as Record<string, unknown>)[HISTORY_GUARD_KEY]) &&
    isSameNavigationState(readNavigationState(rawState), state);
}

function shouldUseBackGuard(state: AppNavigationState) {
  return state.view !== "root" && state.view !== "login" && state.view !== "unknown";
}

function withNavigationState(existingState: unknown, state: AppNavigationState) {
  return {
    ...(existingState && typeof existingState === "object" ? existingState : {}),
    [HISTORY_STATE_KEY]: cloneState(state)
  };
}

function withBackGuard(state: unknown) {
  return {
    ...(state && typeof state === "object" ? state : {}),
    [HISTORY_GUARD_KEY]: true
  };
}

function withoutBackGuard(state: unknown) {
  if (!state || typeof state !== "object") return state;
  const { [HISTORY_GUARD_KEY]: _guard, ...rest } = state as Record<string, unknown>;
  return rest;
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

function resetSystemBackExitWindow() {
  lastSystemBackAt = 0;
}

function exitApplication() {
  if (typeof window === "undefined") return;
  try {
    window.close();
  } catch {
    // Some browsers block window.close() for PWA tabs not opened by script.
  }

  if (typeof window.history?.go === "function") {
    const length = typeof window.history.length === "number" && window.history.length > 0 ? window.history.length : 1;
    window.setTimeout(() => window.history.go(-length), 0);
  }
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
