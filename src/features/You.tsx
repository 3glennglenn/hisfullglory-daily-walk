import { useEffect, useId, useState } from "react";
import { Moon } from "lucide-react";
import { usePlatform } from "../platform/store";
import { LOOK_NAMES } from "../platform/appearance";
import { useAppearance } from "../platform/AppearanceProvider";
import { useAuth } from "../platform/auth";
import { supabase } from "../supabase";
import { GroupedList, Row } from "../ui/List";
import { LargeTitle } from "../ui/Screen";
import { Sheet } from "../ui/Sheet";
import { ModeControl } from "./Appearance";
import { dailyReminderOn } from "./Reminders";

// The signed-in reader's own display name, shown on the account row. Nothing else about the account
// is read here (T-01.1-08).
function useDisplayName(userId: string | undefined) {
  const [name, setName] = useState("");
  useEffect(() => {
    setName("");
    if (!userId || !supabase) return;
    let current = true;
    void supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle()
      .then(
        (r) => {
          if (current) setName(r.data?.display_name ?? "");
        },
        () => {},
      );
    return () => {
      current = false;
    };
  }, [userId]);
  return name;
}

// What You holds (01.2 D-02, in this order): the account, Your walk, Give, Settings (the Night light control with its hint,
// then the Theme row to the Appearance screen, the reminder and privacy), one help row and the Scripture line.
// No shop and no giving card: those are rows or live elsewhere (D-10). It is the same on the sheet (a phone) and on the
// page (from 768px).
export function YouContent() {
  const { session } = useAuth();
  const { state } = usePlatform();
  const { look } = useAppearance();
  const modeLabel = useId();
  const name = useDisplayName(session?.user.id);
  const reminder = state.notifications["Daily Walk"] === true || dailyReminderOn();
  const days = state.local.completedDates.length;
  return (
    <>
      <GroupedList>
        {session ? (
          <Row title={name || "Account"} detail={name ? "Account" : undefined} href="/profile" chevron />
        ) : (
          <Row title="Sign in" detail="Join the community and keep your account safe." href="/profile" chevron />
        )}
      </GroupedList>
      <GroupedList title="Your walk">
        <Row title="My walk" value={`${days} ${days === 1 ? "day" : "days"}`} href="/my-walk" chevron />
        <Row title="My prayers" href="/pray" chevron />
        <Row title="Journal" href="/journal" chevron />
      </GroupedList>
      <GroupedList>
        <Row
          title="Give where it helps most"
          detail="Charities chosen by independent evaluators"
          href="/give"
          chevron
        />
      </GroupedList>
      <GroupedList title="Settings">
        <li className="mode-item">
          <span className="mode-item-label" id={modeLabel}>
            <Moon className="mode-item-icon" size={20} aria-hidden="true" focusable="false" />
            Appearance
          </span>
          <ModeControl labelledBy={modeLabel} />
        </li>
        <Row title="Theme" value={LOOK_NAMES[look]} href="/settings/appearance" chevron />
        <Row title="Daily reminder" value={reminder ? "On" : "Off"} href="/settings/reminders" chevron />
        <Row title="Privacy and your data" href="/settings#privacy" chevron />
      </GroupedList>
      <GroupedList>
        <Row title="Help, privacy and terms" href="/settings#about" chevron />
      </GroupedList>
      <p className="you-footnote">Scripture: World English Bible, public domain.</p>
    </>
  );
}

// You as a sheet over the tab the reader was on (a phone, N-03): the existing Sheet at the large detent, with a Done button.
// Focus goes back to the You button when it closes.
export function YouSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet
      title="You"
      detent="large"
      done
      className="you-sheet"
      returnFocus={() => document.querySelector<HTMLElement>(".you-button")}
      onClose={onClose}
    >
      <div className="grouped-screen you-sheet-body">
        <YouContent />
      </div>
    </Sheet>
  );
}

// You as a page in the content column (from 768px), under the sidebar's marked You item.
export function YouPage() {
  return (
    <section className="grouped-screen you-page">
      <LargeTitle>You</LargeTitle>
      <YouContent />
    </section>
  );
}
