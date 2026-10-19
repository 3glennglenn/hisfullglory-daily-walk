import { Circles } from "./social/Circles";
import { PrivateProfileBoundary } from "./platform/PrivateProfile";
import { Component, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  Heart,
  Home as HomeIcon,
  MessageCircle,
  Menu,
} from "lucide-react";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "./styles.css";
import { usePlatform } from "./platform/store";
import { AuthProvider } from "./platform/auth";
import { parseRoute, navigate, resolveTheme } from "./platform/router";
import { detectCapabilities } from "./platform/capabilities";
import { supabase } from "./supabase";
import { Home, Walk } from "./features/Home";
import { Reader } from "./bible/Reader";
import { Pray } from "./features/Pray";
import { Grow } from "./features/Grow";
import { ContextCheck } from "./context/ContextCheck";
import { JournalLibrary } from "./features/Journal";
import { Settings, Profile } from "./features/Settings";
import { Give, GivingPolicy } from "./giving/Give";
import { Community } from "./community";
import { TopicHub } from "./social/TopicHub";
import { MyWalk } from "./features/MyWalk";
import { ProductCard } from "./features/LegacyWalk";
import { products } from "./config";
import { contentFor } from "./data";
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
        <div className="card">
          <h1>A moment to begin again</h1>
          <p>Your saved data remains on this device.</p>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
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
const menu = [
  ["context", "Context checks", "Verses you know, back in their story"],
  ["my-walk", "My Walk", "Your private focus, prayer and progress"],
  ["grow", "Grow", "Journeys for the season you’re in"],
  ["journal", "Journal", "A private place for reflection"],
  ["give", "Give", "External causes and reviewed support"],
  ["shop", "Shop", "Bibles from HisFullGlory"],
  ["profile", "Profile", "Your community account"],
  ["settings", "Settings", "Your rhythm, theme and privacy"],
];
function App() {
  const { state, notice, update } = usePlatform();
  const [route, setRoute] = useState(() =>
    parseRoute(location.pathname, location.search),
  );
  const [online, setOnline] = useState(navigator.onLine);
  const [date, setDate] = useState(localDate);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [installStatus, setInstallStatus] = useState("");
  const capabilities = detectCapabilities(!!supabase);
  useEffect(() => {
    track("app_opened");
    const refresh = () => {
      setRoute(parseRoute(location.pathname, location.search));
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
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      // Until the Appearance screen replaces this setting, the old theme choice drives the mode.
      // data-look stays as the first paint set it; the colours come from the stylesheet.
      const effective = resolveTheme(state.theme, media.matches);
      const root = document.documentElement;
      root.dataset.mode = effective === "dark" ? "lamplight" : "light";
      try { localStorage.setItem("hfg-appearance", state.theme); } catch { /* Appearance remains usable. */ }
      const color = getComputedStyle(root).getPropertyValue("--theme-color").trim();
      if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [state.theme]);
  const page = route.page;
  let content: ReactNode;
  switch (page) {
    case "my-walk":
      content = <MyWalk />;
      break;
    case "home":
      content = <Home key={date} />;
      break;
    case "walk":
      content = <Walk key={date} />;
      break;
    case "bible":
      content = <Reader route={route} />;
      break;
    case "pray":
      content = <Pray />;
      break;
    case "context":
      content = <ContextCheck key={route.id ?? "today"} slug={route.id} />;
      break;
    case "grow":
      content = <Grow id={route.id} />;
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
    case "profile":
      content = <Profile />;
      break;
    case "settings":
      content = <Settings />;
      break;
    case "circles":
      content = <Circles key={route.id ?? "discovery"} slug={route.id} thread={route.thread}/>;
      break;
    case "community":
      content = (
        <>
          <TopicHub id={route.id} thread={route.thread} />
          <details className="card">
            <summary>Live chat and the original prayer wall</summary>
            <Community verse={contentFor(date)} online={online} />
          </details>
        </>
      );
      break;
    case "shop":
      content = (
        <section>
          <p className="eyebrow">Find a Bible for your journey</p>
          <h1>Rooted in the Word.</h1>
          <p>Current price, stock and checkout are shown by the store.</p>
          {products.map((p) => (
            <ProductCard key={p.handle} product={p} />
          ))}
        </section>
      );
      break;
    case "more":
      content = (
        <section>
          <h1>Make room for more.</h1>
          {menu.map(([path, title, copy]) => (
            <button
              className="card entry"
              key={path}
              onClick={() => navigate("/" + path)}
            >
              <strong>{title}</strong>
              <span>{copy}</span>
            </button>
          ))}
          <small>
            Available now: full WEB, local private writing, external giving
            {capabilities.community
              ? ", connected community"
              : ". Community backend is not configured"}
            .
          </small>
        </section>
      );
      break;
    default:
      content = (
        <div className="card">
          <h1>Page not found</h1>
          <button onClick={() => navigate("/")}>Go home</button>
        </div>
      );
  }
  const active = page === "circles" ? "community" : ["home", "walk"].includes(page)
    ? "home"
    : ["bible", "pray", "community"].includes(page)
      ? page
      : "more";
  const nav = [
    { path: "home", label: "Home", Icon: HomeIcon },
    { path: "bible", label: "Bible", Icon: BookOpen },
    { path: "pray", label: "Pray", Icon: Heart },
    { path: "community", label: "Community", Icon: MessageCircle },
    { path: "more", label: "More", Icon: Menu },
  ];
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="brand">
        <a
          href="/"
          className="brand-name"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          HisFullGlory<span>JESUS AT THE CENTER</span>
        </a>
        <button
          className="icon-button"
          aria-label="Open settings"
          onClick={() => navigate("/settings")}
        >
          <Heart size={22} />
        </button>
      </header>
      {(!online || notice) && (
        <aside className="notice" role="status">
          {notice ||
            "You’re offline. Downloaded Scripture and your private walk remain available. Community needs a connection."}
        </aside>
      )}
      <main id="main" tabIndex={-1}>
        {content}
        {install && !state.local.installDismissed && (
          <aside className="card">
            <h2>Keep your daily walk close</h2>
            <p>Install for a home-screen shortcut.</p>
            <button
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
              className="secondary"
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
      <nav className="bottom-nav platform-nav" aria-label="Main navigation">
        {nav.map(({ path, label, Icon }) => (
          <button
            key={path}
            aria-current={active === path ? "page" : undefined}
            className={active === path ? "active" : ""}
            onClick={() => navigate(path === "home" ? "/" : "/" + path)}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <AuthProvider><PrivateProfileBoundary><App/></PrivateProfileBoundary></AuthProvider>
  </ErrorBoundary>,
);
