// Small pieces of the push setup that need no browser, so they can be tested.

/** The Web Push public key as the bytes PushManager.subscribe wants. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url + "=".repeat((4 - (base64url.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The reminder time to suggest, from the time of day the reader chose at the start. */
export const suggestedReminderTime = (when: "morning" | "afternoon" | "evening") =>
  ({ morning: "07:30", afternoon: "12:30", evening: "20:00" })[when];

/** Reminders are allowed between 05:00 and 22:00 (migration 010). */
export const validReminderTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) && value >= "05:00" && value <= "22:00";
