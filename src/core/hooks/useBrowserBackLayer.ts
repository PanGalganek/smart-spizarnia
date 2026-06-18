import { useEffect, useRef } from "react";

type StackEntry = {
  owner: symbol;
  onBack: () => void;
};

const browserBackStack: StackEntry[] = [];
let listenerInstalled = false;
let suppressedPopCount = 0;

function ensurePopStateListener() {
  if (typeof window === "undefined" || listenerInstalled) return;
  listenerInstalled = true;
  window.addEventListener("popstate", () => {
    if (suppressedPopCount > 0) {
      suppressedPopCount -= 1;
      return;
    }
    const entry = browserBackStack.pop();
    entry?.onBack();
  });
}

export function useBrowserBackLayer(active: boolean, onBack: () => void) {
  useBrowserBackStack(active ? 1 : 0, onBack);
}

export function useBrowserBackStack(depth: number, onBack: () => void) {
  const ownerRef = useRef(Symbol("browser-back-layer"));
  const onBackRef = useRef(onBack);
  const pushedCountRef = useRef(0);
  const handlingPopRef = useRef(false);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    ensurePopStateListener();

    if (depth > pushedCountRef.current) {
      while (pushedCountRef.current < depth) {
        const owner = ownerRef.current;
        browserBackStack.push({
          owner,
          onBack: () => {
            pushedCountRef.current = Math.max(0, pushedCountRef.current - 1);
            handlingPopRef.current = true;
            onBackRef.current();
            window.setTimeout(() => { handlingPopRef.current = false; }, 0);
          }
        });
        window.history.pushState({ smartPantryLayer: true }, "", window.location.href);
        pushedCountRef.current += 1;
      }
      return;
    }

    if (depth < pushedCountRef.current && !handlingPopRef.current) {
      const diff = pushedCountRef.current - depth;
      for (let index = 0; index < diff; index += 1) removeLastEntryForOwner(ownerRef.current);
      pushedCountRef.current = depth;
      suppressedPopCount += diff;
      window.history.go(-diff);
    }
  }, [depth]);

  useEffect(() => () => {
    removeAllEntriesForOwner(ownerRef.current);
    pushedCountRef.current = 0;
  }, []);
}

function removeLastEntryForOwner(owner: symbol) {
  for (let index = browserBackStack.length - 1; index >= 0; index -= 1) {
    if (browserBackStack[index].owner === owner) {
      browserBackStack.splice(index, 1);
      return;
    }
  }
}

function removeAllEntriesForOwner(owner: symbol) {
  for (let index = browserBackStack.length - 1; index >= 0; index -= 1) {
    if (browserBackStack[index].owner === owner) browserBackStack.splice(index, 1);
  }
}
