// Run by the hand-run store workflows before anything is built (D-02, D-03, threat T-02-03): a store binary keeps
// the Supabase values it was built with until the next store release, so both must be present and right.
// Prints one PASS line, or the problems, and never prints either value.
// Usage: VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/store-env-check.mjs
import { nativeEnvProblems } from "../src/native/buildGuard.ts";

const problems = nativeEnvProblems(process.env, { release: true });
if (problems.length) {
  console.error("FAIL store build values:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("PASS store build values: VITE_SUPABASE_URL is a bare https project address and VITE_SUPABASE_ANON_KEY is a public key.");
