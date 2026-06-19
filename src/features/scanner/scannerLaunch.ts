import type { AppView } from "@/core/navigation/navigationManager";

export function shouldAutoStartScanner(autoScan: string | string[] | undefined, view: AppView, alreadyHandled: boolean) {
  const requested = Array.isArray(autoScan) ? autoScan[0] : autoScan;
  return requested === "1" && view === "scanner" && !alreadyHandled;
}
