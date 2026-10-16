/**
 * The word a person types to confirm deleting their account (UI-SPEC Surface 5). Any letter case
 * works, because phone keyboards capitalise unpredictably, and spaces around it are ignored.
 */
export function isDeleteConfirmation(typed: string): boolean {
  return typed.trim().toUpperCase() === "DELETE";
}

/**
 * What deleting an account removes, in the words of the public /delete-account page (a test keeps the
 * two lists equal). The founder approved that wording; do not edit one list without the other.
 */
export const deletedWithAccount: readonly string[] = [
  "Your account and your profile, including your display name.",
  "Your posts, reflections, prayers and chat messages in the community, and the replies other people wrote under your posts.",
  "Your reactions, votes and the reports you sent.",
  "The people you blocked or muted, and anyone's block of you.",
  "Your topic and Circle memberships, and the support requests you made.",
  "Circles you own. They close, with their posts.",
];
