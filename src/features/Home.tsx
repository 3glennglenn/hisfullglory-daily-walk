import { navigate } from "../platform/router";
import { usePlatform } from "../platform/store";
import { contentFor } from "../data";
import { completeDate, localDate } from "../storage";
import { track } from "../analytics";
import { Journal } from "./LegacyWalk";
// Today (the home screen) lives in Today.tsx. This file keeps the daily passage link and the walk, which
// plan 08 turns into the six-step walk of UI-SPEC A5.
export const dailyPassage = (reference: string) =>
  `/bible/psalms/${reference.includes("121") ? 121 : 23}/${reference.split(":")[1]}`;
export function Walk() {
  const { state, update } = usePlatform();
  const date = localDate();
  const today = contentFor(date);
  const step = state.walkStep[date] ?? 0;
  const labels = [
    "Scripture",
    "Context",
    "Devotional",
    "Reflection",
    "Journal",
    "Prayer",
    "Completion",
  ];
  function localUpdate(fn: (s: typeof state.local) => typeof state.local) {
    return update((s) => {
      const local = fn(s.local);
      const text = local.journals[date];
      let entries = s.entries;
      if (text !== undefined) {
        const entry = {
          id: `legacy:${date}`,
          type: "free journal" as const,
          title: "Daily reflection",
          body: text,
          date,
          source: dailyPassage(today.reference),
        };
        entries = entries.some((e) => e.id === entry.id)
          ? entries.map((e) => (e.id === entry.id ? entry : e))
          : [entry, ...entries];
      }
      return { ...s, local, entries };
    });
  }
  return (
    <section>
      <p className="eyebrow">Today’s walk · {date}</p>
      <h1>{labels[step]}</h1>
      <progress value={step} max={6} aria-label="Daily Walk step" />
      <small>
        Step {step + 1} of 7 · {state.preferences.minutes} minute rhythm
      </small>
      {step === 0 ? (
        <article className="card">
          <blockquote>{today.quote}</blockquote>
          <p>{today.reference} · WEB</p>
          <button
            className="secondary"
            onClick={() => navigate(dailyPassage(today.reference))}
          >
            Read the whole passage
          </button>
        </article>
      ) : step === 1 ? (
        <article className="card">
          <h2>Read the surrounding words</h2>
          <p>
            {today.reference.includes("121")
              ? "Psalm 121 repeats the assurance that the LORD keeps his people, from day and night to going out and coming in."
              : "Psalm 23 pictures the LORD as a shepherd and a welcoming host. The valley and the presence of enemies remain part of the picture."}
          </p>
          <p>Editorial observation of the source passage.</p>
          <button
            className="secondary"
            onClick={() =>
              navigate(dailyPassage(today.reference) + "?tab=context")
            }
          >
            Explore passage context
          </button>
        </article>
      ) : step === 2 ? (
        <article className="card">
          <h2>Receive and respond</h2>
          <small>Original editorial devotional</small>
          <p>{today.reflection}</p>
        </article>
      ) : step === 3 ? (
        <article className="card">
          <h2>A question to carry</h2>
          <p>{today.question}</p>
          <p>Take a quiet moment. There is no perfect answer.</p>
        </article>
      ) : step === 4 ? (
        <Journal
          key={date}
          date={date}
          initial={state.local.journals[date] ?? ""}
          question={today.question}
          update={localUpdate}
        />
      ) : step === 5 ? (
        <article className="card">
          <h2>An honest prayer</h2>
          <p>
            Lord Jesus, thank you for your presence. Help me listen to your
            Word, bring my real needs to you, and take one faithful step in love
            today. Amen.
          </p>
          <button className="secondary" onClick={() => navigate("/pray")}>
            Save a private prayer
          </button>
        </article>
      ) : (
        <article className="card">
          <h2>
            {state.local.completedDates.includes(date)
              ? "Today’s walk is complete"
              : "One faithful step"}
          </h2>
          <p>Carry one thought from this passage into the rest of your day.</p>
          <button
            disabled={state.local.completedDates.includes(date)}
            onClick={() => {
              if (update((s) => ({ ...s, local: completeDate(s.local, date) })))
                track("daily_completed", { date });
            }}
          >
            {state.local.completedDates.includes(date)
              ? "Completed · come back anytime"
              : "Complete today’s walk"}
          </button>
          <button className="secondary" onClick={() => navigate("/")}>
            Return home
          </button>
        </article>
      )}
      <div className="row">
        <button
          className="secondary"
          disabled={step === 0}
          onClick={() =>
            update((s) => ({
              ...s,
              walkStep: { ...s.walkStep, [date]: step - 1 },
            }))
          }
        >
          Previous
        </button>
        {step < 6 && (
          <button
            onClick={() =>
              update((s) => ({
                ...s,
                walkStep: { ...s.walkStep, [date]: step + 1 },
              }))
            }
          >
            Continue to {labels[step + 1]}
          </button>
        )}
      </div>
      <p className="helper">
        Progress stays on this device. Resume whenever you’re ready.
      </p>
    </section>
  );
}
