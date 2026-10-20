import { blankState, sanitizeState, validDate } from "../storage.ts";
import { validTopics } from "../topics/graph.ts";
import {
  goals,
  type PlatformState,
  type JournalEntry,
  type PrivatePrayer,
  type ShelfEntry,
} from "./models.ts";
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  readonly length?: number;
  key?(index: number): string | null;
}
export const V2_KEY = "hfg-daily-walk:v2";
export const V3_KEY = "hfg-daily-walk:v3";
export const V1_KEY = "hfg-daily-walk:v1";
export const freshPlatform = (): PlatformState => ({
  version: 3,
  privateTopics: [], followedTopics: [], savedDiscussions: [], savedDiscussionTopics: {}, joinedChallenges: [], pathProgress: {}, challengeProgress: {},
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
  lamplight: "auto",
  shelf: [],
  lastChapter: null,
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
  return migrateV2({...state, version: 2})!;
}
const textArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === "string"))]
    : [];
// ---- The fields added in plan 01.1-04: lamplight, shelf and lastChapter (UI-SPEC 3.2 and 12) ----
// The sanitizers are used twice, by normalizePlatform and by upgradeV3Fields, so that a stored state that lacks
// the fields and the same state after normalization agree and no recovery is triggered.
const lamplightFromTheme = (theme: unknown): PlatformState["lamplight"] =>
  theme === "dark" ? "on" : theme === "light" ? "off" : "auto";
function cleanLamplight(value: unknown, theme: unknown): PlatformState["lamplight"] {
  return value === "auto" || value === "on" || value === "off" ? value : lamplightFromTheme(theme);
}
// Only a slug of lowercase letters, digits and hyphens with a real calendar date is kept; the first entry per
// slug wins and the stored order is kept. Anything else is dropped (T-01.1-10).
function cleanShelf(value: unknown): ShelfEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const shelf: ShelfEntry[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { slug, finishedOn } = entry as Record<string, unknown>;
    if (typeof slug !== "string" || !/^[a-z0-9-]+$/.test(slug) || seen.has(slug)) continue;
    if (typeof finishedOn !== "string" || !validDate(finishedOn)) continue;
    seen.add(slug);
    shelf.push({ slug, finishedOn });
  }
  return shelf;
}
const cleanLastChapter = (value: unknown): string | null =>
  typeof value === "string" && /^\/bible\/[a-z0-9-]+\/[1-9][0-9]*$/.test(value) ? value : null;

/**
 * The explicit forward step for the three fields of plan 01.1-04, applied to a stored v2 or v3 object before it
 * is compared with its normalized form. An object that lacks any of them gets all three at the end, in the order
 * of freshPlatform(), with the values normalizePlatform would derive (lamplight from theme: dark on, light off,
 * system auto). An object that already has all three is returned as it is, byte for byte. Idempotent. The version
 * stays what it was and the theme stays readable.
 */
