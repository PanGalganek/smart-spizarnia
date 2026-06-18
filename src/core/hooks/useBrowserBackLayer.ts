import { useEffect } from "react";

export function useBrowserBackLayer(_active: boolean, _onBack: () => void) {
  // Browser/system back is intentionally left to Expo Router.
  // Previous versions pushed custom window.history entries for modals and
  // substeps, which corrupted PWA back navigation after several screen changes.
  useEffect(() => undefined, [_active, _onBack]);
}

export function useBrowserBackStack(_depth: number, _onBack: () => void) {
  // Kept as a no-op compatibility hook for screens that still expose internal
  // modal steps. Those steps should be closed by visible in-app controls.
  useEffect(() => undefined, [_depth, _onBack]);
}
