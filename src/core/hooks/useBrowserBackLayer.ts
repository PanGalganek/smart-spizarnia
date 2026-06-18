import { useEffect, useMemo, useRef } from "react";
import { createNavigationLayerId, NavigationLayerKind, registerNavigationLayer, unregisterNavigationLayer, unregisterNavigationLayers } from "@/core/navigation/navigationManager";

type BackLayerOptions = {
  kind?: NavigationLayerKind;
  name?: string;
};

export function useBrowserBackLayer(active: boolean, onBack: () => void, options: BackLayerOptions = {}) {
  const id = useRef(createNavigationLayerId(options.name ?? "layer"));
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!active) {
      unregisterNavigationLayer(id.current);
      return;
    }
    registerNavigationLayer(id.current, {
      kind: options.kind ?? "modal",
      name: options.name ?? id.current,
      onBack: () => onBackRef.current()
    });
    return () => unregisterNavigationLayer(id.current);
  }, [active, options.kind, options.name]);
}

export function useBrowserBackStack(depth: number, onBack: () => void, options: BackLayerOptions = {}) {
  const ids = useMemo(() => Array.from({ length: 8 }, (_, index) => createNavigationLayerId(`${options.name ?? "stack"}-${index + 1}`)), [options.name]);
  const onBackRef = useRef(onBack);
  const depthRef = useRef(0);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    const normalizedDepth = Math.max(0, Math.min(depth, ids.length));
    const previousDepth = depthRef.current;

    if (normalizedDepth > previousDepth) {
      for (let index = previousDepth; index < normalizedDepth; index += 1) {
        registerNavigationLayer(ids[index], {
          kind: options.kind ?? "modal",
          name: `${options.name ?? "stack"}-${index + 1}`,
          onBack: () => onBackRef.current()
        });
      }
    }

    if (normalizedDepth < previousDepth) {
      unregisterNavigationLayers(ids.slice(normalizedDepth, previousDepth).reverse());
    }

    depthRef.current = normalizedDepth;
  }, [depth, ids, options.kind, options.name]);

  useEffect(() => () => unregisterNavigationLayers(ids.slice(0, depthRef.current).reverse()), [ids]);
}
