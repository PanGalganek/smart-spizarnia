import { useEffect, useMemo, useRef } from "react";
import { registerBackLayer, unregisterBackLayer } from "@/core/navigation/backRegistry";

export function useBrowserBackLayer(active: boolean, onBack: () => void) {
  const id = useRef(Symbol("browser-back-layer"));

  useEffect(() => {
    if (!active) {
      unregisterBackLayer(id.current);
      return;
    }
    registerBackLayer(id.current, onBack);
    return () => unregisterBackLayer(id.current);
  }, [active, onBack]);
}

export function useBrowserBackStack(depth: number, onBack: () => void) {
  const ids = useMemo(() => Array.from({ length: 5 }, () => Symbol("browser-back-stack-layer")), []);

  useEffect(() => {
    ids.forEach((id, index) => {
      if (index < depth) registerBackLayer(id, onBack);
      else unregisterBackLayer(id);
    });
    return () => ids.forEach(unregisterBackLayer);
  }, [depth, ids, onBack]);
}
