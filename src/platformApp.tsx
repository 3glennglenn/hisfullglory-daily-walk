import { Circles } from "./social/Circles";
import { PrivateProfileBoundary } from "./platform/PrivateProfile";
import { Component, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/gelasio/latin-400.css";
import "@fontsource/gelasio/latin-400-italic.css";
import "@fontsource/literata/latin-400.css";
import "@fontsource/literata/latin-400-italic.css";
import "./styles.css";
import { usePlatform } from "./platform/store";
import { AuthProvider } from "./platform/auth";
import { cameFrom, currentRoute, lastTabRoot, navigate, parseRoute, rememberTabRoot } from "./platform/router";
import { watchTextSize } from "./platform/appearance";
import { AppearanceProvider } from "./platform/AppearanceProvider";
import { supabase } from "./supabase";
import { Walk } from "./features/Walk";
import { Today } from "./features/Today";
import { Welcome } from "./features/Welcome";
import { YourShelf } from "./features/Shelf";
import { Reader } from "./bible/Reader";
import { Pray } from "./features/Pray";
import { Grow } from "./features/Grow";
import { ContextCheck } from "./context/ContextCheck";
import { ContextChecks } from "./context/ContextChecks";
import { JournalLibrary } from "./features/Journal";
import { Settings, Profile } from "./features/Settings";
import { YouPage, YouSheet } from "./features/You";
import { Appearance } from "./features/Appearance";
import { Reminders } from "./features/Reminders";
import { Give, GivingPolicy } from "./giving/Give";
import { TopicHub } from "./social/TopicHub";
import { MyWalk } from "./features/MyWalk";
import { ProductCard } from "./features/LegacyWalk";
import { TabBar } from "./ui/TabBar";
import { activeTab, rootTabOf } from "./ui/tabs";
import { LargeTitle, Toolbar } from "./ui/Screen";
import { config, products } from "./config";
import { contentFor } from "./data";
import { contextChecks } from "./context/data";
import { localDate } from "./storage";
import { track } from "./analytics";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="shell">
        <section className="grouped-screen crash-screen">
          <LargeTitle>A moment to begin again</LargeTitle>
          <p className="screen-lede">Your saved data remains on this device.</p>
          <button className="screen-action" onClick={() => window.location.reload()}>
            Reload the app
          </button>
        </section>
      </main>
    ) : (
      this.props.children
    );
  }
}
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
// /settings/reminders: the existing Reminders card on its own screen, reached from You.
function RemindersScreen() {
  return (
    <section className="grouped-screen">
      <Toolbar back="You" to="/you" />
      <LargeTitle>Daily reminder</LargeTitle>
      {supabase ? <Reminders /> : <p>Reminders are not available yet.</p>}
    </section>
  );
}
// From 768px the sidebar layout is on and You is a page; below it You is a sheet (N-03). Follows a resize without a reload.
function useWide() {
  const query = "(min-width: 768px)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const change = () => setWide(media.matches);
    media.addEventListener("change", change);
    change();
    return () => media.removeEventListener("change", change);
  }, []);
  return wide;
}
// Done, Escape and a swipe close the You sheet: back through history when the reader came from the tab root behind it,
// otherwise (a /you opened directly, or after a resize) the entry is replaced by that root, so Back never returns to a
// closed sheet.
function closeYou() {
  const root = lastTabRoot();
  if (cameFrom() === root) {
    history.back();
    return;
  }
  history.replaceState({}, "", root);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
function App() {
  const { state, notice, update } = usePlatform();
  const [route, setRoute] = useState(currentRoute);
  // The welcome questionnaire takes over once, when the app opens on Today ("/") and has never been answered. A deep link
  // (a chapter, a context check from the website or a share) is never held back: the choice is made at the start, so a
  // reader who came in through a link meets the questionnaire the first time the app opens on Today.
  const [welcomeOpen, setWelcomeOpen] = useState(() => !state.local.onboarded && currentRoute().page === "home");
  const [online, setOnline] = useState(navigator.onLine);
  const [date, setDate] = useState(localDate);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [installStatus, setInstallStatus] = useState("");
  useEffect(() => {
    track("app_opened");
    const refresh = () => {
      setRoute(currentRoute());
      setDate(localDate());
    };
    const connectivity = () => setOnline(navigator.onLine);
    const clock = setInterval(() => setDate(localDate()), 30000);
    const installHandler = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("popstate", refresh);
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    window.addEventListener("beforeinstallprompt", installHandler);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(clock);
      window.removeEventListener("popstate", refresh);
      window.removeEventListener("online", connectivity);
      window.removeEventListener("offline", connectivity);
      window.removeEventListener("beforeinstallprompt", installHandler);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  // Sets data-text="large" on <html> while the system text size is 150 % or more (UI-SPEC 6.3).
  useEffect(() => watchTextSize(document.documentElement), []);
  const page = route.page;
  const wide = useWide();
  // The tab root the reader saw last is what the You sheet stands over on a phone (D-03); kept in memory only.
  rememberTabRoot(route);
  // On a phone /you renders the screen of the last tab root (the same elements and keys, so it stays mounted and keeps
  // the You button as the place focus returns to) with the sheet over it; from 768px /you is a page of its own.
  const shown = page === "you" && !wide ? parseRoute(lastTabRoot()) : route;
  // The story and Today's walk are full-screen flows (UI-SPEC A5, A7, 8.1): the tab bar is covered while one is open
  // and "‹ Today" is the way out. A slug that names no published check is the error state, which keeps the tab bar.
  const welcome = welcomeOpen && page === "home";
  const flow = welcome || page === "walk" || (page === "context" && !!route.id && contextChecks.some((c) => c.slug === route.id));
  let content: ReactNode;
  let youSheet: ReactNode = null;
  switch (shown.page) {
    case "my-walk":
      content = <MyWalk />;
      break;
    case "home":
      content = welcome ? <Welcome onDone={() => setWelcomeOpen(false)} /> : <Today key={date} />;
      break;
    case "walk":
      content = <Walk key={date} />;
      break;
    case "shelf":
      content = <YourShelf />;
      break;
    case "bible":
      content = <Reader route={shown} />;
      break;
    case "pray":
      content = <Pray />;
      break;
    case "context":
      content = shown.id ? <ContextCheck key={shown.id} slug={shown.id} /> : <ContextChecks />;
      break;
    case "grow":
      content = <Grow id={shown.id} />;
      break;
    case "journal":
      content = <JournalLibrary />;
      break;
    case "give":
      content = <Give />;
      break;
    case "giving-policy":
      content = <GivingPolicy />;
      break;
    case "you":
      content = <YouPage />;
      break;
    case "profile":
      content = <Profile />;
      break;
    case "settings":
      content =
        shown.id === "reminders" ? <RemindersScreen /> : shown.id === "appearance" ? <Appearance /> : <Settings />;
      break;
    case "circles":
      content = <Circles key={shown.id ?? "discovery"} slug={shown.id} thread={shown.thread}/>;
      break;
    case "community":
      content = <TopicHub id={shown.id} thread={shown.thread} verse={contentFor(date)} online={online} />;
      break;
    case "shop": {
      // Back names where the reader came from (01.2 D-03): Bible from Bible, Study's row, otherwise Today, the card's home.
      const fromBible = cameFrom().startsWith("/bible");
      content = (
        <section className="grouped-screen">
          <Toolbar back={fromBible ? "Bible" : "Today"} to={fromBible ? "/bible" : "/"} />
          <LargeTitle>Shop</LargeTitle>
          <p className="screen-lede">Study Bibles we recommend. Price, stock and checkout are on the HisFullGlory shop.</p>
          {products.map((p) => (
            <ProductCard key={p.handle} product={p} />
          ))}
          <a className="button secondary shop-all" href={config.storeUrl}>
            Visit the full shop
          </a>
        </section>
      );
      break;
    }
    default:
      content = (
        <section className="grouped-screen">
          <LargeTitle>Page not found</LargeTitle>
          <button className="screen-action" onClick={() => navigate("/")}>
            Back to Today
          </button>
        </section>
      );
  }
  if (page === "you" && !wide) youSheet = <YouSheet onClose={closeYou} />;
  const tab = activeTab(page, wide, rootTabOf(lastTabRoot()));
  return (
    <div className="shell" data-flow={flow ? "true" : undefined}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {(!online || notice) && (
        <aside className="notice" role="status">
          {notice ||
            "You’re offline. Downloaded Scripture and your private walk remain available. Community needs a connection."}
        </aside>
      )}
      <main id="main" tabIndex={-1}>
        {content}
        {youSheet}
        {install && !state.local.installDismissed && (
          <aside className="install-offer">
            <h2>Keep your daily walk close</h2>
            <p>Install for a home-screen shortcut.</p>
            <button
              className="secondary"
              onClick={async () => {
                await install.prompt();
                const choice = await install.userChoice;
                setInstallStatus(
                  choice.outcome === "accepted"
                    ? "Installation accepted."
                    : "Installation dismissed.",
                );
                setInstall(null);
              }}
            >
              Install app
            </button>
            <button
              className="text-button"
              onClick={() =>
                update((s) => ({
                  ...s,
                  local: { ...s.local, installDismissed: true },
                }))
              }
            >
              Later
            </button>
            <small role="status">{installStatus}</small>
          </aside>
        )}
      </main>
      {!flow && <TabBar active={tab} />}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <AuthProvider><PrivateProfileBoundary><AppearanceProvider><App/></AppearanceProvider></PrivateProfileBoundary></AuthProvider>
  </ErrorBoundary>,
);
