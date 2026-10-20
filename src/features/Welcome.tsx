import { useEffect, useRef, useState } from "react";
import { usePlatform } from "../platform/store";
import { goals } from "../platform/models";
import { track } from "../analytics";
import { TopicPreferences } from "../topics/Preferences";
import { GroupedList } from "../ui/List";
import { StepIndicator } from "../ui/StepIndicator";
import { devotionals, recommendedJourney } from "./growData";

// The welcome questionnaire (founder, 2026-10-20: "you only need to have this questionaire once when people open the app
// ... for the first time"). Five steps, one question per screen, in the walk's flow: a Large Title, the step indicator
// "1 of 5", one filled button, "Back" from step 2 on and "Skip for now" on every step. The questions, the choices and
// the storage are those of the old Home questionnaire (local.onboarded, preferences goals / journey / minutes / time,
// privateTopics and the onboarding_completed call). Finishing or skipping sets local.onboarded, so it never comes back
// on this device. The app shows it only when it opens on Today ("/"); a deep link is never held back (platformApp.tsx).
// Nothing here turns a reminder on: the last paragraph of step 4 only says where to find it.
const titles = [
  "Welcome to your daily walk",
  "What are you seeking?",
  "Where are you in your journey?",
  "Make a little room",
  "A rhythm made for you",
] as const;

const journeys = ["New to faith", "Returning to faith", "Growing in faith", "Exploring faith", "Prefer not to say"] as const;

export function Welcome({ onDone }: { onDone: () => void }) {
  const { state, update } = usePlatform();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(state.preferences.goals);
  const [journey, setJourney] = useState(state.preferences.journey);
  const [minutes, setMinutes] = useState<5 | 10 | 20>(state.preferences.minutes);
  const [time, setTime] = useState(state.preferences.time);
  const [privateTopics, setPrivateTopics] = useState(state.privateTopics);
  const heading = useRef<HTMLHeadingElement>(null);
  // Focus follows the reader to the new step's title, but not when the questionnaire first opens.
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [step]);

  const goTo = (to: number) => {
    moved.current = true;
    setStep(to);
  };
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
    // Even when the device refuses the write, the reader is not held here: Today opens and the notice says it was not saved.
    onDone();
  }
  const last = step === titles.length - 1;
  return (
    <section className="flow welcome-flow" aria-label="Welcome">
      <StepIndicator
        name="Welcome progress"
        current={step + 1}
        total={titles.length}
        label={`${step + 1} of ${titles.length}`}
        valueText={`Step ${step + 1} of ${titles.length}, ${titles[step]}`}
      />
      <div className="flow-part">
        <p className="welcome-kicker">Jesus at the center</p>
        <h1 className="large-title welcome-title" tabIndex={-1} ref={heading}>
          {titles[step]}
        </h1>
        {step === 0 ? (
          <p>A few minutes of Scripture, honest reflection and prayer. You can begin as a guest. Your private writing stays here on your device.</p>
        ) : step === 1 ? (
          <>
            <p>Choose up to three goals.</p>
            <div className="chips">
              {goals.map((g) => (
                <button
                  type="button"
                  key={g}
                  className="secondary"
                  aria-pressed={selected.includes(g)}
                  disabled={!selected.includes(g) && selected.length === 3}
                  onClick={() => setSelected(selected.includes(g) ? selected.filter((x) => x !== g) : [...selected, g])}
                >
                  {g}
                </button>
              ))}
            </div>
          </>
        ) : step === 2 ? (
          <GroupedList>
            <li>
              <label className="list-row select-row">
                <span className="list-row-title">Your journey</span>
                <select aria-label="Your journey" value={journey} onChange={(e) => setJourney(e.target.value)}>
                  {journeys.map((j) => (
                    <option key={j}>{j}</option>
                  ))}
                </select>
              </label>
            </li>
          </GroupedList>
        ) : step === 3 ? (
          <>
            <GroupedList>
              <li>
                <label className="list-row select-row">
                  <span className="list-row-title">Minutes each day</span>
                  <select aria-label="Minutes each day" value={minutes} onChange={(e) => setMinutes(Number(e.target.value) as 5 | 10 | 20)}>
                    {[5, 10, 20].map((m) => (
                      <option key={m} value={m}>
                        {m} minutes
                      </option>
                    ))}
                  </select>
                </label>
              </li>
              <li>
                <label className="list-row select-row">
                  <span className="list-row-title">Your preferred time</span>
                  <select aria-label="Your preferred time" value={time} onChange={(e) => setTime(e.target.value as typeof time)}>
                    {["morning", "afternoon", "evening"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
              </li>
            </GroupedList>
            <TopicPreferences selected={privateTopics} onChange={setPrivateTopics} />
            <p>You can turn on a daily reminder in Settings.</p>
          </>
        ) : (
          <>
            <p>
              Begin with {minutes} minutes in the {time}. Your focus: {selected.length ? selected.join(", ") : "Scripture, reflection and prayer"}.
            </p>
            <p>Explore Grow for topic journeys. Change your preferences anytime in Settings.</p>
            <p>Your suggested starting topic: {devotionals.find((d) => d.id === recommendedJourney(selected))?.topic}.</p>
          </>
        )}
      </div>
      <div className="flow-actions">
        {step > 0 && (
          <button type="button" className="flow-button flow-button-secondary" onClick={() => goTo(step - 1)}>
            Back
          </button>
        )}
        <button type="button" className="flow-button" onClick={() => (last ? finish() : goTo(step + 1))}>
          {last ? "Begin my walk" : "Continue"}
        </button>
      </div>
      <button type="button" className="welcome-skip" onClick={finish}>
        Skip for now
      </button>
    </section>
  );
}
