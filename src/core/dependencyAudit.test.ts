import { beforeAll, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url).href);
const fixture = path.join(root, "work", "audit-report-fixture.cjs");
beforeAll(() => {
  mkdirSync(path.dirname(fixture), { recursive: true });
  writeFileSync(fixture, "process.stdout.write(process.env.AUDIT_REPORT_JSON); process.exitCode = 1;");
});

function check(vulnerabilities: Record<string, unknown>, validReport = true) {
  const report = validReport ? { vulnerabilities, metadata: { vulnerabilities: { total: Object.keys(vulnerabilities).length } } } : { error: { message: "Registry unavailable" } };
  return spawnSync(process.execPath, ["scripts/check-dependencies.cjs"], {
    cwd: root, encoding: "utf8", windowsHide: true,
    env: { ...process.env, npm_execpath: fixture, AUDIT_REPORT_JSON: JSON.stringify(report) }
  });
}

it("accepts a report without high or critical findings", () => {
  expect(check({ tool: { severity: "moderate", via: [] } }).status).toBe(0);
});

it("keeps the documented image parser exception limited to its two known advisories", () => {
  expect(check({ "image-size": { severity: "high", via: [
    { url: "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq" },
    { url: "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr" }
  ] } }).status).toBe(0);
});

it("rejects a new high finding in another package", () => {
  const result = check({ another: { severity: "high", via: [] } });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("another");
});

it("rejects an unknown image parser advisory", () => {
  expect(check({ "image-size": { severity: "high", via: [{ url: "https://example.test/new-advisory" }] } }).status).toBe(1);
});

it("never accepts a critical finding, including image-size", () => {
  expect(check({ "image-size": { severity: "critical", via: [{ url: "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq" }] } }).status).toBe(1);
});

it("fails when the registry does not return an audit report", () => {
  expect(check({}, false).status).toBe(1);
});
