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

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
