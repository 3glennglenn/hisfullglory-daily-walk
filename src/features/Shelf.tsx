import { aiUnreviewedCardLabel, todaysCheck } from "../context/checks";
import { contextChecks } from "../context/data";
import { countLabel } from "../context/shelf";
import { cameFrom, navigate } from "../platform/router";
import { usePlatform } from "../platform/store";
import { localDate } from "../storage";
import { AiBadge } from "../ui/Badges";
import { GroupedList, Row } from "../ui/List";
import { LargeTitle, Toolbar } from "../ui/Screen";
import { Shelf } from "../ui/Shelf";

// Your shelf (UI-SPEC A9, 12, D-07, D-11): every context check read to the end, kept on this device. It only
// grows: no gap for a day without a story, nothing to remove, no count to beat. The check written by an AI model
// that no person checked says so on its spine, in the legend under the boards and in the plain list. Tomorrow's
// place is empty and never names a verse (Q2): the daily routine may take an alternate on the day.
export function YourShelf() {
  const { state } = usePlatform();
  const checks = contextChecks;
  const shelf = state.shelf;
  const count = shelf.length;
  const aiPublished = new Set(checks.filter((check) => check.review === "ai-unreviewed").map((check) => check.slug));
  const anyAi = shelf.some((entry) => aiPublished.has(entry.slug));
  // Back names the screen the reader came from: You, or Today when the shelf was opened from Today or directly.
  const fromYou = cameFrom() === "/you";
  const todays = todaysCheck(checks, shelf, localDate())?.check;
  return (
    <section className="grouped-screen shelf-screen">
      <Toolbar back={fromYou ? "You" : "Today"} to={fromYou ? "/you" : "/"} />
      <LargeTitle>Your shelf</LargeTitle>
      {count > 0 ? (
        <p className="shelf-count">
          {countLabel(count)}. Your shelf only grows.
        </p>
      ) : (
        <div className="shelf-empty">
          <h2>Your shelf is empty for now</h2>
          <p>Every context check you read to the end stays here. Your shelf only grows.</p>
          {todays && (
            <button type="button" className="flow-button" onClick={() => navigate(`/context/${todays.slug}`)}>
              Read today's story
            </button>
          )}
        </div>
      )}
      <Shelf shelf={shelf} checks={checks} />
      <p className="shelf-tomorrow-line">There is room for tomorrow.</p>
      {anyAi && (
        <p className="shelf-legend">
          <AiBadge />
          <span>{aiUnreviewedCardLabel}</span>
        </p>
      )}
      <GroupedList>
        <Row title="All context checks" href="/context" chevron />
      </GroupedList>
    </section>
  );
}
