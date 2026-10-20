export interface Route {
  page: string;
  book?: string;
  chapter?: number;
  verse?: number;
  id?: string;
  thread?: string;
  tab: string;
}
const pages = new Set([
  "home",
  "my-walk",
  "walk",
  "bible",
  "pray",
  "community",
  // "more" stays parseable only so old links keep working: the shell replaces it with "/you" (UI-SPEC 8.2).
  "more",
  "you",
  "grow",
  "journal",
  "give",
  "shop",
  "profile",
  "settings",
  "giving-policy",
  "context",
  "shelf",
]);
// The only sub-paths of /settings (T-01.1-07); anything else is not found.
const settingsSubpages = new Set(["appearance", "reminders"]);
export function parseRoute(path: string, search = ""): Route {
  const parts = path.split("/").filter(Boolean);
  const page = parts[0] ?? "home";
  if (!pages.has(page)) return { page: "not-found", tab: "read" };
  if (page === "bible" && parts[1]) {
    if (
      !/^[a-z0-9-]+$/.test(parts[1]) ||
      !/^\d+$/.test(parts[2] ?? "") ||
      Number(parts[2]) < 1 ||
      !Number.isSafeInteger(Number(parts[2])) ||
      (parts[3] && (!/^\d+$/.test(parts[3]) || Number(parts[3]) < 1)) ||
      parts.length > 4
    )
      return { page: "not-found", tab: "read" };
    const tab = new URLSearchParams(search).get("tab") ?? "read";
    return {
      page,
      book: parts[1],
      chapter: Number(parts[2]),
      verse: parts[3] ? Number(parts[3]) : undefined,
      tab: ["read", "context", "study", "community"].includes(tab)
        ? tab
        : "read",
    };
  }
  if (page === "community" && parts[1] === "circles") {
    const slug = parts[2], thread = new URLSearchParams(search).get("thread") ?? undefined;
    if (parts.length > 3 || slug && !/^[a-z][a-z0-9-]{2,59}$/.test(slug) || thread && !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(thread))
      return {page:"not-found",tab:"read"};
    return {page:"circles",id:slug,thread,tab:"read"};
  }
  if (page === "settings" && parts[1] !== undefined) {
    if (parts.length > 2 || !settingsSubpages.has(parts[1]))
      return { page: "not-found", tab: "read" };
    return { page, id: parts[1], tab: "read" };
  }
  if (parts.length > (["grow", "community", "context"].includes(page) ? 2 : 1))
    return { page: "not-found", tab: "read" };
  if (page === "context" && parts[1] && !/^[a-z0-9-]+$/.test(parts[1]))
    return { page: "not-found", tab: "read" };
  const thread = new URLSearchParams(search).get("thread") ?? undefined;
  if (page === "community") {
    if (thread && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(thread)) return {page:"not-found",tab:"read"};
    return {page,id:parts[1],thread,tab:"read"};
  }
  return { page, id: parts[1], tab: "read" };
}
/** The path of the screen the reader came from inside the app, or "" when this entry was opened directly. */
export const cameFrom = (): string => {
  const from = (history.state as { from?: unknown } | null)?.from;
  return typeof from === "string" && from.startsWith("/") ? from : "";
};
export const passagePath = (book: string, chapter: number, verse?: number) =>
  `/bible/${book}/${chapter}${verse ? `/${verse}` : ""}`;
export function navigate(path: string) {
  if (window.location.pathname + window.location.search !== path) {
    // The screen the reader came from is kept with the history entry, so a screen reached from two places (Your
    // shelf, from Today or from You) can name the right one on its Back button, also after a reload.
    history.pushState({ from: window.location.pathname }, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo(0, 0);
  }
}
// The route for the address bar. An old "/more" link is replaced by "/you" in place (T-01.1-07: the
// target is the fixed internal path, never taken from the address), so Back does not return to it.
export function currentRoute(): Route {
  const route = parseRoute(location.pathname, location.search);
  if (route.page !== "more") return route;
  history.replaceState({}, "", "/you");
  return parseRoute("/you");
}
export function resolveTheme(
  theme: "light" | "dark" | "system",
  osDark: boolean,
) {
  return theme === "system" ? (osDark ? "dark" : "light") : theme;
}
