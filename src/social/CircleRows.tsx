import { useEffect, useRef, useState } from "react";
import { useAuth } from "../platform/auth";
import { detectCapabilities } from "../platform/capabilities";
import { supabase } from "../supabase";
import { GroupedList, Row } from "../ui/List";
import { circleRpc, type Circle } from "./circlesApi";

// The Circles segment of Community (01.2 D-06, UI-SPEC 2.3): the Circles the reader is in, or an honest line about why
// there are none to show, and always the way to start or join one. The reader's own Circles come from the same
// read_circles function the Circles screen uses (RLS and the 006 grants decide what returns). The names are held in this
// component's state only: never stored, cached or logged, and nothing is requested while signed out or unconfigured.
type Load = "idle" | "loading" | "done" | "failed";

export function CircleRows() {
  const { session } = useAuth();
  const configured = detectCapabilities(Boolean(supabase)).circles;
  const userId = session?.user.id;
  const [circles, setCircles] = useState<Circle[]>([]);
  const [load, setLoad] = useState<Load>("idle");
  const [attempt, setAttempt] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    const request = ++sequence.current;
    setCircles([]);
    if (!configured || !userId) {
      setLoad("idle");
      return;
    }
    setLoad("loading");
    circleRpc("read_circles", { selected_slug: null, selected_topic: null, own_only: true, before_time: null, before_id: null }).then(
      (rows) => {
        if (request !== sequence.current) return;
        setCircles(rows);
        setLoad("done");
      },
      () => {
        if (request !== sequence.current) return;
        setCircles([]);
        setLoad("failed");
      },
    );
    return () => {
      sequence.current++;
    };
  }, [configured, userId, attempt]);
  return (
    <>
      <p className="screen-lede">Walk together around Scripture and shared encouragement.</p>
      {!configured ? (
        <p role="status">Circles are not available right now.</p>
      ) : !userId ? (
        <p role="status">Sign in to see your Circles.</p>
      ) : load === "failed" ? (
        <>
          <p role="status">Your Circles could not be loaded. Check your connection and try again.</p>
          <button type="button" className="secondary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </>
      ) : load === "done" && circles.length ? (
        <GroupedList title="Your Circles">
          {circles.map((c) => (
            <Row key={c.id} title={c.name} href={"/community/circles/" + c.slug} chevron />
          ))}
        </GroupedList>
      ) : (
        <p role="status">{load === "done" ? "You are not in a Circle yet." : "Loading your Circles…"}</p>
      )}
      <GroupedList>
        <Row title="Start or join a Circle" href="/community/circles" chevron />
      </GroupedList>
    </>
  );
}
