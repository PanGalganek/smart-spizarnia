const path = require("node:path");

// Metro 0.82 requires image-size's v1 CommonJS API. Disable the parsers
// affected by GHSA-5p2g-fcmc-qvqq and GHSA-w3rx-r6r6-pgpr until an SDK
// upgrade can move Metro to image-size v2. Use Metro's own module instance.
const imageSize = require(require.resolve("image-size", {
  paths: [path.dirname(require.resolve("metro/package.json"))]
}));
imageSize.disableTypes(["icns", "jxl", "heif"]);

const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "query-string" && context.originModulePath.replace(/\\/g, "/").includes("/expo-router/build/fork/")) {
    return { type: "sourceFile", filePath: path.join(__dirname, "compat/query-string.cjs") };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
