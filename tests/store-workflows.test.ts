// The shape of the store workflows (D-03, threats T-02-01 and T-02-02). The repository is public: anyone can propose
// a change, so a workflow that holds signing material must only ever run by hand, from the protected store-release
// environment, with that material confined to step env, never traced, and always cleaned up. The pull-request
// checks must prove the store bundle without any of it. Read as text, line by line, so no YAML package is needed.
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const DIR = ".github/workflows";
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const storeFiles = readdirSync(DIR).filter((f) => /^store-.*\.ya?ml$/.test(f));
const indent = (line: string) => line.length - line.trimStart().length;
const meaningful = (line: string) => line.trim() !== "" && !line.trim().startsWith("#");

/** The lines of a top-level block such as `on:`, without blank and comment lines. */
function topBlock(lines: string[], key: string): string[] | null {
  const start = lines.findIndex((l) => l === key + ":" || l.startsWith(key + ": "));
  if (start < 0) return null;
  const inline = lines[start].slice(key.length + 1).trim();
  if (inline) return [inline];
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (meaningful(line) && indent(line) === 0) break;
    if (meaningful(line)) out.push(line.trim());
  }
  return out;
}

/** The steps of a workflow: each starts at a `- ` line at the steps' indentation. */
function steps(lines: string[]): string[][] {
  const start = lines.findIndex((l) => l.trim() === "steps:");
  assert.ok(start >= 0, "the job has steps");
  const stepIndent = indent(lines[start]) + 2;
  const out: string[][] = [];
  for (const line of lines.slice(start + 1)) {
    if (meaningful(line) && indent(line) < stepIndent) break;
    if (indent(line) === stepIndent && line.trim().startsWith("- ")) out.push([line]);
    else if (out.length) out[out.length - 1].push(line);
  }
  return out;
}

test("there is at least one store workflow (iOS TestFlight)", () => {
  assert.ok(storeFiles.includes("store-ios.yml"), "store-ios.yml exists");
});

