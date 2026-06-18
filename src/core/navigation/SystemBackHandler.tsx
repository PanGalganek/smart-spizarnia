import { useGlobalSearchParams, usePathname } from "expo-router";
import { useEffect, useMemo } from "react";
import { Platform } from "react-native";
import { deriveNavigationState, handleSystemBackState, replaceNavigationState } from "@/core/navigation/navigationManager";

type SearchParams = Record<string, string | string[] | undefined>;

export function SystemBackHandler() {
  const pathname = usePathname();
  const params = useGlobalSearchParams() as SearchParams;
  const routeKey = useMemo(() => `${pathname}?${stableParamString(params)}`, [params, pathname]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    replaceNavigationState(deriveNavigationState(pathname, params));
  }, [pathname, routeKey]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    function onPopState(event: PopStateEvent) {
      const handledInsideApp = handleSystemBackState(event.state);
      if (handledInsideApp) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    }

    window.addEventListener("popstate", onPopState, { capture: true });
    return () => window.removeEventListener("popstate", onPopState, { capture: true });
  }, []);

  return null;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function stableParamString(params: SearchParams) {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${firstParam(params[key]) ?? ""}`)
    .join("&");
}
