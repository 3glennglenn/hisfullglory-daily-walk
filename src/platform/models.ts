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
  testimonyIds?: string[];
  answeredAt?: string;
  updates: { date: string; body: string }[];
  createdAt: string;
}
// One finished context check on the reader's shelf (UI-SPEC 12): its slug and the local date it was read to
// the end. Nothing else is kept; whether it is AI-unreviewed is read from the bundled check by slug.
export interface ShelfEntry {
  slug: string;
  finishedOn: string;
}
export interface PlatformState {
  version: 3;
  privateTopics: string[];
  followedTopics: string[];
  savedDiscussions: string[];
  savedDiscussionTopics: Record<string,string>;
  joinedChallenges: string[];
  pathProgress: Record<string, number[]>;
  challengeProgress: Record<string, number[]>;
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
  // Added by upgradeV3Fields (plan 01.1-04). lamplight starts from theme and is the source for the one-time
  // move to the hfg-lamplight key; the reader's live choice is kept in that key, not here.
  lamplight: "auto" | "on" | "off";
  shelf: ShelfEntry[];
  // The chapter the reader was last in, as /bible/{book}/{chapter}, for "Continue reading".
  lastChapter: string | null;
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
    ...(status === "Answered" ? {answeredAt: prayer.answeredAt ?? new Date().toISOString()} : {}),
    answer: status === "Answered" ? answer.trim() : prayer.answer,
  };
}
