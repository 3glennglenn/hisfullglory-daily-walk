/**
 * The word a person types to confirm deleting their account (UI-SPEC Surface 5). Any letter case
 * works, because phone keyboards capitalise unpredictably, and spaces around it are ignored.
 */
export function isDeleteConfirmation(typed: string): boolean {
  return typed.trim().toUpperCase() === "DELETE";
}