export function upgradeV3Fields(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const stored = raw as Record<string, unknown>;
  if (stored.version !== 2 && stored.version !== 3) return raw;
  if ("lamplight" in stored && "shelf" in stored && "lastChapter" in stored) return raw;
  const { lamplight, shelf, lastChapter, ...rest } = stored;
  return {
    ...rest,
    lamplight: cleanLamplight(lamplight, stored.theme),
    shelf: cleanShelf(shelf),
    lastChapter: cleanLastChapter(lastChapter),
  };
}
export function normalizePlatform(value: unknown): PlatformState | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    (value.version !== 2 && value.version !== 3)
  )
    return null;
  const v = value as Partial<PlatformState>,
    s = freshPlatform();
  s.privateTopics = validTopics(v.privateTopics);
  s.followedTopics = validTopics(v.followedTopics);
  s.savedDiscussions = textArray(v.savedDiscussions).filter(id => /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id));
  if (v.challengeProgress && typeof v.challengeProgress === "object")
    s.challengeProgress = Object.fromEntries(Object.entries(v.challengeProgress)
      .filter(([id, days]) => id === "seven-days-in-scripture" && Array.isArray(days))
      .map(([id, days]) => [id, [...new Set(days.filter(n => Number.isInteger(n) && n >= 0 && n < 7))]]));
  s.joinedChallenges = textArray(v.joinedChallenges).filter(id => id === "seven-days-in-scripture");
  if (v.pathProgress && typeof v.pathProgress === "object")
    s.pathProgress = Object.fromEntries(Object.entries(v.pathProgress)
      .filter(([id, days]) => ["return-to-scripture", "walking-through-grief"].includes(id) && Array.isArray(days))
      .map(([id, days]) => [id, [...new Set(days.filter(n => Number.isInteger(n) && n >= 0 && n < 3))]]));
  if (v.savedDiscussionTopics && typeof v.savedDiscussionTopics === "object")
    s.savedDiscussionTopics = Object.fromEntries(Object.entries(v.savedDiscussionTopics)
      .filter(([id, topic]) => s.savedDiscussions.includes(id) && typeof topic === "string" && validTopics([topic]).length === 1));
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
  s.lamplight = cleanLamplight(v.lamplight, s.theme);
  s.shelf = cleanShelf(v.shelf);
  s.lastChapter = cleanLastChapter(v.lastChapter);
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
    ? v.prayers
        .filter(
          (p): p is PrivatePrayer =>
            !!p &&
            typeof p.id === "string" &&
            typeof p.title === "string" &&
            typeof p.body === "string" &&
            typeof p.answer === "string" &&
            typeof p.createdAt === "string" &&
            ["Active", "Waiting", "Answered", "Archived"].includes(p.status),
        )
        .map(({answeredAt, ...p}) => ({
          ...p,
          ...(typeof answeredAt === "string" && Number.isFinite(Date.parse(answeredAt)) ? {answeredAt} : {}),
          ...(p.testimonyIds ? {testimonyIds: textArray(p.testimonyIds).filter(id => /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))} : {}),
          updates: Array.isArray(p.updates)
            ? p.updates.filter(
                (u) =>
                  !!u &&
                  typeof u.body === "string" &&
                  typeof u.date === "string",
              )
            : [],
        }))
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
function loadLegacyPlatform(storage: StorageLike): {
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
          // The forward step first: only a real repair, not the three new fields, counts as recovery.
          if (JSON.stringify(state) !== JSON.stringify(upgradeV3Fields(JSON.parse(current)))) {
            const recoveryKey = V2_KEY + ":recovery:normalized";
            try {
              const previous = storage.getItem(recoveryKey);
              if (previous !== null && previous !== current)
                throw new Error("An earlier recovery copy must be preserved");
              if (previous === null) storage.setItem(recoveryKey, current);
            } catch {
              return {
                state,
                blocked: true,
                notice:
                  "Stored data needs a recovery backup, but storage cannot save it. Your readable data is available; export it in Settings. No stored data was overwritten.",
              };
            }
            return {
              state,
              blocked: false,
              notice:
                "Some stored fields needed recovery. The original data was preserved in your Settings backup.",
            };
          }
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
    try {
      storage.setItem(V2_KEY, JSON.stringify(state));
    } catch {
      return {
        state,
        blocked: true,
        notice:
          "Storage cannot save the migration. Your existing data remains readable and unchanged. Free browser storage, then reload; export a backup in Settings.",
      };
    }
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
    storage.setItem(V3_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
export function backupData(storage: StorageLike) {
  const recovery: Record<string, string | null> = {};
  for (let i = 0; i < (storage.length ?? 0); i++) {
    const key = storage.key?.(i);
    if (key?.startsWith(V2_KEY + ":recovery:") || key?.startsWith(V3_KEY + ":recovery:"))
      recovery[key] = storage.getItem(key);
  }
  return JSON.stringify(
    { v1: storage.getItem(V1_KEY), v2: storage.getItem(V2_KEY), v3: storage.getItem(V3_KEY), recovery },
    null,
    2,
  );
}
export function recoverPlatform(storage: StorageLike): PlatformState {
  const old = storage.getItem(V3_KEY);
  if (old !== null) {
    const base = V3_KEY+":recovery:"+Date.now();
    let key=base,index=0;
    while(storage.getItem(key)!==null) key=base+":"+(++index);
    storage.setItem(key,old);
  }
  const legacy = storage.getItem(V1_KEY);
  let value: unknown = null;
  try {
    value = JSON.parse(legacy ?? "null");
  } catch {
    /* original retained */
  }
  let prior: PlatformState | null = null;
  try { prior = migrateV2(JSON.parse(storage.getItem(V2_KEY) ?? "null")); } catch { /* Original v2 remains intact. */ }
  const s = prior ?? migrateV1(value);
  storage.setItem(V3_KEY, JSON.stringify(s));
  return s;
}

export function migrateV2(value: unknown): PlatformState | null {
  return normalizePlatform(value);
}
export function loadPlatform(storage: StorageLike): ReturnType<typeof loadLegacyPlatform> {
  try {
    if (storage.getItem(V3_KEY) !== null) {
      // Reuse tested recovery behavior, scoped to v3. Never fall back over corrupt v3.
      return loadLegacyPlatform({
        getItem: key => storage.getItem(key.replace(V2_KEY, V3_KEY)),
        setItem: (key, value) => storage.setItem(key.replace(V2_KEY, V3_KEY), value),
      });
    }
    const result = loadLegacyPlatform({
      getItem: key => storage.getItem(key),
      // Preserve original v2 byte-for-byte; migration writes only the new key.
      setItem: (key, value) => { if (key !== V2_KEY) storage.setItem(key, value); },
    });
    if (!result.blocked && !savePlatform(storage, result.state))
      return {...result, blocked: true, notice: "Storage cannot save the v3 migration. Readable data and original sources are preserved; export a private backup."};
    return result;
  } catch {
    return {state: freshPlatform(), blocked: true, notice: "Browser storage is unavailable. No private data was overwritten."};
  }
}

const accountPrefix = (userId: string) => {
  if (!/^[a-z0-9-]+$/i.test(userId)) throw new Error("Invalid private profile");
  return `hfg-private:${userId}:`;
};

// Guest data stays in the device guest profile. Login never adopts or merges it.
export function scopedStorage(storage: StorageLike, userId: string | null): StorageLike {
  if (!userId) return storage;
  const prefix = accountPrefix(userId);
  const keys = () => Array.from({length: storage.length ?? 0}, (_, i) => storage.key?.(i))
    .filter((key): key is string => !!key?.startsWith(prefix));
  return {
    getItem: key => storage.getItem(prefix + key),
    setItem: (key, value) => storage.setItem(prefix + key, value),
    get length() { return keys().length; },
    key: index => keys()[index]?.slice(prefix.length) ?? null,
  };
}

/**
 * After an account is deleted, removes what this device kept for it. Nobody can sign in to
 * that account again, so its private data would otherwise stay behind unreachable. Guest data
 * and other accounts on the device are left alone. Returns how many entries were removed.
 */
export function forgetAccount(storage: StorageLike & { removeItem(key: string): void }, userId: string): number {
  const prefix = accountPrefix(userId);
  const doomed = Array.from({ length: storage.length ?? 0 }, (_, i) => storage.key?.(i))
    .filter((key): key is string => !!key?.startsWith(prefix));
  for (const key of doomed) storage.removeItem(key);
  return doomed.length;
}
