import { createRequire } from "node:module";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const queryString = require("../../../compat/query-string.cjs");

it("keeps Router's named stringify API with spaces, Polish text, arrays and optional values", () => {
  expect(queryString.stringify({ name: "Mąka pszenna", tag: ["a", "b"], empty: null, absent: undefined }, { sort: false }))
    .toBe("name=M%C4%85ka%20pszenna&tag=a&tag=b&empty");
});

it("retains safe parsing of malformed URI components", () => {
  expect(queryString.parse("name=M%C4%85ka%20pszenna&tag=a&tag=b")).toMatchObject({ name: "Mąka pszenna", tag: ["a", "b"] });
  expect(() => queryString.parse("q=%E0%A4%A")).not.toThrow();
});

it("limits the compatibility resolver to Expo Router's legacy fork", () => {
  const config = require("../../../metro.config.js");
  const resolveRequest = config.resolver.resolveRequest;
  const fallback = () => ({ type: "sourceFile", filePath: "/fallback.js" });
  expect(resolveRequest({ originModulePath: "C:\\project\\node_modules\\expo-router\\build\\fork\\getPathFromState.js", resolveRequest: fallback }, "query-string", "web").filePath)
    .toMatch(/compat[\\/]query-string\.cjs$/);
  expect(resolveRequest({ originModulePath: "/project/compat/query-string.cjs", resolveRequest: fallback }, "query-string", "web").filePath)
    .toBe("/fallback.js");
});
