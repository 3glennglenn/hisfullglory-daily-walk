import { useEffect, useState } from "react";
import { usePlatform } from "../platform/store";
import { LAMPLIGHT_NAMES, LOOK_NAMES } from "../platform/appearance";
import { useAppearance } from "../platform/AppearanceProvider";
import { useAuth } from "../platform/auth";
import { supabase } from "../supabase";
import { GroupedList, Row } from "../ui/List";
import { LargeTitle } from "../ui/Screen";
import { GiveFeature } from "../giving/GiveFeature";
import { ShopFeature } from "./ShopFeature";
import { dailyReminderOn } from "./Reminders";
import { LegalLinks } from "./Settings";

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

// You (UI-SPEC A12): everything that used to be behind More, in one grouped list.
export function You() {
  const { session } = useAuth();
  const { state } = usePlatform();
  const { look, lamplight } = useAppearance();
  const name = useDisplayName(session?.user.id);
  const reminder = state.notifications["Daily Walk"] === true || dailyReminderOn();
  return (
    <section className="grouped-screen">
      <LargeTitle>You</LargeTitle>
      <GiveFeature />
      <ShopFeature />
      <GroupedList>
        {session ? (
          <Row title={name || "Account"} detail={name ? "Account" : undefined} href="/profile" chevron />
        ) : (
          <Row title="Sign in" detail="Join the community and keep your account safe." href="/profile" chevron />
        )}
      </GroupedList>
      <GroupedList title="Your walk">
        <Row title="Days walked" value={state.local.completedDates.length} />
        <Row title="Your shelf" value={`${state.shelf.length} read`} href="/shelf" chevron />
        <Row title="My Walk" href="/my-walk" chevron />
        <Row title="Journal" href="/journal" chevron />
        <Row title="Grow" href="/grow" chevron />
      </GroupedList>
      <GroupedList title="Settings">
        <Row
          title="Appearance"
          value={`${LOOK_NAMES[look]}, ${LAMPLIGHT_NAMES[lamplight]}`}
          href="/settings/appearance"
          chevron
        />
        <Row
          title="Daily rhythm"
          value={`${state.preferences.minutes} minutes, ${state.preferences.time}`}
          href="/settings"
          chevron
        />
        <Row title="Daily reminder" value={reminder ? "On" : "Off"} href="/settings/reminders" chevron />
        <Row title="Privacy and your data" href="/settings#privacy" chevron />
      </GroupedList>
      <GroupedList title="About" plain>
        <LegalLinks />
      </GroupedList>
      <footer className="you-footer">
        <img src="/icon.svg" alt="" width="24" height="24" />
        <div>
          <p>HisFullGlory Daily Walk</p>
          <p>Scripture: World English Bible, public domain.</p>
        </div>
      </footer>
    </section>
  );
}
