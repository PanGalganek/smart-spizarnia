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

  it("pushes a scanner layer and closes it from system popstate", async () => {
    const { entries } = installWindow("/scanner");
    const { deriveNavigationState, handleSystemBackState, registerNavigationLayer, replaceNavigationState, getCurrentNavigationState } = await import("./navigationManager");
    const onBack = vi.fn();

    replaceNavigationState(deriveNavigationState("/scanner", {}, "/scanner"));
    registerNavigationLayer("scanner-layer", { kind: "scanner", name: "scanner-camera", onBack });

    expect(entries).toHaveLength(2);
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
});
