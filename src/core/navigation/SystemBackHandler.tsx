import { useGlobalSearchParams, usePathname } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { colors } from "@/core/theme";
import { deriveNavigationState, handleBackNavigation, replaceNavigationState, setExitPromptListener } from "@/core/navigation/navigationManager";

type SearchParams = Record<string, string | string[] | undefined>;

export function SystemBackHandler() {
  const pathname = usePathname();
  const params = useGlobalSearchParams() as SearchParams;
  const [showExitPrompt, setShowExitPrompt] = useState(false);
  const routeKey = useMemo(() => `${pathname}?${stableParamString(params)}`, [params, pathname]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    replaceNavigationState(deriveNavigationState(pathname, params));
  }, [pathname, routeKey]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    function onPopState(event: PopStateEvent) {
      const handledInsideApp = handleBackNavigation(event.state);
      if (handledInsideApp) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    }

    window.addEventListener("popstate", onPopState, { capture: true });
    return () => window.removeEventListener("popstate", onPopState, { capture: true });
  }, []);

  useEffect(() => setExitPromptListener((visible) => {
    setShowExitPrompt(visible);
    if (visible && typeof window !== "undefined") window.setTimeout(() => setShowExitPrompt(false), 2200);
  }), []);

  if (!showExitPrompt) return null;
  return <View pointerEvents="none" style={styles.exitPrompt}><Text style={styles.exitPromptText}>Naciśnij ponownie, aby wyjść</Text></View>;
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

const styles = StyleSheet.create({
  exitPrompt: { position: "absolute", left: 24, right: 24, bottom: 28, zIndex: 9999, alignItems: "center" },
  exitPromptText: { overflow: "hidden", backgroundColor: colors.text, color: "white", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, fontWeight: "800" }
});
