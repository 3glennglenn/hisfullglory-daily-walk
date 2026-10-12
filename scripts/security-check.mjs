import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const roots = ["src", "supabase", "scripts", "docs", "tests"];
let files = 0;
const failures = [];
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
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
  `PASS credential scan of ${files} implementation, SQL, documentation and test files; public-key guard; static-only cache; dependency lockfile.`,
);
