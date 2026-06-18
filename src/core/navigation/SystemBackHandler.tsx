import { router, useGlobalSearchParams, usePathname } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";

const HOME_PATH = "/home";
const LOGIN_PATH = "/login";

type SearchParams = Record<string, string | string[] | undefined>;

export function SystemBackHandler() {
  const pathname = usePathname();
  const params = useGlobalSearchParams() as SearchParams;
  const routeKey = useMemo(() => `${pathname}?${stableParamString(params)}`, [params, pathname]);
  const pathnameRef = useRef(pathname);
  const paramsRef = useRef(params);
  const handlingBackRef = useRef(false);

  useEffect(() => {
    pathnameRef.current = pathname;
    paramsRef.current = params;
  }, [params, pathname, routeKey]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    if (!shouldGuardPath(pathname)) return;

    const guardUrl = `${window.location.pathname}${window.location.search}`;
    const state = window.history.state ?? {};
    if (state.smartPantryBackGuard === true && state.smartPantryBackUrl === guardUrl) return;

    window.history.pushState({ ...state, smartPantryBackGuard: true, smartPantryBackUrl: guardUrl }, "", guardUrl);
  }, [pathname, routeKey]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    function onPopState() {
      const currentPath = pathnameRef.current;
      if (!shouldGuardPath(currentPath) || handlingBackRef.current) return;

      handlingBackRef.current = true;
      performLogicalBack(currentPath, paramsRef.current);
      window.setTimeout(() => {
        handlingBackRef.current = false;
      }, 250);
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return null;
}

function shouldGuardPath(pathname: string) {
  return pathname !== HOME_PATH && pathname !== LOGIN_PATH && pathname !== "/";
}

function performLogicalBack(pathname: string, params: SearchParams) {
  if (pathname.startsWith("/pantry/")) {
    router.back();
    return;
  }

  if (pathname === "/pantry") {
    const type = firstParam(params.type);
    const location = firstParam(params.location);
    if (location) {
      router.replace({ pathname: "/pantry", params: type ? { type } : undefined });
      return;
    }
  }

  router.replace(HOME_PATH);
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
