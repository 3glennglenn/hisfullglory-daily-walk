import { useEffect, useRef } from "react";
import { navigate } from "../platform/router";
import { usePlatform } from "../platform/store";
import { contentFor } from "../data";
import { completeDate, dateNumber, localDate } from "../storage";
import { track } from "../analytics";
import { Toolbar } from "../ui/Screen";
import { StepIndicator } from "../ui/StepIndicator";
import { Journal } from "./LegacyWalk";

// Today's walk (UI-SPEC A5, A6, D-11): a full-screen flow of six steps that ends on the Prayer step, then a finish
// screen that is a reason to come back and never a reproach. The tab bar is covered while it is open; "‹ Today" is the
// way out and keeps the step. The stored step keeps its old meaning, walkStep[date]: 0 to 5 are the six steps and 6 is
// the finish screen, so progress stored before this screen existed resumes where it was.
export const dailyPassage = (reference: string) =>
  `/bible/psalms/${reference.includes("121") ? 121 : 23}/${reference.split(":")[1]}`;

/** The day after a local date ("YYYY-MM-DD"). */
export const nextDate = (date: string) => new Date((dateNumber(date) + 1) * 86400000).toISOString().slice(0, 10);

const labels = ["Scripture", "Context", "Devotional", "Reflection", "Journal", "Prayer"] as const;

export function Walk() {
  const { state, update } = usePlatform();
  const date = localDate();
  const today = contentFor(date);
  const done = state.local.completedDates.includes(date);
  // A finished day shows the finish screen. An unfinished day whose stored step is 6 (the old Completion step, which
  // no longer exists) lands on the Prayer step, where the filled button now finishes the walk.
  const step = done ? 6 : Math.min(state.walkStep[date] ?? 0, 5);
  const title = useRef<HTMLDivElement>(null);
  // Focus follows the reader to the new step's title, but not when the walk first opens.
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    const heading = title.current?.querySelector<HTMLElement>("h2");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }, [step]);

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

  if (step === 6) return <WalkFinish date={date} />;

  const goTo = (to: number) => {
    moved.current = true;
    update((s) => ({ ...s, walkStep: { ...s.walkStep, [date]: to } }));
  };
  // The Prayer step finishes the day exactly as the old Completion step did: the date is kept once (completeDate is
  // idempotent), the private reflection stays where the Journal step saved it, and the stored step moves to the finish.
  const finish = () => {
    moved.current = true;
    if (update((s) => ({ ...s, local: completeDate(s.local, date), walkStep: { ...s.walkStep, [date]: 6 } })))
      track("daily_completed", { date });
  };
  const label = labels[step];
  return (
    <section className="flow walk-flow">
      <Toolbar back="Today" to="/" title="Today's walk" />
      <StepIndicator
        name="Walk progress"
        current={step + 1}
        total={labels.length}
        label={`Step ${step + 1} of ${labels.length}`}
        valueText={`Step ${step + 1} of ${labels.length}, ${label}`}
      />
      <div className="flow-part" ref={title}>
        <h2>{label}</h2>
        {step === 0 ? (
          <>
            <blockquote className="walk-verse">{today.quote}</blockquote>
            <p className="walk-note">{today.reference} · WEB</p>
            <button type="button" className="walk-link" onClick={() => navigate(dailyPassage(today.reference))}>
              Read the whole passage
            </button>
          </>
        ) : step === 1 ? (
          <>
            <p className="walk-sub">Read the surrounding words</p>
            <p>
              {today.reference.includes("121")
                ? "Psalm 121 repeats the assurance that the LORD keeps his people, from day and night to going out and coming in."
                : "Psalm 23 pictures the LORD as a shepherd and a welcoming host. The valley and the presence of enemies remain part of the picture."}
            </p>
            <p className="walk-note">Editorial observation of the source passage.</p>
            <button type="button" className="walk-link" onClick={() => navigate(dailyPassage(today.reference) + "?tab=context")}>
              Explore passage context
            </button>
          </>
        ) : step === 2 ? (
          <>
            <p className="walk-sub">Receive and respond</p>
            <p className="walk-note">Original editorial devotional</p>
            <p>{today.reflection}</p>
          </>
        ) : step === 3 ? (
          <>
            <p className="walk-sub">A question to carry</p>
            <p>{today.question}</p>
            <p>Take a quiet moment. There is no perfect answer.</p>
          </>
        ) : step === 4 ? (
          <Journal key={date} date={date} initial={state.local.journals[date] ?? ""} question={today.question} update={localUpdate} />
        ) : (
          <>
            <p className="walk-sub">An honest prayer</p>
            <p>
              Lord Jesus, thank you for your presence. Help me listen to your Word, bring my real needs to you, and take one faithful
              step in love today. Amen.
            </p>
            <button type="button" className="walk-link" onClick={() => navigate("/pray")}>
              Save a private prayer
            </button>
          </>
        )}
      </div>
      <div className="flow-actions">
        {step > 0 && (
          <button type="button" className="flow-button flow-button-secondary" aria-label={`Back to ${labels[step - 1]}`} onClick={() => goTo(step - 1)}>
            <span aria-hidden="true">‹</span> {labels[step - 1]}
          </button>
        )}
        {step < labels.length - 1 ? (
          <button type="button" className="flow-button" onClick={() => goTo(step + 1)}>
            Continue to {labels[step + 1]}
          </button>
        ) : (
          <button type="button" className="flow-button" onClick={finish}>
            Finish today's walk
          </button>
        )}
      </div>
      <p className="walk-footnote">Progress stays on this device. Resume whenever you're ready.</p>
    </section>
  );
}

// The finish screen (A6) is built in the second task of plan 08; until then it says the walk is complete and leads back to Today.
function WalkFinish({ date }: { date: string }) {
  void date;
  return (
    <section className="flow walk-flow walk-finish">
      <Toolbar back="Today" to="/" title="Today's walk" />
      <h2 className="walk-complete">Walk complete</h2>
      <button type="button" className="flow-button" onClick={() => navigate("/")}>
        Back to Today
      </button>
    </section>
  );
}
