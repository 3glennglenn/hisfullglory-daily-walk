// What the store app (vite mode "native") leaves out in version 1.0. The founder chose on 2026-11-16 to ship the first
// App Store version without accounts, so that it could be submitted that week: no sign-in, no community, no giving and
// no web-push reminder. Sign-in inside a store app needs the native Google and Apple flows of plans 02-08 to 02-11, and
// Apple asks for reporting and blocking wherever other people's posts are shown, which needs an account. Those return in
// version 1.1. The web app at app.hisfullglory.com keeps everything.
// Pure on purpose (no DOM, no other src/ imports), so Node can run the unit tests with the types stripped; there
// import.meta.env does not exist and this counts as the web build.

const mode = (import.meta as { env?: { MODE?: string } }).env?.MODE;

/** True in the store build (vite build --mode native). */
export const storeBuild = mode === "native";

/** Sign-in, the community, Circles, posting and giving are part of this build. */
export const accountsInApp = !storeBuild;

/** The daily reminder uses web push through a service worker, which the store build does not have. */
export const webRemindersInApp = !storeBuild;

// Pages a store build of version 1.0 does not have. A link to one, from a share or an old bookmark, shows "Page not found".
const accountPages = new Set(["community", "circles", "profile", "give", "giving-policy"]);

/** Whether this build has the page of a route (page and id as parsed by the router). */
export function pageInBuild(page: string, id: string | undefined, store: boolean = storeBuild): boolean {
  if (!store) return true;
  if (accountPages.has(page)) return false;
  if (page === "settings" && id === "reminders") return false;
  return true;
}
