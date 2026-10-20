import { useState, useRef, useEffect, useCallback } from "react";
import { Heart, ChevronRight, Check, BookOpen } from "lucide-react";
import { plans } from "../data";
import { config, type Product } from "../config";
import { track } from "../analytics";
import type { LocalState, PlanSlug } from "../storage";
type Update = (change: (s: LocalState) => LocalState) => boolean;
export function Journal({
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

export function Plans({
  state,
  update,
}: {
  state: LocalState;
  update: Update;
}) {
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
      <h2 id="plans-title">Your next five days.</h2>
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
        <p className="screen-meta">{plan.title}</p>
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
        <p className="screen-meta">Day {dayIndex + 1}</p>
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
export function ProductCard({
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
