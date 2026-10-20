import { navigate } from "../platform/router";
import { usePlatform } from "../platform/store";
import { localDate } from "../storage";
import { refLabel, todaysCheck } from "../context/checks";
import { contextChecks } from "../context/data";
import { Cover, CoverAiRow, CoverHook } from "../ui/Cover";
import { LargeTitle } from "../ui/Screen";

/** "Monday, October 19": the date line under the title, in English. */
function dateLine(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// Today (UI-SPEC A1): one focus, the day's context check, the newest one the reader has not finished on an
// earlier day, written by an AI model or not (D-05, D-06).
export function Today() {
  const { state } = usePlatform();
  const date = localDate();
  const found = todaysCheck(contextChecks, state.shelf, date);
  return (
    <section className="today">
      <LargeTitle>Today</LargeTitle>
      <p className="today-date">{dateLine(date)}</p>
      {found && (
        <Cover heading="Today's context check" reference={refLabel(found.check.verse)}>
          <CoverHook hook={found.check.hook} />
          {found.check.review === "ai-unreviewed" && <CoverAiRow />}
          <button
            type="button"
            className="cover-button"
            aria-label={`Read the story: ${refLabel(found.check.verse)}`}
            onClick={() => navigate(`/context/${found.check.slug}`)}
          >
            Read the story
          </button>
        </Cover>
      )}
    </section>
  );
}
