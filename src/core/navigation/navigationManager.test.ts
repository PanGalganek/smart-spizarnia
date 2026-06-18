import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-router", () => ({
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn()
  }
}));

type HistoryEntry = { state: unknown; url: string };

function installWindow(url = "/scanner") {
  const entries: HistoryEntry[] = [{ state: {}, url }];
  let index = 0;
  const history = {
    get state() { return entries[index]?.state ?? null; },
    pushState: vi.fn((state: unknown, _title: string, nextUrl?: string | URL | null) => {
      entries.splice(index + 1);
      entries.push({ state, url: String(nextUrl ?? entries[index].url) });
      index = entries.length - 1;
      setLocation(entries[index].url);
    }),
    replaceState: vi.fn((state: unknown, _title: string, nextUrl?: string | URL | null) => {
      entries[index] = { state, url: String(nextUrl ?? entries[index].url) };
      setLocation(entries[index].url);
    }),
    go: vi.fn((delta: number) => {
      index = Math.max(0, Math.min(entries.length - 1, index + delta));
      setLocation(entries[index].url);
    })
  };

  function setLocation(nextUrl: string) {
    const parsed = new URL(nextUrl, "https://example.test");
    Object.assign(location, { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash });
  }

  const location = { pathname: url, search: "", hash: "" };
  vi.stubGlobal("window", {
    history,
    location,
    setTimeout: (callback: () => void) => {
      callback();
      return 0;
    }
  });
  setLocation(url);
  return { entries, history };
}

