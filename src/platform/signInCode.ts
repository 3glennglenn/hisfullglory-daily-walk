/** Accepts what people paste from the sign-in email: spaces and dashes are dropped; 6 to 10 digits remain. */
export function cleanCode(value: string): string | null {
  const digits = value.replace(/[\s-]/g, "");
  return /^\d{6,10}$/.test(digits) ? digits : null;
}

/**
 * Whole seconds before another sign-in email may be asked for: the wait runs from `waitSeconds`
 * (60, the limit Supabase enforces per person) down to 0, which is reached at exactly
 * `waitSeconds` after sending. Rounded up, so "1 second" shows until the last moment, and
 * clamped, so a clock that moved back never shows more than the full wait and a long time later
 * never shows a negative number. Times are in milliseconds, as from Date.now().
 */
export function resendSecondsLeft(sentAt: number, now: number, waitSeconds = 60): number {
  const left = Math.ceil((sentAt + waitSeconds * 1000 - now) / 1000);
  return Math.min(waitSeconds, Math.max(0, left));
}
