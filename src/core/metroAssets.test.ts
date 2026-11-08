import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("rejects malformed ICNS, JXL and HEIF without hanging and still reads PNG assets", () => {
  // Isolate vulnerable parsers: a regression must fail by timeout, not hang Vitest.
  const script = `
    const path = require('node:path');
    const fs = require('node:fs');
    require('./metro.config.js');
    const size = require(require.resolve('image-size', {
      paths: [path.dirname(require.resolve('metro/package.json'))]
    }));
    const samples = [
      '69636e73000000106963303700000000',
      '0000000c4a584c200d0a870a00000014667479706a786c20000000006a786c20000000006a786c7000000000',
      '00000014667479706d696631000000006d696631000000006d657461'
    ];
    const errors = samples.map(hex => {
      try { size(Buffer.from(hex, 'hex')); return 'accepted'; }
      catch (error) { return error.message; }
    });
    const png = size(fs.readFileSync('assets/favicon.png'));
    console.log(JSON.stringify({ errors, png }));
  `;
  const output = execFileSync(process.execPath, ["-e", script], {
    cwd: fileURLToPath(new URL("../../", import.meta.url).href),
    encoding: "utf8", timeout: 10_000, windowsHide: true
  });
  const result = JSON.parse(output.trim().split(/\r?\n/).at(-1)!);
  expect(result.errors).toEqual(["disabled file type: icns", "disabled file type: jxl", "disabled file type: heif"]);
  expect(result.png).toMatchObject({ type: "png" });
  expect(result.png.width).toBeGreaterThan(0);
  expect(result.png.height).toBeGreaterThan(0);
}, 15_000);
