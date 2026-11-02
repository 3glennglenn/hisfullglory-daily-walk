// The native packages the founder approved on 2026-11-02 after the package check of plan 02-01 (publisher, source
// repository, publish date, integrity, install scripts). Each is pinned exactly in package.json and resolves in
// package-lock.json to the approved version and integrity hash (D-02, threat T-02-SC). Changing a version means a
// new package check with the founder first.
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const approved = [
  { name: "@capacitor/core", version: "8.5.3", dev: false, integrity: "sha512-oBE1oGuYE4ZzYYrulC75OuHdSsD6zLUy7d5o1tFwDLG4govGoubY15cxpiI5l0+q87Lm5p0bhbehMdzJg4aFag==" },
  { name: "@capacitor/ios", version: "8.5.3", dev: false, integrity: "sha512-HnnV92Jl8+3x0JUloXUMjFcUsQI8wHFVsKwkLn72DfRZXYGZW11tQbmNOWOnRTljaU18FdI1b9ipT09SzzPDNw==" },
  { name: "@capacitor/android", version: "8.5.3", dev: false, integrity: "sha512-ilH4gSSz3DrketMkzDVAvY9JsWJ//rCQnECLTdcFRO7xXDogwAbUvQAnIAbiqefwV/D1xfjEL4Gw1MJXEcaA9g==" },
  { name: "@capacitor/app", version: "8.1.2", dev: false, integrity: "sha512-uKBlsrXH0IdvUn69e/KKYbZ32A06pcrUdG8LWuZ/6y33YMXZXLEEdNSwl+jKS/SrsTWqnePs8EqSWaiQM3mUGA==" },
  { name: "@capacitor/browser", version: "8.0.5", dev: false, integrity: "sha512-qqcEjUqs9kG1naF+tsD8rERuZ3wuIfXzvoIJEERHI4RNWwNSUqAHHduaKhkyb+t01VyVPa0ydx0mZ/eOskk2Ug==" },
  { name: "@capacitor/share", version: "8.0.3", dev: false, integrity: "sha512-gnvZBV1NPu2B8vd1UKncR56G15ueHd0aZLqgDov++t3SmTBG9Q0VrAZ1VnHn5stxlmglVaTb4RwopMgbpLzroA==" },
  { name: "@capacitor/filesystem", version: "8.1.5", dev: false, integrity: "sha512-m1RkI8L83NJeppEKyRWioK3MDp2vjlA+QfUQcF8/xRlcXNC2HYxqoyYJ+K4M0EcVovy+g+4F24S05+bhK4Vgdg==" },
  { name: "@capacitor/local-notifications", version: "8.3.1", dev: false, integrity: "sha512-F7zu/+p/mIR958YP4axOkeI5hBKRaXDyYjbNPrAil2wWfd7OxScPSTvP9t85NpQ0eULVRu0/sntoxOg6ck477A==" },
  { name: "@capacitor/splash-screen", version: "8.0.2", dev: false, integrity: "sha512-0C6rYScr13WfAE9nPl4ScOQynmjFv9NT3Th+RZkD4ezYHmER6mcl1/lDYsv7jg3Rj3FOvLrlTlmNkUrr83kZzQ==" },
  { name: "@capawesome/capacitor-apple-sign-in", version: "0.1.4", dev: false, integrity: "sha512-B6aEtGCJ4WDe71LFdBkSeHQQ1aluJCNFHE7oMAZlB1f37oD0i6mYEoWMCKtAY4RGmR//el/SY8Sed9JIZ1+eXA==" },
  { name: "@capacitor/cli", version: "8.5.3", dev: true, integrity: "sha512-/G6xwna+p4GS3lthSdWN3OThCH2F85O0Ukdy8rv3oAXvgEMeyFgPEIA3PMAS++IkHwUuBYBAKOQJnZfcrh1n0w==" },
  { name: "@capacitor/assets", version: "3.0.5", dev: true, integrity: "sha512-ohz/OUq61Y1Fc6aVSt0uDrUdeOA7oTH4pkWDbv/8I3UrPjH7oPkzYhShuDRUjekNp9RBi198VSFdt0CetpEOzw==" },
];

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));

for (const p of approved)
  test(`${p.name} is pinned at the approved ${p.version} with the approved integrity`, () => {
    const section = p.dev ? "devDependencies" : "dependencies";
    assert.equal(pkg[section]?.[p.name], p.version, `package.json ${section} must pin ${p.name} exactly (no ^ or ~)`);
    assert.equal(lock.packages[""][section]?.[p.name], p.version, "the lockfile root must pin it the same way");
    const entry = lock.packages["node_modules/" + p.name];
    assert.ok(entry, "package-lock.json must resolve " + p.name);
    assert.equal(entry.version, p.version);
    assert.equal(entry.integrity, p.integrity);
    assert.ok(!entry.hasInstallScript, p.name + " was approved without an install script");
  });

test("no other @capacitor or @capawesome package is a direct dependency", () => {
  const names = approved.map((p) => p.name);
  for (const section of ["dependencies", "devDependencies"])
    for (const name of Object.keys(pkg[section] ?? {}))
      if (/^@(capacitor|capawesome)\//.test(name)) assert.ok(names.includes(name), name + " was not in the package check");
});
