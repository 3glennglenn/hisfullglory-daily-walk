import { usePlatform } from "../platform/store";
import { findTopic } from "../topics/graph";
import { Resources } from "../topics/Resources";
import { navigate } from "../platform/router";
import { GroupedList, Row } from "../ui/List";
import { LargeTitle, Toolbar } from "../ui/Screen";

// My Walk (UI-SPEC D-10, plan 11): a pushed screen of You. Same words as before; the cards became grouped
// sections and the list-like ones became rows. "Private · this local profile" carries information (what kind
// of page this is), so it stays as a 13px muted line instead of an uppercase eyebrow.
export function MyWalk() {
  const { state } = usePlatform();
  const answered = state.prayers.filter((p) => p.status === "Answered");
  const recentDays = state.local.completedDates.slice(-7);
  return (
    <section className="grouped-screen">
      <Toolbar back="You" to="/you" />
      <LargeTitle>My Walk</LargeTitle>
      <p className="screen-meta">Private · this local profile</p>
      <p className="screen-lede">
        A place to return, not a measure of spiritual maturity. Nothing on this page is a public profile.
      </p>
      <GroupedList title="Current focus" plain>
        <div className="group-pad">
          <p>{state.privateTopics.map((id) => findTopic(id)?.label).join(" · ") || "No private topics selected."}</p>
          <button className="secondary" onClick={() => navigate("/settings")}>
            Change private preferences
          </button>
        </div>
      </GroupedList>
      <GroupedList title="Your rhythm" plain>
        <div className="group-pad">
          <p>
            {state.local.completedDates.length} Daily Walks · {state.reading.length} chapters read ·{" "}
            {state.bookmarks.length} saved passages
          </p>
          <button onClick={() => navigate("/walk")}>Continue today's walk</button>
        </div>
      </GroupedList>
      <GroupedList title="Prayer and reflection">
        {["Active", "Waiting", "Answered", "Archived"].map((status) => (
          <Row key={status} title={status} value={state.prayers.filter((p) => p.status === status).length} />
        ))}
        <Row title="Private journal entries" value={state.entries.length} />
        <Row title="Open private prayers" href="/pray" chevron />
        <Row title="Open private journal" href="/journal" chevron />
      </GroupedList>
      <GroupedList title="Your journeys" plain={!Object.keys(state.devotionalProgress).length}>
        {Object.keys(state.devotionalProgress).length ? (
          Object.entries(state.devotionalProgress).map(([id, days]) => (
            <Row key={id} title={id.replaceAll("-", " ")} value={`${days.length}/5`} href={"/grow/" + id} chevron />
          ))
        ) : (
          <div className="group-pad">
            <p>No journey progress yet.</p>
          </div>
        )}
      </GroupedList>
      {(answered.length > 0 || recentDays.length > 0) && (
        <GroupedList title="Your story">
          {answered.map((p) => (
            <Row
              key={p.id}
              title={p.title}
              detail={
                (p.answeredAt ? new Date(p.answeredAt).toLocaleDateString() + " · " : "") +
                "answered privately" +
                (p.testimonyIds?.length ? " · testimony explicitly published" : "")
              }
            />
          ))}
          {recentDays.map((date) => (
            <Row key={date} title={date} detail="Daily Walk completed" />
          ))}
        </GroupedList>
      )}
      <GroupedList title="Paths and challenges" plain>
        <div className="group-pad">
          <p>
            {state.joinedChallenges.length} joined challenge(s) ·{" "}
            {Object.values(state.pathProgress).reduce((n, steps) => n + steps.length, 0)} path steps recorded
          </p>
          <button className="secondary" onClick={() => navigate("/grow")}>
            Continue a path or challenge
          </button>
        </div>
      </GroupedList>
      <GroupedList title="Followed communities" plain={!state.followedTopics.length}>
        {state.followedTopics.length ? (
          state.followedTopics.map((id) => (
            <Row key={id} title={findTopic(id)?.label ?? id} href={"/community/" + id} chevron />
          ))
        ) : (
          <div className="group-pad">
            <p>No followed topics yet.</p>
          </div>
        )}
      </GroupedList>
      <Resources />
    </section>
  );
}
