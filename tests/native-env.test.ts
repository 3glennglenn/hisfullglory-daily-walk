// The store build guard (D-02, threat T-02-03). Values baked into a store build cannot be fixed without a new
// store release, so a Supabase address with a path (the 2026-10-08 "/rest/v1/" outage) or a key that is not a
// public key stops the build. Keys are built at run time so the security scan never sees token-shaped text here.
import test from "node:test";
import assert from "node:assert/strict";
import { nativeEnvProblems } from "../src/native/buildGuard.ts";

const b64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (role: string) => [b64url({ alg: "HS256", typ: "JWT" }), b64url({ iss: "supabase", role }), "signature"].join(".");
const URL_OK = "https://abcdefghijklmnop.supabase.co";
const KEY_OK = "sb_publishable_" + "a".repeat(24);
const ok = (env: Record<string, string>, release = true) => assert.deepEqual(nativeEnvProblems(env, { release }), []);
const bad = (env: Record<string, string>, pattern: RegExp, release = true) => {
  const problems = nativeEnvProblems(env, { release });
  assert.ok(problems.length > 0, "expected a problem for " + JSON.stringify(env));
  assert.ok(problems.some((p) => pattern.test(p)), problems.join(" | "));
};

test("a pull-request build without Supabase values has no problems", () => {
  assert.deepEqual(nativeEnvProblems({}, { release: false }), []);
  assert.deepEqual(nativeEnvProblems({ VITE_SUPABASE_URL: "  ", VITE_SUPABASE_ANON_KEY: "" }, { release: false }), []);
});

test("a release build names both missing values", () => {
  const problems = nativeEnvProblems({}, { release: true });
  assert.ok(problems.some((p) => p.includes("VITE_SUPABASE_URL")), problems.join(" | "));
  assert.ok(problems.some((p) => p.includes("VITE_SUPABASE_ANON_KEY")), problems.join(" | "));
});

test("the bare https project address and a publishable or anon key pass", () => {
  ok({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: KEY_OK });
  ok({ VITE_SUPABASE_URL: URL_OK + "/", VITE_SUPABASE_ANON_KEY: jwt("anon") });
  ok({ VITE_SUPABASE_URL: "http://127.0.0.1:54321", VITE_SUPABASE_ANON_KEY: KEY_OK }, false);
});

test("an address with a path, a query, a fragment, credentials or plain http on another host is refused", () => {
  bad({ VITE_SUPABASE_URL: URL_OK + "/rest/v1/", VITE_SUPABASE_ANON_KEY: KEY_OK }, /path/);
  bad({ VITE_SUPABASE_URL: URL_OK + "/rest/v1/", VITE_SUPABASE_ANON_KEY: KEY_OK }, /path/, false);
  bad({ VITE_SUPABASE_URL: URL_OK + "?x=1", VITE_SUPABASE_ANON_KEY: KEY_OK }, /query/);
  bad({ VITE_SUPABASE_URL: URL_OK + "#top", VITE_SUPABASE_ANON_KEY: KEY_OK }, /fragment/);
  bad({ VITE_SUPABASE_URL: "https://user:pw@abcdefghijklmnop.supabase.co", VITE_SUPABASE_ANON_KEY: KEY_OK }, /user name or password/);
  bad({ VITE_SUPABASE_URL: "http://abcdefghijklmnop.supabase.co", VITE_SUPABASE_ANON_KEY: KEY_OK }, /https/);
  bad({ VITE_SUPABASE_URL: "http://127.0.0.1:54321", VITE_SUPABASE_ANON_KEY: KEY_OK }, /release build/);
  bad({ VITE_SUPABASE_URL: "not a url", VITE_SUPABASE_ANON_KEY: KEY_OK }, /not a valid address/);
});

test("a key that is not public is refused, and the message never repeats the key", () => {
  const secret = "sb_secret_" + "b".repeat(30);
  for (const key of [jwt("service_role"), secret, "plain-text", jwt("authenticated")]) {
    const problems = nativeEnvProblems({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: key }, { release: false });
    assert.ok(problems.some((p) => /public key/.test(p)), key.slice(0, 12) + ": " + problems.join(" | "));
    assert.ok(problems.every((p) => !p.includes(key)), "a problem must not print the key");
  }
});

test("half a configuration is refused, because sign-in would ship broken", () => {
  bad({ VITE_SUPABASE_URL: URL_OK }, /VITE_SUPABASE_ANON_KEY/, false);
  bad({ VITE_SUPABASE_ANON_KEY: KEY_OK }, /VITE_SUPABASE_URL/, false);
});
