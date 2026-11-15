// Which tab a route belongs to (01.2 UI-SPEC N-01, D-03), kept apart from the component so the unit tests can import it.
// Three tabs (Today, Bible, Community) and You, which is a sidebar item from 768px and the round button on a phone.
export type TabId = "today" | "bible" | "community" | "you";

// The screens reached from You (My walk, My prayers, the journal, Give, Settings, the shop, Grow, the account) belong to
// "you": on a phone they keep the tab the reader was on (activeTab), from 768px they mark You in the sidebar.
const tabByPage: Record<string, TabId> = {
  home: "today",
  walk: "today",
  bible: "bible",
  context: "bible",
  shelf: "bible",
  community: "community",
  circles: "community",
  you: "you",
  profile: "you",
  settings: "you",
  "my-walk": "you",
  journal: "you",
  grow: "you",
  give: "you",
  "giving-policy": "you",
  shop: "you",
  pray: "you",
};
export const tabFor = (page: string): TabId | null => tabByPage[page] ?? null;

/** The tab to mark: on a phone a screen of You keeps the tab of the root the reader came from (rootTab, null when none was
 * seen, as after opening /pray by its address: then no tab is marked), wide it marks You. */
export function activeTab(page: string, wide: boolean, rootTab: TabId | null): TabId | null {
  const tab = tabFor(page);
  return tab === "you" && !wide ? rootTab : tab;
}

/** The tab of a tab-root path ("/", "/bible", "/community"); Today for anything else. */
export function rootTabOf(path: string): TabId {
  return path === "/bible" ? "bible" : path === "/community" ? "community" : "today";
}
