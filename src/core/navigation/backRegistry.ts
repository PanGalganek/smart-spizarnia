type BackLayer = {
  id: symbol;
  priority: number;
  onBack: () => void;
};

const layers: BackLayer[] = [];

let priorityCounter = 0;
let ensureGuard: ((force?: boolean) => void) | null = null;

export function setBackGuardEnsurer(callback: ((force?: boolean) => void) | null) {
  ensureGuard = callback;
}

export function registerBackLayer(id: symbol, onBack: () => void) {
  const existing = layers.find((layer) => layer.id === id);
  if (existing) {
    existing.onBack = onBack;
    ensureGuard?.();
    return;
  }
  layers.push({ id, onBack, priority: priorityCounter += 1 });
  ensureGuard?.();
}

export function unregisterBackLayer(id: symbol) {
  const index = layers.findIndex((layer) => layer.id === id);
  if (index >= 0) layers.splice(index, 1);
  if (layers.length === 0) ensureGuard?.(true);
}

export function runTopBackLayer() {
  const layer = [...layers].sort((left, right) => right.priority - left.priority)[0];
  if (!layer) return false;
  layer.onBack();
  return true;
}
