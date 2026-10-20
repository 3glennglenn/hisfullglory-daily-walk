import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DARK_QUERY,
  applyAppearance,
  effectiveMode,
  escape,
  keep,
  migrateAppearance,
  readLamplight,
  readLook,
  readNotice,
  recordShown,
  shouldShowNotice,
  turnOff,
  watchDevice,
  writeLamplight,
  writeLook,
  writeNotice,
  type Lamplight,
  type Look,
  type Mode,
} from "./appearance";
import { usePlatform } from "./store";

// The reader's look (Cover and story or Marked page) and Lamplight setting (Automatic, On or Off), kept on
// this device only (UI-SPEC 3.2): two plain keys, never in private state, an account, a cookie, analytics
// or the backup export. The first-paint script of index.html has already put data-look and data-mode on
// <html>; this provider starts from the same values and keeps them current. A choice applies at once;
// while Automatic the mode follows the device and swaps instantly when it switches.
//
// It also decides when the Lamplight notice of UI-SPEC 4 shows: when Lamplight turns on by itself (Automatic and
// a dark device) at start, after the shell has rendered, or when the device switches to dark while the app is
// open. What the notice looks like is src/ui/LamplightNotice.tsx; the rules are in appearance.ts.
export type NoticeVariant = "on" | "off";

export interface AppearanceValue {
  look: Look;
  lamplight: Lamplight;
  /** What the mode is now: Lamplight on, or Light. */
  mode: Mode;
  /** True while the device itself is set to dark. */
  deviceDark: boolean;
  setLook: (look: Look) => void;
  setLamplight: (lamplight: Lamplight) => void;
  /** The notice while it shows: "on" says Lamplight is on, "off" confirms the reader turned it off. */
  notice: { variant: NoticeVariant } | null;
  /** "Keep Lamplight": closes the notice for good. */
  keepNotice: () => void;
  /** "Turn off": Lamplight Off at once, the notice confirms it. */
  turnOffNotice: () => void;
  /** "Hide notice", after Turn off. */
  hideNotice: () => void;
  /** Escape inside the notice: closes it, leaves it unanswered. */
  escapeNotice: () => void;
  /** The reader went somewhere else: the notice is gone for this session. */
  leaveNotice: () => void;
}

const Appearance = createContext<AppearanceValue | null>(null);

// Done once per page load, not again when the reader signs in or out (the account boundary remounts the
// providers below it): moving the old appearance key, and the notice at start.
let moved = false;
let startChecked = false;
// Left to the shell to render its status region and settle before the notice is written into it.
const START_DELAY_MS = 400;

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [look, setLookState] = useState<Look>(() => readLook());
  const [lamplight, setLamplightState] = useState<Lamplight>(() => readLamplight());
  const [deviceDark, setDeviceDark] = useState(() => matchMedia(DARK_QUERY).matches);
  const [notice, setNotice] = useState<{ variant: NoticeVariant } | null>(null);
  const mode = effectiveMode(lamplight, deviceDark);
  const { state } = usePlatform();

  // The current values for the listeners below, which are set up once.
  const current = useRef({ lamplight, deviceDark, notice });
  current.current = { lamplight, deviceDark, notice };
  // After the reader leaves the screen the notice stays away until the next automatic switch.
  const away = useRef(false);

  // Once, at start: hfg-appearance (or the loaded state's lamplight) becomes hfg-lamplight (UI-SPEC 3.2).
  useEffect(() => {
    if (moved) return;
    moved = true;
    migrateAppearance(undefined, state.lamplight);
    setLamplightState(readLamplight());
  }, []);

  // Before the browser paints, so a change never shows a frame in the old look.
  useLayoutEffect(() => applyAppearance(document.documentElement, look, mode), [look, mode]);

  const showIfDue = useCallback(() => {
    const now = current.current;
    if (now.notice || away.current) return;
    const counters = readNotice();
    if (!shouldShowNotice(now.lamplight, now.deviceDark, counters)) return;
    writeNotice(recordShown(counters));
    setNotice({ variant: "on" });
  }, []);

  // The device switches: the mode follows (while Automatic, through the mode above), a switch to dark may show
  // the notice, a switch to light closes it silently.
  useEffect(
    () =>
      watchDevice(matchMedia(DARK_QUERY), (dark) => {
        current.current = { ...current.current, deviceDark: dark };
        setDeviceDark(dark);
        if (dark) {
          away.current = false;
          showIfDue();
        } else setNotice(null);
      }),
    [showIfDue],
  );

  // At start, once the shell has rendered (its status region is in the page by then).
  useEffect(() => {
    if (startChecked) return;
    startChecked = true;
    let fired = false;
    const timer = setTimeout(() => {
      fired = true;
      showIfDue();
    }, START_DELAY_MS);
    return () => {
      clearTimeout(timer);
      if (!fired) startChecked = false;
    };
  }, [showIfDue]);

  // Lamplight no longer Automatic (chosen on the Appearance screen): the notice has nothing left to say.
  useEffect(() => {
    if (lamplight !== "auto") setNotice((n) => (n?.variant === "on" ? null : n));
  }, [lamplight]);

  const setLook = useCallback((next: Look) => {
    // A storage that cannot be written keeps the choice for this visit only, silently.
    writeLook(next);
    setLookState(next);
  }, []);
  const setLamplight = useCallback((next: Lamplight) => {
    writeLamplight(next);
    setLamplightState(next);
  }, []);

  const keepNotice = useCallback(() => {
    writeNotice(keep(readNotice()));
    setNotice(null);
  }, []);
  const turnOffNotice = useCallback(() => {
    const result = turnOff(readNotice());
    writeNotice(result.notice);
    setLamplight(result.lamplight);
    setNotice({ variant: "off" });
  }, [setLamplight]);
  const hideNotice = useCallback(() => setNotice(null), []);
  const escapeNotice = useCallback(() => {
    writeNotice(escape(readNotice()));
    setNotice(null);
  }, []);
  const leaveNotice = useCallback(() => {
    if (current.current.notice?.variant === "on") away.current = true;
    setNotice(null);
  }, []);

  const value = useMemo(
    () => ({
      look,
      lamplight,
      mode,
      deviceDark,
      setLook,
      setLamplight,
      notice,
      keepNotice,
      turnOffNotice,
      hideNotice,
      escapeNotice,
      leaveNotice,
    }),
    [look, lamplight, mode, deviceDark, notice, setLook, setLamplight, keepNotice, turnOffNotice, hideNotice, escapeNotice, leaveNotice],
  );
  return <Appearance.Provider value={value}>{children}</Appearance.Provider>;
}

export function useAppearance(): AppearanceValue {
  const value = useContext(Appearance);
  if (!value) throw new Error("AppearanceProvider missing");
  return value;
}
