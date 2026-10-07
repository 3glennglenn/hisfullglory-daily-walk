import type { LocalState } from "../storage";
export type Theme = "light" | "dark" | "system";
export const goals = [
  "Understand the Bible",
  "Grow closer to God",
  "Prayer",
  "Peace",
  "Purpose & direction",
  "Relationships",
  "Consistency",
  "Healing through a difficult season",
] as const;
export type JournalType =
  | "free journal"
  | "Bible passage"
  | "devotional"
  | "prayer"
  | "study note"
  | "answered prayer";
export interface JournalEntry {
  id: string;
  type: JournalType;
  title: string;
  body: string;
  date: string;
  source?: string;
}
export type PrayerStatus = "Active" | "Waiting" | "Answered" | "Archived";
export interface PrivatePrayer {
  id: string;
  title: string;
  body: string;
  status: PrayerStatus;
  answer: string;
  updates: { date: string; body: string }[];
  createdAt: string;
}
export interface PlatformState {
  version: 2;
  local: LocalState;
  preferences: {
    goals: string[];
    journey: string;
    minutes: 5 | 10 | 20;
    time: "morning" | "afternoon" | "evening";
  };
  theme: Theme;
  entries: JournalEntry[];
  prayers: PrivatePrayer[];
  bookmarks: string[];
  highlights: Record<string, string>;
  reading: string[];
  savedDevotionals: string[];
  devotionalProgress: Record<string, number[]>;
  walkStep: Record<string, number>;
  notifications: Record<string, boolean>;
}
export type UpdatePlatform = (
  fn: (state: PlatformState) => PlatformState,
) => boolean;
export function prayerTransition(
  prayer: PrivatePrayer,
  status: PrayerStatus,
  answer = "",
): PrivatePrayer {
  if (status === "Answered" && !answer.trim())
    throw new Error("An answer reflection is required.");
  return {
    ...prayer,
    status,
    answer: status === "Answered" ? answer.trim() : prayer.answer,
  };
}