for (const file of storeFiles) {
  const text = read(`${DIR}/${file}`);
  const lines = text.split("\n");

  test(`${file}: runs only by hand (workflow_dispatch), never for a pull request`, () => {
    const on = topBlock(lines, "on");
    assert.ok(on, "an on: block");
    assert.deepEqual(on, ["workflow_dispatch:"], "on: holds only workflow_dispatch");
    assert.doesNotMatch(text, /pull_request/, "no pull_request or pull_request_target anywhere");
    assert.doesNotMatch(text, /^\s*(push|schedule|workflow_run|repository_dispatch|release|issue_comment):/m, "no other trigger");
  });

  test(`${file}: the store-release environment and read-only contents`, () => {
    assert.equal(text.split("environment: store-release").length - 1, 1, "one job in environment store-release");
    assert.deepEqual(topBlock(lines, "permissions"), ["contents: read"], "permissions: contents: read only");
    assert.doesNotMatch(text, /\benvironment:\s*(?!store-release\b)\S/, "no other environment");
  });

  test(`${file}: commands are never traced`, () => {
    assert.doesNotMatch(text, /\bset\s+-[a-z]*x/, "no set -x");
    assert.doesNotMatch(text, /\bset\s+-o\s+xtrace\b/, "no xtrace");
    assert.doesNotMatch(text, /ACTIONS_STEP_DEBUG|ACTIONS_RUNNER_DEBUG/, "no debug logging switches");
  });

  test(`${file}: every secret is a step env entry NAME: \${{ secrets.NAME }}`, () => {
    lines.forEach((line, i) => {
      if (!line.includes("secrets.")) return;
      const m = line.match(/^(\s+)([A-Z][A-Z0-9_]*): \$\{\{ secrets\.([A-Z][A-Z0-9_]*) \}\}\s*$/);
      assert.ok(m, `line ${i + 1} mentions a secret outside a NAME: \${{ secrets.NAME }} entry: ${line.trim()}`);
      assert.equal(m[2], m[3], `line ${i + 1}: the env name equals the secret name`);
      let j = i - 1;
      while (j >= 0 && indent(lines[j]) === m[1].length && /^\s+[A-Z][A-Z0-9_]*: /.test(lines[j])) j--;
      assert.equal(lines[j]?.trim(), "env:", `line ${i + 1} sits in an env: block`);
      const stepLine = lines.slice(0, j).reverse().find((l) => meaningful(l) && indent(l) < indent(lines[j]));
      assert.ok(stepLine?.trim().startsWith("- "), `line ${i + 1}: that env: block belongs to a step, not to the job or the file`);
    });
  });

  test(`${file}: a cleanup step runs with if: always() and deletes the keychain and the decoded files`, () => {
    const all = steps(lines);
    const cleanup = all.find((s) => s.some((l) => l.trim() === "if: always()"));
    assert.ok(cleanup, "a step with if: always()");
    const body = cleanup.join("\n");
    if (/create-keychain/.test(text)) assert.match(body, /security delete-keychain/);
    for (const decoded of [...text.matchAll(/base64 --decode > "([^"]+)"/g)].map((m) => m[1]))
      assert.ok(body.includes(decoded), "the cleanup deletes " + decoded);
    assert.equal(all.indexOf(cleanup), all.length - 1, "the cleanup is the last step");
  });

  test(`${file}: the failure note never reads a signing step's output`, () => {
    for (const line of lines.filter((l) => l.includes("ci-failure-note.mjs")))
      assert.doesNotMatch(line, /sign|keychain|cert|profile/i, line.trim());
  });
}

test("store-ios.yml: the release run checks the store values, builds the store bundle and exports with ExportOptions.plist", () => {
  const text = read(`${DIR}/store-ios.yml`);
  assert.match(text, /node scripts\/store-env-check\.mjs/);
  assert.match(text, /npm run build:native/);
  assert.match(text, /npx cap sync ios/);
  assert.match(text, /-exportOptionsPlist ios\/ExportOptions\.plist/);
  assert.match(text, /persist-credentials: false/);
  assert.match(text, /if: github\.ref == 'refs\/heads\/main' \|\| github\.ref == 'refs\/heads\/store-shell'/);
  assert.doesNotMatch(text, /PROVISIONING_PROFILE_SPECIFIER|CODE_SIGN_IDENTITY|DEVELOPMENT_TEAM/, "signing settings live in the project, per target (research A4)");
});

test("checks.yml: no secret at all, and it builds and browser-checks the store bundle", () => {
  const text = read(`${DIR}/checks.yml`);
  assert.doesNotMatch(text, /secrets\./, "no secrets. reference");
  assert.match(text, /npm run build:native -- --outDir dist-native/);
  assert.match(text, /npm run check:native -- dist-native/);
  assert.match(text, /npm run preview:native/);
  assert.match(text, /npm run test:native-browser/);
});

test("ExportOptions.plist: manual App Store export and upload for the team and profile of the project", () => {
  const plist = read("ios/ExportOptions.plist");
  const value = (key: string) => plist.match(new RegExp(`<key>${key}</key>\\s*(<string>([^<]*)</string>|<(true|false)/>)`));
  assert.equal(value("method")?.[2], "app-store-connect");
  assert.equal(value("signingStyle")?.[2], "manual");
  assert.equal(value("destination")?.[2], "upload");
  assert.equal(value("teamID")?.[2], "5ZYRJ5FZPU");
  assert.equal(value("signingCertificate")?.[2], "Apple Distribution");
  assert.equal(value("uploadSymbols")?.[3], "true");
  assert.equal(value("manageAppVersionAndBuildNumber")?.[3], "false");
  assert.match(plist, /<key>provisioningProfiles<\/key>\s*<dict>\s*<key>com\.hisfullglory\.app<\/key>\s*<string>HisFullGlory App Store<\/string>\s*<\/dict>/);
});

test("store-env-check: fails with the problems and a PASS line never prints the values", () => {
  const run = (env: Record<string, string>) => {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("VITE_SUPABASE_")));
    return spawnSync(process.execPath, ["scripts/store-env-check.mjs"], { env: { ...clean, ...env }, encoding: "utf8" });
  };
  const missing = run({});
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /VITE_SUPABASE_URL is missing/);
  assert.match(missing.stderr, /VITE_SUPABASE_ANON_KEY is missing/);
  const withPath = run({ VITE_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co/rest/v1/", VITE_SUPABASE_ANON_KEY: "sb_publishable_" + "c".repeat(24) });
  assert.equal(withPath.status, 1);
  assert.match(withPath.stderr, /has a path/);
  const url = "https://abcdefghijklmnop.supabase.co";
  const key = "sb_publishable_" + "d".repeat(24);
  const good = run({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key });
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /^PASS /);
  assert.ok(!(good.stdout + good.stderr).includes(url) && !(good.stdout + good.stderr).includes(key), "neither value is printed");
});
