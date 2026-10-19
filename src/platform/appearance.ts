// How the app looks, per device and without an account (UI-SPEC 3.2): a look ("cover" or
// "marked") and a Lamplight setting ("auto", "on" or "off"). The values sit in two plain
// localStorage keys and reach <html> as data-look and data-mode. index.html sets both before
// anything paints; this module is the same logic for the app once it runs.
// Every storage access is guarded: a blocked or unreadable store means Cover and Automatic.

export const LOOK_KEY = "hfg-look";
export const LAMPLIGHT_KEY = "hfg-lamplight";
export const NOTICE_KEY = "hfg-lamplight-notice";

export type Look = "cover" | "marked";
export type Lamplight = "auto" | "on" | "off";
export type Mode = "light" | "lamplight";

/** The words the reader sees for each look and Lamplight setting (UI-SPEC 9.1: "theme", "Lamplight"). */
export const LOOK_NAMES: Record<Look, string> = { cover: "Cover and story", marked: "Marked page" };
export const LAMPLIGHT_NAMES: Record<Lamplight, string> = { auto: "Automatic", on: "On", off: "Off" };

type Reader = Pick<Storage, "getItem">;

/** Anything but the literal "marked" is the default look. */
export function readLook(storage: Reader | undefined = safeStorage()): Look {
  try {
    return storage?.getItem(LOOK_KEY) === "marked" ? "marked" : "cover";
  } catch {
    return "cover";
  }
}

/** The old appearance values (hfg-appearance, hfg-theme, a saved state's theme) mapped once. */
export function legacyLamplight(value: string | null | undefined): Lamplight {
  return value === "dark" ? "on" : value === "light" ? "off" : "auto";
}

/** The stored Lamplight setting; the old keys are read only while the new one is absent. */
export function readLamplight(storage: Reader | undefined = safeStorage()): Lamplight {
  try {
    const stored = storage?.getItem(LAMPLIGHT_KEY);
    if (stored === "on" || stored === "off" || stored === "auto") return stored;
    if (!storage) return "auto";
    let old = storage.getItem("hfg-appearance") || storage.getItem("hfg-theme");
    if (!old) {
      const state = JSON.parse(storage.getItem("hfg-daily-walk:v3") || "null") as { theme?: string } | null;
      old = state?.theme ?? null;
    }
    return legacyLamplight(old);
  } catch {
    return "auto";
  }
}

/** Light or Lamplight for a Lamplight setting and the device's current appearance. */
export function effectiveMode(lamp: Lamplight, deviceDark: boolean): Mode {
  return lamp === "on" || (lamp !== "off" && deviceDark) ? "lamplight" : "light";
}

type Writer = Pick<Storage, "setItem">;

/**
 * Remembers the look on this device. A storage that cannot be written keeps the choice for this
 * visit only (UI-SPEC 3.2): the caller still applies it, nothing is shown to the reader.
 */
export function writeLook(look: Look, storage: Writer | undefined = safeStorage()): boolean {
  try {
    storage?.setItem(LOOK_KEY, look);
    return !!storage;
  } catch {
    return false;
  }
}

/** Remembers the Lamplight setting on this device; same rule as writeLook. */
export function writeLamplight(lamp: Lamplight, storage: Writer | undefined = safeStorage()): boolean {
  try {
    storage?.setItem(LAMPLIGHT_KEY, lamp);
    return !!storage;
  } catch {
    return false;
  }
}

/** The key the app wrote its old theme choice to (UI-SPEC 3.2). It is read once, moved and removed. */
export const OLD_APPEARANCE_KEY = "hfg-appearance";

/**
 * Moves the old appearance choice to hfg-lamplight, once, at start (UI-SPEC 3.2): with no hfg-lamplight,
 * hfg-appearance "dark" becomes "on", "light" "off" and "system" "auto"; with neither key, the loaded state's
 * lamplight (itself taken from its old theme) is written. An existing hfg-lamplight is never overwritten. The
 * old key is removed only after the new one is safely there. A storage that throws changes nothing and
 * throws nothing here; the app then keeps working from what first paint read.
 */
export function migrateAppearance(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined = safeStorage(),
  stateLamplight: Lamplight = "auto",
): void {
  try {
    if (!storage) return;
    const stored = storage.getItem(LAMPLIGHT_KEY);
    const old = storage.getItem(OLD_APPEARANCE_KEY);
    if (stored !== "on" && stored !== "off" && stored !== "auto") {
      const next = old ? legacyLamplight(old) : stateLamplight === "on" || stateLamplight === "off" ? stateLamplight : "auto";
      storage.setItem(LAMPLIGHT_KEY, next);
    }
    if (old !== null) storage.removeItem(OLD_APPEARANCE_KEY);
  } catch {
    /* Blocked or full storage: the choice then lasts for this visit only. */
  }
}

export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The part of a MediaQueryList the app uses, so tests can supply their own. */
export interface DeviceMedia {
  readonly matches: boolean;
  addEventListener(type: "change", listener: (event: { matches: boolean }) => void): void;
  removeEventListener(type: "change", listener: (event: { matches: boolean }) => void): void;
}

/** Calls onChange with the device's new appearance whenever it switches. Returns a stop function. */
export function watchDevice(media: DeviceMedia, onChange: (dark: boolean) => void): () => void {
  const listener = (event: { matches: boolean }) => onChange(event.matches);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

/**
 * Puts the look and mode on <html> at once (no cross-fade) and the browser's theme-color on the
 * colour the active block names (UI-SPEC 3.3). Browser only.
 */
export function applyAppearance(root: HTMLElement, look: Look, mode: Mode): void {
  root.dataset.look = look;
  root.dataset.mode = mode;
  const color = getComputedStyle(root).getPropertyValue("--theme-color").trim();
  if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

/**
 * Marks <html data-text="large"> while the root font size is 26px or more (about 150 % of the
 * 17px default, iOS accessibility sizes and above) and removes it otherwise, so layouts can
 * stack (UI-SPEC 6.3). Re-checks on resize and when the page becomes visible again.
 * Returns a function that stops watching.
 */
export function watchTextSize(root: HTMLElement): () => void {
  const check = () => {
    const size = parseFloat(getComputedStyle(root).fontSize);
    if (size >= 26) root.dataset.text = "large";
    else delete root.dataset.text;
  };
  check();
  window.addEventListener("resize", check);
  document.addEventListener("visibilitychange", check);
  return () => {
    window.removeEventListener("resize", check);
    document.removeEventListener("visibilitychange", check);
  };
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
