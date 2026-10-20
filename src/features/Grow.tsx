import { Journeys } from "./Journeys";
import { findTopic } from "../topics/graph";
import { useEffect, useState } from "react";
import { usePlatform } from "../platform/store";
import { devotionals, topics } from "./growData";
import { Plans } from "./LegacyWalk";
import { navigate } from "../platform/router";
import { localDate } from "../storage";
import { Feed } from "../social/Feed";
import { GroupedList, Row } from "../ui/List";
import { LargeTitle, Toolbar } from "../ui/Screen";
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
      <section className="grouped-screen">
        <Toolbar back="You" to="/you" />
        <LargeTitle>Journey not found</LargeTitle>
        <button className="screen-action" onClick={() => navigate("/grow")}>
          Browse available journeys
        </button>
      </section>
    );
  if (selected) {
    const current = selected.days[day];
    return (
      <section className="grouped-screen">
        <Toolbar back="All journeys" to="/grow" />
        <LargeTitle>{selected.title}</LargeTitle>
        <p className="screen-meta">
          Original editorial devotional · {selected.topic}
        </p>
        <p>
          {done.length === 5
            ? "Journey completed · revisit anytime"
            : `${done.length} of 5 days completed`}
        </p>
        <progress value={done.length} max={5} aria-label="Journey progress" />
        <div className="tabs day-picker">
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
        <div className="actions">
          <button
            className="secondary"
            onClick={() => setShowCommunity(!showCommunity)}
          >
            Discuss this devotional
          </button>
          {findTopic(selected.id) && <button className="secondary" onClick={() => navigate("/community/"+selected.id)}>Explore the related topic community</button>}
        </div>
        {showCommunity && <Feed source={`/grow/${selected.id}`} />}
      </section>
    );
  }
  const startJourney = (journeyId: string) => {
    const next =
      [0, 1, 2, 3, 4].find(
        (i) => !state.devotionalProgress[journeyId]?.includes(i),
      ) ?? 0;
    setDay(next);
    navigate(`/grow/${journeyId}`);
  };
  const shown = devotionals.filter(
    (d) =>
      filter === "all" ||
      filter === d.topic ||
      (filter === "saved" && state.savedDevotionals.includes(d.id)) ||
      (filter === "continue" &&
        (state.devotionalProgress[d.id]?.length ?? 0) > 0 &&
        (state.devotionalProgress[d.id]?.length ?? 0) < 5),
  );
  // "Jesus at the center of ordinary life" decorated the title and is gone; each journey keeps its topic and
  // length as a 13px detail line (plan 11).
  return (
    <section className="grouped-screen">
      <Toolbar back="You" to="/you" />
      <LargeTitle>Room to grow.</LargeTitle>
      <Journeys />
      <GroupedList plain>
        <div className="group-pad">
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
        </div>
      </GroupedList>
      {shown.length > 0 && (
        <GroupedList>
          {shown.map((d) => (
            <Row
              key={d.id}
              title={d.title}
              detail={
                <>
                  <span className="row-line">{d.topic} · 5 days</span>
                  <span className="row-line">{d.description}</span>
                  <span className="row-line">
                    {state.devotionalProgress[d.id]?.length ?? 0}/5 complete
                    {state.savedDevotionals.includes(d.id) ? " · Saved" : ""}
                  </span>
                </>
              }
              chevron
              onClick={() => startJourney(d.id)}
            />
          ))}
        </GroupedList>
      )}
      <details className="group-disclosure">
        <summary>Your original Daily Walk plans</summary>
        <Plans
          state={state.local}
          update={(fn) => update((s) => ({ ...s, local: fn(s.local) }))}
        />
      </details>
    </section>
  );
}
