// The store build guard (D-02). A store build bakes VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY into a binary that
// takes days to replace, so the values are checked before anything is built:
// - vite.config.ts runs it in native mode with release: false, so pull-request checks build without values but a
//   wrong value given locally still stops the build;
// - scripts/store-env-check.mjs runs it with release: true in the TestFlight workflow, where both values are required.
// The rules match src/supabase.ts (validUrl, publicKey), plus the 2026-10-08 lesson: an address ending in /rest/v1/
// made every call 404, so the address must be the bare project URL.
// Pure on purpose: no DOM, no Node imports, no imports from other src/ files, so Node can run it with the types
// stripped and Vite can import it from vite.config.ts. A problem never repeats a value.

export type BuildEnv = Record<string, string | undefined>;

const URL_NAME = "VITE_SUPABASE_URL";
const KEY_NAME = "VITE_SUPABASE_ANON_KEY";
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

function jwtRole(value: string): string | null {
  const part = value.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const payload: unknown = JSON.parse(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)));
    return payload && typeof payload === "object" && typeof (payload as { role?: unknown }).role === "string"
      ? (payload as { role: string }).role
      : null;
  } catch {
    return null;
  }
}

function urlProblems(value: string, release: boolean): string[] {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return [`${URL_NAME} is not a valid address. Use the bare project address, for example https://<project>.supabase.co.`];
  }
  const problems: string[] = [];
  const local = u.protocol === "http:" && LOCAL_HOSTS.includes(u.hostname);
  if (release && u.protocol !== "https:")
    problems.push(`${URL_NAME} must use https in a release build; a store app cannot reach a local server.`);
  else if (u.protocol !== "https:" && !local)
    problems.push(`${URL_NAME} must use https (plain http is allowed only for localhost and 127.0.0.1).`);
  if (u.username || u.password) problems.push(`${URL_NAME} must not carry a user name or password.`);
  if (u.pathname !== "/" && u.pathname !== "")
    problems.push(`${URL_NAME} has a path; use the bare project address without /rest/v1/ or anything after the host.`);
  if (u.search) problems.push(`${URL_NAME} has a query (?...); use the bare project address.`);
  if (u.hash) problems.push(`${URL_NAME} has a fragment (#...); use the bare project address.`);
  return problems;
}

function keyProblems(value: string): string[] {
  if (value.startsWith("sb_publishable_")) return [];
  if (jwtRole(value) === "anon") return [];
  return [
    `${KEY_NAME} is not a public key. Use the project's publishable key (sb_publishable_...) or its anon key; ` +
      "never a secret or service-role key, because everything in a store build can be read by anyone.",
  ];
}

/** Problems with the Supabase values of a store build, in plain English. Empty means the build may go on.
 *  release: true requires both values (the TestFlight workflow); release: false allows neither (pull-request checks). */
export function nativeEnvProblems(env: BuildEnv, { release }: { release: boolean }): string[] {
  const url = env[URL_NAME]?.trim() ?? "";
  const key = env[KEY_NAME]?.trim() ?? "";
  const problems: string[] = [];
  if (!url && !key && !release) return problems;
  if (!url) problems.push(`${URL_NAME} is missing.${release ? " A release build needs it." : " Set both values or neither."}`);
  if (!key) problems.push(`${KEY_NAME} is missing.${release ? " A release build needs it." : " Set both values or neither."}`);
  if (url) problems.push(...urlProblems(url, release));
  if (key) problems.push(...keyProblems(key));
  return problems;
}
