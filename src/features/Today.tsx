import { Check } from "lucide-react";
import { navigate } from "../platform/router";
import { usePlatform } from "../platform/store";
import { contentFor } from "../data";
import { dateNumber, localDate } from "../storage";
import { refLabel, todaysCheck } from "../context/checks";
import { contextChecks } from "../context/data";
import { countLabel, shelfSummary } from "../context/shelf";
import { Cover, CoverAiRow, CoverHook } from "../ui/Cover";
import { AiBadge } from "../ui/Badges";
import { GroupedList, Row } from "../ui/List";
import { LargeTitle } from "../ui/Screen";
import { MiniShelf } from "../ui/Shelf";
import { SponsorRow } from "../ui/SponsorRow";

const parts = (date: string) => date.split("-").map(Number) as [number, number, number];

/** "Monday, October 19": the date line under the title, in English. */
function dateLine(date: string): string {
  const [year, month, day] = parts(date);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** "October 19": the day a check was finished, in English. */
function monthDay(date: string): string {
  const [year, month, day] = parts(date);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

const nextDate = (date: string) => new Date((dateNumber(date) + 1) * 86400000).toISOString().slice(0, 10);

// Today (UI-SPEC A1): one focus, the day's context check, the newest one the reader has not finished on an
// earlier day, written by an AI model or not (D-05, D-06). Under it one quiet list: Today's walk and Your shelf
// (D-07, D-11). The bundled checks come from ../context/data, which a browser fixture replaces with its own list.
export function Today() {
  const checks = contextChecks;
  const { state } = usePlatform();
  const date = localDate();
  const found = todaysCheck(checks, state.shelf, date);
  const passage = contentFor(date);
  const done = state.local.completedDates.includes(date);
  const step = state.walkStep[date] ?? 0;
  const { count, ai } = shelfSummary(state.shelf, checks);

  const walkRow = done ? (
    <Row
      href="/walk"
      chevron
      title={
        <span className="row-with-icon">
          <Check className="row-success" aria-hidden="true" focusable="false" size={18} strokeWidth={2.5} />
          Today's walk is complete
        </span>
      }
      detail={`${state.local.completedDates.length} ${state.local.completedDates.length === 1 ? "day" : "days"} walked. Tomorrow: ${contentFor(nextDate(date)).reference}.`}
    />
  ) : step > 0 ? (
    <Row href="/walk" chevron title="Continue today's walk" detail={`Step ${Math.min(step + 1, 6)} of 6`} />
  ) : (
    <Row
      href="/walk"
      chevron
      title="Today's walk"
      detail={`${passage.reference}. Read, reflect and pray, ${state.preferences.minutes} minutes.`}
    />
  );

  return (
    <section className="today">
      <LargeTitle>Today</LargeTitle>
      <p className="today-date">{dateLine(date)}</p>
      {found ? (
        <Cover heading="Today's context check" reference={refLabel(found.check.verse)}>
          <CoverHook hook={found.check.hook} />
          {found.check.review === "ai-unreviewed" && <CoverAiRow />}
          {found.state !== "unread" && (
            <p className="cover-status">
              <Check aria-hidden="true" focusable="false" size={16} strokeWidth={2.5} />
              <span>{found.state === "finished-today" || !found.finishedOn ? "On your shelf" : `On your shelf since ${monthDay(found.finishedOn)}`}</span>
            </p>
          )}
          <button
            type="button"
            className={found.state === "unread" ? "cover-button" : "cover-button cover-button-secondary"}
            aria-label={`${found.state === "unread" ? "Read the story" : "Read it again"}: ${refLabel(found.check.verse)}`}
            onClick={() => navigate(`/context/${found.check.slug}`)}
          >
            {found.state === "unread" ? "Read the story" : "Read it again"}
          </button>
        </Cover>
      ) : (
        // No context check is published: the walk takes the block, and its row leaves the list.
        <Cover heading="Today's walk" reference={passage.reference}>
          <p className="cover-verse">{passage.quote}</p>
          {done && (
            <p className="cover-status">
              <Check aria-hidden="true" focusable="false" size={16} strokeWidth={2.5} />
              <span>Today's walk is complete</span>
            </p>
          )}
          <button type="button" className="cover-button" onClick={() => navigate("/walk")}>
            {done ? "Revisit today's walk" : step > 0 ? "Continue today's walk" : "Begin today's walk"}
          </button>
        </Cover>
      )}
      <GroupedList>
        {found && walkRow}
        <Row
          href="/shelf"
          chevron
          leading={<MiniShelf shelf={state.shelf} checks={checks} />}
          title="Your shelf"
          detail={
            <>
              <span className="row-line">{countLabel(count)}</span>
              {ai > 0 && (
                <span className="row-line row-ai">
                  <AiBadge />
                  <span>{ai} written by an AI model, not checked by a person.</span>
                </span>
              )}
            </>
          }
        />
      </GroupedList>
      {/* The sponsor slot: nothing is rendered while no sponsor is set (D-13). */}
      <SponsorRow place="today-end" />
    </section>
  );
}
