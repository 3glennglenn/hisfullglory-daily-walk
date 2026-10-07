import { blankState, sanitizeState, validDate } from "../storage.ts";
import {
  goals,
  type PlatformState,
  type JournalEntry,
  type PrivatePrayer,
} from "./models.ts";
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  readonly length?: number;
  key?(index: number): string | null;
}
export const V2_KEY = "hfg-daily-walk:v2";
export const V1_KEY = "hfg-daily-walk:v1";
export const freshPlatform = (): PlatformState => ({
  version: 2,
  local: blankState(),
  preferences: {
    goals: [],
    journey: "Prefer not to say",
    minutes: 5,
    time: "morning",
  },
  theme: "system",
  entries: [],
  prayers: [],
  bookmarks: [],
  highlights: {},
  reading: [],
  savedDevotionals: [],
  devotionalProgress: {},
  walkStep: {},
  notifications: {},
});
export function migrateV1(value: unknown): PlatformState {
  const state = freshPlatform();
  state.local = sanitizeState(value);
  state.preferences.goals = state.local.goal
    ? [
        state.local.goal === "closer-to-god"
          ? "Grow closer to God"
          : state.local.goal === "peace-in-god"
            ? "Peace"
            : "Consistency",
      ]
    : [];
  state.entries = Object.entries(state.local.journals).map(([date, body]) => ({
    id: `legacy:${date}`,
    date,
    body,
    title: "Daily reflection",
    type: "free journal",
  }));
  return state;
}
const textArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === "string"))]
    : [];
