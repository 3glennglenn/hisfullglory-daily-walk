import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  Check,
  ChevronRight,
  Flame,
  Heart,
  Home,
  Leaf,
  MessageCircle,
  ShoppingBag,
  X,
} from "lucide-react";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "./styles.css";
import { contentFor, plans } from "./data";
import { config, products, type Product } from "./config";
import {
  completeDate,
  localDate,
  readState,
  streak,
  writeState,
  type LocalState,
  type PlanSlug,
} from "./storage";
import { track } from "./analytics";
import { Community } from "./community";

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
          <p>
            Something did not load correctly. Your saved daily walk remains on
            this device.
          </p>
          <button onClick={() => window.location.reload()}>
            Reload Daily Walk
          </button>
        </div>
      </main>
    ) : (
      this.props.children
    );
  }
}
type Tab = "Today" | "Plans" | "Community" | "Shop";
type Update = (change: (state: LocalState) => LocalState) => boolean;
function App() {
  const [state, setState] = useState(readState);
  const stateRef = useRef(state);
  const [storageError, setStorageError] = useState(false);
  const [tab, setTab] = useState<Tab>("Today");
  const [date, setDate] = useState(localDate);
  const [online, setOnline] = useState(navigator.onLine);
  const [welcomeStep, setWelcomeStep] = useState(0);
  const [goal, setGoal] = useState<PlanSlug>("closer-to-god");
  const heading = useRef<HTMLElement>(null);
  const update: Update = useCallback((change) => {
    const next = change(stateRef.current);
    stateRef.current = next;
    setState(next);
    const saved = writeState(next);
    setStorageError(!saved);
    return saved;
  }, []);
  useEffect(() => {
    track("app_opened", { tab: "Today", date: localDate() });
    const sync = () => {
      setOnline(navigator.onLine);
      setDate(localDate());
    };
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    const timer = setInterval(sync, 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  const selectTab = (next: Tab) => {
    setTab(next);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => heading.current?.focus());
  };
  const verse = contentFor(date);
  const completed = state.completedDates.includes(date);
  const onboard = (skip: boolean) => {
    update((s) => ({
      ...s,
      onboarded: true,
      goal: skip ? null : goal,
      activePlan: skip ? s.activePlan : goal,
    }));
    track("onboarding_completed");
    if (!skip) track("plan_started", { plan: goal });
  };
  return (
    <div className="shell">
      <header className="brand">
        <a
          href={config.storeUrl}
          aria-label="HisFullGlory store"
          className="brand-name"
        >
          HisFullGlory<span>DAILY WALK</span>
        </a>
        <Leaf size={25} aria-hidden="true" />
      </header>
      <main ref={heading} tabIndex={-1} id="main-content">
        {!online && (
          <aside className="notice" role="status">
            <strong>You’re offline</strong>
            <p>
              Scripture, plans, and your private journal are here. Community and
              shop links need a connection.
            </p>
          </aside>
        )}
        {storageError && (
          <aside className="notice error" role="alert">
            This device could not save your changes. Free some browser storage
            or allow local storage before leaving this page.
          </aside>
        )}
        {!state.onboarded && (
          <section className="card onboarding" aria-labelledby="welcome-title">
            <p className="eyebrow">A small beginning</p>
            <h2 id="welcome-title">Build a daily rhythm with God.</h2>
            {welcomeStep === 0 ? (
              <>
                <p>
                  A little Scripture. A moment of reflection. One faithful step.
                  Begin wherever you are, with no account needed.
                </p>
                <button onClick={() => setWelcomeStep(1)}>
                  Begin your daily walk <ChevronRight size={18} />
                </button>
              </>
            ) : (
              <>
                <fieldset>
                  <legend>What would you like to grow in?</legend>
                  {[
                    ["closer-to-god", "Grow closer to God"],
                    ["consistent-in-the-word", "Be consistent in the Word"],
                    ["peace-in-god", "Find peace in God"],
                  ].map(([value, label]) => (
                    <label className="goal-option" key={value}>
                      <input
                        type="radio"
                        name="goal"
                        value={value}
                        checked={goal === value}
                        onChange={() => setGoal(value as PlanSlug)}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <button onClick={() => onboard(false)}>
                  Start my five-day plan
                </button>
              </>
            )}
            <button className="text-button" onClick={() => onboard(true)}>
              Skip for now
            </button>
          </section>
        )}
        {tab === "Today" && (
          <section aria-labelledby="today-title">
            <div className="section-head">
              <div>
                <p className="eyebrow">
                  {new Date(date + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
                <h1 id="today-title">A moment with God.</h1>
              </div>
              <span className="streak">
                <Flame size={17} />
                {streak(state.completedDates, date)}
                <span className="sr-only"> day streak</span>
              </span>
            </div>
            <p className="intro">
              Welcome, friend. Take a breath and begin where you are.
            </p>
            <article className="card verse-card">
              <div className="row">
                <p className="eyebrow">The Word for today</p>
                <BookOpen size={20} aria-hidden="true" />
              </div>
              <blockquote>{verse.quote}</blockquote>
              <p className="verse-reference">
                {verse.reference} <span>WEB</span>
              </p>
              <div className="reflection">
                <h2>A little reflection</h2>
                <p>{verse.reflection}</p>
              </div>
            </article>
            <Journal
              key={date}
              date={date}
              initial={state.journals[date] ?? ""}
              question={verse.question}
              update={update}
            />
            <button
              className="complete-button"
              disabled={completed}
              onClick={() => {
                update((s) => completeDate(s, date));
                track("daily_completed", { date });
              }}
            >
              <Check size={19} />
              {completed ? "Today’s walk is complete" : "Complete today"}
            </button>
            <p className="helper center">
              {completed
                ? "One faithful step. Come back tomorrow."
                : "Your rhythm is built one day at a time."}
            </p>
            {state.activePlan && (
              <button
                className="card continue-card"
                onClick={() => selectTab("Plans")}
              >
                <div>
                  <p className="eyebrow">Your five-day journey</p>
                  <h2>
                    {plans.find((p) => p.slug === state.activePlan)?.title}
                  </h2>
                  <small>
                    {state.progress[state.activePlan].length} of 5 days complete
                  </small>
                </div>
                <ChevronRight size={23} />
              </button>
            )}
            <div className="deeper">
              <p className="eyebrow">Go deeper</p>
              <p>A companion for your time in the Word.</p>
              <ProductCard
                product={
                  products[
                    state.goal === "consistent-in-the-word"
                      ? 1
                      : state.goal === "peace-in-god"
                        ? 2
                        : 0
                  ]
                }
                compact
              />
            </div>
          </section>
        )}
        {tab === "Plans" && <Plans state={state} update={update} />}
        {tab === "Community" && (
          <ErrorBoundary>
            <Community verse={verse} online={online} />
          </ErrorBoundary>
        )}
        {tab === "Shop" && (
          <section aria-labelledby="shop-title">
            <p className="eyebrow">Resources for your walk</p>
            <h1 id="shop-title">Rooted in the Word.</h1>
            <p className="intro">
              Thoughtful companions for your daily reading. Browse and purchase
              securely at HisFullGlory.
            </p>
            <div className="product-grid">
              {products.map((product) => (
                <ProductCard key={product.handle} product={product} />
              ))}
            </div>
            <p className="helper">
              Prices and availability are confirmed in the store. NLT, ESV, and
              Amplified editions are shop products; all Scripture quoted in
              Daily Walk is public-domain WEB.
            </p>
          </section>
        )}
        {!state.installDismissed &&
          !window.matchMedia("(display-mode: standalone)").matches && (
            <aside className="install-hint">
              <div>
                <strong>Keep your daily walk close</strong>
                <p>
                  Add Daily Walk to your home screen from your browser’s menu.
                  On iPhone, use Share → Add to Home Screen.
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Dismiss install help"
                onClick={() =>
                  update((s) => ({ ...s, installDismissed: true }))
                }
              >
                <X size={18} />
              </button>
            </aside>
          )}
        <footer className="app-footer">
          One faithful step, every day.
          <br />
          <small>HisFullGlory Daily Walk · WEB Scripture</small>
        </footer>
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {(
          [
            { name: "Today", icon: Home },
            { name: "Plans", icon: BookOpen },
            { name: "Community", icon: MessageCircle },
            { name: "Shop", icon: ShoppingBag },
          ] as const
        ).map(({ name, icon: Icon }) => (
          <button
            key={name}
            aria-current={tab === name ? "page" : undefined}
            onClick={() => selectTab(name)}
          >
            <Icon size={21} />
            <span>{name}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Journal({
  date,
  initial,
  question,
  update,
}: {
  date: string;
  initial: string;
  question: string;
  update: Update;
}) {
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState(
    initial ? "Saved on this device" : "Only on this device",
  );
  const draft = useRef(initial);
  const saved = useRef(initial);
  const save = useCallback(() => {
    if (draft.current === saved.current) return;
    const ok = update((s) => ({
      ...s,
      journals: { ...s.journals, [date]: draft.current },
    }));
    setStatus(
      ok ? "Saved on this device" : "Not saved — check browser storage",
    );
    if (ok) {
      saved.current = draft.current;
      track("journal_saved", { date });
    }
  }, [date, update]);
  useEffect(() => {
    const timer = setTimeout(save, 650);
    return () => clearTimeout(timer);
  }, [text, save]);
  useEffect(() => {
    const leave = () => save();
    window.addEventListener("pagehide", leave);
    const hide = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      save();
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [save]);
  return (
    <section className="card journal-card" aria-labelledby="journal-title">
      <div className="row">
        <h2 id="journal-title">Your quiet reflection</h2>
        <Heart size={18} aria-hidden="true" />
      </div>
      <label htmlFor="journal">{question}</label>
      <textarea
        id="journal"
        rows={5}
        maxLength={10000}
        placeholder="A thought, a prayer, a little gratitude…"
        value={text}
        onChange={(e) => {
          draft.current = e.target.value;
          setText(e.target.value);
          setStatus("Saving…");
        }}
        onBlur={save}
      />
      <div className="row">
        <small>Private journal · never uploaded</small>
        <small role="status">{status}</small>
      </div>
    </section>
  );
}

function Plans({ state, update }: { state: LocalState; update: Update }) {
  const [selected, setSelected] = useState<PlanSlug>(
    state.activePlan ?? "closer-to-god",
  );
  const [dayIndex, setDayIndex] = useState(() => {
    const done = state.progress[state.activePlan ?? "closer-to-god"];
    return [0, 1, 2, 3, 4].find((i) => !done.includes(i)) ?? 4;
  });
  const plan = plans.find((p) => p.slug === selected)!;
  const done = state.progress[selected];
  const active = state.activePlan === selected;
  const current = plan.days[dayIndex];
  const pick = (slug: PlanSlug) => {
    setSelected(slug);
    setDayIndex(
      [0, 1, 2, 3, 4].find((i) => !state.progress[slug].includes(i)) ?? 4,
    );
  };
  return (
    <section aria-labelledby="plans-title">
      <p className="eyebrow">Small steps. Lasting roots.</p>
      <h1 id="plans-title">Your next five days.</h1>
      <p className="intro">
        Choose one gentle journey. Every completed day stays here for you to
        revisit.
      </p>
      <div className="plan-list">
        {plans.map((p) => (
          <button
            key={p.slug}
            className={`card plan-choice ${selected === p.slug ? "selected" : ""}`}
            aria-pressed={selected === p.slug}
            onClick={() => pick(p.slug)}
          >
            <div>
              <h2>{p.title}</h2>
              <p>{p.description}</p>
              <small>
                {state.activePlan === p.slug ? "Active plan · " : ""}
                {state.progress[p.slug].length}/5 days complete
              </small>
            </div>
            <ChevronRight size={20} />
          </button>
        ))}
      </div>
      <article className="card plan-detail">
        <p className="eyebrow">{plan.title}</p>
        <div className="row">
          <h2>
            {done.length === 5
              ? "Journey completed"
              : `${done.length} of 5 days complete`}
          </h2>
          <small>{active ? "Active" : "Preview"}</small>
        </div>
        <progress
          max={5}
          value={done.length}
          aria-label={`${plan.title} progress`}
        />
        {!active && (
          <>
            <p className="helper">
              Starting this journey makes it your active plan. Progress in other
              plans stays saved.
            </p>
            <button
              onClick={() => {
                update((s) => ({ ...s, activePlan: selected }));
                track("plan_started", { plan: selected });
              }}
            >
              Start {plan.title}
            </button>
          </>
        )}
        <div className="day-tabs" aria-label="Plan days">
          {plan.days.map((_, i) => (
            <button
              key={i}
              aria-label={`Day ${i + 1}${done.includes(i) ? ", complete" : ""}`}
              aria-pressed={dayIndex === i}
              onClick={() => setDayIndex(i)}
            >
              {done.includes(i) ? <Check size={16} /> : i + 1}
            </button>
          ))}
        </div>
        <p className="eyebrow">Day {dayIndex + 1}</p>
        <h2>{current.title}</h2>
        <blockquote>{current.scripture.quote}</blockquote>
        <p className="verse-reference">
          {current.scripture.reference} <span>WEB</span>
        </p>
        <p>{current.devotional}</p>
        <h3>Reflect</h3>
        <p>{current.question}</p>
        <h3>A simple prayer</h3>
        <p>{current.prayer}</p>
        <div className="action-note">
          <h3>One faithful step</h3>
          <p>{current.action}</p>
        </div>
        <button
          disabled={!active || done.includes(dayIndex)}
          onClick={() => {
            update((s) => ({
              ...s,
              progress: {
                ...s.progress,
                [selected]: [
                  ...new Set([...s.progress[selected], dayIndex]),
                ].sort(),
              },
            }));
            track("plan_day_completed", { plan: selected });
          }}
        >
          <Check size={18} />
          {done.includes(dayIndex)
            ? "Day complete · revisit anytime"
            : active
              ? "Complete this day"
              : "Start this plan to save progress"}
        </button>
        {done.length === 5 && (
          <p className="helper">
            Well done. Return to these words whenever you need them, or begin
            another journey above.
          </p>
        )}
      </article>
    </section>
  );
}
function ProductCard({
  product,
  compact = false,
}: {
  product: Product;
  compact?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article className={`card product-card ${compact ? "compact" : ""}`}>
      <div className="product-image">
        {!imageFailed ? (
          <img
            src={product.image}
            alt={product.title}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="book-placeholder">
            <BookOpen size={32} />
            <span>HisFullGlory</span>
          </div>
        )}
      </div>
      <div className="product-copy">
        <h2>{product.title}</h2>
        <p>{product.benefit}</p>
        <small>{product.price}</small>
        <a
          className="button secondary"
          href={`${config.storeUrl}/products/${product.handle}`}
          onClick={() => track("product_clicked", { product: product.handle })}
        >
          View on HisFullGlory <ChevronRight size={16} />
        </a>
      </div>
    </article>
  );
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
