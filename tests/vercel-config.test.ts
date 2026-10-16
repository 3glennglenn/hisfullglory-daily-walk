// Guards the Vercel branch rules of both projects (GATE-05, decision D-02).
// Branches that need no preview build create no deployment; `main` always deploys.
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

type Rules = Record<string, boolean>;
const app = JSON.parse(readFileSync("vercel.json", "utf8"));
const site = JSON.parse(readFileSync("site/vercel.json", "utf8"));

const EXPECTED_PATTERNS = ["ci", "ci-*", "docs-*", "planning-*", "scratch-*", "wip-*"];

// Vercel matches branch names with minimatch: a star is any run of characters except "/".
const glob = (pattern: string) =>
  new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");

test("both projects carry a git.deploymentEnabled object", () => {
  for (const [name, config] of [["vercel.json", app], ["site/vercel.json", site]] as const) {
    const rules = config.git?.deploymentEnabled;
    assert.ok(rules && typeof rules === "object" && !Array.isArray(rules), `${name} has an object`);
  }
});

test("both projects skip exactly the same branches", () => {
  assert.deepEqual(app.git.deploymentEnabled, site.git.deploymentEnabled);
});

test("the rule set is exactly the six patterns of D-02, each switched off", () => {
  const rules: Rules = app.git.deploymentEnabled;
  assert.deepEqual(Object.keys(rules).sort(), EXPECTED_PATTERNS);
  for (const [pattern, on] of Object.entries(rules)) assert.equal(on, false, `${pattern} is false`);
});

test("no rule is a bare star and no rule can match main", () => {
  const rules: Rules = app.git.deploymentEnabled;
  for (const [pattern, on] of Object.entries(rules)) {
    assert.notEqual(pattern, "*", "a bare * would switch off every branch");
    assert.notEqual(pattern, "main", "main must not be named");
    assert.ok(on || !glob(pattern).test("main"), `${pattern} must not match main`);
  }
});

test("the patterns match the branch names they are meant for", () => {
  const rules: Rules = app.git.deploymentEnabled;
  const off = (branch: string) => Object.keys(rules).some((pattern) => glob(pattern).test(branch));
  for (const branch of ["docs-sign-in-email", "planning-notes", "scratch-vercel-probe", "wip-draft", "ci", "ci-checks"]) {
    assert.ok(off(branch), `${branch} gets no deployment`);
  }
  // Ordinary feature branches keep their preview builds, and main keeps its production build.
  for (const branch of ["main", "release-foundation", "report-hold", "account-deletion", "cicd", "scratch"]) {
    assert.ok(!off(branch), `${branch} still deploys`);
  }
});

test("the redirects, headers and rewrites that were already there are untouched", () => {
  assert.ok(Array.isArray(site.redirects) && site.redirects.length > 0, "site redirects remain");
  assert.ok(Array.isArray(site.headers) && site.headers.length > 0, "site headers remain");
  assert.equal(site.trailingSlash, false);
  assert.ok(Array.isArray(app.rewrites) && app.rewrites.length > 0, "app rewrites remain");
});