describe("navigationManager", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("replaces the initial route state without adding history entries", async () => {
    const { entries, history } = installWindow("/scanner");
    const { deriveNavigationState, replaceNavigationState } = await import("./navigationManager");

    replaceNavigationState(deriveNavigationState("/scanner", {}, "/scanner"));

    expect(entries).toHaveLength(1);
    expect(history.replaceState).toHaveBeenCalledTimes(1);
    expect(history.pushState).not.toHaveBeenCalled();
  });

  it("keeps navigation snapshots referentially stable until state changes", async () => {
    installWindow("/scanner");
    const { deriveNavigationState, getNavigationSnapshot, replaceNavigationState } = await import("./navigationManager");

    expect(getNavigationSnapshot()).toBe(getNavigationSnapshot());

    replaceNavigationState(deriveNavigationState("/scanner", {}, "/scanner"));
    expect(getNavigationSnapshot()).toBe(getNavigationSnapshot());
  });

  it("pushes a scanner layer and closes it from system popstate", async () => {
    const { entries } = installWindow("/scanner");
    const { deriveNavigationState, handleSystemBackState, registerNavigationLayer, replaceNavigationState, getCurrentNavigationState } = await import("./navigationManager");
    const onBack = vi.fn();

    replaceNavigationState(deriveNavigationState("/scanner", {}, "/scanner"));
    registerNavigationLayer("scanner-layer", { kind: "scanner", name: "scanner-camera", onBack });

    expect(entries).toHaveLength(2);
    expect(entries[1].url).toBe("/scanner#smart-pantry-layer=scanner-layer");
    expect(getCurrentNavigationState()?.scanner).toBe(true);

    handleSystemBackState(entries[0].state);

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(getCurrentNavigationState()?.scanner).toBe(false);
    expect(getCurrentNavigationState()?.layerId).toBeNull();
  });

  it("does not push a duplicate entry for the same layer", async () => {
    const { entries } = installWindow("/scanner");
    const { deriveNavigationState, registerNavigationLayer, replaceNavigationState } = await import("./navigationManager");
    const onBack = vi.fn();

    replaceNavigationState(deriveNavigationState("/scanner", {}, "/scanner"));
    registerNavigationLayer("scanner-layer", { kind: "scanner", name: "scanner-camera", onBack });
    registerNavigationLayer("scanner-layer", { kind: "scanner", name: "scanner-camera", onBack });

    expect(entries).toHaveLength(2);
  });

  it("pops the layer history entry when a layer is closed manually", async () => {
    const { history } = installWindow("/scanner");
    const { deriveNavigationState, registerNavigationLayer, replaceNavigationState, unregisterNavigationLayer } = await import("./navigationManager");

    replaceNavigationState(deriveNavigationState("/scanner", {}, "/scanner"));
    registerNavigationLayer("scanner-layer", { kind: "scanner", name: "scanner-camera", onBack: vi.fn() });
    unregisterNavigationLayer("scanner-layer");

    expect(history.go).toHaveBeenCalledWith(-1);
  });

  it("restores the previous step inside the same layer before closing it", async () => {
    const { entries } = installWindow("/meals");
    const { deriveNavigationState, getCurrentNavigationState, handleSystemBackState, openNavigationLayer, replaceNavigationState, updateNavigationState } = await import("./navigationManager");
    const onBack = vi.fn();

    replaceNavigationState(deriveNavigationState("/meals", {}, "/meals"));
    openNavigationLayer("meal-layer", { kind: "modal", name: "meal-creator", onBack }, { modal: "meal-creator", mode: "meal-type" });
    updateNavigationState({ mode: "meal-products" }, { push: true });

    expect(entries).toHaveLength(3);
    expect(getCurrentNavigationState()?.mode).toBe("meal-products");

    handleSystemBackState(entries[1].state);

    expect(onBack).not.toHaveBeenCalled();
    expect(getCurrentNavigationState()?.layerId).toBe("meal-layer");
    expect(getCurrentNavigationState()?.mode).toBe("meal-type");

    handleSystemBackState(entries[0].state);

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(getCurrentNavigationState()?.layerId).toBeNull();
  });

  it("keeps a parent modal visible when a nested modal is opened and restored", async () => {
    const { entries } = installWindow("/saved");
    const { deriveNavigationState, getCurrentNavigationState, handleSystemBackState, isNavigationLayerVisible, openNavigationLayer, replaceNavigationState } = await import("./navigationManager");

    replaceNavigationState(deriveNavigationState("/saved", {}, "/saved"));
    openNavigationLayer("saved-product", { kind: "modal", name: "saved-product" }, { modal: "saved-product", mode: "saved-details", selectedId: "590" });
    openNavigationLayer("location-picker", { kind: "modal", name: "location-picker" }, { modal: "location-picker" });

    expect(entries[0].url).toBe("/saved");
    expect(entries[1].url).toBe("/saved#smart-pantry-layer=saved-product");
    expect(entries[2].url).toBe("/saved#smart-pantry-layer=location-picker");
    expect(getCurrentNavigationState()?.layerId).toBe("location-picker");
    expect(getCurrentNavigationState()?.selectedId).toBe("590");
    expect(getCurrentNavigationState()?.mode).toBe("saved-details");
    expect(isNavigationLayerVisible("saved-product")).toBe(true);
    expect(isNavigationLayerVisible("location-picker")).toBe(true);

    handleSystemBackState(entries[1].state);

    expect(getCurrentNavigationState()?.layerId).toBe("saved-product");
    expect(getCurrentNavigationState()?.selectedId).toBe("590");
    expect(isNavigationLayerVisible("saved-product")).toBe(true);
    expect(isNavigationLayerVisible("location-picker")).toBe(false);
  });

  it("keeps saved product details as a separate Android back step", async () => {
    const { entries } = installWindow("/saved");
    const { deriveNavigationState, getCurrentNavigationState, handleSystemBackState, openNavigationLayer, replaceNavigationState } = await import("./navigationManager");
    const onBack = vi.fn();

    replaceNavigationState(deriveNavigationState("/saved", {}, "/saved"));
    openNavigationLayer("saved-product", { kind: "modal", name: "saved-product", onBack }, { modal: "saved-product", mode: "saved-details", selectedId: "590" });

    expect(entries).toHaveLength(2);
    expect(entries[0].url).toBe("/saved");
    expect(entries[1].url).toBe("/saved#smart-pantry-layer=saved-product");
    expect(getCurrentNavigationState()?.selectedId).toBe("590");

    handleSystemBackState(entries[0].state);

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(getCurrentNavigationState()?.view).toBe("saved");
    expect(getCurrentNavigationState()?.layerId).toBeNull();
    expect(getCurrentNavigationState()?.selectedId).toBeNull();
  });

  it("strips navigation hashes from stored state urls", async () => {
    const { entries } = installWindow("/saved#smart-pantry-layer=old-modal");
    const { deriveNavigationState, getCurrentNavigationState, replaceNavigationState } = await import("./navigationManager");

    replaceNavigationState(deriveNavigationState("/saved", {}, "/saved#smart-pantry-layer=old-modal"));

    expect(getCurrentNavigationState()?.url).toBe("/saved");
    expect(entries[0].url).toBe("/saved");
  });

  it("cleans hidden layer history when the browser jumps back several entries", async () => {
    const { entries } = installWindow("/saved");
    const { deriveNavigationState, getCurrentNavigationState, getNavigationStackSnapshot, handleSystemBackState, isNavigationLayerVisible, openNavigationLayer, replaceNavigationState, updateNavigationState } = await import("./navigationManager");

    replaceNavigationState(deriveNavigationState("/saved", {}, "/saved"));
    openNavigationLayer("saved-product", { kind: "modal", name: "saved-product" }, { modal: "saved-product", mode: "saved-details", selectedId: "590" });
    updateNavigationState({ mode: "saved-edit" }, { push: true });

    expect(entries).toHaveLength(3);
    expect(isNavigationLayerVisible("saved-product")).toBe(true);

    handleSystemBackState(entries[0].state);

    expect(getCurrentNavigationState()?.layerId).toBeNull();
    expect(getNavigationStackSnapshot()).toHaveLength(0);
    expect(isNavigationLayerVisible("saved-product")).toBe(false);
  });

  it("closes all history entries belonging to the same layer", async () => {
    const { history } = installWindow("/meals");
    const { closeNavigationLayer, deriveNavigationState, openNavigationLayer, replaceNavigationState, updateNavigationState } = await import("./navigationManager");

    replaceNavigationState(deriveNavigationState("/meals", {}, "/meals"));
    openNavigationLayer("meal-layer", { kind: "modal", name: "meal-creator" }, { modal: "meal-creator", mode: "meal-type" });
    updateNavigationState({ mode: "meal-products" }, { push: true });

    closeNavigationLayer("meal-layer");

    expect(history.go).toHaveBeenCalledWith(-2);
  });
});
