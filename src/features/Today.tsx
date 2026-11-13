import { Check, Footprints } from "lucide-react";
import { navigate } from "../platform/router";
import { usePlatform } from "../platform/store";
import { contentFor } from "../data";
import { localDate, nextDate } from "../storage";
import { refLabel, todaysCheck } from "../context/checks";
import { contextChecks } from "../context/data";
import { monthDay } from "../context/shelf";
import { Cover, CoverAiRow, CoverHook } from "../ui/Cover";
import { StudyBiblesCard } from "./ShopFeature";
import { GroupedList, Row } from "../ui/List";
import { TitleRow } from "../ui/Screen";
import { SponsorRow } from "../ui/SponsorRow";
import { StarField } from "../ui/StarField";

const parts = (date: string) => date.split("-").map(Number) as [number, number, number];

/** "Monday, October 19": the date line under the title, in English. */
function dateLine(date: string): string {
  const [year, month, day] = parts(date);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// Today (UI-SPEC A1; 01.2 D-04): three things. The day's context check, the newest one the reader has not finished
// on an earlier day, written by an AI model or not (D-05, D-06); the Today's walk row; and the Study Bibles card
// (D-10). The shelf lives in Bible, Study and the days walked in My walk, so neither is here. The bundled checks come
// from ../context/data, which a browser fixture replaces with its own list.
// In Night light (direction B) a sky of stars, one for each day walked, stands above the cover as decoration only.
export function Today() {
  const checks = contextChecks;
  const { state } = usePlatform();
  const date = localDate();
  const found = todaysCheck(checks, state.shelf, date);
  const passage = contentFor(date);
  const done = state.local.completedDates.includes(date);
  const step = state.walkStep[date] ?? 0;

  // The leading tile is a picture (the footprints of the walk); the words carry the meaning.
  const tile = (
    <span className="walk-tile" aria-hidden="true">
      <Footprints focusable="false" size={22} strokeWidth={1.8} />
    </span>
  );
  const walkRow = done ? (
    <Row
      href="/walk"
      chevron
      leading={tile}
      title={
        <span className="row-with-icon">
          <Check className="row-success" aria-hidden="true" focusable="false" size={18} strokeWidth={2.5} />
          Today's walk is complete
        </span>
      }
      detail={`${state.local.completedDates.length} ${state.local.completedDates.length === 1 ? "day" : "days"} walked. Tomorrow: ${contentFor(nextDate(date)).reference}.`}
    />
  ) : step > 0 ? (
    <Row href="/walk" chevron leading={tile} title="Continue today's walk" detail={`Step ${Math.min(step + 1, 6)} of 6`} />
  ) : (
    <Row
      href="/walk"
      leading={tile}
      title="Today's walk"
      detail={`${passage.reference} · read, reflect, pray`}
      value={<span className="walk-start">Start</span>}
    />
  );

  return (
    <section className="today">
      <TitleRow className="today-head" title="Today" />
      <p className="today-date">{dateLine(date)}</p>
      {/* Night light only (the CSS leaves it out in the day modes): a star for every day walked, as decoration. No line
          counts the days here (01.2 D-04); My walk and the walk's finish say it in words. */}
      <StarField walked={state.local.completedDates} today={date} />
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
      {found && <GroupedList>{walkRow}</GroupedList>}
      {/* The shop's one place on Today (01.2 D-10): under the walk row, never next to the walk flow or prayers. */}
      <StudyBiblesCard />
      {/* The sponsor slot: nothing is rendered while no sponsor is set (D-13). */}
      <SponsorRow place="today-end" />
    </section>
  );
}