export function normalizePlatform(value: unknown): PlatformState | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 2
  )
    return null;
  const v = value as Partial<PlatformState>,
    s = freshPlatform();
  s.local = sanitizeState(v.local);
  s.preferences = { ...s.preferences, ...v.preferences };
  s.preferences.goals = textArray(v.preferences?.goals)
    .filter((g) => goals.includes(g as (typeof goals)[number]))
    .slice(0, 3);
  if (![5, 10, 20].includes(s.preferences.minutes)) s.preferences.minutes = 5;
  if (!["morning", "afternoon", "evening"].includes(s.preferences.time))
    s.preferences.time = "morning";
  if (typeof s.preferences.journey !== "string")
    s.preferences.journey = "Prefer not to say";
  s.theme = ["light", "dark", "system"].includes(v.theme ?? "")
    ? v.theme!
    : "system";
  s.entries = Array.isArray(v.entries)
    ? v.entries.filter(
        (e): e is JournalEntry =>
          !!e &&
          typeof e.id === "string" &&
          typeof e.body === "string" &&
          typeof e.title === "string" &&
          typeof e.date === "string" &&
          validDate(e.date) &&
          [
            "free journal",
            "Bible passage",
            "devotional",
            "prayer",
            "study note",
            "answered prayer",
          ].includes(e.type),
      )
    : [];
  for (const [date, body] of Object.entries(s.local.journals))
    if (!s.entries.some((e) => e.id === `legacy:${date}`))
      s.entries.push({
        id: `legacy:${date}`,
        date,
        body,
        title: "Daily reflection",
        type: "free journal",
      });
  s.prayers = Array.isArray(v.prayers)
    ? v.prayers.filter(
        (p): p is PrivatePrayer =>
          !!p &&
          typeof p.id === "string" &&
          typeof p.title === "string" &&
          typeof p.body === "string" &&
          typeof p.answer === "string" &&
          typeof p.createdAt === "string" &&
          ["Active", "Waiting", "Answered", "Archived"].includes(p.status) &&
          Array.isArray(p.updates) &&
          p.updates.every(
            (u) => typeof u.body === "string" && typeof u.date === "string",
          ),
      )
    : [];
  for (const field of ["bookmarks", "reading", "savedDevotionals"] as const)
    s[field] = textArray(v[field]);
  if (v.highlights && typeof v.highlights === "object")
    s.highlights = Object.fromEntries(
      Object.entries(v.highlights).filter(
        ([k, x]) =>
          k.startsWith("/bible/") && ["gold", "sage", "rose"].includes(x),
      ),
    );
  if (v.devotionalProgress && typeof v.devotionalProgress === "object")
    s.devotionalProgress = Object.fromEntries(
      Object.entries(v.devotionalProgress)
        .filter(([, days]) => Array.isArray(days))
        .map(([k, days]) => [
          k,
          [
            ...new Set(
              days.filter((n) => Number.isInteger(n) && n >= 0 && n < 5),
            ),
          ],
        ]),
    );
  if (v.walkStep && typeof v.walkStep === "object")
    s.walkStep = Object.fromEntries(
      Object.entries(v.walkStep).filter(
        ([k, n]) => validDate(k) && Number.isInteger(n) && n >= 0 && n <= 6,
      ),
    );
  if (v.notifications && typeof v.notifications === "object")
    s.notifications = Object.fromEntries(
      Object.entries(v.notifications).filter(
        ([k, b]) =>
          [
            "Daily Walk",
            "Devotionals",
            "Someone prayed",
            "Prayer updates",
            "Replies",
            "Giving updates",
          ].includes(k) && typeof b === "boolean",
      ),
    );
  return s;
}
export function loadPlatform(storage: StorageLike): {
  state: PlatformState;
  blocked: boolean;
  notice: string;
} {
  try {
    const current = storage.getItem(V2_KEY);
    if (current !== null) {
      try {
        const state = normalizePlatform(JSON.parse(current));
        if (state) {
          if (JSON.stringify(state) !== current)
            storage.setItem(V2_KEY + ":recovery:normalized", current);
          return { state, blocked: false, notice: "" };
        }
      } catch {
        /* retained intact */
      }
      return {
        state: freshPlatform(),
        blocked: true,
        notice:
          "Stored data needs recovery. It has not been overwritten. Export a backup in Settings before starting fresh.",
      };
    }
    const legacy = storage.getItem(V1_KEY);
    let parsed: unknown = null,
      notice = "";
    if (legacy !== null) {
      try {
        parsed = JSON.parse(legacy);
        if (
          !parsed ||
          typeof parsed !== "object" ||
          !("version" in parsed) ||
          parsed.version !== 1
        )
          notice =
            "Unrecognized legacy data was kept intact. Export it from Settings.";
      } catch {
        notice =
          "Corrupt legacy data was kept intact. Export it from Settings.";
      }
    }
    const state = migrateV1(parsed);
    storage.setItem(V2_KEY, JSON.stringify(state));
    return { state, blocked: false, notice };
  } catch {
    return {
      state: freshPlatform(),
      blocked: true,
      notice:
        "Browser storage is unavailable. Changes cannot be saved until storage is enabled.",
    };
  }
}
export function savePlatform(
  storage: StorageLike,
  state: PlatformState,
  blocked = false,
): boolean {
  if (blocked) return false;
  try {
    storage.setItem(V2_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
export function backupData(storage: StorageLike) {
  const recovery: Record<string, string | null> = {};
  for (let i = 0; i < (storage.length ?? 0); i++) {
    const key = storage.key?.(i);
    if (key?.startsWith(V2_KEY + ":recovery:"))
      recovery[key] = storage.getItem(key);
  }
  return JSON.stringify(
    { v1: storage.getItem(V1_KEY), v2: storage.getItem(V2_KEY), recovery },
    null,
    2,
  );
}
export function recoverPlatform(storage: StorageLike): PlatformState {
  const old = storage.getItem(V2_KEY);
  if (old !== null) storage.setItem(`${V2_KEY}:recovery:${Date.now()}`, old);
  const legacy = storage.getItem(V1_KEY);
  let value: unknown = null;
  try {
    value = JSON.parse(legacy ?? "null");
  } catch {
    /* original retained */
  }
  const s = migrateV1(value);
  storage.setItem(V2_KEY, JSON.stringify(s));
  return s;
}
