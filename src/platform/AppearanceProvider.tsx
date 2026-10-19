import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DARK_QUERY,
  applyAppearance,
  effectiveMode,
  migrateAppearance,
  readLamplight,
  readLook,
  watchDevice,
  writeLamplight,
  writeLook,
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
export interface AppearanceValue {
  look: Look;
  lamplight: Lamplight;
  /** What the mode is now: Lamplight on, or Light. */
  mode: Mode;
  /** True while the device itself is set to dark. */
  deviceDark: boolean;
  setLook: (look: Look) => void;
  setLamplight: (lamplight: Lamplight) => void;
}

const Appearance = createContext<AppearanceValue | null>(null);

// The old hfg-appearance key is moved once per page load, not again when the reader signs in or out.
let moved = false;

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [look, setLookState] = useState<Look>(() => readLook());
  const [lamplight, setLamplightState] = useState<Lamplight>(() => readLamplight());
  const [deviceDark, setDeviceDark] = useState(() => matchMedia(DARK_QUERY).matches);
  const mode = effectiveMode(lamplight, deviceDark);
  const { state } = usePlatform();

  // Once, at start: hfg-appearance (or the loaded state's lamplight) becomes hfg-lamplight (UI-SPEC 3.2).
  useEffect(() => {
    if (moved) return;
    moved = true;
    migrateAppearance(undefined, state.lamplight);
    setLamplightState(readLamplight());
  }, []);

  // Before the browser paints, so a change never shows a frame in the old look.
  useLayoutEffect(() => applyAppearance(document.documentElement, look, mode), [look, mode]);
  useEffect(() => watchDevice(matchMedia(DARK_QUERY), setDeviceDark), []);

  const setLook = useCallback((next: Look) => {
    // A storage that cannot be written keeps the choice for this visit only, silently.
    writeLook(next);
    setLookState(next);
  }, []);
  const setLamplight = useCallback((next: Lamplight) => {
    writeLamplight(next);
    setLamplightState(next);
  }, []);

  const value = useMemo(
    () => ({ look, lamplight, mode, deviceDark, setLook, setLamplight }),
    [look, lamplight, mode, deviceDark, setLook, setLamplight],
  );
  return <Appearance.Provider value={value}>{children}</Appearance.Provider>;
}

export function useAppearance(): AppearanceValue {
  const value = useContext(Appearance);
  if (!value) throw new Error("AppearanceProvider missing");
  return value;
}
