// In CI, after a failed step: shows the first error and the end of the newest of the given logs
// as an error annotation, so the reason is readable on the pull request (and through the API)
// without signing in to open the full log. Usage: node scripts/ci-failure-note.mjs a.log b.log ...
import { existsSync, readFileSync, statSync } from "node:fs";

const logs = process.argv.slice(2).filter((file) => existsSync(file));
const newest = logs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
if (newest) {
  const lines = readFileSync(newest, "utf8")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .trimEnd()
    .split("\n")
    .map((line) => (line.length > 300 ? line.slice(0, 300) + " [...]" : line));
  // A failure message can be followed by a long dump (page text, stack), so the first error
  // line is shown as well as the end.
  const first = lines.findIndex((line) => /Error\b|^not ok\b|✖|\bFAIL\b/.test(line));
  const picked =
    first >= 0 && first < lines.length - 40
      ? [...lines.slice(first, first + 15), "[...]", ...lines.slice(-25)]
      : lines.slice(-40);
  const escape = (text) => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  console.log(`::error title=${newest}::${escape(picked.join("\n"))}`);
}
