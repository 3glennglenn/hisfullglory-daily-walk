// "Continue with Google": the parts that decide things, apart from the screen so they can be tested
// without a browser. How it is set up on Google's and Supabase's side: docs/GOOGLE_SIGN_IN.md.
// Nothing here reads a name or a picture from Google, and nothing here holds a key or a secret.

/** Shown while the browser is being sent to Google. */
export const googleOpening = "Opening Google…";
/** Shown when Google sign-in could not start, or came back with an error. */
export const googleFailed = "Google sign-in did not finish. Try again.";
/** Shown when Supabase will not send a sign-in email to this address (its built-in sender only reaches team members). */
export const emailNotOpen = "Signing in by email is not open yet. Use Continue with Google.";
/** Today's message for any other failure to send the sign-in code (kept as it was). */
export const codeSendFailedMessage =
  "We could not send the code. Check the address, wait a minute and try again.";

/**
 * Where Google sign-in brings the reader back to: this app's own origin and the page they are on.
 * Only the path is kept. The query and the hash are dropped, because after a sign-in they can hold
 * tokens or a code, and a redirect must never carry them on. A path that would leave the origin
 * (for example one that starts with two slashes) falls back to the front page of the app.
 */
export function oauthRedirectTo(where: { origin: string; pathname: string }): string {
  let origin: string;
  try {
    origin = new URL(where.origin).origin;
  } catch {
    return "";
  }
  if (origin === "null") return "";
  const path = where.pathname.startsWith("/") ? where.pathname : "/" + where.pathname;
  try {
    const target = new URL(path, origin);
    // Backslashes and doubled slashes are read as another host by some browsers.
    if (target.origin !== origin || /^\/[\\/]/.test(path)) return origin + "/";
    return origin + target.pathname;
  } catch {
    return origin + "/";
  }
}

/** The parameters Supabase puts on the address when a sign-in comes back with an error. */
const errorParams = ["error", "error_code", "error_description"];

function paramsOf(text: string): URLSearchParams {
  return new URLSearchParams(text.replace(/^[?#]/, ""));
}

/**
 * True when the address Supabase sent the reader back to carries a sign-in error, in the hash
 * (the implicit flow this app uses) or in the query. Only the fact is used; the words Supabase or
 * Google put in the description are never shown, because they are written for developers.
 */
export function hasOauthError(where: { search: string; hash: string }): boolean {
  return [where.hash, where.search].some((part) => {
    const p = paramsOf(part);
    return p.has("error") || p.has("error_description");
  });
}

/**
 * The address without the sign-in error parameters, so a reload does not show the message again.
 * Everything else on the address stays. Works on a path with its query and hash.
 */
export function withoutOauthError(relative: string): string {
  const hashAt = relative.indexOf("#");
  const beforeHash = hashAt < 0 ? relative : relative.slice(0, hashAt);
  const hash = hashAt < 0 ? "" : relative.slice(hashAt + 1);
  const queryAt = beforeHash.indexOf("?");
  const path = queryAt < 0 ? beforeHash : beforeHash.slice(0, queryAt);
  const query = queryAt < 0 ? "" : beforeHash.slice(queryAt + 1);
  const clean = (text: string) => {
    const p = paramsOf(text);
    // Text with no error parameter in it (a plain anchor such as "verse-28") is left exactly as it was.
    if (!errorParams.some((name) => p.has(name))) return text;
    errorParams.forEach((name) => p.delete(name));
    return p.toString();
  };
  const q = clean(query);
  const h = clean(hash);
  return path + (q ? "?" + q : "") + (h ? "#" + h : "");
}

/**
 * What to tell a reader when the sign-in email could not be sent. Supabase's built-in sender only
 * delivers to members of its own team and answers every other address with the code
 * `email_address_not_authorized` (Supabase docs, Auth, error codes). That one gets its own words;
 * every other failure keeps today's message.
 */
export function codeFailureMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const { code } = error as { code?: unknown };
    if (code === "email_address_not_authorized") return emailNotOpen;
  }
  return codeSendFailedMessage;
}
