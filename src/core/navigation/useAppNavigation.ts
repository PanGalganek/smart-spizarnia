import { router } from "expo-router";
import { deriveNavigationState, navigateTo } from "@/core/navigation/navigationManager";

type RouteHref = Parameters<typeof router.push>[0];

export function useAppNavigation() {
  return {
    navigateToRoute,
    replaceWithRoute,
    goBack: () => router.back()
  };
}

export function navigateToRoute(href: RouteHref) {
  const path = hrefPath(href);
  navigateTo(deriveNavigationState(path, hrefParams(href), path), href);
}

export function replaceWithRoute(href: RouteHref) {
  const path = hrefPath(href);
  navigateTo(deriveNavigationState(path, hrefParams(href), path), href, { replace: true });
}

function hrefPath(href: RouteHref) {
  if (typeof href === "string") return href.split("?")[0] || "/";
  const pathname = typeof href.pathname === "string" ? href.pathname : "/";
  return pathname.replace("[barcode]", String(href.params?.barcode ?? ""));
}

function hrefParams(href: RouteHref) {
  if (typeof href === "string") return {};
  return Object.fromEntries(Object.entries(href.params ?? {}).map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : String(value)]));
}
