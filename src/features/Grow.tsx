import { useEffect, useState } from "react";
import { usePlatform } from "../platform/store";
import { devotionals, topics } from "./growData";
import { Plans } from "./LegacyWalk";
import { navigate } from "../platform/router";
import { localDate } from "../storage";
import { Feed } from "../social/Feed";
export function Grow({ id }: { id?: string }) {
  const { state, update } = usePlatform();
  const [filter, setFilter] = useState("all");
  const nextDay = () =>
    [0, 1, 2, 3, 4].find(
      (i) => !state.devotionalProgress[id ?? ""]?.includes(i),
    ) ?? 0;
  const [day, setDay] = useState(nextDay);
  useEffect(() => {
    setDay(nextDay());
    setShowCommunity(false);
  }, [id]);
  const [showCommunity, setShowCommunity] = useState(false);
  const selected = devotionals.find((d) => d.id === id);
  const done = selected ? (state.devotionalProgress[selected.id] ?? []) : [];
  if (id && !selected)
    return (
      <section className="card">
        <h1>Journey not found</h1>
        <button onClick={() => navigate("/grow")}>
          Browse available journeys
        </button>
      </section>
    );
  if (selected) {
    const current = selected.days[day];
    return (
      <section>
        <button className="text-button" onClick={() => navigate("/grow")}>
          ← All journeys
        </button>
        <p className="eyebrow">
          Original editorial devotional · {selected.topic}
        </p>
        <h1>{selected.title}</h1>
        <p>
          {done.length === 5
            ? "Journey completed · revisit anytime"
            : `${done.length} of 5 days completed`}
        </p>
        <progress value={done.length} max={5} aria-label="Journey progress" />
        <div className="tabs">
          {selected.days.map((_, i) => (
            <button key={i} aria-pressed={day === i} onClick={() => setDay(i)}>
              {done.includes(i) ? "✓ " : ""}Day {i + 1}
            </button>
          ))}
        </div>
        <article className="card">
          <h2>{current.title}</h2>
          <blockquote>{current.scripture.quote}</blockquote>
          <small>{current.scripture.reference} · WEB</small>
          <p>{current.teaching}</p>
          <h3>Reflect</h3>
          <p>{current.question}</p>
          <button
            className="secondary"
            onClick={() => {
              if (
                update((s) => ({
                  ...s,
                  entries: [
                    {
                      id: crypto.randomUUID(),
                      type: "devotional",
                      title: `${selected.topic} · Day ${day + 1}`,
                      body: "",
                      date: localDate(),
                      source: `/grow/${selected.id}`,
                    },
                    ...s.entries,
                  ],
                }))
              )
                navigate("/journal");
            }}
          >
            Write privately in your journal
          </button>
          <h3>Pray</h3>
          <p>{current.prayer}</p>
          <button
            disabled={done.includes(day)}
            onClick={() =>
              update((s) => ({
                ...s,
                devotionalProgress: {
                  ...s.devotionalProgress,
                  [selected.id]: [...new Set([...done, day])],
                },
              }))
            }
          >
            {done.includes(day) ? "Day complete" : "Complete this day"}
          </button>
          <button
            className="secondary"
            onClick={() =>
              update((s) => ({
                ...s,
                savedDevotionals: s.savedDevotionals.includes(selected.id)
                  ? s.savedDevotionals.filter((x) => x !== selected.id)
                  : [...s.savedDevotionals, selected.id],
              }))
            }
          >
            {state.savedDevotionals.includes(selected.id)
              ? "Unsave journey"
              : "Save journey"}
          </button>
        </article>
        <button
          className="secondary"
          onClick={() => setShowCommunity(!showCommunity)}
        >
          Discuss this devotional
        </button>
        {showCommunity && <Feed source={`/grow/${selected.id}`} />}
      </section>
    );
  }
  return (
    <section>
      <p className="eyebrow">Jesus at the center of ordinary life</p>
      <h1>Room to grow.</h1>
      <label>
        Explore a topic
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All topics</option>
          <option value="saved">Saved</option>
          <option value="continue">Continue a journey</option>
          {topics.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      {devotionals
        .filter(
          (d) =>
            filter === "all" ||
            filter === d.topic ||
            (filter === "saved" && state.savedDevotionals.includes(d.id)) ||
            (filter === "continue" &&
              (state.devotionalProgress[d.id]?.length ?? 0) > 0 &&
              (state.devotionalProgress[d.id]?.length ?? 0) < 5),
        )
        .map((d) => (
          <button
            key={d.id}
            className="card entry"
            onClick={() => {
              const next =
                [0, 1, 2, 3, 4].find(
                  (i) => !state.devotionalProgress[d.id]?.includes(i),
                ) ?? 0;
              setDay(next);
              navigate(`/grow/${d.id}`);
            }}
          >
            <span className="eyebrow">{d.topic} · 5 days</span>
            <strong>{d.title}</strong>
            <span>{d.description}</span>
            <small>
              {state.devotionalProgress[d.id]?.length ?? 0}/5 complete
              {state.savedDevotionals.includes(d.id) ? " · Saved" : ""}
            </small>
          </button>
        ))}
      <details className="card">
        <summary>Your original Daily Walk plans</summary>
        <Plans
          state={state.local}
          update={(fn) => update((s) => ({ ...s, local: fn(s.local) }))}
        />
      </details>
    </section>
  );
}
