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
  "more",
  "grow",
  "journal",
  "give",
  "shop",
  "profile",
  "settings",
  "giving-policy",
]);
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
  if (parts.length > (["grow", "community"].includes(page) ? 2 : 1))
    return { page: "not-found", tab: "read" };
  const thread = new URLSearchParams(search).get("thread") ?? undefined;
  if (page === "community") {
    if (thread && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(thread)) return {page:"not-found",tab:"read"};
    return {page,id:parts[1],thread,tab:"read"};
  }
  return { page, id: parts[1], tab: "read" };
}
export const passagePath = (book: string, chapter: number, verse?: number) =>
  `/bible/${book}/${chapter}${verse ? `/${verse}` : ""}`;
export function navigate(path: string) {
  if (window.location.pathname + window.location.search !== path) {
    history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo(0, 0);
  }
}
export function resolveTheme(
  theme: "light" | "dark" | "system",
  osDark: boolean,
) {
  return theme === "system" ? (osDark ? "dark" : "light") : theme;
}
