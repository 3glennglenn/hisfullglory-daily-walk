// In CI, after a failed step: shows the end of the newest of the given logs as an error
// annotation, so the reason is readable on the pull request (and through the API) without
// signing in to open the full log. Usage: node scripts/ci-failure-note.mjs a.log b.log ...
import { existsSync, readFileSync, statSync } from "node:fs";

const logs = process.argv.slice(2).filter((file) => existsSync(file));
const newest = logs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
if (newest) {
  const tail = readFileSync(newest, "utf8")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .trimEnd()
    .split("\n")
    .slice(-40)
    .join("\n");
  const escape = (text) => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  console.log(`::error title=End of ${newest}::${escape(tail)}`);
}
