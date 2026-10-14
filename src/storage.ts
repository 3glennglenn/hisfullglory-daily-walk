export const planSlugs = [
  "closer-to-god",
  "consistent-in-the-word",
  "peace-in-god",
] as const;
export type PlanSlug = (typeof planSlugs)[number];
export interface LocalState {
  version: 1;
  onboarded: boolean;
  goal: PlanSlug | null;
  journals: Record<string, string>;
  completedDates: string[];
  activePlan: PlanSlug | null;
  progress: Record<PlanSlug, number[]>;
  installDismissed: boolean;
}
const KEY = "hfg-daily-walk:v1";
export const blankState = (): LocalState => ({
  version: 1,
  onboarded: false,
  goal: null,
  journals: {},
  completedDates: [],
  activePlan: null,
  progress: {
    "closer-to-god": [],
    "consistent-in-the-word": [],
    "peace-in-god": [],
  },
  installDismissed: false,
});
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dateNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const normalized = new Date(dateNumber(value) * 86400000)
    .toISOString()
    .slice(0, 10);
  return normalized === value;
}
export function sanitizeState(value: unknown): LocalState {
  const base = blankState();
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1
  )
    return base;
  const v = value as Partial<LocalState>;
  base.onboarded = v.onboarded === true;
  base.installDismissed = v.installDismissed === true;
  const slug = (s: unknown): s is PlanSlug =>
    typeof s === "string" && planSlugs.includes(s as PlanSlug);
  base.goal = slug(v.goal) ? v.goal : null;
  base.activePlan = slug(v.activePlan) ? v.activePlan : null;
  if (Array.isArray(v.completedDates))
    base.completedDates = [
      ...new Set(
        v.completedDates.filter((d) => typeof d === "string" && validDate(d)),
      ),
    ].sort();
  if (v.journals && typeof v.journals === "object") {
    for (const [date, entry] of Object.entries(v.journals))
      if (validDate(date) && typeof entry === "string")
        base.journals[date] = entry.slice(0, 10000);
  }
  for (const key of planSlugs) {
    const days = v.progress?.[key];
    if (Array.isArray(days))
      base.progress[key] = [
        ...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d < 5)),
      ].sort();
  }
  return base;
}
export function readState(): LocalState {
  try {
    return sanitizeState(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch {
    return blankState();
  }
}
export function writeState(state: LocalState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
export function completeDate(state: LocalState, date: string): LocalState {
  if (!validDate(date) || state.completedDates.includes(date)) return state;
  return { ...state, completedDates: [...state.completedDates, date].sort() };
}
export function streak(dates: string[], today: string): number {
  const numbers = new Set(dates.filter(validDate).map(dateNumber));
  let cursor = dateNumber(today);
  if (!numbers.has(cursor)) cursor--;
  let count = 0;
  while (numbers.has(cursor--)) count++;
  return count;
}

/**
 * The current run of walks, forgiving one missed day: a single day between two walks does
 * not break it, and the run is still current if the last walk was the day before yesterday.
 * After a longer break `current` is false and the app welcomes the reader back instead of
 * showing a zero.
 */
export function rhythm(dates: string[], today: string): { days: number; current: boolean; missedYesterday: boolean } {
  const end = dateNumber(today);
  const done = [...new Set(dates.filter(validDate).map(dateNumber))].filter((n) => n <= end).sort((a, b) => b - a);
  if (!done.length) return { days: 0, current: false, missedYesterday: false };
  let days = 1;
  while (days < done.length && done[days - 1] - done[days] <= 2) days++;
  return { days, current: end - done[0] <= 2, missedYesterday: end - done[0] === 2 };
}
