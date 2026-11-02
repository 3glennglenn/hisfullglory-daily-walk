// Checks a store build (npm run build:native) before it goes into the Capacitor apps (D-02, STORE-03):
// the app and the Bible are inside it, and nothing of the service worker or the web manifest is.
// Usage: node scripts/native-build-check.mjs [dir]   (dir defaults to dist)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dir = process.argv[2] ?? "dist";
const problems = [];
const files = [];
function walk(path) {
  for (const item of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, item.name);
    if (item.isDirectory()) walk(full);
    else files.push(relative(dir, full).replace(/\\/g, "/"));
  }
}

if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`FAIL ${dir} does not exist. Run npm run build:native first.`);
  process.exit(1);
}
walk(dir);

for (const required of ["index.html", "bible/web.json"])
  if (!files.includes(required)) problems.push(`${required} is missing; the store app must carry it.`);

for (const file of files) {
  const name = file.split("/").pop();
  if (name === "sw.js" || name === "registerSW.js" || /^workbox-.*\.js$/.test(name) || name === "manifest.webmanifest")
    problems.push(`${file} is a service worker or web manifest file; a store build has neither.`);
}

if (files.includes("index.html")) {
  const html = readFileSync(join(dir, "index.html"), "utf8");
  if (/rel=["']?manifest/i.test(html)) problems.push('index.html links a web manifest (rel="manifest").');
  if (/registerSW|serviceWorker/.test(html)) problems.push("index.html registers a service worker.");
}

for (const file of files.filter((f) => f.startsWith("assets/") && /\.(js|mjs)$/.test(f)))
  if (readFileSync(join(dir, file), "utf8").includes("serviceWorker.register"))
    problems.push(`${file} registers a service worker (serviceWorker.register).`);

if (problems.length) {
  console.error(`FAIL store build in ${dir}:\n- ` + problems.join("\n- "));
  process.exit(1);
}
console.log(`PASS store build in ${dir}: ${files.length} files, index.html and bible/web.json present, no service worker, no web manifest.`);
