import { TopicPreferences } from "../topics/Preferences";
import { Resources } from "../topics/Resources";
import { useState } from "react";
import { usePlatform } from "../platform/store";
import { goals } from "../platform/models";
import { navigate } from "../platform/router";
import { contentFor } from "../data";
import { completeDate, localDate, streak } from "../storage";
import { track } from "../analytics";
import { Journal } from "./LegacyWalk";
import { ContextOfTheDayCard } from "../context/ContextCheck";
import { devotionals, recommendedJourney } from "./growData";
export const dailyPassage = (reference: string) =>
  `/bible/psalms/${reference.includes("121") ? 121 : 23}/${reference.split(":")[1]}`;
export function Onboarding() {
  const { state, update } = usePlatform();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(state.preferences.goals);
  const [journey, setJourney] = useState(state.preferences.journey);
  const [minutes, setMinutes] = useState<5 | 10 | 20>(
    state.preferences.minutes,
  );
  const [privateTopics,setPrivateTopics]=useState(state.privateTopics);
  const [time, setTime] = useState(state.preferences.time);
  function finish() {
    if (
      update((s) => ({
        ...s,
        local: { ...s.local, onboarded: true },
        preferences: { goals: selected, journey, minutes, time },
        privateTopics,
      }))
    )
      track("onboarding_completed");
  }
  return (
    <div className="card welcome">
      <p className="eyebrow">Jesus at the center</p>
      <h2>
        {
          [
            "Welcome to your daily walk",
            "What are you seeking?",
            "Where are you in your journey?",
            "Make a little room",
            "A rhythm made for you",
          ][step]
        }
      </h2>
      {step === 0 ? (
        <p>
          A few minutes of Scripture, honest reflection and prayer. You can
          begin as a guest. Your private writing stays here on your device.
        </p>
      ) : step === 1 ? (
        <>
          <p>Choose up to three goals.</p>
          <div className="chips">
            {goals.map((g) => (
              <button
                key={g}
                className="secondary"
                aria-pressed={selected.includes(g)}
                disabled={!selected.includes(g) && selected.length === 3}
                onClick={() =>
                  setSelected(
                    selected.includes(g)
                      ? selected.filter((x) => x !== g)
                      : [...selected, g],
                  )
                }
              >
                {g}
              </button>
            ))}
          </div>
        </>
      ) : step === 2 ? (
        <label>
          Your journey
          <select value={journey} onChange={(e) => setJourney(e.target.value)}>
            {[
              "New to faith",
              "Returning to faith",
              "Growing in faith",
              "Exploring faith",
              "Prefer not to say",
            ].map((j) => (
              <option key={j}>{j}</option>
            ))}
          </select>
        </label>
      ) : step === 3 ? (
        <>
          <label>
            Minutes each day
            <select
              value={minutes}
              onChange={(e) =>
                setMinutes(Number(e.target.value) as 5 | 10 | 20)
              }
            >
              {[5, 10, 20].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </label>
          <label>
            Your preferred time
            <select
              value={time}
              onChange={(e) => setTime(e.target.value as typeof time)}
            >
              {["morning", "afternoon", "evening"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <TopicPreferences selected={privateTopics} onChange={setPrivateTopics} />
          <p>
            This is a preference, not a scheduled notification. Push reminders
            are not configured.
          </p>
        </>
      ) : (
        <>
          <p>
            Begin with {minutes} minutes in the {time}. Your focus:{" "}
            {selected.length
              ? selected.join(", ")
              : "Scripture, reflection and prayer"}
            .
          </p>
          <p>
            Explore Grow for topic journeys. Change your preferences anytime in
            Settings.
          </p>
          <p>
            Your suggested starting topic:{" "}
            {
              devotionals.find((d) => d.id === recommendedJourney(selected))
                ?.topic
            }
            .
          </p>
        </>
      )}
      <div className="actions">
        {step > 0 && (
          <button className="secondary" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        <button onClick={() => (step === 4 ? finish() : setStep(step + 1))}>
          {step === 4 ? "Begin my walk" : "Continue"}
        </button>
        <button className="text-button" onClick={finish}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
export function Home() {
  const { state } = usePlatform();
  const date = localDate();
  const today = contentFor(date);
  const continuing = devotionals.find((d) => {
    const done = state.devotionalProgress[d.id]?.length ?? 0;
    return done > 0 && done < d.days.length;
  });
  const journeyId =
    continuing?.id ?? recommendedJourney(state.preferences.goals);
  return (
    <section>
      <p className="eyebrow">
        A little space for God ·{" "}
        {new Date().toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
      </p>
      <h1>
        Walk with Jesus,
        <br />
        one day at a time.
      </h1>
      {!state.local.onboarded && <Onboarding />}
      <article className="card verse-card">
        <small>Today’s Scripture</small>
        <blockquote>{today.quote}</blockquote>
        <p>{today.reference} · WEB</p>
        <button onClick={() => navigate("/walk")}>
          {state.local.completedDates.includes(date)
            ? "Revisit today’s walk"
            : state.walkStep[date]
              ? "Continue today’s walk"
              : "Begin today’s walk"}
        </button>
        <button
          className="text-button"
          onClick={() => navigate(dailyPassage(today.reference))}
        >
          Read the passage
        </button>
      </article>
      <ContextOfTheDayCard />
      <div className="card">
        <h2>A gentle rhythm</h2>
        <p>
          {streak(state.local.completedDates, date)} day streak ·{" "}
          {state.local.completedDates.length} days completed
        </p>
        <p>
          {state.preferences.minutes} minutes · {state.preferences.time}
        </p>
        <small>
          A missed day is an invitation to begin again. There is no penalty.
        </small>
      </div>
      <Resources />
      <div className="quick-grid">
        {[
          ["/bible", "Read Scripture", "Open the complete WEB Bible"],
          [
            "/pray",
            "Bring a prayer",
            "Private prayers and public encouragement",
          ],
          [
            `/grow/${journeyId}`,
            continuing ? "Continue your journey" : "Grow in faith",
            `${continuing ? "Continue" : "Suggested topic"}: ${devotionals.find((d) => d.id === journeyId)?.topic}`,
          ],
          ["/journal", "Reflect privately", "Your own words, on this device"],
        ].map(([path, title, copy]) => (
          <button
            className="card entry"
            key={path}
            onClick={() => navigate(path)}
          >
            <strong>{title}</strong>
            <span>{copy}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
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
