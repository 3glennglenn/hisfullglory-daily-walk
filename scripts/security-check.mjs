import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const roots = ["src", "supabase", "scripts", "docs", "tests"];
let files = 0;
const failures = [];
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{15,}/,
  /\b(?:sb_secret_|ghp_|github_pat_)[A-Za-z0-9_]{20,}/,
  /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
];
function inspect(path) {
  const text = readFileSync(path, "utf8");
  files++;
  for (const pattern of patterns)
    if (pattern.test(text)) failures.push(path + ": possible credential");
}
function scan(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) scan(path);
    else if (/\.(tsx?|mjs|sql|md|html)$/.test(path)) {
      inspect(path);
    }
  }
}
for (const root of roots) scan(root);
// The store builds (D-03, threat T-02-04): the workflows, the Capacitor configuration and the text files of the
// native projects are scanned too.
function scanNative(dir) {
  if (!existsSync(dir)) return;
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) {
      if (!["public", "node_modules", "build", "Pods", "DerivedData", "xcuserdata", ".gradle"].includes(item.name)) scanNative(path);
    } else if (/\.(ya?ml|plist|xcprivacy|entitlements|pbxproj|swift|json|xml|gradle|kts|properties)$/.test(path)) inspect(path);
  }
}
for (const dir of [".github/workflows", "ios", "android"]) scanNative(dir);
if (existsSync("capacitor.config.ts")) inspect("capacitor.config.ts");
// Signing files never belong in the repository, whatever .gitignore says: a certificate bundle, an API key,
// a provisioning profile or a keystore found among the tracked files (or, where git is absent as in a build
// copy, anywhere outside node_modules) fails the check.
const signingFile = /\.(p12|p8|mobileprovision|cer|csr|key|jks|keystore)$/i;
let tracked = null;
try {
  tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\0").filter(Boolean);
} catch {
  tracked = null;
}
if (tracked === null) {
  tracked = [];
  const walk = (dir) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) {
        if (!["node_modules", ".git", "dist", "dist-native", ".astro"].includes(item.name)) walk(path);
      } else tracked.push(path.replace(/\\/g, "/"));
    }
  };
  walk(".");
}
for (const path of tracked) if (signingFile.test(path)) failures.push(path + ": signing file (key, certificate, profile or keystore) in the repository");
for (const path of [
  "index.html",
  "README.md",
  "AGENTS.md",
  "CHANGELOG.md",
  "IMPLEMENTATION_STATUS.md",
  ".env.example",
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "vercel.json",
])
  inspect(path);
const client = readFileSync("src/supabase.ts", "utf8");
if (!client.includes("role") || !client.includes("anon"))
  failures.push("Supabase public-key validation missing");
const config = readFileSync("vite.config.ts", "utf8");
if (!config.includes("runtimeCaching: []"))
  failures.push("Review dynamic response caching");
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
if (lock.packages[""].dependencies.react === undefined)
  failures.push("Lockfile root missing dependencies");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `PASS credential scan of ${files} implementation, SQL, documentation, test, workflow and native project files; no signing files; public-key guard; static-only cache; dependency lockfile.`,
);
