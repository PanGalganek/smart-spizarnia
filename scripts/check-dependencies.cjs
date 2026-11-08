const { spawnSync } = require("node:child_process");

const npmPath = process.env.npm_execpath;
if (!npmPath) throw new Error("Run this check with npm run audit:security.");
const result = spawnSync(process.execPath, [npmPath, "audit", "--json"], {
  encoding: "utf8", windowsHide: true, maxBuffer: 20 * 1024 * 1024
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Dependency audit stopped: ${result.signal}`);
const report = JSON.parse(result.stdout);
if (report.error || !report.metadata?.vulnerabilities || !report.vulnerabilities) {
  throw new Error("Dependency audit did not return a valid report.");
}
const allowedImageAdvisories = new Set([
  "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq",
  "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr"
]);
const rejected = Object.entries(report.vulnerabilities).filter(([name, item]) => {
  if (item.severity === "critical") return true;
  if (item.severity !== "high") return false;
  // A version-based finding remains visible. Metro rejects these formats;
  // metroAssets.test.ts verifies the guard against malformed inputs.
  return !(name === "image-size" && item.via.length > 0 && item.via.every((entry) =>
    typeof entry === "object" && allowedImageAdvisories.has(entry.url)));
});
console.log(JSON.stringify(report.metadata.vulnerabilities));
if (rejected.length) {
  console.error(`Unaccepted high/critical findings: ${rejected.map(([name]) => name).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("No unaccepted high/critical findings. Existing image-size findings remain documented in docs/dependency-security.md.");
}
