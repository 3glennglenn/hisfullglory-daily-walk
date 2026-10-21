// "Continue with Google": the decisions that do not need a browser (src/platform/googleSignIn.ts).
// Nothing here reaches Google or Supabase.
// Run from the project root: node --experimental-strip-types --test tests/google-signin.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  codeFailureMessage,
  emailNotOpen,
  googleFailed,
  googleOpening,
  hasOauthError,
  oauthRedirectTo,
  withoutOauthError,
} from "../src/platform/googleSignIn.ts";

const origin = "https://app.hisfullglory.com";

test("the way back is on the app's own origin and keeps the page the reader was on", () => {
  assert.equal(oauthRedirectTo({ origin, pathname: "/" }), origin + "/");
  assert.equal(oauthRedirectTo({ origin, pathname: "/you/account" }), origin + "/you/account");
  assert.equal(oauthRedirectTo({ origin, pathname: "/bible/romans/8/28" }), origin + "/bible/romans/8/28");
  assert.equal(oauthRedirectTo({ origin: "http://127.0.0.1:4173", pathname: "/give" }), "http://127.0.0.1:4173/give");
});

test("the way back drops the query and the hash, where tokens and codes arrive", () => {
  // A location object has pathname apart from search and hash; even if a caller passes them in the
  // path, they do not survive.
  const where = { origin, pathname: "/give?code=abc123&access_token=secret#access_token=secret&refresh_token=x" };
  const back = oauthRedirectTo(where);
  assert.equal(back, origin + "/give");
  assert.ok(!/code|token|secret|#|\?/.test(back));
  assert.equal(oauthRedirectTo({ origin, pathname: "/pray#error=access_denied" }), origin + "/pray");
});

test("the way back never leaves the origin, whatever the path says", () => {
  for (const pathname of ["//evil.example/x", "///evil.example", "/\\evil.example", "\\\\evil.example", "https://evil.example/", "@evil.example"]) {
    const back = oauthRedirectTo({ origin, pathname });
    assert.equal(new URL(back).origin, origin, pathname);
  }
  // A path with no leading slash is read as one.
  assert.equal(oauthRedirectTo({ origin, pathname: "give" }), origin + "/give");
  // An origin that is not one gives no way back at all, instead of a wrong one.
  assert.equal(oauthRedirectTo({ origin: "null", pathname: "/give" }), "");
  assert.equal(oauthRedirectTo({ origin: "not a url", pathname: "/give" }), "");
});

test("an error on the returning address is found in the hash and in the query, and nothing else is", () => {
  assert.equal(hasOauthError({ search: "", hash: "#error=access_denied&error_code=bad_oauth_callback&error_description=Something+went+wrong" }), true);
  assert.equal(hasOauthError({ search: "?error=server_error&error_description=Unable+to+exchange", hash: "" }), true);
  assert.equal(hasOauthError({ search: "?error_description=x", hash: "" }), true);
  assert.equal(hasOauthError({ search: "", hash: "" }), false);
  assert.equal(hasOauthError({ search: "?tab=context", hash: "#verse-28" }), false);
  // A good sign-in carries tokens, not an error.
  assert.equal(hasOauthError({ search: "", hash: "#access_token=a&refresh_token=b&token_type=bearer" }), false);
});

test("the error parameters leave the address and everything else stays", () => {
  assert.equal(
    withoutOauthError("/give#error=access_denied&error_code=bad_oauth_callback&error_description=Something+went+wrong"),
    "/give",
  );
  assert.equal(withoutOauthError("/give?error=server_error&error_description=Unable+to+exchange"), "/give");
  assert.equal(withoutOauthError("/bible/romans/8?tab=context&error=x&error_code=y&error_description=z#verse-28"), "/bible/romans/8?tab=context#verse-28");
  assert.equal(withoutOauthError("/bible/romans/8?tab=context#verse-28"), "/bible/romans/8?tab=context#verse-28");
  assert.equal(withoutOauthError("/"), "/");
  assert.equal(withoutOauthError("/you/account?x=1#error=a"), "/you/account?x=1");
});

test("only Supabase's 'email address not authorized' code gets the Google words; any other failure keeps today's message", () => {
  assert.equal(emailNotOpen, "Signing in by email is not open yet. Use Continue with Google.");
  // The shape of supabase-js's AuthApiError: a message, a status and the code from the error-codes page.
  assert.equal(
    codeFailureMessage({ name: "AuthApiError", status: 400, code: "email_address_not_authorized", message: 'Email address "a@b.c" cannot be used as it is not authorized' }),
    emailNotOpen,
  );
  const today = "We could not send the code. Check the address, wait a minute and try again.";
  for (const other of [
    { status: 429, code: "over_email_send_rate_limit", message: "rate" },
    { status: 400, code: "email_address_invalid", message: "invalid" },
    { status: 500, code: "unexpected_failure", message: "boom" },
    { message: "Failed to fetch" },
    new Error("network"),
    "email_address_not_authorized",
    null,
    undefined,
  ])
    assert.equal(codeFailureMessage(other), today);
});

test("the words of the Google sign-in are the ones the founder was shown", () => {
  assert.equal(googleOpening, "Opening Google…");
  assert.equal(googleFailed, "Google sign-in did not finish. Try again.");
});

test("the button draws Google's mark unchanged, says exactly 'Continue with Google', and loads nothing from Google", () => {
  const source = readFileSync("src/platform/GoogleButton.tsx", "utf8");
  assert.match(source, /export const googleLabel = "Continue with Google";/);
  // The four colours of the official mark.
  for (const colour of ["#EA4335", "#4285F4", "#FBBC05", "#34A853"]) assert.ok(source.includes(`fill="${colour}"`), colour);
  assert.ok(!/<img|https?:\/\//.test(source.replace(/\/\/.*$/gm, "")), "inline SVG only: no image and no address");
});
