// A daily reminder and "someone prayed for you", as push notifications (migration 010 and
// supabase/functions/push-sender). Works on Android and computers in the browser, and on an
// iPhone (iOS 16.4 and later) once the app is on the Home Screen. A notification never shows
// what anyone wrote.
import { useEffect, useState } from "react";
import { config } from "../config";
import { useAuth } from "../platform/auth";
import { keyBytes, suggestedReminderTime, validReminderTime } from "../platform/pushKeys";
import { usePlatform } from "../platform/store";
import { supabase } from "../supabase";

const savedKey = "hfg-reminder";
interface Saved { daily: boolean; time: string; prayedFor: boolean }
function readSaved(): Saved | null {
  try {
    const value = JSON.parse(localStorage.getItem(savedKey) ?? "null");
    return value && typeof value.time === "string" ? (value as Saved) : null;
  } catch {
    return null;
  }
}
function writeSaved(value: Saved | null) {
  try {
    if (value) localStorage.setItem(savedKey, JSON.stringify(value));
    else localStorage.removeItem(savedKey);
  } catch {
    /* Only the form's memory is lost; the server keeps the setting. */
  }
}

// True when a daily reminder was saved on this device (the You screen shows it as "On").
export const dailyReminderOn = () => readSaved()?.daily === true;
export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const onHomeScreen = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const isIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

async function subscription() {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export function Reminders() {
  const { session } = useAuth();
  const { state } = usePlatform();
  const saved = readSaved();
  const [on, setOn] = useState(false);
  const [daily, setDaily] = useState(saved?.daily ?? true);
  const [time, setTime] = useState(saved?.time ?? suggestedReminderTime(state.preferences.time));
  const [prayedFor, setPrayedFor] = useState(saved?.prayedFor ?? false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!pushSupported()) return;
    let active = true;
    void subscription().then((s) => active && setOn(!!s && !!readSaved())).catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!supabase) return null;
  if (!pushSupported() || (isIphone() && !onHomeScreen()))
    return (
      <section className="card" id="reminders">
        <h2>A gentle daily reminder</h2>
        {isIphone() ? (
          <p>
            On iPhone, reminders work once HisFullGlory is on your Home Screen. In Safari, tap
            Share, then Add to Home Screen, and open the app from there.
          </p>
        ) : (
          <p>This browser cannot show notifications. Open the app in Chrome, Edge, Firefox or Safari to turn them on.</p>
        )}
      </section>
    );

  async function save() {
    if (!supabase || busy) return;
    if (daily && !validReminderTime(time)) {
      setStatus("Pick a time between 05:00 and 22:00.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications are switched off for this app. Allow them in your phone's settings, then try again.");
      const registration = await navigator.serviceWorker.ready;
      const current =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.pushPublicKey) }));
      const keys = current.toJSON().keys ?? {};
      const { error } = await supabase.rpc("save_push_subscription", {
        sub_endpoint: current.endpoint,
        sub_p256dh: keys.p256dh,
        sub_auth: keys.auth,
        wants_daily: daily,
        at_time: validReminderTime(time) ? time : "07:30",
        zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        wants_prayed_for: !!session && prayedFor,
      });
      if (error) throw new Error("Your reminder could not be saved. Try again in a moment.");
      writeSaved({ daily, time, prayedFor: !!session && prayedFor });
      setOn(true);
      setStatus(daily ? `Saved. You will get a reminder around ${time}.` : "Saved.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Your reminder could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    if (!supabase) return;
    const current = await subscription();
    const { data } = current ? await supabase.rpc("request_test_push", { sub_endpoint: current.endpoint }) : { data: false };
    setStatus(data ? "A test notification is on its way. It can take up to five minutes." : "You can ask for a test once every ten minutes.");
  }
  async function off() {
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const current = await subscription();
      if (current) {
        await supabase.rpc("remove_push_subscription", { sub_endpoint: current.endpoint });
        await current.unsubscribe();
      }
      writeSaved(null);
      setOn(false);
      setStatus("Reminders are off.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card" id="reminders">
      <h2>A gentle daily reminder</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="check">
          <input id="reminder-daily" type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} />
          Remind me to take my daily walk
        </label>
        {daily && (
          <label>
            Around
            <input id="reminder-time" type="time" min="05:00" max="22:00" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        )}
        {session && (
          <label className="check">
            <input id="reminder-prayed" type="checkbox" checked={prayedFor} onChange={(e) => setPrayedFor(e.target.checked)} />
            Tell me when someone prays for my prayer request
          </label>
        )}
        <button disabled={busy}>{on ? "Save" : "Turn on reminders"}</button>
      </form>
      {on && (
        <div className="row">
          <button className="secondary" disabled={busy} onClick={() => void test()}>
            Send me a test
          </button>
          <button className="text-button" disabled={busy} onClick={() => void off()}>
            Turn off
          </button>
        </div>
      )}
      <small>A notification never shows what you or anyone else wrote. A missed day is fine; the reminder simply comes again tomorrow.</small>
      <p role="status">{status}</p>
    </section>
  );
}
